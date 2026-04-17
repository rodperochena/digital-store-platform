"use strict";

const express = require("express");
const { corsMiddleware } = require("./middleware/cors.middleware");
const helmet = require("helmet");

const { apiRouter } = require("./routes");
const { notFoundHandler, errorHandler } = require("./middleware/error.middleware");
const { tenantResolver } = require("./middleware/tenant.middleware");
const { requestId } = require("./middleware/requestId.middleware");

// Ensure Supabase Storage buckets exist on startup (fire-and-forget)
try {
  const { ensureBucketsExist } = require("./lib/storage");
  ensureBucketsExist().catch((err) => console.warn("Storage bucket setup:", err.message));
} catch {
  // SUPABASE_URL / SUPABASE_SERVICE_KEY not set — storage features unavailable
}

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

  // Stripe webhook: must receive raw body for signature verification.
  // Registered BEFORE express.json() so the stream is not consumed first.
  const { stripeWebhookHandler } = require("./routes/stripe.routes");
  app.post(
    "/api/webhook/stripe",
    express.raw({ type: "application/json" }),
    stripeWebhookHandler
  );

  app.use(express.json());
  app.use(tenantResolver);

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
