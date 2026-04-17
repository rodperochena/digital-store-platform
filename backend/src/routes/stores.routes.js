"use strict";

// Routes: stores (admin)
// Platform admin endpoints for creating and configuring stores.
// All routes here require x-admin-key. Owners use /api/owner/* to manage their own store.

const express = require("express");
const { z } = require("zod");

const { RESERVED_TENANT_SLUGS, SLUG_REGEX } = require("../config/tenancy.constants");
const {
  createStore,
  enableStore,
  getStoreSettings,
  updateStoreSettings,
} = require("../db/queries/stores.queries");

const { requireUuidParam, validateBody } = require("../middleware/validate.middleware");
const { requireAdminKey } = require("../middleware/admin.middleware");

const router = express.Router();

const createStoreSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(SLUG_REGEX, "slug must be lowercase letters, numbers, or hyphens")
    .refine((s) => !RESERVED_TENANT_SLUGS.has(String(s).toLowerCase()), {
      message: "slug is reserved",
    }),
  name: z.string().min(2).max(100),
  currency: z.string().min(3).max(10).optional(),
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

// POST /api/stores — Admin only (x-admin-key required)
// Creates a new store in disabled state. Store must be enabled separately via PATCH .../enable.
router.post(
  "/stores",
  requireAdminKey,
  validateBody(createStoreSchema),
  async (req, res, next) => {
    try {
      const store = await createStore(req.validatedBody);
      return res.status(201).json({ store });
    } catch (err) {
      return next(err);
    }
  }
);

// PATCH /api/stores/:id/enable — Admin only
// Flips is_enabled to true, making the store publicly accessible.
router.patch(
  "/stores/:id/enable",
  requireAdminKey,
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

// GET /api/stores/:id/settings — Admin only
// Returns all store settings including internal fields. Owners use GET /api/owner/store instead.
router.get(
  "/stores/:id/settings",
  requireAdminKey,
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

// PATCH /api/stores/:id/settings — Admin only
// Updates store settings. Owners use PATCH /api/owner/store instead.
router.patch(
  "/stores/:id/settings",
  requireAdminKey,
  requireUuidParam("id"),
  validateBody(updateStoreSettingsSchema),
  async (req, res, next) => {
    try {
      const storeId = req.params.id;

      const store = await updateStoreSettings(storeId, req.validatedBody);
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

module.exports = { storesRouter: router };
