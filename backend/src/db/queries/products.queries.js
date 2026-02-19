"use strict";

const { pool } = require("../pool");

/**
 * Creates a product for a store.
 * - Enforces ONE currency per store (product currency must match store currency).
 * - If store doesn't exist, returns a clean 404 error (instead of FK 500).
 */
async function createProduct(
  storeId,
  { title, description, price_cents, currency, is_active, delivery_url }
) {
  // Always load store currency (DB is source of truth)
  const storeRes = await pool.query(
    `
    SELECT currency
    FROM stores
    WHERE id = $1
    LIMIT 1;
    `,
    [storeId]
  );

  const store = storeRes.rows[0] || null;
  if (!store) {
    const err = new Error("Store not found");
    err.statusCode = 404;
    throw err;
  }

  const storeCurrency = String(store.currency || "usd").toLowerCase();
  const providedCurrency = currency ? String(currency).toLowerCase() : null;

  // Enforce ONE currency per store
  if (providedCurrency && providedCurrency !== storeCurrency) {
    const err = new Error("Product currency must match store currency");
    err.statusCode = 400;
    throw err;
  }

  const finalCurrency = storeCurrency;

  const sql = `
    INSERT INTO products (store_id, title, description, price_cents, currency, is_active, delivery_url)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, store_id, title, description, price_cents, currency, is_active, delivery_url, created_at, updated_at;
  `;

  const result = await pool.query(sql, [
    storeId,
    title,
    description ?? null,
    price_cents,
    finalCurrency,
    is_active ?? true,
    delivery_url ?? null,
  ]);

  return result.rows[0];
}

async function listProductsByStore(storeId) {
  const sql = `
    SELECT id, store_id, title, description, price_cents, currency, is_active, delivery_url, created_at, updated_at
    FROM products
    WHERE store_id = $1
    ORDER BY created_at DESC;
  `;
  const result = await pool.query(sql, [storeId]);
  return result.rows;
}

module.exports = { createProduct, listProductsByStore };
