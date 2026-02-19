"use strict";

const { request, app, randSuffix, createStore, enableStore, patchStoreSettings } = require("./helpers");

test("Host routing: /api/storefront/meta resolves tenant slug", async () => {
  const s = randSuffix();
  const slug = `t-${s}`;

  const createRes = await createStore({ slug, name: `Tenant ${s}`, currency: "usd" });
  expect(createRes.status).toBe(201);

  const storeId = createRes.body?.store?.id;
  expect(storeId).toBeTruthy();

  await enableStore(storeId);
  await patchStoreSettings(storeId, { currency: "usd" });

  const res = await request(app)
    .get("/api/storefront/meta")
    .set("Host", `${slug}.localhost`);

  expect(res.status).toBe(200);
  expect(res.body?.store?.slug).toBe(slug);
});
