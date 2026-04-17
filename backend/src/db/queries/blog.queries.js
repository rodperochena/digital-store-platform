"use strict";

// Queries: blog posts
// Store blog CRUD for the owner dashboard and public storefront. Visibility controlled by status ('published'/'draft').

const { pool } = require("../pool");

// ── Create ─────────────────────────────────────────────────────────────────────

async function createBlogPost(storeId, {
  slug, title, excerpt, body, cover_image_url, status,
  seo_title, seo_description, featured_product_id, author_name,
}) {
  const resolvedStatus = status || "draft";
  const publishedAt    = resolvedStatus === "published" ? new Date() : null;

  const { rows } = await pool.query(
    `INSERT INTO blog_posts
       (store_id, slug, title, excerpt, body, cover_image_url, status,
        published_at, seo_title, seo_description, featured_product_id, author_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      storeId, slug, title, excerpt || null, body,
      cover_image_url || null, resolvedStatus, publishedAt,
      seo_title || null, seo_description || null,
      featured_product_id || null, author_name || null,
    ]
  );
  return rows[0];
}

// ── List (owner — all statuses) ────────────────────────────────────────────────

async function listBlogPostsForOwner(storeId, { status, limit = 50, offset = 0 } = {}) {
  const conditions = ["store_id = $1"];
  const vals       = [storeId];
  let   i          = 2;

  if (status && ["draft", "published"].includes(status)) {
    conditions.push(`status = $${i++}`);
    vals.push(status);
  }

  const where = conditions.join(" AND ");
  const { rows } = await pool.query(
    `SELECT id, slug, title, excerpt, cover_image_url, status,
            published_at, author_name, created_at, updated_at
     FROM   blog_posts
     WHERE  ${where}
     ORDER  BY created_at DESC
     LIMIT  $${i} OFFSET $${i + 1}`,
    [...vals, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) AS total FROM blog_posts WHERE ${where}`,
    vals
  );

  return { posts: rows, total: parseInt(countRows[0].total, 10) };
}

// ── Get single post by ID (owner) ──────────────────────────────────────────────

async function getBlogPostById(storeId, postId) {
  const { rows } = await pool.query(
    `SELECT * FROM blog_posts WHERE id = $1 AND store_id = $2 LIMIT 1`,
    [postId, storeId]
  );
  return rows[0] ?? null;
}

// ── Update ─────────────────────────────────────────────────────────────────────

async function updateBlogPost(storeId, postId, updates) {
  const allowed = [
    "slug", "title", "excerpt", "body", "cover_image_url", "status",
    "seo_title", "seo_description", "featured_product_id", "author_name",
  ];

  // Fetch current row to decide if published_at should be set
  const current = await getBlogPostById(storeId, postId);
  if (!current) return null;

  const sets = [];
  const vals = [];
  let   i    = 1;

  for (const key of allowed) {
    if (key in updates) {
      sets.push(`${key} = $${i++}`);
      vals.push(updates[key] ?? null);
    }
  }

  if (sets.length === 0) return current;

  // If transitioning draft → published for the first time, stamp published_at
  if (
    updates.status === "published" &&
    current.status === "draft" &&
    !current.published_at
  ) {
    sets.push(`published_at = $${i++}`);
    vals.push(new Date());
  }

  sets.push(`updated_at = NOW()`);
  vals.push(postId, storeId);

  const { rows } = await pool.query(
    `UPDATE blog_posts SET ${sets.join(", ")}
     WHERE  id = $${i} AND store_id = $${i + 1}
     RETURNING *`,
    vals
  );
  return rows[0] ?? null;
}

// ── Delete ─────────────────────────────────────────────────────────────────────

async function deleteBlogPost(storeId, postId) {
  const { rowCount } = await pool.query(
    `DELETE FROM blog_posts WHERE id = $1 AND store_id = $2`,
    [postId, storeId]
  );
  return rowCount > 0;
}

// ── Public: list published posts ───────────────────────────────────────────────

async function listPublishedPosts(storeId, { limit = 10, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, slug, title, excerpt, cover_image_url, published_at, author_name
     FROM   blog_posts
     WHERE  store_id = $1 AND status = 'published'
     ORDER  BY published_at DESC NULLS LAST, created_at DESC
     LIMIT  $2 OFFSET $3`,
    [storeId, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) AS total FROM blog_posts WHERE store_id = $1 AND status = 'published'`,
    [storeId]
  );

  return { posts: rows, total: parseInt(countRows[0].total, 10) };
}

// ── Public: get published post by slug ────────────────────────────────────────

async function getPublishedPostBySlug(storeId, postSlug) {
  const { rows } = await pool.query(
    `SELECT bp.*,
            p.id            AS fp_id,
            p.title         AS fp_title,
            p.price_cents   AS fp_price_cents,
            p.currency      AS fp_currency,
            p.image_url     AS fp_image_url,
            p.visibility    AS fp_visibility
     FROM   blog_posts bp
     LEFT   JOIN products p ON p.id = bp.featured_product_id
     WHERE  bp.store_id = $1 AND bp.slug = $2 AND bp.status = 'published'
     LIMIT  1`,
    [storeId, postSlug]
  );
  if (!rows[0]) return null;

  const row = rows[0];
  const featuredProduct = row.fp_id
    ? {
        id:          row.fp_id,
        title:       row.fp_title,
        price_cents: row.fp_price_cents,
        currency:    row.fp_currency,
        image_url:   row.fp_image_url,
        visibility:  row.fp_visibility,
      }
    : null;

  const {
    fp_id, fp_title, fp_price_cents, fp_currency, fp_image_url, fp_visibility,
    ...post
  } = row;

  return { ...post, featured_product: featuredProduct };
}

// ── Slug availability ─────────────────────────────────────────────────────────

async function isSlugAvailable(storeId, slug, excludePostId = null) {
  const vals = [storeId, slug];
  let where = "store_id = $1 AND slug = $2";
  if (excludePostId) {
    where += " AND id != $3";
    vals.push(excludePostId);
  }
  const { rows } = await pool.query(
    `SELECT id FROM blog_posts WHERE ${where} LIMIT 1`,
    vals
  );
  return rows.length === 0;
}

// ── Recent published posts (storefront homepage widget) ───────────────────────

async function getRecentPublishedPosts(storeId, limit = 3) {
  const { rows } = await pool.query(
    `SELECT id, slug, title, excerpt, cover_image_url, published_at, author_name
     FROM   blog_posts
     WHERE  store_id = $1 AND status = 'published'
     ORDER  BY published_at DESC NULLS LAST, created_at DESC
     LIMIT  $2`,
    [storeId, limit]
  );
  return rows;
}

module.exports = {
  createBlogPost,
  listBlogPostsForOwner,
  getBlogPostById,
  updateBlogPost,
  deleteBlogPost,
  listPublishedPosts,
  getPublishedPostBySlug,
  isSlugAvailable,
  getRecentPublishedPosts,
};
