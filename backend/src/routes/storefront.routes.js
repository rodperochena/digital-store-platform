"use strict";

const express = require("express");
const {
    getEnabledStoreMetaBySlug,
    listPublicProductsByStoreSlug,
    getPublicProductBySlugAndId,
} = require("../db/storefront.queries");
  

const router = express.Router();

/**
 * GET /api/store/:subdomain/meta
 * Public store metadata (only if store is enabled).
 */
router.get("/store/:subdomain/meta", async (req, res, next) => {
  try {
    const subdomain = String(req.params.subdomain || "").trim().toLowerCase();

    // Minimal validation: slug rules match your store slug regex
    if (!/^[a-z0-9-]{2,63}$/.test(subdomain)) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: "Invalid store subdomain",
      });
    }

    const store = await getEnabledStoreMetaBySlug(subdomain);

    // Hide disabled / non-existing stores
    if (!store) {
      return res.status(404).json({
        error: true,
        code: "NOT_FOUND",
        message: "Store not found",
      });
    }

    return res.json({ store });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/store/:subdomain/products
 * Public product listing for an enabled store.
 * Must NOT expose delivery_url.
 */
router.get("/store/:subdomain/products", async (req, res, next) => {
  try {
    const subdomain = String(req.params.subdomain || "").trim().toLowerCase();

    if (!/^[a-z0-9-]{2,63}$/.test(subdomain)) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: "Invalid store subdomain",
      });
    }

    // If store is disabled / missing, return 404 (same rule)
    const store = await getEnabledStoreMetaBySlug(subdomain);
    if (!store) {
      return res.status(404).json({
        error: true,
        code: "NOT_FOUND",
        message: "Store not found",
      });
    }

    const products = await listPublicProductsByStoreSlug(subdomain);
    return res.json({ products });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/store/:subdomain/products/:productId
 * Public product detail for an enabled store.
 */
router.get("/store/:subdomain/products/:productId", async (req, res, next) => {
    try {
      const subdomain = String(req.params.subdomain || "").trim().toLowerCase();
      const productId = String(req.params.productId || "").trim();
  
      if (!/^[a-z0-9-]{2,63}$/.test(subdomain)) {
        return res.status(400).json({
          error: true,
          code: "BAD_REQUEST",
          message: "Invalid store subdomain",
        });
      }
  
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
      if (!uuidRegex.test(productId)) {
        return res.status(400).json({
          error: true,
          code: "BAD_REQUEST",
          message: "Invalid product id",
        });
      }
  
      const product = await getPublicProductBySlugAndId(subdomain, productId);
  
      if (!product) {
        return res.status(404).json({
          error: true,
          code: "NOT_FOUND",
          message: "Product not found",
        });
      }
  
      return res.json({ product });
    } catch (err) {
      return next(err);
    }
  });
  
module.exports = { storefrontRouter: router };
