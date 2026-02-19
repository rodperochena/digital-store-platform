"use strict";

const { request, app, randSuffix, createStore, createProduct } = require("./helpers");

test("Disabled store: public order creation must 404 (legacy)", async () => {
  const s = randSuffix();
  const slug = `disabled-${s}`;

  const createRes = await createStore({ slug, name: `Disabled ${s}`, currency: "usd" });
  expect(createRes.status).toBe(201);

  const storeId = createRes.body?.store?.id;
  expect(storeId).toBeTruthy();

  // Create a product (admin) even though store is disabled — public checkout must still 404
  const prodRes = await createProduct(storeId, {
    title: `P ${s}`,
    price_cents: 1990,
    currency: "usd",
    is_active: true,
    delivery_url: "https://example.com/dl",
  });
  expect(prodRes.status).toBe(201);

  const productId = prodRes.body?.product?.id;
  expect(productId).toBeTruthy();

  const legacy = await request(app)
    .post(`/api/stores/${storeId}/orders`)
    .set("Content-Type", "application/json")
    .send({ items: [{ product_id: productId, quantity: 1 }] });

  expect(legacy.status).toBe(404);
});

