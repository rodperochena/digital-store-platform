"use strict";

const express = require("express");
const { z } = require("zod");
const { createStore, enableStore } = require("../db/stores.queries");

const router = express.Router();

const createStoreSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, or hyphens"),
  name: z.string().min(2).max(100),
});

router.post("/stores", async (req, res, next) => {
  try {
    const parsed = createStoreSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          message: "Invalid request body",
          issues: parsed.error.issues,
        },
      });
    }

    const store = await createStore(parsed.data);
    return res.status(201).json({ store });
  } catch (err) {
    return next(err);
  }
});

/**
 * Enable store (set is_enabled = true)
 * PATCH /api/stores/:id/enable
 */
router.patch("/stores/:id/enable", async (req, res, next) => {
  try {
    const storeId = req.params.id;

    // Basic UUID format validation
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(storeId)) {
      return res.status(400).json({
        error: { message: "Invalid store id" },
      });
    }

    const store = await enableStore(storeId);

    if (!store) {
      return res.status(404).json({
        error: { message: "Store not found" },
      });
    }

    return res.json({ store });
  } catch (err) {
    return next(err);
  }
});

module.exports = { storesRouter: router };

