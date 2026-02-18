"use strict";

const express = require("express");
const { z } = require("zod");
const { createOrder } = require("../db/orders.queries");
const { requireUuidParam, validateBody } = require("../middleware/validate.middleware");

const router = express.Router();

const createOrderSchema = z.object({
  customer_user_id: z.string().uuid().optional(),
  items: z.array(
    z.object({
      product_id: z.string().uuid(),
      quantity: z.number().int().positive(),
    })
  ).min(1, "items must have at least 1 item"),
});

/**
 * POST /api/stores/:storeId/orders
 * Public checkout endpoint
 */
router.post(
  "/stores/:storeId/orders",
  requireUuidParam("storeId"),
  validateBody(createOrderSchema),
  async (req, res, next) => {
    try {
      const { storeId } = req.params;
      const order = await createOrder(storeId, req.validatedBody);
      return res.status(201).json({ order });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = { ordersPublicRouter: router };
