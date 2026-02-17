"use strict";

const express = require("express");
const { z } = require("zod");
const {
  createOrder,
  getOrderWithItems,
  markOrderPaid,
  attachPaymentIntent,
  markOrderPaidByPaymentIntent,
} = require("../db/orders.queries");

const router = express.Router();

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createOrderSchema = z
  .object({
    customer_user_id: z.string().uuid().optional(),
    items: z
      .array(
        z.object({
          product_id: z.string().uuid(),
          quantity: z.number().int().positive(),
        })
      )
      .min(1, "items must have at least 1 item"),
  })
  .superRefine((val, ctx) => {
    const seen = new Map(); // product_id -> first index
    val.items.forEach((it, idx) => {
      const prev = seen.get(it.product_id);
      if (prev !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", idx, "product_id"],
          message: `Duplicate product_id. Merge quantities instead of repeating the same product (first at items[${prev}])`,
        });
      } else {
        seen.set(it.product_id, idx);
      }
    });
});


const paymentIntentSchema = z.object({
  stripe_payment_intent_id: z.string().min(5).max(200),
});

/**
 * POST /api/stores/:storeId/orders
 */
router.post("/stores/:storeId/orders", async (req, res, next) => {
  try {
    const { storeId } = req.params;

    if (!uuidRegex.test(storeId)) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: "Invalid store id",
        path: req.originalUrl,
      });
    }

    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: "Invalid request body",
        issues: parsed.error.issues,
        path: req.originalUrl,
      });
    }

    const order = await createOrder(storeId, parsed.data);
    return res.status(201).json({ order });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/stores/:storeId/orders/:orderId
 */
router.get("/stores/:storeId/orders/:orderId", async (req, res, next) => {
  try {
    const { storeId, orderId } = req.params;

    if (!uuidRegex.test(storeId)) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: "Invalid store id",
        path: req.originalUrl,
      });
    }

    if (!uuidRegex.test(orderId)) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: "Invalid order id",
        path: req.originalUrl,
      });
    }

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
});

/**
 * PATCH /api/stores/:storeId/orders/:orderId/mark-paid
 * Temporary simulation endpoint (until Stripe webhook integration)
 */
router.patch("/stores/:storeId/orders/:orderId/mark-paid", async (req, res, next) => {
  try {
    const { storeId, orderId } = req.params;

    if (!uuidRegex.test(storeId)) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: "Invalid store id",
        path: req.originalUrl,
      });
    }

    if (!uuidRegex.test(orderId)) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: "Invalid order id",
        path: req.originalUrl,
      });
    }

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
});

/**
 * PATCH /api/stores/:storeId/orders/:orderId/attach-payment-intent
 */
router.patch(
  "/stores/:storeId/orders/:orderId/attach-payment-intent",
  async (req, res, next) => {
    try {
      const { storeId, orderId } = req.params;

      if (!uuidRegex.test(storeId)) {
        return res.status(400).json({
          error: true,
          code: "BAD_REQUEST",
          message: "Invalid store id",
          path: req.originalUrl,
        });
      }

      if (!uuidRegex.test(orderId)) {
        return res.status(400).json({
          error: true,
          code: "BAD_REQUEST",
          message: "Invalid order id",
          path: req.originalUrl,
        });
      }

      const parsed = paymentIntentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: true,
          code: "BAD_REQUEST",
          message: "Invalid request body",
          issues: parsed.error.issues,
          path: req.originalUrl,
        });
      }

      const result = await attachPaymentIntent(
        storeId,
        orderId,
        parsed.data.stripe_payment_intent_id
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
  async (req, res, next) => {
    try {
      const { storeId } = req.params;

      if (!uuidRegex.test(storeId)) {
        return res.status(400).json({
          error: true,
          code: "BAD_REQUEST",
          message: "Invalid store id",
          path: req.originalUrl,
        });
      }

      const parsed = paymentIntentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: true,
          code: "BAD_REQUEST",
          message: "Invalid request body",
          issues: parsed.error.issues,
          path: req.originalUrl,
        });
      }

      const result = await markOrderPaidByPaymentIntent(
        storeId,
        parsed.data.stripe_payment_intent_id
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
