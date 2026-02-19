"use strict";

const express = require("express");
const cors = require("cors");
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

  // CORS env-based (CSV)
  const corsOriginRaw = String(process.env.CORS_ORIGIN || "").trim();
  const allowedOrigins = corsOriginRaw
    ? corsOriginRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true); // curl/postman
        if (!allowedOrigins) {
          if (process.env.NODE_ENV !== "production") return cb(null, true);
          return cb(null, false);
        }
        return cb(null, allowedOrigins.includes(origin));
      },
      credentials: String(process.env.CORS_CREDENTIALS || "0") === "1",
    })
  );

  app.use(requestId);
  app.use(express.json());
  app.use(tenantResolver);

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
