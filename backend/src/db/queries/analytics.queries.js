"use strict";

// Queries: analytics
// Revenue, customer, and product breakdown queries for the owner analytics dashboard.
// Read-only aggregate queries — no writes, no side effects.

const { pool } = require("../pool");

/**
 * Revenue breakdown by product for paid orders.
 * Returns up to 20 products ordered by revenue DESC.
 */
async function getRevenueByProduct(storeId) {
  const sql = `
    WITH product_revenue AS (
      SELECT
        p.id              AS product_id,
        p.title,
        p.image_url,
        COALESCE(SUM(oi.quantity * oi.unit_price_cents), 0)::bigint AS revenue_cents,
        COUNT(DISTINCT o.id)::int                                    AS order_count
      FROM products p
      LEFT JOIN order_items oi ON oi.product_id = p.id
      LEFT JOIN orders      o  ON o.id = oi.order_id
                               AND o.status = 'paid'
                               AND o.store_id = $1
      WHERE p.store_id = $1
      GROUP BY p.id, p.title, p.image_url
    ),
    totals AS (
      SELECT NULLIF(SUM(revenue_cents), 0) AS total_revenue
      FROM product_revenue
    )
    SELECT
      pr.product_id,
      pr.title,
      pr.image_url,
      pr.revenue_cents,
      pr.order_count,
      ROUND(
        CASE
          WHEN t.total_revenue IS NULL THEN 0
          ELSE (pr.revenue_cents::numeric / t.total_revenue) * 100
        END,
        1
      )::float AS percentage
    FROM product_revenue pr
    CROSS JOIN totals t
    ORDER BY pr.revenue_cents DESC
    LIMIT 20;
  `;
  const result = await pool.query(sql, [storeId]);
  return result.rows.map((r) => ({
    ...r,
    revenue_cents: Number(r.revenue_cents),
    order_count:   Number(r.order_count),
    percentage:    Number(r.percentage),
  }));
}

/**
 * Orders over time, zero-filled.
 * period: '7d' | '30d' | '90d' | 'all'
 * For 'all' groups by month.
 */
async function getOrdersOverTime(storeId, period = "30d") {
  if (period === "all") {
    // Monthly aggregation from the store's first order
    const sql = `
      WITH months AS (
        SELECT generate_series(
          DATE_TRUNC('month', MIN(created_at)),
          DATE_TRUNC('month', NOW()),
          INTERVAL '1 month'
        ) AS month
        FROM orders
        WHERE store_id = $1
      ),
      monthly AS (
        SELECT
          DATE_TRUNC('month', created_at) AS month,
          COALESCE(SUM(total_cents), 0)::bigint AS revenue_cents,
          COUNT(*)::int                          AS order_count
        FROM orders
        WHERE store_id = $1 AND status = 'paid'
        GROUP BY 1
      )
      SELECT
        TO_CHAR(m.month, 'YYYY-MM') AS date,
        COALESCE(mo.revenue_cents, 0)::bigint AS revenue_cents,
        COALESCE(mo.order_count,   0)::int    AS order_count
      FROM months m
      LEFT JOIN monthly mo ON mo.month = m.month
      ORDER BY m.month ASC;
    `;
    const result = await pool.query(sql, [storeId]);
    return result.rows.map((r) => ({
      date:          r.date,
      revenue_cents: Number(r.revenue_cents),
      order_count:   Number(r.order_count),
    }));
  }

  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;

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
        COUNT(*)::int                              AS order_count
      FROM orders
      WHERE store_id = $1
        AND status   = 'paid'
        AND created_at >= NOW() - $2 * INTERVAL '1 day'
      GROUP BY 1
    )
    SELECT
      s.day::text                                  AS date,
      COALESCE(d.revenue_cents, 0)::bigint         AS revenue_cents,
      COALESCE(d.order_count,   0)::int            AS order_count
    FROM series s
    LEFT JOIN daily d ON d.day = s.day
    ORDER BY s.day ASC;
  `;
  const result = await pool.query(sql, [storeId, days]);
  return result.rows.map((r) => ({
    date:          r.date,
    revenue_cents: Number(r.revenue_cents),
    order_count:   Number(r.order_count),
  }));
}

/**
 * Customer statistics for the store.
 */
async function getCustomerStats(storeId) {
  const sql = `
    WITH customer_orders AS (
      SELECT
        buyer_email,
        COUNT(*) AS purchase_count
      FROM orders
      WHERE store_id = $1
        AND status   = 'paid'
        AND buyer_email IS NOT NULL
      GROUP BY buyer_email
    )
    SELECT
      COUNT(*)::int                          AS total_customers,
      COUNT(*) FILTER (WHERE purchase_count >= 2)::int AS repeat_customers,
      CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(
          (COUNT(*) FILTER (WHERE purchase_count >= 2)::numeric / COUNT(*)) * 100,
          1
        )
      END::float AS repeat_rate
    FROM customer_orders;
  `;
  const result = await pool.query(sql, [storeId]);
  const row = result.rows[0];
  return {
    total_customers:   Number(row.total_customers),
    repeat_customers:  Number(row.repeat_customers),
    repeat_rate:       Number(row.repeat_rate),
  };
}

/**
 * Recent activity feed combining orders + fulfillments.
 */
async function getRecentActivity(storeId, limit = 10) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));

  const sql = `
    WITH events AS (
      -- Paid orders
      SELECT
        'order_paid'::text                             AS type,
        CONCAT(
          'New order from ',
          COALESCE(o.buyer_email, 'guest'),
          ' — ',
          TO_CHAR(o.total_cents / 100.0, 'FM$999,990.00')
        )                                              AS description,
        o.created_at                                   AS timestamp
      FROM orders o
      WHERE o.store_id = $1 AND o.status = 'paid'

      UNION ALL

      -- Delivery sent
      SELECT
        'delivery_sent'::text,
        CONCAT('Download link sent to ', f.sent_to_email),
        f.sent_at
      FROM order_fulfillments f
      JOIN orders o ON o.id = f.order_id
      WHERE o.store_id = $1
        AND f.sent_at IS NOT NULL

      UNION ALL

      -- Delivery opened
      SELECT
        'delivery_opened'::text,
        CONCAT('Download link opened by ', f.sent_to_email),
        f.opened_at
      FROM order_fulfillments f
      JOIN orders o ON o.id = f.order_id
      WHERE o.store_id = $1
        AND f.opened_at IS NOT NULL
    )
    SELECT type, description, timestamp
    FROM events
    WHERE timestamp IS NOT NULL
    ORDER BY timestamp DESC
    LIMIT $2;
  `;
  const result = await pool.query(sql, [storeId, safeLimit]);
  return result.rows;
}

/**
 * Summary metrics for current and previous periods.
 * previousPeriod is the same length immediately before startDate.
 */
async function getAnalyticsSummary(storeId, startDate, endDate, productId = null) {
  const s       = new Date(startDate);
  const e       = new Date(endDate);
  const diffDays = Math.max(0, Math.round((e - s) / (1000 * 60 * 60 * 24)));

  const prevEnd   = new Date(s); prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - diffDays);
  const prevStartDate = prevStart.toISOString().slice(0, 10);
  const prevEndDate   = prevEnd.toISOString().slice(0, 10);

  const productJoin   = productId ? `JOIN order_items _oi ON _oi.order_id = o.id AND _oi.product_id = $6` : "";
  const orderParams   = productId
    ? [storeId, startDate, endDate, prevStartDate, prevEndDate, productId]
    : [storeId, startDate, endDate, prevStartDate, prevEndDate];

  const ordersSql = `
    SELECT
      COALESCE(SUM(o.total_cents) FILTER (WHERE o.created_at::date BETWEEN $2::date AND $3::date), 0)::bigint AS cur_rev,
      COUNT(*)                    FILTER (WHERE o.created_at::date BETWEEN $2::date AND $3::date)::int        AS cur_orders,
      COUNT(DISTINCT o.buyer_email) FILTER (WHERE o.created_at::date BETWEEN $2::date AND $3::date)::int     AS cur_unique_buyers,
      COALESCE(SUM(o.total_cents) FILTER (WHERE o.created_at::date BETWEEN $4::date AND $5::date), 0)::bigint AS prev_rev,
      COUNT(*)                    FILTER (WHERE o.created_at::date BETWEEN $4::date AND $5::date)::int        AS prev_orders,
      COUNT(DISTINCT o.buyer_email) FILTER (WHERE o.created_at::date BETWEEN $4::date AND $5::date)::int     AS prev_unique_buyers
    FROM orders o
    ${productJoin}
    WHERE o.store_id = $1
      AND o.status   = 'paid'
      AND o.created_at::date BETWEEN $4::date AND $3::date
  `;

  const viewProductFilter = productId ? `AND product_id = $6` : "";
  const viewParams = orderParams; // same binding positions

  const viewsSql = `
    SELECT
      COUNT(*)                   FILTER (WHERE created_at::date BETWEEN $2::date AND $3::date)::int AS cur_views,
      COUNT(DISTINCT visitor_id) FILTER (WHERE created_at::date BETWEEN $2::date AND $3::date)::int AS cur_unique,
      COUNT(*)                   FILTER (WHERE created_at::date BETWEEN $4::date AND $5::date)::int AS prev_views,
      COUNT(DISTINCT visitor_id) FILTER (WHERE created_at::date BETWEEN $4::date AND $5::date)::int AS prev_unique
    FROM page_views
    WHERE store_id = $1
      AND created_at::date BETWEEN $4::date AND $3::date
      ${viewProductFilter}
  `;

  const [ordersRes, viewsRes] = await Promise.all([
    pool.query(ordersSql, orderParams),
    pool.query(viewsSql, viewParams),
  ]);

  const o = ordersRes.rows[0] || {};
  const v = viewsRes.rows[0]  || {};

  return {
    currentPeriod: {
      totalRevenue:   Number(o.cur_rev             ?? 0),
      totalOrders:    Number(o.cur_orders          ?? 0),
      uniqueBuyers:   Number(o.cur_unique_buyers   ?? 0),
      totalViews:     Number(v.cur_views           ?? 0),
      uniqueVisitors: Number(v.cur_unique          ?? 0),
    },
    previousPeriod: {
      totalRevenue:   Number(o.prev_rev            ?? 0),
      totalOrders:    Number(o.prev_orders         ?? 0),
      uniqueBuyers:   Number(o.prev_unique_buyers  ?? 0),
      totalViews:     Number(v.prev_views          ?? 0),
      uniqueVisitors: Number(v.prev_unique         ?? 0),
    },
    previousStartDate: prevStartDate,
    previousEndDate:   prevEndDate,
  };
}

/**
 * Revenue + order counts over time, zero-filled, grouped by daily/weekly/monthly/quarterly/yearly.
 */
async function getRevenueTimeSeries(storeId, startDate, endDate, groupBy = "daily", productId = null) {
  const TRUNC = {
    daily:     { trunc: "day",     interval: "1 day",    fmt: "YYYY-MM-DD" },
    weekly:    { trunc: "week",    interval: "1 week",   fmt: "YYYY-MM-DD" },
    monthly:   { trunc: "month",   interval: "1 month",  fmt: "YYYY-MM"    },
    quarterly: { trunc: "quarter", interval: "3 months", fmt: "YYYY-MM"    },
    yearly:    { trunc: "year",    interval: "1 year",   fmt: "YYYY"       },
  };
  const { trunc, interval, fmt } = TRUNC[groupBy] || TRUNC.daily;

  const productJoin = productId
    ? `JOIN order_items _oi ON _oi.order_id = o.id AND _oi.product_id = $4`
    : "";
  const params = productId
    ? [storeId, startDate, endDate, productId]
    : [storeId, startDate, endDate];

  const sql = `
    WITH series AS (
      SELECT generate_series(
        DATE_TRUNC('${trunc}', $2::date),
        DATE_TRUNC('${trunc}', $3::date),
        INTERVAL '${interval}'
      )::date AS bucket
    ),
    agg AS (
      SELECT
        DATE_TRUNC('${trunc}', o.created_at)::date          AS bucket,
        COALESCE(SUM(o.total_cents), 0)::bigint             AS revenue,
        COUNT(DISTINCT o.id)::int                           AS orders
      FROM orders o
      ${productJoin}
      WHERE o.store_id = $1
        AND o.status   = 'paid'
        AND o.created_at::date BETWEEN $2::date AND $3::date
      GROUP BY 1
    )
    SELECT
      TO_CHAR(s.bucket, '${fmt}')            AS date,
      COALESCE(a.revenue, 0)::bigint         AS revenue,
      COALESCE(a.orders,  0)::int            AS orders
    FROM series s
    LEFT JOIN agg a ON a.bucket = s.bucket
    ORDER BY s.bucket ASC
  `;

  const result = await pool.query(sql, params);
  return result.rows.map((r) => ({
    date:    r.date,
    revenue: Number(r.revenue),
    orders:  Number(r.orders),
  }));
}

/**
 * Per-product revenue breakdown for a date range. Returns only products with sales.
 */
async function getTopProductsBreakdown(storeId, startDate, endDate) {
  const sql = `
    WITH product_sales AS (
      SELECT
        p.id                                                         AS product_id,
        p.title                                                      AS product_name,
        COALESCE(SUM(oi.quantity * oi.unit_price_cents), 0)::bigint AS revenue,
        COUNT(DISTINCT o.id)::int                                   AS orders
      FROM products p
      JOIN order_items oi ON oi.product_id = p.id
      JOIN orders      o  ON o.id          = oi.order_id
                          AND o.store_id   = $1
                          AND o.status     = 'paid'
                          AND o.created_at::date BETWEEN $2::date AND $3::date
      WHERE p.store_id = $1
      GROUP BY p.id, p.title
    ),
    total AS (
      SELECT NULLIF(SUM(revenue), 0) AS total_revenue FROM product_sales
    )
    SELECT
      ps.product_id,
      ps.product_name,
      ps.revenue,
      ps.orders,
      ROUND(
        CASE WHEN t.total_revenue IS NULL THEN 0
             ELSE (ps.revenue::numeric / t.total_revenue) * 100
        END, 1
      )::float AS percentage
    FROM product_sales ps
    CROSS JOIN total t
    WHERE ps.revenue > 0
    ORDER BY ps.revenue DESC
    LIMIT 10
  `;
  const result = await pool.query(sql, [storeId, startDate, endDate]);
  return result.rows.map((r) => ({
    productId:   r.product_id,
    productName: r.product_name,
    revenue:     Number(r.revenue),
    orders:      Number(r.orders),
    percentage:  Number(r.percentage),
  }));
}

/**
 * Geography breakdown — combined from page_views (ip_country) and orders (buyer_country).
 * Returns views, orders, and revenue per country so the table is useful even when
 * page_view country data is sparse.
 */
async function getGeographyBreakdown(storeId, startDate, endDate) {
  const sql = `
    SELECT
      country,
      SUM(views)::int   AS views,
      SUM(orders)::int  AS orders,
      SUM(revenue)::bigint AS revenue
    FROM (
      -- Page views with country
      SELECT ip_country AS country, COUNT(*)::int AS views, 0 AS orders, 0 AS revenue
      FROM page_views
      WHERE store_id = $1
        AND ip_country IS NOT NULL
        AND ip_country != ''
        AND created_at::date BETWEEN $2::date AND $3::date
      GROUP BY ip_country

      UNION ALL

      -- Orders with buyer_country
      SELECT buyer_country AS country, 0 AS views, COUNT(*)::int AS orders, COALESCE(SUM(total_cents), 0)::bigint AS revenue
      FROM orders
      WHERE store_id = $1
        AND status = 'paid'
        AND buyer_country IS NOT NULL
        AND buyer_country != ''
        AND created_at::date BETWEEN $2::date AND $3::date
      GROUP BY buyer_country
    ) combined
    WHERE country IS NOT NULL
    GROUP BY country
    ORDER BY (SUM(views) + SUM(orders)) DESC
    LIMIT 10
  `;
  const result = await pool.query(sql, [storeId, startDate, endDate]);
  return result.rows.map((r) => ({
    country: r.country,
    views:   Number(r.views),
    orders:  Number(r.orders),
    revenue: Number(r.revenue),
  }));
}

/**
 * Customer breakdown using the store_customers table.
 * First-time: order_count = 1 AND first purchase was in [startDate, endDate].
 * Repeat: order_count > 1 AND was active (last_seen_at) in [startDate, endDate].
 */
async function getCustomerBreakdown(storeId, startDate, endDate) {
  const sql = `
    SELECT
      COUNT(*) FILTER (
        WHERE first_seen_at::date BETWEEN $2::date AND $3::date
          AND order_count = 1
      )::int AS first_time_buyers,
      COUNT(*) FILTER (
        WHERE last_seen_at::date BETWEEN $2::date AND $3::date
          AND order_count > 1
      )::int AS repeat_buyers,
      COUNT(*) FILTER (
        WHERE last_seen_at::date BETWEEN $2::date AND $3::date
      )::int AS total_customers,
      COUNT(*) FILTER (
        WHERE buyer_account_id IS NOT NULL
          AND last_seen_at::date BETWEEN $2::date AND $3::date
      )::int AS registered_buyers,
      COUNT(*) FILTER (
        WHERE buyer_account_id IS NULL
          AND last_seen_at::date BETWEEN $2::date AND $3::date
      )::int AS guest_buyers
    FROM store_customers
    WHERE store_id = $1
  `;
  const result = await pool.query(sql, [storeId, startDate, endDate]);
  const row = result.rows[0] || {};
  return {
    firstTimeBuyers:  Number(row.first_time_buyers  ?? 0),
    repeatBuyers:     Number(row.repeat_buyers      ?? 0),
    totalCustomers:   Number(row.total_customers    ?? 0),
    registeredBuyers: Number(row.registered_buyers  ?? 0),
    guestBuyers:      Number(row.guest_buyers       ?? 0),
  };
}

/**
 * Most recent paid transactions in the period, one row per order (first product item).
 */
async function getRecentTransactions(storeId, startDate, endDate, limit = 5) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 20));
  const sql = `
    WITH ranked AS (
      SELECT
        o.id                              AS order_id,
        o.buyer_email,
        o.buyer_country,
        p.title                           AS product_name,
        o.total_cents                     AS revenue,
        o.created_at,
        ROW_NUMBER() OVER (PARTITION BY o.id ORDER BY oi.unit_price_cents * oi.quantity DESC) AS rn
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products    p  ON p.id        = oi.product_id
      WHERE o.store_id = $1
        AND o.status   = 'paid'
        AND o.created_at::date BETWEEN $2::date AND $3::date
    )
    SELECT order_id, buyer_email, buyer_country, product_name, revenue, created_at
    FROM ranked
    WHERE rn = 1
    ORDER BY created_at DESC
    LIMIT $4
  `;
  const result = await pool.query(sql, [storeId, startDate, endDate, safeLimit]);
  return result.rows.map((r) => ({
    orderId:      r.order_id,
    buyerEmail:   r.buyer_email,
    buyerCountry: r.buyer_country,
    productName:  r.product_name,
    revenue:      Number(r.revenue),
    createdAt:    r.created_at,
  }));
}

module.exports = {
  getRevenueByProduct,
  getOrdersOverTime,
  getCustomerStats,
  getRecentActivity,
  getAnalyticsSummary,
  getRevenueTimeSeries,
  getTopProductsBreakdown,
  getGeographyBreakdown,
  getCustomerBreakdown,
  getRecentTransactions,
};
