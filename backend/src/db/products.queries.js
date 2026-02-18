"use strict";

const { pool } = require("./pool");

/**
 * Creates a product for a store.
 * - If currency is omitted, defaults to the store's currency from DB.
 * - If store doesn't exist, returns a clean 404 error (instead of FK 500).
 */
async function createProduct(
  storeId,
  { title, description, price_cents, currency, is_active, delivery_url }
) {
  // If client didn't provide currency, use store currency (DB is source of truth)
  let finalCurrency = currency;

  if (!finalCurrency) {
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

    finalCurrency = store.currency || "usd";
  }

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
