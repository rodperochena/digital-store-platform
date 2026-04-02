"use strict";

const express = require("express");

const { healthRouter } = require("./health.routes");
const { storefrontRouter } = require("./storefront.routes");
const { storefrontHostRouter } = require("./storefrontHost.routes");
const { storesRouter } = require("./stores.routes");
const { productsRouter } = require("./products.routes");
const { ordersPublicRouter } = require("./orders.public.routes");
const { ordersAdminRouter } = require("./orders.admin.routes");
const { ownerRouter } = require("./owner.routes");
const { stripeRouter } = require("./stripe.routes");
const { deliveryRouter } = require("./delivery.routes");

const { publicLimiter } = require("../middleware/rateLimit.middleware");

const apiRouter = express.Router();

apiRouter.use("/health", healthRouter);

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

// Dev-only APIs — never mounted in production
if (String(process.env.NODE_ENV || "").toLowerCase() !== "production") {
  const { devRouter } = require("./dev.routes");
  apiRouter.use("/dev", devRouter);
}

module.exports = { apiRouter };