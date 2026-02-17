"use strict";

const express = require("express");
const { z } = require("zod");
const {
  createOrder,
  listOrdersByStore,
  getOrderWithItems,
  markOrderPaid,
  attachPaymentIntent,
  markOrderPaidByPaymentIntent,
} = require("../db/orders.queries");

const { requireUuidParam, validateBody } = require("../middleware/validate.middleware");

const router = express.Router();

/**
 * NOTE:
 * We intentionally allow duplicate product_id lines here.
 * The DB layer normalizes/merges duplicates defensively (normalizeItems).
 */
const createOrderSchema = z.object({
  customer_user_id: z.string().uuid().optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1, "items must have at least 1 item"),
});

const paymentIntentSchema = z.object({
  stripe_payment_intent_id: z.string().min(5).max(200),
});

/**
 * POST /api/stores/:storeId/orders
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

/**
 * GET /api/stores/:storeId/orders
 * Admin listing
 * Optional query: ?limit=50 (max 100)
 */
router.get(
  "/stores/:storeId/orders",
  requireUuidParam("storeId"),
  async (req, res, next) => {
    try {
      const { storeId } = req.params;

      const orders = await listOrdersByStore(storeId, {
        limit: req.query.limit,
      });

      return res.json({ orders });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/stores/:storeId/orders/:orderId
 */
router.get(
  "/stores/:storeId/orders/:orderId",
  requireUuidParam("storeId"),
  requireUuidParam("orderId"),
  async (req, res, next) => {
    try {
      const { storeId, orderId } = req.params;

      const result = await getOrderWithItems(storeId, orderId);
      if (!result) {
        return res.status(404).json({
          error: true,
          code: "NOT_FOUND",
          message: "Order not found",
          path: req.originalUrl,
        });
      }

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * PATCH /api/stores/:storeId/orders/:orderId/mark-paid
 * Temporary simulation endpoint (until Stripe webhook integration)
 */
router.patch(
  "/stores/:storeId/orders/:orderId/mark-paid",
  requireUuidParam("storeId"),
  requireUuidParam("orderId"),
  async (req, res, next) => {
    try {
      const { storeId, orderId } = req.params;

      const result = await markOrderPaid(storeId, orderId);

      if (result.kind === "NOT_FOUND") {
        return res.status(404).json({
          error: true,
          code: "NOT_FOUND",
          message: "Order not found",
          path: req.originalUrl,
        });
      }

      if (result.kind === "INVALID_STATE") {
        return res.status(409).json({
          error: true,
          code: "CONFLICT",
          message: `Cannot mark paid from status '${result.status}'`,
          path: req.originalUrl,
        });
      }

      return res.json({ order: result.order });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * PATCH /api/stores/:storeId/orders/:orderId/attach-payment-intent
 */
router.patch(
  "/stores/:storeId/orders/:orderId/attach-payment-intent",
  requireUuidParam("storeId"),
  requireUuidParam("orderId"),
  validateBody(paymentIntentSchema),
  async (req, res, next) => {
    try {
      const { storeId, orderId } = req.params;

      const result = await attachPaymentIntent(
        storeId,
        orderId,
        req.validatedBody.stripe_payment_intent_id
      );

      if (result.kind === "NOT_FOUND") {
        return res.status(404).json({
          error: true,
          code: "NOT_FOUND",
          message: "Order not found",
          path: req.originalUrl,
        });
      }

      if (result.kind === "CONFLICT") {
        return res.status(409).json({
          error: true,
          code: "CONFLICT",
          message: "Order already has a different stripe_payment_intent_id",
          path: req.originalUrl,
        });
      }

      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * PATCH /api/stores/:storeId/orders/mark-paid-by-payment-intent
 */
router.patch(
  "/stores/:storeId/orders/mark-paid-by-payment-intent",
  requireUuidParam("storeId"),
  validateBody(paymentIntentSchema),
  async (req, res, next) => {
    try {
      const { storeId } = req.params;

      const result = await markOrderPaidByPaymentIntent(
        storeId,
        req.validatedBody.stripe_payment_intent_id
      );

      if (result.kind === "NOT_FOUND") {
        return res.status(404).json({
          error: true,
          code: "NOT_FOUND",
          message: "Order not found for that payment intent",
          path: req.originalUrl,
        });
      }

      if (result.kind === "INVALID_STATE") {
        return res.status(409).json({
          error: true,
          code: "CONFLICT",
          message: `Cannot mark paid from status '${result.status}'`,
          path: req.originalUrl,
        });
      }

      return res.json({ order: result.order });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = { ordersRouter: router };
