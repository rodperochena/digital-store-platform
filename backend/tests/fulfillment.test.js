"use strict";

/**
 * tests/fulfillment.test.js
 *
 * Integration tests for the fulfillment system:
 *   - triggerFulfillment: creates record, sends email, marks sent
 *   - triggerFulfillment: idempotent (second call is no-op)
 *   - delivery endpoint: valid token → 302 redirect
 *   - delivery endpoint: expired token → 410
 *   - delivery endpoint: unknown token → 404
 *   - delivery endpoint: marks fulfillment opened
 *   - resendFulfillment: issues new token, re-sends
 *   - resendFulfillment: fails on unpaid order
 *   - owner resend endpoint: 200 on valid paid order
 *   - owner resend endpoint: 404 on wrong store
 */

// ── Mock mailer so no real emails are sent ────────────────────────────────────

const mockSendEmail = jest.fn().mockResolvedValue(undefined);
jest.mock("../src/lib/mailer", () => ({ sendEmail: mockSendEmail }));

// ── Test helpers ───────────────────────────────────────────────────────────────

const { request, app, randSuffix, createStore, enableStore, createProduct } = require("./helpers");
const { pool } = require("../src/db/pool");  // still needed for manual expiry update
const { triggerFulfillment } = require("../src/lib/fulfillment");
const { getFulfillmentByOrderId } = require("../src/db/queries/fulfillment.queries");
const { createOrder, markOrderPaid } = require("../src/db/queries/orders.queries");

jest.setTimeout(30_000);

// ── Fixture helpers ───────────────────────────────────────────────────────────

async function provisionStore() {
  const s = randSuffix();
  const storeRes = await createStore({ slug: `ff-${s}`, name: `Fulfillment Test ${s}` });
  expect(storeRes.status).toBe(201);
  const storeId = storeRes.body.store.id;
  const slug = storeRes.body.store.slug;
  await enableStore(storeId);
  return { storeId, slug };
}

async function provisionProduct(storeId, { delivery_url = "https://example.com/file.zip" } = {}) {
  const s = randSuffix();
  const res = await createProduct(storeId, {
    title: `Product ${s}`,
    price_cents: 999,
    delivery_url,
  });
  expect(res.status).toBe(201);
  return res.body.product;
}

/** Create a paid order directly via DB helpers. */
async function createPaidOrder(storeId, productId, buyerEmail = "buyer@example.com") {
  const order = await createOrder(storeId, {
    items: [{ product_id: productId, quantity: 1 }],
    buyer_email: buyerEmail,
  });
  expect(order).not.toBeNull();
  const result = await markOrderPaid(storeId, order.id);
  expect(result.kind).toBe("OK");
  return result.order;
}

/**
 * Provision a store+owner account via the dev endpoint and return a session token.
 * Uses the same dev provision → claim-access flow as owner.auth.test.js.
 */
async function provisionStoreWithOwner(password = "testpassword1") {
  const provRes = await request(app).post("/api/dev/provision-store");
  if (provRes.status !== 201) throw new Error(`provision-store failed: ${provRes.status}`);
  const { store_id: storeId, bootstrap_token } = provRes.body;

  const claimRes = await request(app)
    .post("/api/owner/claim-access")
    .send({ store_id: storeId, bootstrap_token, password });
  if (claimRes.status !== 201) throw new Error(`claim-access failed: ${claimRes.status}`);

  return { storeId, sessionToken: claimRes.body.session_token };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("triggerFulfillment", () => {
  test("creates fulfillment record and sends email for a paid order", async () => {
    const { storeId } = await provisionStore();
    const product = await provisionProduct(storeId);
    const order = await createPaidOrder(storeId, product.id, "buyer@example.com");

    mockSendEmail.mockClear();
    await triggerFulfillment(order.id, storeId);

    const fulfillment = await getFulfillmentByOrderId(order.id);
    expect(fulfillment).not.toBeNull();
    expect(fulfillment.status).toBe("sent");
    expect(fulfillment.sent_to_email).toBe("buyer@example.com");
    expect(fulfillment.sent_at).not.toBeNull();
    expect(mockSendEmail).toHaveBeenCalledTimes(1);

    const call = mockSendEmail.mock.calls[0][0];
    expect(call.to).toBe("buyer@example.com");
    expect(call.text).toContain("/api/deliver/");
  });

  test("is idempotent — second call for same order is no-op", async () => {
    const { storeId } = await provisionStore();
    const product = await provisionProduct(storeId);
    const order = await createPaidOrder(storeId, product.id);

    mockSendEmail.mockClear();
    await triggerFulfillment(order.id, storeId);
    await triggerFulfillment(order.id, storeId);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);

    const fulfillment = await getFulfillmentByOrderId(order.id);
    expect(fulfillment.status).toBe("sent");
  });

  test("is a no-op for an unpaid (pending) order", async () => {
    const { storeId } = await provisionStore();
    const product = await provisionProduct(storeId);
    const order = await createOrder(storeId, {
      items: [{ product_id: product.id, quantity: 1 }],
      buyer_email: "buyer@example.com",
    });

    mockSendEmail.mockClear();
    await triggerFulfillment(order.id, storeId);

    expect(mockSendEmail).not.toHaveBeenCalled();
    const fulfillment = await getFulfillmentByOrderId(order.id);
    expect(fulfillment).toBeNull();
  });

  test("marks fulfillment failed when email send throws", async () => {
    const { storeId } = await provisionStore();
    const product = await provisionProduct(storeId);
    const order = await createPaidOrder(storeId, product.id);

    mockSendEmail.mockRejectedValueOnce(new Error("SMTP connection refused"));
    await triggerFulfillment(order.id, storeId);

    const fulfillment = await getFulfillmentByOrderId(order.id);
    expect(fulfillment.status).toBe("failed");
    expect(fulfillment.error).toContain("SMTP connection refused");
  });
});

describe("GET /api/deliver/:token", () => {
  test("valid token redirects to product delivery_url", async () => {
    const { storeId } = await provisionStore();
    const product = await provisionProduct(storeId, {
      delivery_url: "https://cdn.example.com/download.zip",
    });
    const order = await createPaidOrder(storeId, product.id);
    await triggerFulfillment(order.id, storeId);

    // Extract the delivery token from the email call
    const emailCall = mockSendEmail.mock.calls.at(-1)[0];
    const match = emailCall.text.match(/\/api\/deliver\/([a-f0-9]+)/);
    expect(match).not.toBeNull();
    const token = match[1];

    const res = await request(app).get(`/api/deliver/${token}`);
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe("https://cdn.example.com/download.zip");
  });

  test("unknown token returns 404", async () => {
    const res = await request(app).get("/api/deliver/000000000000000000000000000000000000000000000000000000000000ffff");
    expect(res.status).toBe(404);
  });

  test("expired token returns 410", async () => {
    const { storeId } = await provisionStore();
    const product = await provisionProduct(storeId);
    const order = await createPaidOrder(storeId, product.id);
    await triggerFulfillment(order.id, storeId);

    // Manually expire the fulfillment
    await pool.query(
      "UPDATE order_fulfillments SET delivery_expires_at = NOW() - INTERVAL '1 hour' WHERE order_id = $1",
      [order.id]
    );

    const emailCall = mockSendEmail.mock.calls.at(-1)[0];
    const match = emailCall.text.match(/\/api\/deliver\/([a-f0-9]+)/);
    const token = match[1];

    const res = await request(app).get(`/api/deliver/${token}`);
    expect(res.status).toBe(410);
  });

  test("marks fulfillment as opened after first access", async () => {
    const { storeId } = await provisionStore();
    const product = await provisionProduct(storeId, {
      delivery_url: "https://cdn.example.com/file.pdf",
    });
    const order = await createPaidOrder(storeId, product.id);
    await triggerFulfillment(order.id, storeId);

    const emailCall = mockSendEmail.mock.calls.at(-1)[0];
    const match = emailCall.text.match(/\/api\/deliver\/([a-f0-9]+)/);
    const token = match[1];

    await request(app).get(`/api/deliver/${token}`);

    // Give the async markFulfillmentOpened a tick to complete
    await new Promise((r) => setImmediate(r));

    const fulfillment = await getFulfillmentByOrderId(order.id);
    expect(fulfillment.status).toBe("opened");
    expect(fulfillment.opened_at).not.toBeNull();
  });
});

describe("POST /api/owner/orders/:orderId/resend-delivery", () => {
  function authed(method, path, token) {
    return request(app)[method](path).set("Authorization", `Bearer ${token}`);
  }

  test("resends delivery and returns 200", async () => {
    const { storeId, sessionToken } = await provisionStoreWithOwner();
    const product = await provisionProduct(storeId);
    const order = await createPaidOrder(storeId, product.id);
    await triggerFulfillment(order.id, storeId);

    mockSendEmail.mockClear();

    const res = await authed("post", `/api/owner/orders/${order.id}/resend-delivery`, sessionToken);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  test("returns 404 when no fulfillment exists", async () => {
    const { storeId, sessionToken } = await provisionStoreWithOwner();
    const product = await provisionProduct(storeId);
    const order = await createPaidOrder(storeId, product.id);
    // Do NOT trigger fulfillment

    const res = await authed("post", `/api/owner/orders/${order.id}/resend-delivery`, sessionToken);
    expect(res.status).toBe(404);
  });

  test("returns 401 without auth", async () => {
    const { storeId } = await provisionStoreWithOwner();
    const product = await provisionProduct(storeId);
    const order = await createPaidOrder(storeId, product.id);

    const res = await request(app).post(`/api/owner/orders/${order.id}/resend-delivery`);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/owner/orders/:orderId includes fulfillment", () => {
  function authed(method, path, token) {
    return request(app)[method](path).set("Authorization", `Bearer ${token}`);
  }

  test("returns fulfillment: null before fulfillment is triggered", async () => {
    const { storeId, sessionToken } = await provisionStoreWithOwner();
    const product = await provisionProduct(storeId);
    const order = await createPaidOrder(storeId, product.id);

    const res = await authed("get", `/api/owner/orders/${order.id}`, sessionToken);
    expect(res.status).toBe(200);
    expect(res.body.fulfillment).toBeNull();
  });

  test("returns fulfillment status after triggerFulfillment", async () => {
    const { storeId, sessionToken } = await provisionStoreWithOwner();
    const product = await provisionProduct(storeId);
    const order = await createPaidOrder(storeId, product.id);
    await triggerFulfillment(order.id, storeId);

    const res = await authed("get", `/api/owner/orders/${order.id}`, sessionToken);
    expect(res.status).toBe(200);
    expect(res.body.fulfillment).not.toBeNull();
    expect(res.body.fulfillment.status).toBe("sent");
    // delivery_token_hash must NOT be in response
    expect(res.body.fulfillment.delivery_token_hash).toBeUndefined();
  });
});
