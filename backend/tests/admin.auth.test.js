"use strict";

const { request, app, randSuffix } = require("./helpers");

test("POST /api/stores without x-admin-key returns 401", async () => {
  const s = randSuffix();
  const res = await request(app)
    .post("/api/stores")
    .set("Content-Type", "application/json")
    .send({ slug: `noauth-${s}`, name: `NoAuth ${s}`, currency: "usd" });

  expect(res.status).toBe(401);
});
