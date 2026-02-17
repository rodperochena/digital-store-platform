const express = require("express");
const { healthRouter } = require("./health.routes");
const { storesRouter } = require("./stores.routes"); 
const { productsRouter } = require("./products.routes");
const { ordersRouter } = require("./orders.routes");
const { storefrontRouter } = require("./storefront.routes");
const { storefrontHostRouter } = require("./storefrontHost.routes");

const apiRouter = express.Router();

apiRouter.use("/health", healthRouter);
apiRouter.use(storesRouter); 
apiRouter.use(productsRouter);
apiRouter.use(ordersRouter);
apiRouter.use(storefrontRouter);
apiRouter.use(storefrontHostRouter);

module.exports = { apiRouter };
