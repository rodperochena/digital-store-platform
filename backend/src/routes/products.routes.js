"use strict";

// Routes: products (admin)
// Admin-only product management endpoints scoped to a store.
// Owners manage their products through /api/owner/products/* instead.

const express = require("express");
const { z } = require("zod");

const { createProduct, listProductsByStore } = require("../db/queries/products.queries");
const { requireUuidParam, validateBody } = require("../middleware/validate.middleware");
const { requireAdminKey } = require("../middleware/admin.middleware");

const router = express.Router();

const createProductSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(5000).optional(),
  price_cents: z.number().int().positive(),
  delivery_url: z.string().url().optional(),
  is_active: z.boolean().optional(),
});

// POST /api/stores/:storeId/products — Admin only
// Creates a product for a store. Currency is inherited from the store.
router.post(
  "/stores/:storeId/products",
  requireAdminKey,
  requireUuidParam("storeId"),
  validateBody(createProductSchema),
  async (req, res, next) => {
    try {
      const { storeId } = req.params;
      const product = await createProduct(storeId, req.validatedBody);
      return res.status(201).json({ product });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/stores/:storeId/products — Admin only
// Returns all products for a store (including inactive/draft).
router.get(
  "/stores/:storeId/products",
  requireAdminKey,
  requireUuidParam("storeId"),
  async (req, res, next) => {
    try {
      const { storeId } = req.params;
      const products = await listProductsByStore(storeId);
      return res.json({ products });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = { productsRouter: router };
