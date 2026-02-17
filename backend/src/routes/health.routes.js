"use strict";

const express = require("express");
const { pingDb } = require("../db/ping");

const healthRouter = express.Router();

healthRouter.get("/", async (req, res) => {
  try {
    const ok = await pingDb();
    res.json({
      status: "server running",
      db: ok ? "ok" : "fail",
    });
  } catch (err) {
    res.json({
      status: "server running",
      db: "fail",
    });
  }
});

module.exports = { healthRouter };
