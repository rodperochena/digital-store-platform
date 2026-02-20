"use strict";

const express = require("express");
const { z } = require("zod");
const { createProduct, listProductsByStore } = require("../db/queries/products.queries");
const { requireAdminKey } = require("../middleware/admin.middleware");
const {
  requireUuidParam,
  validateBody,
} = require("../middleware/validate.middleware");

const router = express.Router();

const createProductSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional(),
  price_cents: z.number().int().nonnegative(),
  currency: z.string().min(3).max(10).optional(),
  is_active: z.boolean().optional(),
  delivery_url: z.string().url().optional(),
});

/**
 * POST /api/stores/:storeId/products
 */
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

/**
 * GET /api/stores/:storeId/products
 */
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
