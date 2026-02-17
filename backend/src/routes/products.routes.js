"use strict";

const express = require("express");
const { z } = require("zod");
const { createProduct, listProductsByStore } = require("../db/products.queries");

const router = express.Router();

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createProductSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional(),
  price_cents: z.number().int().nonnegative(),
  currency: z.string().min(3).max(10).optional(),
  is_active: z.boolean().optional(),
  delivery_url: z.string().url().optional(),
});

router.post("/stores/:storeId/products", async (req, res, next) => {
  try {
    const { storeId } = req.params;

    if (!uuidRegex.test(storeId)) {
      return res.status(400).json({ error: { message: "Invalid store id" } });
    }

    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { message: "Invalid request body", issues: parsed.error.issues },
      });
    }

    const product = await createProduct(storeId, parsed.data);
    return res.status(201).json({ product });
  } catch (err) {
    return next(err);
  }
});

router.get("/stores/:storeId/products", async (req, res, next) => {
  try {
    const { storeId } = req.params;

    if (!uuidRegex.test(storeId)) {
      return res.status(400).json({ error: { message: "Invalid store id" } });
    }

    const products = await listProductsByStore(storeId);
    return res.json({ products });
  } catch (err) {
    return next(err);
  }
});

module.exports = { productsRouter: router };
