"use strict";

// Queries: flash sales
// Manages time-limited sales that apply a discount percentage to all products in a store.
// computeSalePriceForProduct is a pure function (no DB call) — used inline during checkout.

const { pool } = require("../pool");

/**
 * Get the currently active sale for a store (if any).
 * A sale is active when: is_active=true AND (starts_at IS NULL OR starts_at <= NOW())
 *                         AND (ends_at IS NULL OR ends_at > NOW())
 */
async function getActiveSale(storeId) {
  const { rows } = await pool.query(
    `SELECT * FROM store_sales
     WHERE store_id = $1
       AND is_active = true
       AND (starts_at IS NULL OR starts_at <= NOW())
       AND (ends_at IS NULL OR ends_at > NOW())
     ORDER BY created_at DESC
     LIMIT 1`,
    [storeId]
  );
  return rows[0] ?? null;
}

/**
 * Compute the sale price for a product given an active sale.
 * Returns sale_price_cents (floored) or null if not applicable.
 */
function computeSalePrice(productPriceCents, sale) {
  if (!sale) return null;
  if (sale.apply_to === "selected") return null; // caller must check product_ids
  if (sale.discount_type === "percentage") {
    const pct = parseFloat(sale.discount_value);
    return Math.max(0, Math.floor(productPriceCents * (1 - pct / 100)));
  }
  if (sale.discount_type === "fixed") {
    const off = Math.round(parseFloat(sale.discount_value) * 100); // stored as dollars
    return Math.max(0, productPriceCents - off);
  }
  return null;
}

/**
 * Compute sale price for a specific product (respects apply_to=selected).
 */
function computeSalePriceForProduct(productId, productPriceCents, sale) {
  if (!sale) return null;
  if (sale.apply_to === "selected") {
    const ids = sale.product_ids || [];
    if (!ids.includes(productId)) return null;
  }
  return computeSalePrice(productPriceCents, { ...sale, apply_to: "all" });
}

/**
 * List all sales for a store (owner).
 */
async function listSales(storeId) {
  const { rows } = await pool.query(
    `SELECT * FROM store_sales WHERE store_id = $1 ORDER BY created_at DESC`,
    [storeId]
  );
  return rows;
}

/**
 * Get a sale by ID (owner).
 */
async function getSaleById(storeId, saleId) {
  const { rows } = await pool.query(
    `SELECT * FROM store_sales WHERE id = $1 AND store_id = $2 LIMIT 1`,
    [saleId, storeId]
  );
  return rows[0] ?? null;
}

/**
 * Create a sale.
 */
async function createSale(storeId, { name, discount_type, discount_value, starts_at, ends_at, apply_to, product_ids }) {
  const { rows } = await pool.query(
    `INSERT INTO store_sales (store_id, name, discount_type, discount_value, starts_at, ends_at, apply_to, product_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      storeId,
      name,
      discount_type,
      discount_value,
      starts_at || null,
      ends_at   || null,
      apply_to  || "all",
      product_ids || [],
    ]
  );
  return rows[0];
}

/**
 * Update a sale.
 */
async function updateSale(storeId, saleId, fields) {
  const allowed = ["name", "discount_type", "discount_value", "starts_at", "ends_at", "apply_to", "product_ids", "is_active"];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = $${i++}`);
      vals.push(fields[key]);
    }
  }
  if (sets.length === 0) return null;
  sets.push(`updated_at = NOW()`);
  vals.push(saleId, storeId);
  const { rows } = await pool.query(
    `UPDATE store_sales SET ${sets.join(", ")} WHERE id = $${i} AND store_id = $${i + 1} RETURNING *`,
    vals
  );
  return rows[0] ?? null;
}

/**
 * Delete a sale.
 */
async function deleteSale(storeId, saleId) {
  const { rowCount } = await pool.query(
    `DELETE FROM store_sales WHERE id = $1 AND store_id = $2`,
    [saleId, storeId]
  );
  return rowCount > 0;
}

module.exports = {
  getActiveSale,
  computeSalePrice,
  computeSalePriceForProduct,
  listSales,
  getSaleById,
  createSale,
  updateSale,
  deleteSale,
};
