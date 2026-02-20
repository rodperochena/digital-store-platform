"use strict";

const request = require("supertest");
const { createApp } = require("../src/app");

describe("request_id contract", () => {
  test("GET /api/does-not-exist returns x-request-id and body.request_id (match)", async () => {
    const app = createApp();

    const res = await request(app)
      .get("/api/does-not-exist")
      .set("Accept", "application/json");

    const ridHeader = res.headers["x-request-id"];
    expect(ridHeader).toBeTruthy();

    // Your not-found handler should return JSON error payload
    expect(res.status).toBe(404);
    expect(res.body).toBeTruthy();
    expect(res.body.error).toBe(true);
    expect(res.body.request_id).toBe(ridHeader);
  });
});
