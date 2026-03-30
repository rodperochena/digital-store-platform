"use strict";

const express = require("express");
const request = require("supertest");
const { requestId } = require("../src/middleware/requestId.middleware");
const { createApp } = require("../src/app");

describe("requestId middleware", () => {
  test("injects request_id into JSON error payloads when missing", async () => {
    const app = express();
    app.use(requestId);

    app.get("/oops", (req, res) => {
      return res.status(400).json({ error: true, code: "BAD_REQUEST", message: "nope" });
    });

    const res = await request(app).get("/oops");
    expect(res.status).toBe(400);

    const headerId = res.headers["x-request-id"];
    expect(headerId).toBeTruthy();
    expect(res.body.request_id).toBe(headerId);
  });

  test("404 payload has request_id matching x-request-id", async () => {
    const app = createApp();
    const res = await request(app).get("/api/does-not-exist");

    const headerId = res.headers["x-request-id"];
    expect(headerId).toBeTruthy();

    // Your error middleware uses request_id already; this ensures consistency.
    expect(res.body && res.body.request_id).toBe(headerId);
  });
});
