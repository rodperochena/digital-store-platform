const express = require("express");

const healthRouter = express.Router();

healthRouter.get("/", (req, res) => {
  res.json({ status: "server running" });
});

module.exports = { healthRouter };
