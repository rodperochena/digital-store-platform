"use strict";

// Routes: health
// Exposes GET /api/health — checks DB connectivity and returns 200 or 503.
// HEALTH_SIMULATE_DB_DOWN=1 forces a 503 without hitting the DB (useful for health-check CI tests).

const express = require("express");
const { pingDb } = require("../db/ping");

const healthRouter = express.Router();

// GET /api/health — Public, no auth
// Pings the DB with SELECT 1. Returns 503 if unreachable.
// db_ms is only included outside production to avoid exposing latency info publicly.
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
