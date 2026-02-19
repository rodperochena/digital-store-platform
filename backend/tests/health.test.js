"use strict";

const { request, app } = require("./helpers");

test("GET /api/health returns 200", async () => {
  const res = await request(app).get("/api/health");
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty("status");
});
