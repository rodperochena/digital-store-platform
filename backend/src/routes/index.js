const express = require("express");
const { healthRouter } = require("./health.routes");

const apiRouter = express.Router();

apiRouter.use("/health", healthRouter);

module.exports = { apiRouter };
