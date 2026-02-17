"use strict";

const express = require("express");
const {
    getEnabledStoreMetaBySlug,
    listPublicProductsByStoreSlug,
    getPublicProductBySlugAndId,
} = require("../db/storefront.queries");
  
  

const router = express.Router();

function requireTenant(req, res) {
  const slug = req.tenant?.slug;

  // Must match store slug rules
  if (!slug || !/^[a-z0-9-]{2,63}$/.test(slug)) {
    res.status(400).json({
      error: true,
      code: "BAD_REQUEST",
      message: "Missing or invalid tenant subdomain",
    });
    return null;
  }

  return slug;
}

/**
 * GET /api/storefront/meta
 * Tenant comes from Host subdomain
 */
router.get("/storefront/meta", async (req, res, next) => {
  try {
    const slug = requireTenant(req, res);
    if (!slug) return;

    const store = await getEnabledStoreMetaBySlug(slug);
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
 * GET /api/storefront/products
 */
router.get("/storefront/products", async (req, res, next) => {
  try {
    const slug = requireTenant(req, res);
    if (!slug) return;

    const store = await getEnabledStoreMetaBySlug(slug);
    if (!store) {
      return res.status(404).json({
        error: true,
        code: "NOT_FOUND",
        message: "Store not found",
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
router.get("/storefront/products/:productId", async (req, res, next) => {
  try {
    const slug = requireTenant(req, res);
    if (!slug) return;

    const productId = String(req.params.productId || "").trim();
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(productId)) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: "Invalid product id",
      });
    }

    const product = await getPublicProductBySlugAndId(slug, productId);
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

module.exports = { storefrontHostRouter: router };
