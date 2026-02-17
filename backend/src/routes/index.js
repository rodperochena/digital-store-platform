const express = require("express");
const { healthRouter } = require("./health.routes");
const { storesRouter } = require("./stores.routes"); 
const { productsRouter } = require("./products.routes");
const { ordersRouter } = require("./orders.routes");

const apiRouter = express.Router();

apiRouter.use("/health", healthRouter);
apiRouter.use(storesRouter); 
apiRouter.use(productsRouter);
apiRouter.use(ordersRouter);

module.exports = { apiRouter };
