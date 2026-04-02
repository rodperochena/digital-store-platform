"use strict";

/**
 * tests/owner.auth.test.js
 *
 * Integration tests for owner auth + first-sale simulation flow.
 * Covers:
 *   - claim-access success and failure paths
 *   - login success and failure paths
 *   - session validation
 *   - cross-store order isolation (store A owner cannot access store B orders)
 *   - dev mark-paid cross-store rejection
 *   - public storefront does not leak delivery_url
 */

const { request, app, randSuffix, createStore, enableStore, createProduct } = require("./helpers");

// scrypt is intentionally slow — each ownerClaim takes ~500 ms.
// Tests that call ownerClaim multiple times need a longer timeout.
jest.setTimeout(30_000);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Provision a store via the dev endpoint and return { store_id, slug, bootstrap_token }. */
async function devProvision() {
  const res = await request(app).post("/api/dev/provision-store");
  if (res.status !== 201) throw new Error(`provision-store failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body; // { store_id, slug, bootstrap_token, ... }
}

/** Claim owner access and return { session_token, store }. */
async function ownerClaim(store_id, bootstrap_token, password = "password123") {
  const res = await request(app)
    .post("/api/owner/claim-access")
    .set("Content-Type", "application/json")
    .send({ store_id, bootstrap_token, password });
  if (res.status !== 201) throw new Error(`claim-access failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body; // { session_token, store }
}

/**
 * Make an authenticated request.
 * HTTP method must be supplied first so the supertest chain is valid.
 * Usage: authed("get", "/api/owner/session", token)
 *        authed("post", "/api/owner/logout", token)
 */
function authed(method, path, token) {
  return request(app)[method](path).set("Authorization", `Bearer ${token}`);
}

// ── claim-access ──────────────────────────────────────────────────────────────

describe("POST /api/owner/claim-access", () => {
  test("success: returns session_token and store", async () => {
    const { store_id, bootstrap_token } = await devProvision();

    const res = await request(app)
      .post("/api/owner/claim-access")
      .set("Content-Type", "application/json")
      .send({ store_id, bootstrap_token, password: "testpassword1" });

    expect(res.status).toBe(201);
    expect(typeof res.body.session_token).toBe("string");
    expect(res.body.session_token.length).toBeGreaterThan(10);
    expect(res.body.store).toMatchObject({ id: store_id });
    // delivery_url must not appear in store response
    expect(res.body.store.delivery_url).toBeUndefined();
  });

  test("fail: wrong bootstrap token → 401", async () => {
    const { store_id } = await devProvision();

    const res = await request(app)
      .post("/api/owner/claim-access")
      .set("Content-Type", "application/json")
      .send({ store_id, bootstrap_token: "totally-wrong-token", password: "testpassword1" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe(true);
  });

  test("fail: already claimed → 409", async () => {
    const { store_id, bootstrap_token } = await devProvision();
    // Claim once
    await ownerClaim(store_id, bootstrap_token, "firstpassword1");

    // Attempt to claim again (bootstrap token is now cleared in DB)
    const res = await request(app)
      .post("/api/owner/claim-access")
      .set("Content-Type", "application/json")
      .send({ store_id, bootstrap_token, password: "secondpassword1" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ALREADY_CLAIMED");
  });

  test("fail: password too short → 400", async () => {
    const { store_id, bootstrap_token } = await devProvision();

    const res = await request(app)
      .post("/api/owner/claim-access")
      .set("Content-Type", "application/json")
      .send({ store_id, bootstrap_token, password: "short" });

    expect(res.status).toBe(400);
  });
});

// ── login ─────────────────────────────────────────────────────────────────────

describe("POST /api/owner/login", () => {
  let slug;
  const password = "logintest99";

  beforeAll(async () => {
    const prov = await devProvision();
    slug = prov.slug;
    await ownerClaim(prov.store_id, prov.bootstrap_token, password);
  });

  test("success: login by slug → returns session_token", async () => {
    const res = await request(app)
      .post("/api/owner/login")
      .set("Content-Type", "application/json")
      .send({ identifier: slug, password });

    expect(res.status).toBe(200);
    expect(typeof res.body.session_token).toBe("string");
    expect(res.body.store).toMatchObject({ slug });
  });

  test("fail: wrong password → 401", async () => {
    const res = await request(app)
      .post("/api/owner/login")
      .set("Content-Type", "application/json")
      .send({ identifier: slug, password: "wrongpassword" });

    expect(res.status).toBe(401);
  });

  test("fail: non-existent slug → 401", async () => {
    const res = await request(app)
      .post("/api/owner/login")
      .set("Content-Type", "application/json")
      .send({ identifier: `nonexistent-${randSuffix()}`, password });

    expect(res.status).toBe(401);
  });

  test("fail: unclaimed store → 401", async () => {
    const prov = await devProvision();
    // Do NOT claim — just try to login
    const res = await request(app)
      .post("/api/owner/login")
      .set("Content-Type", "application/json")
      .send({ identifier: prov.slug, password: "anypwd123" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });
});

// ── session validation ────────────────────────────────────────────────────────

describe("GET /api/owner/session", () => {
  let sessionToken;
  let storeId;

  beforeAll(async () => {
    const prov = await devProvision();
    storeId = prov.store_id;
    const claimed = await ownerClaim(storeId, prov.bootstrap_token, "sessiontest1");
    sessionToken = claimed.session_token;
  });

  test("valid token → 200 with valid: true and store", async () => {
    const res = await authed("get", "/api/owner/session", sessionToken);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.store).toMatchObject({ id: storeId });
    expect(res.body.owner.store_id).toBe(storeId);
  });

  test("no token → 401", async () => {
    const res = await request(app).get("/api/owner/session");
    expect(res.status).toBe(401);
  });

  test("invalid token → 401", async () => {
    const res = await authed("get", "/api/owner/session", "notavalidtoken");
    expect(res.status).toBe(401);
  });

  test("logout then session rejected → 401", async () => {
    // Create a fresh session to logout
    const prov = await devProvision();
    const claimed = await ownerClaim(prov.store_id, prov.bootstrap_token, "logouttest1");
    const tok = claimed.session_token;

    // Logout
    const logoutRes = await authed("post", "/api/owner/logout", tok);
    expect(logoutRes.status).toBe(200);

    // Session should now be rejected
    const sessionRes = await authed("get", "/api/owner/session", tok);
    expect(sessionRes.status).toBe(401);
  });
});

// ── cross-store order isolation ───────────────────────────────────────────────

describe("Cross-store order isolation", () => {
  let tokenA;
  let tokenB;
  let orderId;
  let slugA;

  beforeAll(async () => {
    // Provision + claim two separate stores
    const provA = await devProvision();
    const provB = await devProvision();
    slugA = provA.slug;

    const claimedA = await ownerClaim(provA.store_id, provA.bootstrap_token, "crossstoreA1");
    const claimedB = await ownerClaim(provB.store_id, provB.bootstrap_token, "crossstoreB1");
    tokenA = claimedA.session_token;
    tokenB = claimedB.session_token;

    // Create a product on store A via owner API
    const productRes = await authed("post", "/api/owner/products", tokenA)
      .set("Content-Type", "application/json")
      .send({ title: "Test Product", price_cents: 999, is_active: true });
    expect(productRes.status).toBe(201);
    const productId = productRes.body.product.id;

    // Place an order on store A's public storefront
    const orderRes = await request(app)
      .post(`/api/store/${slugA}/orders`)
      .set("Content-Type", "application/json")
      .send({ items: [{ product_id: productId, quantity: 1 }] });
    expect(orderRes.status).toBe(201);
    orderId = orderRes.body.order.id;
  });

  test("owner A can fetch the order they own", async () => {
    const res = await authed("get", `/api/owner/orders/${orderId}`, tokenA);
    expect(res.status).toBe(200);
    expect(res.body.order.id).toBe(orderId);
  });

  test("owner B cannot fetch store A order → 404", async () => {
    const res = await authed("get", `/api/owner/orders/${orderId}`, tokenB);
    expect(res.status).toBe(404);
  });

  test("owner B cannot mark store A order as paid → 404", async () => {
    const res = await authed("post", `/api/dev/orders/${orderId}/mark-paid`, tokenB);
    expect(res.status).toBe(404);
  });

  test("owner A can mark their own order as paid", async () => {
    const res = await authed("post", `/api/dev/orders/${orderId}/mark-paid`, tokenA);
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("paid");
  });
});

// ── public storefront does not leak delivery_url ──────────────────────────────

describe("Public storefront — delivery_url not exposed", () => {
  let slug;

  beforeAll(async () => {
    const s = randSuffix();
    const storeRes = await createStore({ slug: `dltest-${s}`, name: `DL Test ${s}` });
    expect(storeRes.status).toBe(201);
    const storeId = storeRes.body.store.id;
    slug = storeRes.body.store.slug;

    await enableStore(storeId);

    await createProduct(storeId, {
      title: "Secret Product",
      price_cents: 1000,
      is_active: true,
      delivery_url: "https://secret.example.com/download/file.zip",
    });
  });

  test("GET /api/store/:slug/products does not include delivery_url", async () => {
    const res = await request(app).get(`/api/store/${slug}/products`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body.products.length).toBeGreaterThan(0);

    for (const product of res.body.products) {
      expect(product.delivery_url).toBeUndefined();
    }
  });
});
