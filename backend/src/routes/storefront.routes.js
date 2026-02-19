"use strict";

const express = require("express");
const {
  getEnabledStoreMetaBySlug,
  listPublicProductsByStoreSlug,
  getPublicProductBySlugAndId,
} = require("../db/queries/storefront.queries");

const { requireSlugParam } = require("../middleware/storefront.middleware");
const { requireUuidParam } = require("../middleware/validate.middleware");

const router = express.Router();

/**
 * GET /api/store/:subdomain/meta
 */
router.get(
  "/store/:subdomain/meta",
  requireSlugParam("subdomain"),
  async (req, res, next) => {
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
  }
);

/**
 * GET /api/store/:subdomain/products
 */
router.get(
  "/store/:subdomain/products",
  requireSlugParam("subdomain"),
  async (req, res, next) => {
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
  }
);

/**
 * GET /api/store/:subdomain/products/:productId
 */
router.get(
  "/store/:subdomain/products/:productId",
  requireSlugParam("subdomain"),
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

module.exports = { storefrontRouter: router };
