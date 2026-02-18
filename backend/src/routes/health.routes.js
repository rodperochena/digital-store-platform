"use strict";

const express = require("express");
const { pingDb } = require("../db/ping");

const healthRouter = express.Router();

/**
 * GET /api/health
 * - 200 if server + DB are healthy
 * - 503 if DB is unhealthy (prod-friendly signal for load balancers)
 *
 * Dev-only test hook:
 * - If HEALTH_SIMULATE_DB_DOWN=1, we return 503 without hitting DB.
 */
healthRouter.get("/", async (req, res) => {
  try {
    if (process.env.HEALTH_SIMULATE_DB_DOWN === "1") {
      return res.status(503).json({
        status: "server running",
        db: "fail",
      });
    }

    const ok = await pingDb();

    if (!ok) {
      return res.status(503).json({
        status: "server running",
        db: "fail",
      });
    }

    return res.status(200).json({
      status: "server running",
      db: "ok",
    });
  } catch (err) {
    return res.status(503).json({
      status: "server running",
      db: "fail",
    });
  }
});

module.exports = { healthRouter };
