"use strict";

const express = require("express");
const { z } = require("zod");
const {
  listOrdersByStore,
  getOrderWithItems,
  markOrderPaid,
  attachPaymentIntent,
  markOrderPaidByPaymentIntent,
} = require("../db/queries/orders.queries");

const { requireUuidParam, validateBody } = require("../middleware/validate.middleware");

const router = express.Router();

const paymentIntentSchema = z.object({
  stripe_payment_intent_id: z.string().min(5).max(200),
});

/**
 * GET /api/stores/:storeId/orders
 */
router.get(
    "/stores/:storeId/orders",
    requireUuidParam("storeId"),
    async (req, res, next) => {
      try {
        const { storeId } = req.params;
  
        const raw = req.query.limit;
        const rawStr = Array.isArray(raw) ? raw[0] : raw;
  
        let safeLimit;
        if (rawStr !== undefined) {
          const n = Number(rawStr);
  
          // must be a positive integer
          if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
            return res.status(400).json({
              error: true,
              code: "BAD_REQUEST",
              message: "limit must be a positive integer",
              path: req.originalUrl,
            });
          }
  
          // clamp 1..100
          safeLimit = Math.min(n, 100);
        }
  
        const orders = await listOrdersByStore(storeId, { limit: safeLimit });
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

      if (result.kind === "CONFLICT_PI_IN_USE") {
        return res.status(409).json({
          error: true,
          code: "CONFLICT",
          message:
            "That stripe_payment_intent_id is already attached to another order in this store",
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

module.exports = { ordersAdminRouter: router };
