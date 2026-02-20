"use strict";

const express = require("express");

const { healthRouter } = require("./health.routes");
const { storefrontRouter } = require("./storefront.routes");
const { storefrontHostRouter } = require("./storefrontHost.routes");
const { storesRouter } = require("./stores.routes");
const { productsRouter } = require("./products.routes");
const { ordersPublicRouter } = require("./orders.public.routes");
const { ordersAdminRouter } = require("./orders.admin.routes");

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

module.exports = { apiRouter };