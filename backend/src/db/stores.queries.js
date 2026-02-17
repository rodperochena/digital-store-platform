"use strict";

const { pool } = require("./pool");

async function createStore({ slug, name }) {
  const sql = `
    INSERT INTO stores (slug, name)
    VALUES ($1, $2)
    RETURNING id, slug, name, is_enabled, created_at, updated_at;
  `;
  const result = await pool.query(sql, [slug, name]);
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

/**
 * Get store settings by store id.
 * @param {string} storeId - The id of the store.
 * @returns {Promise<Object>} The store settings.
 */
async function getStoreSettings(storeId) {
    const sql = `
      SELECT
        id,
        slug,
        name,
        currency,
        primary_color,
        logo_url,
        is_enabled,
        created_at,
        updated_at
      FROM stores
      WHERE id = $1
      LIMIT 1;
    `;
    const result = await pool.query(sql, [storeId]);
    return result.rows[0] || null;
  }
  
async function updateStoreSettings(storeId, { name, currency, primary_color, logo_url }) {
    const sql = `
      UPDATE stores
      SET
        name = COALESCE($2, name),
        currency = COALESCE($3, currency),
        primary_color = COALESCE($4, primary_color),
        logo_url = COALESCE($5, logo_url),
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id, slug, name, currency, primary_color, logo_url, is_enabled, created_at, updated_at;
    `;
    const result = await pool.query(sql, [
      storeId,
      name ?? null,
      currency ?? null,
      primary_color ?? null,
      logo_url ?? null,
    ]);
    return result.rows[0] || null;
}

/**
 * Update store settings by store id.
 * @param {string} storeId - The id of the store.
 * @param {Object} settings - The store settings to update.
 * @returns {Promise<Object>} The updated store settings.
 */
module.exports = {
    createStore,
    getStoreBySlug,
    enableStore,
    getStoreSettings,
    updateStoreSettings,
  };
  