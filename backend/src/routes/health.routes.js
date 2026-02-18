"use strict";

const express = require("express");
const { pingDb } = require("../db/ping");

const healthRouter = express.Router();

/**
 * GET /api/health
 * - 200 if server + DB are healthy
 * - 503 if DB is unhealthy
 *
 * Dev-only test hook:
 * - If HEALTH_SIMULATE_DB_DOWN=1, we return 503 without hitting DB.
 */
healthRouter.get("/", async (req, res) => {
  try {
    if (process.env.HEALTH_SIMULATE_DB_DOWN === "1") {
      return res.status(503).json({ status: "server running", db: "fail" });
    }

    const result = await pingDb();

    if (!result.ok) {
      // Keep response clean in prod; include useful info in dev.
      const payload = { status: "server running", db: "fail" };

      if (process.env.NODE_ENV !== "production") {
        payload.db_error = result.error || null;
        payload.db_ms = result.ms;
      }

      return res.status(503).json(payload);
    }

    return res.status(200).json({
      status: "server running",
      db: "ok",
      db_ms: process.env.NODE_ENV !== "production" ? result.ms : undefined,
    });
  } catch (err) {
    return res.status(503).json({ status: "server running", db: "fail" });
  }
});

module.exports = { healthRouter };
