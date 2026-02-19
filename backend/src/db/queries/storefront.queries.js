"use strict";

const { pool } = require("../pool");

/**
 * Public store meta by slug, only if enabled.
 * Returns null if store doesn't exist OR is not enabled.
 *
 * NOTE: We intentionally keep this response minimal (public-safe fields only).
 */
async function getEnabledStoreMetaBySlug(slug) {
  const sql = `
    SELECT
      id,
      slug,
      name,
      currency,
      primary_color,
      logo_url
    FROM stores
    WHERE slug = $1 AND is_enabled = TRUE
    LIMIT 1;
  `;
  const res = await pool.query(sql, [slug]);
  return res.rows[0] || null;
}

/**
 * Public product list for enabled store by slug.
 * - Only active products
 * - DOES NOT expose delivery_url
 * - Keeps fields minimal for public surface area
 */
async function listPublicProductsByStoreSlug(slug) {
  const sql = `
    SELECT
      p.id,
      p.title,
      p.description,
      p.price_cents,
      p.currency
    FROM products p
    JOIN stores s ON s.id = p.store_id
    WHERE s.slug = $1
      AND s.is_enabled = TRUE
      AND p.is_active = TRUE
    ORDER BY p.created_at DESC;
  `;
  const res = await pool.query(sql, [slug]);
  return res.rows;
}

/**
 * Public product detail for enabled store by slug.
 * Returns null if store is disabled OR product not found OR inactive.
 */
async function getPublicProductBySlugAndId(slug, productId) {
  const sql = `
    SELECT
      p.id,
      p.title,
      p.description,
      p.price_cents,
      p.currency
    FROM products p
    JOIN stores s ON s.id = p.store_id
    WHERE s.slug = $1
      AND s.is_enabled = TRUE
      AND p.is_active = TRUE
      AND p.id = $2
    LIMIT 1;
  `;
  const res = await pool.query(sql, [slug, productId]);
  return res.rows[0] || null;
}

module.exports = {
  getEnabledStoreMetaBySlug,
  listPublicProductsByStoreSlug,
  getPublicProductBySlugAndId,
};


