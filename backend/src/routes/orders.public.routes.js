"use strict";

const express = require("express");
const { z } = require("zod");

const {
  createOrder,
  resolveEnabledStoreIdBySlug,
} = require("../db/queries/orders.queries");

const {
  requireUuidParam,
  validateBody,
} = require("../middleware/validate.middleware");

const { checkoutLimiter } = require("../middleware/rateLimit.middleware");

const router = express.Router();

const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, or hyphens");

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

function publicNotFound(req, res, message) {
  // Public: do NOT reveal if store exists but is disabled.
  return res.status(404).json({
    error: true,
    code: "NOT_FOUND",
    message: message || "Not found",
    path: req.originalUrl,
  });
}

function publicBadRequest(req, res, message) {
  return res.status(400).json({
    error: true,
    code: "BAD_REQUEST",
    message,
    path: req.originalUrl,
  });
}

async function handleCreateOrderByStoreId(req, res, next, storeId) {
  try {
    const order = await createOrder(storeId, req.validatedBody);

    // Contract: createOrder returns null when store doesn't exist OR is disabled (public 404)
    if (!order) return publicNotFound(req, res, "Store not found");

    return res.status(201).json({ order });
  } catch (err) {
    return next(err);
  }
}

async function handleCreateOrderBySlug(req, res, next, slug) {
  try {
    const storeId = await resolveEnabledStoreIdBySlug(slug);

    // resolveEnabledStoreIdBySlug returns null for not found OR disabled (public 404)
    if (!storeId) return publicNotFound(req, res, "Store not found");

    const order = await createOrder(storeId, req.validatedBody);
    if (!order) return publicNotFound(req, res, "Store not found");

    return res.status(201).json({ order });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/stores/:storeId/orders
 * Public checkout endpoint (legacy/compatible)
 */
router.post(
  "/stores/:storeId/orders",
  checkoutLimiter,
  requireUuidParam("storeId"),
  validateBody(createOrderSchema),
  async (req, res, next) => {
    const { storeId } = req.params;
    return handleCreateOrderByStoreId(req, res, next, storeId);
  }
);

/**
 * POST /api/store/:slug/orders
 * Public checkout endpoint (preferred: slug-based)
 */
router.post(
  "/store/:slug/orders",
  checkoutLimiter,
  validateBody(createOrderSchema),
  async (req, res, next) => {
    const slug = String(req.params.slug || "").trim().toLowerCase();

    const parsed = slugSchema.safeParse(slug);
    if (!parsed.success) return publicBadRequest(req, res, "Invalid store slug");

    return handleCreateOrderBySlug(req, res, next, parsed.data);
  }
);

/**
 * POST /api/storefront/orders
 * Public checkout endpoint (preferred: Host/tenant-based)
 *
 * Requires tenant middleware upstream to set req.tenant = {slug} or null.
 */
router.post(
  "/storefront/orders",
  checkoutLimiter,
  validateBody(createOrderSchema),
  async (req, res, next) => {
    const t = req.tenant;

    if (!t || !t.slug) return publicBadRequest(req, res, "Missing tenant Host subdomain");
    if (t.reserved) return publicBadRequest(req, res, "Invalid tenant Host subdomain");

    const slug = String(t.slug).trim().toLowerCase();
    const parsed = slugSchema.safeParse(slug);
    if (!parsed.success) return publicBadRequest(req, res, "Invalid tenant slug");

    return handleCreateOrderBySlug(req, res, next, parsed.data);
  }
);

module.exports = { ordersPublicRouter: router };
