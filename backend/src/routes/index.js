"use strict";

// Routes: API router
// Assembles all sub-routers into the main /api/* router.
// Public routes are rate-limited via publicLimiter. Route-specific auth is handled inside each router.
// Dev routes (/api/dev/*) are only mounted when NODE_ENV != production.

const express = require("express");

const { healthRouter } = require("./health.routes");
const { taxonomyRouter } = require("./taxonomy.routes");
const { storefrontRouter } = require("./storefront.routes");
const { storefrontHostRouter } = require("./storefrontHost.routes");
const { storesRouter } = require("./stores.routes");
const { productsRouter } = require("./products.routes");
const { ordersPublicRouter } = require("./orders.public.routes");
const { ordersAdminRouter } = require("./orders.admin.routes");
const { ownerRouter } = require("./owner.routes");
const { stripeRouter } = require("./stripe.routes");
const { deliveryRouter } = require("./delivery.routes");
const { trackingRouter } = require("./tracking.routes");
const { buyerRouter }   = require("./buyer.routes");

const { publicLimiter } = require("../middleware/rateLimit.middleware");

const apiRouter = express.Router();

apiRouter.use("/health", healthRouter);
apiRouter.use(taxonomyRouter);

// Public APIs (rate-limited)
apiRouter.use(["/storefront", "/store"], publicLimiter);
apiRouter.use(storefrontRouter);
apiRouter.use(storefrontHostRouter);
apiRouter.use(ordersPublicRouter);

// Admin APIs (protected at route-level inside each router)
apiRouter.use(storesRouter);
apiRouter.use(productsRouter);
apiRouter.use(ordersAdminRouter);

// Owner session validation
apiRouter.use("/owner", ownerRouter);

// Stripe checkout session (public, store-scoped)
apiRouter.use(stripeRouter);

// Delivery endpoint: GET /api/deliver/:token
apiRouter.use(deliveryRouter);

// Email open tracking pixel: GET /api/track/open/:token
apiRouter.use(trackingRouter);

// Buyer account + session routes (paths include /buyer/* prefix internally)
apiRouter.use(buyerRouter);

// Dev-only APIs — never mounted in production
if (String(process.env.NODE_ENV || "").toLowerCase() !== "production") {
  const { devRouter } = require("./dev.routes");
  apiRouter.use("/dev", devRouter);
}

// DEMO: temporary demo checkout routes — not gated by NODE_ENV so they work in the demo env.
// Remove after the demo when Stripe is fully configured.
const { demoRouter } = require("./demo.routes");
apiRouter.use(demoRouter);

module.exports = { apiRouter };