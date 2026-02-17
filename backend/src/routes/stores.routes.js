"use strict";

const express = require("express");
const { z } = require("zod");
const {
  createStore,
  enableStore,
  getStoreSettings,
  updateStoreSettings,
} = require("../db/stores.queries");

const {
  requireUuidParam,
  validateBody,
} = require("../middleware/validate.middleware");

const router = express.Router();

const createStoreSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, or hyphens"),
  name: z.string().min(2).max(100),
});

const updateStoreSettingsSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  currency: z.string().min(3).max(10).optional(),
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "primary_color must be a hex color like #RRGGBB")
    .optional(),
  logo_url: z.string().url().optional(),
});

/**
 * POST /api/stores
 * Creates a new store (is_enabled defaults to false).
 */
router.post("/stores", validateBody(createStoreSchema), async (req, res, next) => {
  try {
    const store = await createStore(req.validatedBody);
    return res.status(201).json({ store });
  } catch (err) {
    return next(err);
  }
});

/**
 * PATCH /api/stores/:id/enable
 * Enable store (set is_enabled = true).
 */
router.patch(
  "/stores/:id/enable",
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      const storeId = req.params.id;

      const store = await enableStore(storeId);
      if (!store) {
        return res.status(404).json({
          error: true,
          code: "NOT_FOUND",
          message: "Store not found",
          path: req.originalUrl,
        });
      }

      return res.json({ store });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/stores/:id/settings
 * Returns store settings/branding fields (admin use).
 */
router.get(
  "/stores/:id/settings",
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      const storeId = req.params.id;

      const store = await getStoreSettings(storeId);
      if (!store) {
        return res.status(404).json({
          error: true,
          code: "NOT_FOUND",
          message: "Store not found",
          path: req.originalUrl,
        });
      }

      return res.json({ store });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * PATCH /api/stores/:id/settings
 * Updates store settings/branding fields (admin use).
 */
router.patch(
  "/stores/:id/settings",
  requireUuidParam("id"),
  validateBody(updateStoreSettingsSchema),
  async (req, res, next) => {
    try {
      const storeId = req.params.id;

      const updated = await updateStoreSettings(storeId, req.validatedBody);
      if (!updated) {
        return res.status(404).json({
          error: true,
          code: "NOT_FOUND",
          message: "Store not found",
          path: req.originalUrl,
        });
      }

      return res.json({ store: updated });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = { storesRouter: router };
