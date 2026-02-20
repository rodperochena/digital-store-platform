"use strict";

const { request, app, randSuffix, createStore, ADMIN_KEY } = require("./helpers");

test("POST /api/stores without x-admin-key returns 401", async () => {
  const s = randSuffix();
  const res = await request(app)
    .post("/api/stores")
    .set("Content-Type", "application/json")
    .send({ slug: `noauth-${s}`, name: `NoAuth ${s}`, currency: "usd" });

  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({
    error: true,
    code: "UNAUTHORIZED",
    message: "Unauthorized",
  });
});

test("POST /api/stores/:storeId/products without x-admin-key returns 401", async () => {
  const s = randSuffix();
  const storeRes = await createStore({
    slug: `products-noauth-${s}`,
    name: `Products NoAuth ${s}`,
    currency: "usd",
  });

  expect(storeRes.status).toBe(201);
  const storeId = storeRes.body.store.id;

  const res = await request(app)
    .post(`/api/stores/${storeId}/products`)
    .set("Content-Type", "application/json")
    .send({
      title: "Unauthorized product",
      description: "Should fail without admin key",
      price_cents: 1499,
      currency: "usd",
      delivery_url: "https://example.com/dl",
    });

  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({
    error: true,
    code: "UNAUTHORIZED",
    message: "Unauthorized",
  });
});

test("GET /api/stores/:storeId/products without x-admin-key returns 401", async () => {
  const s = randSuffix();
  const storeRes = await createStore({
    slug: `products-list-noauth-${s}`,
    name: `Products List NoAuth ${s}`,
    currency: "usd",
  });

  expect(storeRes.status).toBe(201);
  const storeId = storeRes.body.store.id;

  const res = await request(app).get(`/api/stores/${storeId}/products`);

  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({
    error: true,
    code: "UNAUTHORIZED",
    message: "Unauthorized",
  });
});

test("POST and GET /api/stores/:storeId/products with x-admin-key continue to work", async () => {
  const s = randSuffix();
  const storeRes = await createStore({
    slug: `products-auth-${s}`,
    name: `Products Auth ${s}`,
    currency: "usd",
  });

  expect(storeRes.status).toBe(201);
  const storeId = storeRes.body.store.id;

  const createRes = await request(app)
    .post(`/api/stores/${storeId}/products`)
    .set("x-admin-key", ADMIN_KEY)
    .set("Content-Type", "application/json")
    .send({
      title: "Authorized product",
      description: "Should succeed with admin key",
      price_cents: 2999,
      currency: "usd",
      delivery_url: "https://example.com/authorized",
    });

  expect(createRes.status).toBe(201);
  expect(createRes.body.product).toBeTruthy();

  const listRes = await request(app)
    .get(`/api/stores/${storeId}/products`)
    .set("x-admin-key", ADMIN_KEY);

  expect(listRes.status).toBe(200);
  expect(Array.isArray(listRes.body.products)).toBe(true);
  expect(listRes.body.products.length).toBeGreaterThanOrEqual(1);
});
