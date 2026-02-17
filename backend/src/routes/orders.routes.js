"use strict";

const express = require("express");
const { z } = require("zod");
const { createOrder, getOrderWithItems, markOrderPaid } = require("../db/orders.queries");


const router = express.Router();

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createOrderSchema = z.object({
  customer_user_id: z.string().uuid().optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});

router.post("/stores/:storeId/orders", async (req, res, next) => {
  try {
    const { storeId } = req.params;
    if (!uuidRegex.test(storeId)) {
      return res.status(400).json({ error: { message: "Invalid store id" } });
    }

    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { message: "Invalid request body", issues: parsed.error.issues },
      });
    }

    const order = await createOrder(storeId, parsed.data);
    return res.status(201).json({ order });
  } catch (err) {
    return next(err);
  }
});

router.get("/stores/:storeId/orders/:orderId", async (req, res, next) => {
  try {
    const { storeId, orderId } = req.params;

    if (!uuidRegex.test(storeId)) {
      return res.status(400).json({ error: { message: "Invalid store id" } });
    }
    if (!uuidRegex.test(orderId)) {
      return res.status(400).json({ error: { message: "Invalid order id" } });
    }

    const result = await getOrderWithItems(storeId, orderId);

    if (!result) {
      return res.status(404).json({ error: { message: "Order not found" } });
    }

    return res.json(result);
  } catch (err) {
    return next(err);
  }
});
router.patch("/stores/:storeId/orders/:orderId/mark-paid", async (req, res, next) => {
    try {
      const { storeId, orderId } = req.params;
  
      if (!uuidRegex.test(storeId)) {
        return res.status(400).json({ error: { message: "Invalid store id" } });
      }
      if (!uuidRegex.test(orderId)) {
        return res.status(400).json({ error: { message: "Invalid order id" } });
      }
  
      const order = await markOrderPaid(storeId, orderId);
  
      if (!order) {
        return res.status(404).json({ error: { message: "Order not found" } });
      }
  
      return res.json({ order });
    } catch (err) {
      return next(err);
    }
  });
  
module.exports = { ordersRouter: router };
