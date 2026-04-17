"use strict";

// Queries: stores
// Store provisioning and settings management.
// Key constraint: currency cannot be changed once products exist (enforced in updateStoreSettings).
// getStoreSettings returns all columns; getEnabledStoreMetaBySlug (in storefront.queries) returns public-safe fields only.

const { pool } = require("../pool");

async function createStore({ slug, name, currency }) {
  const normalizedCurrency =
    currency != null ? String(currency).trim().toLowerCase() : null;

  const sql = `
    INSERT INTO stores (slug, name, currency)
    VALUES ($1, $2, COALESCE($3, 'usd'))
    RETURNING id, slug, name, currency, is_enabled, created_at, updated_at;
  `;

  const result = await pool.query(sql, [slug, name, normalizedCurrency]);
  return result.rows[0];
}

async function getStoreBySlug(slug) {
  const sql = `
    SELECT id, slug, name, is_enabled, created_at, updated_at
    FROM stores
    WHERE slug = $1
    LIMIT 1;
  `;
  const result = await pool.query(sql, [slug]);
  return result.rows[0] || null;
}

async function enableStore(storeId) {
  const sql = `
    UPDATE stores
    SET is_enabled = TRUE,
        updated_at = NOW()
    WHERE id = $1
    RETURNING id, slug, name, is_enabled, created_at, updated_at;
  `;
  const result = await pool.query(sql, [storeId]);
  return result.rows[0] || null;
}

// Returns all store settings columns for internal use (owner dashboard + fulfillment).
// For public-facing data, use getEnabledStoreMetaBySlug in storefront.queries instead.
async function getStoreSettings(storeId) {
  const sql = `
    SELECT
      id,
      slug,
      name,
      currency,
      primary_color,
      secondary_color,
      logo_url,
      is_enabled,
      tagline,
      description,
      social_twitter,
      social_instagram,
      social_youtube,
      social_website,
      storefront_config,
      font_family,
      is_paused,
      pause_message,
      onboarding_completed_at,
      created_at,
      updated_at
    FROM stores
    WHERE id = $1
    LIMIT 1;
  `;
  const result = await pool.query(sql, [storeId]);
  return result.rows[0] || null;
}

async function checkSlugAvailable(slug) {
  const res = await pool.query(
    `SELECT id FROM stores WHERE slug = $1 LIMIT 1`,
    [slug]
  );
  return res.rows.length === 0; // true = available
}

async function updateStoreSettings(storeId, {
  name, currency, primary_color, secondary_color, logo_url, slug,
  tagline, description, social_twitter, social_instagram, social_youtube, social_website,
  storefront_config, font_family, is_paused, pause_message,
}) {
  // Load current store currency (DB source of truth)
  const currentRes = await pool.query(
    `
    SELECT currency
    FROM stores
    WHERE id = $1
    LIMIT 1;
    `,
    [storeId]
  );

  const current = currentRes.rows[0] || null;
  if (!current) return null;

  const currentCurrency = String(current.currency || "usd").trim().toLowerCase();

  // Normalize incoming currency
  const nextCurrency = currency != null ? String(currency).trim().toLowerCase() : null;

  // If attempting to change currency, block if products already exist
  if (nextCurrency && nextCurrency !== currentCurrency) {
    const prodRes = await pool.query(
      `
      SELECT 1
      FROM products
      WHERE store_id = $1
      LIMIT 1;
      `,
      [storeId]
    );

    if (prodRes.rows.length > 0) {
      const err = new Error("Cannot change store currency after products exist");
      err.statusCode = 409;
      throw err;
    }
  }

  const sql = `
    UPDATE stores
    SET
      name               = COALESCE($2,  name),
      currency           = COALESCE($3,  currency),
      primary_color      = COALESCE($4,  primary_color),
      logo_url           = COALESCE($5,  logo_url),
      slug               = COALESCE($6,  slug),
      tagline            = COALESCE($7,  tagline),
      description        = COALESCE($8,  description),
      social_twitter     = COALESCE($9,  social_twitter),
      social_instagram   = COALESCE($10, social_instagram),
      social_youtube     = COALESCE($11, social_youtube),
      social_website     = COALESCE($12, social_website),
      storefront_config  = COALESCE($13, storefront_config),
      secondary_color    = COALESCE($14, secondary_color),
      font_family        = COALESCE($15, font_family),
      is_paused          = COALESCE($16, is_paused),
      pause_message      = CASE WHEN $17::text IS NOT NULL THEN $17 ELSE pause_message END,
      updated_at         = NOW()
    WHERE id = $1
    RETURNING
      id, slug, name, currency, primary_color, secondary_color, logo_url, is_enabled,
      tagline, description, social_twitter, social_instagram, social_youtube, social_website,
      storefront_config, font_family, is_paused, pause_message, onboarding_completed_at,
      created_at, updated_at;
  `;

  try {
    const result = await pool.query(sql, [
      storeId,
      name                ?? null,
      nextCurrency        ?? null,
      primary_color       ?? null,
      logo_url            ?? null,
      slug                ?? null,
      tagline             ?? null,
      description         ?? null,
      social_twitter      ?? null,
      social_instagram    ?? null,
      social_youtube      ?? null,
      social_website      ?? null,
      storefront_config   != null ? JSON.stringify(storefront_config) : null,
      secondary_color     ?? null,
      font_family         ?? null,
      is_paused           != null ? is_paused : null,
      pause_message       ?? null,
    ]);
    return result.rows[0] || null;
  } catch (err) {
    if (err.code === "23505") {
      const conflict = new Error("This store username is already taken");
      conflict.statusCode = 409;
      throw conflict;
    }
    throw err;
  }
}

async function setOnboardingCompleted(storeId) {
  await pool.query(
    `UPDATE stores SET onboarding_completed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND onboarding_completed_at IS NULL`,
    [storeId]
  );
}

module.exports = {
  createStore,
  getStoreBySlug,
  enableStore,
  getStoreSettings,
  updateStoreSettings,
  checkSlugAvailable,
  setOnboardingCompleted,
};
