"use strict";

// Queries: owner dashboard
// Aggregated metrics for the dashboard home page: revenue stats, top products, daily sales chart,
// recent orders, and page view stats. All queries are read-only.

const { pool } = require("../pool");

/**
 * Aggregated revenue + order stats for the dashboard overview.
 * Reuses the same scalar-subquery approach as stats.queries.js
 * but adds a rolling 30-day revenue figure for trend context.
 */
async function getDashboardStats(storeId) {
  const sql = `
    SELECT
      COALESCE(
        (SELECT SUM(total_cents)::bigint FROM orders WHERE store_id = $1 AND status = 'paid'),
        0
      )                                                                               AS total_revenue,
      (SELECT COUNT(*)::int  FROM orders  WHERE store_id = $1 AND status = 'paid')   AS paid_orders_count,
      (SELECT COUNT(*)::int  FROM orders  WHERE store_id = $1 AND status = 'pending') AS pending_orders_count,
      (SELECT COUNT(*)::int  FROM products WHERE store_id = $1)                       AS total_products,
      (SELECT COUNT(*)::int  FROM products WHERE store_id = $1 AND is_active = TRUE)  AS active_products,
      (SELECT currency FROM stores WHERE id = $1 LIMIT 1)                             AS currency,
      (SELECT MAX(created_at) FROM orders WHERE store_id = $1 AND status = 'paid')    AS latest_order_at,
      COALESCE(
        (SELECT SUM(total_cents)::bigint
           FROM orders
          WHERE store_id = $1
            AND status = 'paid'
            AND created_at >= NOW() - INTERVAL '30 days'),
        0
      )                                                                               AS revenue_30d,
      (SELECT COUNT(*)::int FROM store_customers
        WHERE store_id = $1 AND buyer_account_id IS NOT NULL)                         AS registered_buyers,
      (SELECT COUNT(*)::int FROM store_customers
        WHERE store_id = $1 AND marketing_opt_in = true)                              AS marketing_opted_in
  `;

  const result = await pool.query(sql, [storeId]);
  const row    = result.rows[0];

  return {
    total_revenue:        Number(row.total_revenue),
    paid_orders_count:    row.paid_orders_count,
    pending_orders_count: row.pending_orders_count,
    total_products:       row.total_products,
    active_products:      row.active_products,
    currency:             row.currency ?? "usd",
    latest_order_at:      row.latest_order_at ?? null,
    revenue_30d:          Number(row.revenue_30d),
    registered_buyers:    row.registered_buyers ?? 0,
    marketing_opted_in:   row.marketing_opted_in ?? 0,
  };
}

/**
 * Top-selling products by paid revenue.
 * Returns up to `limit` rows ordered by revenue DESC.
 */
async function getTopProducts(storeId, limit = 5) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 20));

  const sql = `
    SELECT
      p.id,
      p.title,
      p.price_cents,
      p.currency,
      p.is_active,
      p.image_url,
      COALESCE(SUM(oi.quantity), 0)::int                          AS sales_count,
      COALESCE(SUM(oi.quantity * oi.unit_price_cents), 0)::bigint AS revenue_cents
    FROM products p
    LEFT JOIN order_items oi ON oi.product_id = p.id
    LEFT JOIN orders      o  ON o.id = oi.order_id AND o.status = 'paid' AND o.store_id = $1
    WHERE p.store_id = $1
    GROUP BY p.id, p.title, p.price_cents, p.currency, p.is_active, p.image_url
    ORDER BY revenue_cents DESC, sales_count DESC, p.title ASC
    LIMIT $2;
  `;

  const result = await pool.query(sql, [storeId, safeLimit]);
  return result.rows.map((r) => ({
    ...r,
    sales_count:   Number(r.sales_count),
    revenue_cents: Number(r.revenue_cents),
  }));
}

/**
 * Daily paid revenue for the last N days, zero-filled using generate_series
 * so days with no sales still appear in the result.
 */
async function getDailySales(storeId, days = 30) {
  const safeDays = Math.max(7, Math.min(Number(days) || 30, 90));

  const sql = `
    WITH series AS (
      SELECT generate_series(
        (NOW() - ($2 - 1) * INTERVAL '1 day')::date,
        NOW()::date,
        INTERVAL '1 day'
      )::date AS day
    ),
    daily AS (
      SELECT
        created_at::date                           AS day,
        COALESCE(SUM(total_cents), 0)::bigint      AS revenue_cents,
        COUNT(*)::int                              AS orders_count
      FROM orders
      WHERE store_id = $1
        AND status   = 'paid'
        AND created_at >= NOW() - $2 * INTERVAL '1 day'
      GROUP BY 1
    )
    SELECT
      s.day::text                                       AS day,
      COALESCE(d.revenue_cents, 0)::bigint              AS revenue_cents,
      COALESCE(d.orders_count,  0)::int                 AS orders_count
    FROM series s
    LEFT JOIN daily d ON d.day = s.day
    ORDER BY s.day ASC;
  `;

  const result = await pool.query(sql, [storeId, safeDays]);
  return result.rows.map((r) => ({
    day:           r.day,
    revenue_cents: Number(r.revenue_cents),
    orders_count:  Number(r.orders_count),
  }));
}

/**
 * Recent paid orders with a comma-separated product title list.
 */
async function getRecentOrders(storeId, limit = 5) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 20));

  const sql = `
    SELECT
      o.id,
      o.status,
      o.total_cents,
      o.currency,
      o.buyer_email,
      o.created_at,
      STRING_AGG(p.title, ', ' ORDER BY p.title) AS product_titles
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products    p  ON p.id = oi.product_id
    WHERE o.store_id = $1
      AND o.status   = 'paid'
    GROUP BY o.id, o.status, o.total_cents, o.currency, o.buyer_email, o.created_at
    ORDER BY o.created_at DESC
    LIMIT $2;
  `;

  const result = await pool.query(sql, [storeId, safeLimit]);
  return result.rows;
}

/**
 * Up to `limit` most recently created active products with 30-day view counts.
 * Used by the dashboard "Your Products" cards section.
 */
async function getRecentPublishedProducts(storeId, limit = 3) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 3, 10));

  const sql = `
    SELECT
      p.id,
      p.title,
      p.price_cents,
      p.currency,
      p.is_active,
      p.image_url,
      p.visibility,
      p.created_at,
      COALESCE(SUM(oi.quantity), 0)::int                          AS sales_count,
      COALESCE(SUM(oi.quantity * oi.unit_price_cents), 0)::bigint AS revenue_cents,
      COALESCE(
        (SELECT COUNT(*)::int FROM page_views pv
          WHERE pv.product_id = p.id
            AND pv.store_id   = $1
            AND pv.created_at >= NOW() - INTERVAL '30 days'),
        0
      )                                                           AS views_30d
    FROM products p
    LEFT JOIN order_items oi ON oi.product_id = p.id
    LEFT JOIN orders      o  ON o.id = oi.order_id AND o.status = 'paid' AND o.store_id = $1
    WHERE p.store_id  = $1
      AND p.is_active = true
    GROUP BY p.id, p.title, p.price_cents, p.currency, p.is_active,
             p.image_url, p.visibility, p.created_at
    ORDER BY p.created_at DESC
    LIMIT $2;
  `;

  const result = await pool.query(sql, [storeId, safeLimit]);
  return result.rows.map((r) => ({
    ...r,
    sales_count:   Number(r.sales_count),
    revenue_cents: Number(r.revenue_cents),
    views_30d:     Number(r.views_30d),
  }));
}

/**
 * Last 7 days of page view counts, zero-filled, plus today total and 7d total.
 * Returns { daily_views: [{ date, views }], total_views_today, total_views_7d }
 */
async function getDailyViewStats(storeId) {
  const sql = `
    WITH series AS (
      SELECT generate_series(
        (NOW() - 6 * INTERVAL '1 day')::date,
        NOW()::date,
        INTERVAL '1 day'
      )::date AS day
    ),
    daily AS (
      SELECT created_at::date AS day, COUNT(*)::int AS views
      FROM page_views
      WHERE store_id = $1
        AND created_at >= NOW() - 6 * INTERVAL '1 day'
      GROUP BY 1
    )
    SELECT
      s.day::text                    AS date,
      COALESCE(d.views, 0)::int      AS views
    FROM series s
    LEFT JOIN daily d ON d.day = s.day
    ORDER BY s.day ASC;
  `;
  const result = await pool.query(sql, [storeId]);
  const rows   = result.rows.map((r) => ({ date: r.date, views: Number(r.views) }));
  const today  = new Date().toISOString().slice(0, 10);
  const total7d = rows.reduce((s, r) => s + r.views, 0);
  const todayRow = rows.find((r) => r.date === today);
  return {
    daily_views:       rows,
    total_views_today: todayRow?.views ?? 0,
    total_views_7d:    total7d,
  };
}

module.exports = { getDashboardStats, getTopProducts, getDailySales, getRecentOrders, getRecentPublishedProducts, getDailyViewStats };
