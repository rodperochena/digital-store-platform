"use strict";

const request = require("supertest");
const { createApp } = require("../src/app");

describe("CORS - allow *.localhost in non-production", () => {
  const savedEnv = { ...process.env };

  afterAll(() => {
    process.env = savedEnv;
  });

  test("sets ACAO for http://a.localhost:3000", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.CORS_ORIGIN; // default behavior
    process.env.CORS_ALLOW_LOCAL_DEV = "1";

    const app = createApp();
    const res = await request(app)
      .get("/api/health")
      .set("Origin", "http://a.localhost:3000");

    expect(res.headers["access-control-allow-origin"]).toBe("http://a.localhost:3000");
  });
});
