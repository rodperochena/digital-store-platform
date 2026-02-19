"use strict";

const express = require("express");
const {
  getEnabledStoreMetaBySlug,
  listPublicProductsByStoreSlug,
  getPublicProductBySlugAndId,
} = require("../db/queries/storefront.queries");

const { requireTenantSlug } = require("../middleware/storefront.middleware");
const { requireUuidParam } = require("../middleware/validate.middleware");

const router = express.Router();

/**
 * GET /api/storefront/meta
 * Tenant comes from Host subdomain
 */
router.get("/storefront/meta", requireTenantSlug, async (req, res, next) => {
  try {
    const slug = req.storeSlug;

    const store = await getEnabledStoreMetaBySlug(slug);
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
});

/**
 * GET /api/storefront/products
 */
router.get("/storefront/products", requireTenantSlug, async (req, res, next) => {
  try {
    const slug = req.storeSlug;

    const store = await getEnabledStoreMetaBySlug(slug);
    if (!store) {
      return res.status(404).json({
        error: true,
        code: "NOT_FOUND",
        message: "Store not found",
        path: req.originalUrl,
      });
    }

    const products = await listPublicProductsByStoreSlug(slug);
    return res.json({ products });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/storefront/products/:productId
 */
router.get(
  "/storefront/products/:productId",
  requireTenantSlug,
  requireUuidParam("productId"),
  async (req, res, next) => {
    try {
      const slug = req.storeSlug;
      const { productId } = req.params;

      const product = await getPublicProductBySlugAndId(slug, productId);
      if (!product) {
        return res.status(404).json({
          error: true,
          code: "NOT_FOUND",
          message: "Product not found",
          path: req.originalUrl,
        });
      }

      return res.json({ product });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = { storefrontHostRouter: router };
