const express = require("express");

const { healthRouter } = require("./health.routes");
const { storefrontRouter } = require("./storefront.routes");
const { storefrontHostRouter } = require("./storefrontHost.routes");
const { storesRouter } = require("./stores.routes");
const { productsRouter } = require("./products.routes");
const { ordersPublicRouter } = require("./orders.public.routes");
const { ordersAdminRouter } = require("./orders.admin.routes");

const { requireAdminKey } = require("../middleware/admin.middleware");
const { publicLimiter } = require("../middleware/rateLimit.middleware");

const apiRouter = express.Router();

apiRouter.use("/health", healthRouter);

// Public APIs (rate-limited)
apiRouter.use(["/storefront", "/store"], publicLimiter);
apiRouter.use(storefrontRouter);
apiRouter.use(storefrontHostRouter);
apiRouter.use(ordersPublicRouter);

// Admin APIs (protected, explicit)
// IMPORTANT: do NOT mount under "/stores" if the routers already include "/stores" in their paths.
const adminRouter = express.Router();
adminRouter.use(requireAdminKey);
adminRouter.use(storesRouter);
adminRouter.use(productsRouter);
adminRouter.use(ordersAdminRouter);

apiRouter.use(adminRouter);

module.exports = { apiRouter };
