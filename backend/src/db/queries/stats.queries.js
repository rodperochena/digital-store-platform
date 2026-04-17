"use strict";

// Queries: owner stats
// Single-query aggregate stats for the owner dashboard header cards.
// Uses scalar subqueries instead of GROUP BY to make the query self-documenting — each metric is
// clearly labelled and easy to add/remove without rewriting the whole query.

const { pool } = require("../pool");

/**
 * Returns a single stats snapshot for the owner dashboard.
 * One round-trip using scalar subqueries — cheap for store-scale data.
 */
async function getOwnerStats(storeId) {
  const sql = `
    SELECT
      COALESCE(
        (SELECT SUM(total_cents)::bigint FROM orders WHERE store_id = $1 AND status = 'paid'),
        0
      )                                                                              AS total_revenue,
      (SELECT COUNT(*)::int FROM orders  WHERE store_id = $1 AND status = 'paid')   AS paid_orders_count,
      (SELECT COUNT(*)::int FROM orders  WHERE store_id = $1 AND status = 'pending') AS pending_orders_count,
      (SELECT COUNT(*)::int FROM products WHERE store_id = $1)                       AS total_products,
      (SELECT COUNT(*)::int FROM products WHERE store_id = $1 AND is_active = TRUE)  AS active_products,
      (SELECT currency FROM stores WHERE id = $1 LIMIT 1)                            AS currency,
      (SELECT MAX(created_at) FROM orders WHERE store_id = $1 AND status = 'paid')   AS latest_order_at
  `;

  const result = await pool.query(sql, [storeId]);
  const row = result.rows[0];

  return {
    total_revenue:        Number(row.total_revenue),
    paid_orders_count:    row.paid_orders_count,
    pending_orders_count: row.pending_orders_count,
    total_products:       row.total_products,
    active_products:      row.active_products,
    currency:             row.currency ?? "usd",
    latest_order_at:      row.latest_order_at ?? null,
  };
}

module.exports = { getOwnerStats };
