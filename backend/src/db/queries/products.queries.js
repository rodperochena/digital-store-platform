"use strict";

const { pool } = require("../pool");

/**
 * Creates a product for a store.
 * - Enforces ONE currency per store (product currency must match store currency).
 * - If store doesn't exist, returns a clean 404 error (instead of FK 500).
 */
async function createProduct(
  storeId,
  { title, description, price_cents, currency, is_active, delivery_url, image_url }
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
    INSERT INTO products (store_id, title, description, price_cents, currency, is_active, delivery_url, image_url)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id, store_id, title, description, price_cents, currency, is_active, delivery_url, image_url, created_at, updated_at;
  `;

  const result = await pool.query(sql, [
    storeId,
    title,
    description ?? null,
    price_cents,
    finalCurrency,
    is_active ?? true,
    delivery_url ?? null,
    image_url ?? null,
  ]);

  return result.rows[0];
}

async function listProductsByStore(storeId) {
  const sql = `
    SELECT id, store_id, title, description, price_cents, currency, is_active, delivery_url, image_url, created_at, updated_at
    FROM products
    WHERE store_id = $1
    ORDER BY created_at DESC;
  `;
  const result = await pool.query(sql, [storeId]);
  return result.rows;
}

/**
 * Updates a product. Only fields present in `updates` are changed.
 * Scoped to storeId — returns null if product not found or belongs to a different store.
 */
async function updateProduct(productId, storeId, updates) {
  const allowed = ["title", "description", "price_cents", "delivery_url", "image_url", "is_active"];
  const setClauses = [];
  const values = [productId, storeId];
  let idx = 3;

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      setClauses.push(`${key} = $${idx++}`);
      values.push(updates[key]);
    }
  }

  if (setClauses.length === 0) return null;

  setClauses.push(`updated_at = NOW()`);

  const sql = `
    UPDATE products
    SET ${setClauses.join(", ")}
    WHERE id = $1 AND store_id = $2
    RETURNING id, store_id, title, description, price_cents, currency, is_active, delivery_url, image_url, created_at, updated_at;
  `;

  const result = await pool.query(sql, values);
  return result.rows[0] ?? null;
}

/**
 * Deletes a product scoped to storeId.
 * - If the product has no order_items references: hard DELETE.
 * - If it has order references: soft-delete (set is_active = false).
 * Returns { kind: "DELETED" | "DEACTIVATED" | "NOT_FOUND", product? }
 */
async function deleteProduct(productId, storeId) {
  // Verify the product belongs to this store first
  const ownerCheck = await pool.query(
    "SELECT id FROM products WHERE id = $1 AND store_id = $2 LIMIT 1",
    [productId, storeId]
  );
  if (ownerCheck.rowCount === 0) return { kind: "NOT_FOUND" };

  // Check for any order references
  const refCheck = await pool.query(
    "SELECT 1 FROM order_items WHERE product_id = $1 LIMIT 1",
    [productId]
  );

  if (refCheck.rowCount === 0) {
    // Safe to hard-delete
    await pool.query("DELETE FROM products WHERE id = $1 AND store_id = $2", [productId, storeId]);
    return { kind: "DELETED" };
  }

  // Has orders — soft-delete only
  const result = await pool.query(
    `UPDATE products
     SET is_active = false, updated_at = NOW()
     WHERE id = $1 AND store_id = $2
     RETURNING id, store_id, title, description, price_cents, currency, is_active, delivery_url, image_url, created_at, updated_at`,
    [productId, storeId]
  );
  return { kind: "DEACTIVATED", product: result.rows[0] };
}

module.exports = { createProduct, listProductsByStore, updateProduct, deleteProduct };
