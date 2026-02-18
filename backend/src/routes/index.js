const express = require("express");

const { healthRouter } = require("./health.routes");
const { storefrontRouter } = require("./storefront.routes");
const { storefrontHostRouter } = require("./storefrontHost.routes");

const { storesRouter } = require("./stores.routes");
const { productsRouter } = require("./products.routes");

const { ordersPublicRouter } = require("./orders.public.routes");
const { ordersAdminRouter } = require("./orders.admin.routes");

const { requireAdminKey } = require("../middleware/admin.middleware");

const apiRouter = express.Router();

apiRouter.use("/health", healthRouter);

// Public APIs
apiRouter.use(storefrontRouter);
apiRouter.use(storefrontHostRouter);
apiRouter.use(ordersPublicRouter);

// Admin APIs
apiRouter.use(requireAdminKey);
apiRouter.use(storesRouter);
apiRouter.use(productsRouter);
apiRouter.use(ordersAdminRouter);

module.exports = { apiRouter };
