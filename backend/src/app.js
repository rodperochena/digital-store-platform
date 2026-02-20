"use strict";

const express = require("express");
const { corsMiddleware } = require("./middleware/cors.middleware");
const helmet = require("helmet");

const { apiRouter } = require("./routes");
const { notFoundHandler, errorHandler } = require("./middleware/error.middleware");
const { tenantResolver } = require("./middleware/tenant.middleware");
const { requestId } = require("./middleware/requestId.middleware");

function createApp() {
  const app = express();

  // TRUST_PROXY=1 (Render/Heroku/Nginx/Cloudflare)
  if (process.env.TRUST_PROXY) {
    const v = process.env.TRUST_PROXY;
    const asNum = Number(v);
    app.set("trust proxy", Number.isFinite(asNum) ? asNum : v);
  }

  app.use(helmet());
  app.use(corsMiddleware());

  app.use(requestId);
  app.use(express.json());
  app.use(tenantResolver);

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
