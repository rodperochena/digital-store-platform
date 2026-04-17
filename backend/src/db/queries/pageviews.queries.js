"use strict";

// Queries: page views + analytics
// Records storefront visits (recordPageView) and provides aggregated view stats for the dashboard.
// Visitor deduplication is based on a client-supplied visitor_id or an IP+UA hash — not perfect,
// but good enough for the store-scale analytics we need.

const { pool } = require("../pool");

/**
 * Compute an ISO date range from a period string.
 * Returns { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }
 */
function periodToDateRange(period) {
  const end   = new Date();
  const start = new Date();
  if      (period === "7d")  start.setDate(start.getDate()  -  6);
  else if (period === "30d") start.setDate(start.getDate()  - 29);
  else if (period === "60d") start.setDate(start.getDate()  - 59);
  else if (period === "90d") start.setDate(start.getDate()  - 89);
  else                       start.setFullYear(2020);  // "all"
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate:   end.toISOString().slice(0, 10),
  };
}

/**
 * Record a page view.
 */
async function recordPageView(storeId, {
  productId, pageType, visitorId, ipCountry, referrer, referrerSource, userAgent,
}) {
  const sql = `
    INSERT INTO page_views
      (store_id, product_id, page_type, visitor_id, ip_country, referrer, referrer_source, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `;
  await pool.query(sql, [
    storeId,
    productId  || null,
    pageType,
    visitorId  || null,
    ipCountry  || null,
    referrer   || null,
    referrerSource || null,
    userAgent  || null,
  ]);
}

/**
 * Daily view counts zero-filled between startDate and endDate.
 * Returns [{ date: 'YYYY-MM-DD', views: N }, ...]
 */
async function getDailyViews(storeId, { productId, startDate, endDate }) {
  const productFilter = productId ? "AND product_id = $4" : "";
  const params        = productId ? [storeId, startDate, endDate, productId] : [storeId, startDate, endDate];

  const sql = `
    WITH series AS (
      SELECT generate_series($2::date, $3::date, INTERVAL '1 day')::date AS day
    ),
    daily AS (
      SELECT created_at::date AS day, COUNT(*)::int AS views
      FROM page_views
      WHERE store_id = $1
        AND created_at::date BETWEEN $2::date AND $3::date
        ${productFilter}
      GROUP BY 1
    )
    SELECT s.day::text AS date, COALESCE(d.views, 0)::int AS views
    FROM series s
    LEFT JOIN daily d ON d.day = s.day
    ORDER BY s.day ASC
  `;
  const result = await pool.query(sql, params);
  return result.rows.map((r) => ({ date: r.date, views: Number(r.views) }));
}

/**
 * Top referrer sources for a store.
 * Returns [{ source: 'direct', count: N }, ...]
 */
async function getReferrerSources(storeId, { productId, startDate, endDate }) {
  const productFilter = productId ? "AND product_id = $4" : "";
  const params        = productId ? [storeId, startDate, endDate, productId] : [storeId, startDate, endDate];

  const sql = `
    SELECT COALESCE(referrer_source, 'unknown') AS source, COUNT(*)::int AS count
    FROM page_views
    WHERE store_id = $1
      AND created_at::date BETWEEN $2::date AND $3::date
      ${productFilter}
    GROUP BY 1
    ORDER BY count DESC
  `;
  const result = await pool.query(sql, params);
  return result.rows.map((r) => ({ source: r.source, count: Number(r.count) }));
}

/**
 * Views by country.
 * Returns [{ country: 'US', count: N }, ...] (top 20)
 */
async function getViewsByCountry(storeId, { productId, startDate, endDate }) {
  const productFilter = productId ? "AND product_id = $4" : "";
  const params        = productId ? [storeId, startDate, endDate, productId] : [storeId, startDate, endDate];

  const sql = `
    SELECT ip_country AS country, COUNT(*)::int AS count
    FROM page_views
    WHERE store_id = $1
      AND created_at::date BETWEEN $2::date AND $3::date
      AND ip_country IS NOT NULL
      ${productFilter}
    GROUP BY 1
    ORDER BY count DESC
    LIMIT 20
  `;
  const result = await pool.query(sql, params);
  return result.rows.map((r) => ({ country: r.country, count: Number(r.count) }));
}

/**
 * Total and unique visitor counts.
 * Returns { total: N, unique: N }
 */
async function getTotalViews(storeId, { productId, startDate, endDate }) {
  const productFilter = productId ? "AND product_id = $4" : "";
  const params        = productId ? [storeId, startDate, endDate, productId] : [storeId, startDate, endDate];

  const sql = `
    SELECT
      COUNT(*)::int                  AS total,
      COUNT(DISTINCT visitor_id)::int AS unique_visitors
    FROM page_views
    WHERE store_id = $1
      AND created_at::date BETWEEN $2::date AND $3::date
      ${productFilter}
  `;
  const result = await pool.query(sql, params);
  return {
    total:  Number(result.rows[0]?.total            ?? 0),
    unique: Number(result.rows[0]?.unique_visitors  ?? 0),
  };
}

/**
 * Top N products by view count in a date range.
 * Returns [{ product_id, product_title, views }, ...]
 */
async function getViewsPerProduct(storeId, { startDate, endDate, limit = 10 }) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
  const sql = `
    SELECT pv.product_id, p.title AS product_title, COUNT(*)::int AS views
    FROM page_views pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.store_id = $1
      AND pv.created_at::date BETWEEN $2::date AND $3::date
      AND pv.product_id IS NOT NULL
    GROUP BY pv.product_id, p.title
    ORDER BY views DESC
    LIMIT $4
  `;
  const result = await pool.query(sql, [storeId, startDate, endDate, safeLimit]);
  return result.rows.map((r) => ({
    product_id:    r.product_id,
    product_title: r.product_title,
    views:         Number(r.views),
  }));
}

module.exports = {
  periodToDateRange,
  recordPageView,
  getDailyViews,
  getReferrerSources,
  getViewsByCountry,
  getTotalViews,
  getViewsPerProduct,
};
