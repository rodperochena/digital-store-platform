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
  
module.exports = { createStore, getStoreBySlug, enableStore };
