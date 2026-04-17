"use strict";

// Queries: product reviews
// Review tokens are one-time-use: submitReview marks the token used and returns null on reuse.
// createReviewToken is called during fulfillment — one token per order item, per buyer email.

const { pool } = require("../pool");
const crypto = require("crypto");

function generateReviewToken() {
  return crypto.randomBytes(24).toString("hex");
}

/**
 * Create a review invitation token for an order (called after fulfillment).
 * Returns the token (raw) so it can be embedded in the delivery email.
 */
async function createReviewToken(storeId, productId, orderId, buyerEmail) {
  const token = generateReviewToken();
  // rating = 0 is the sentinel for "pending / not yet submitted."
  // Migration 024 widens the DB CHECK to allow 0 as a pending placeholder.
  // is_approved = false ensures pending rows never appear in public listings.
  await pool.query(
    `INSERT INTO product_reviews (store_id, product_id, order_id, buyer_email, rating, review_token, is_approved)
     VALUES ($1, $2, $3, $4, 0, $5, false)
     ON CONFLICT (review_token) DO NOTHING`,
    [storeId, productId, orderId, buyerEmail, token]
  );
  return token;
}

/**
 * Get a pending review by token (rating=0 means not yet submitted).
 */
async function getReviewByToken(token) {
  const { rows } = await pool.query(
    `SELECT r.*, p.title AS product_title, s.name AS store_name, s.primary_color
     FROM product_reviews r
     JOIN products p ON p.id = r.product_id
     JOIN stores   s ON s.id = r.store_id
     WHERE r.review_token = $1
     LIMIT 1`,
    [token]
  );
  return rows[0] ?? null;
}

/**
 * Submit a review (buyer fills in rating + body via the review token URL).
 */
async function submitReview(token, { rating, body }) {
  const { rows } = await pool.query(
    `UPDATE product_reviews
     SET rating = $1, body = $2, is_approved = true
     WHERE review_token = $3 AND rating = 0
     RETURNING *`,
    [rating, body || null, token]
  );
  return rows[0] ?? null;
}

/**
 * List approved reviews for a product (public).
 */
async function listProductReviews(productId, { limit = 20, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, buyer_email, rating, body, created_at
     FROM product_reviews
     WHERE product_id = $1 AND is_approved = true AND rating > 0
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [productId, limit, offset]
  );
  // Mask email for privacy
  return rows.map((r) => ({
    ...r,
    buyer_email: maskEmail(r.buyer_email),
  }));
}

/**
 * List all reviews for a store (owner view — unmasked).
 */
async function listStoreReviews(storeId, { limit = 50, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT r.id, r.buyer_email, r.rating, r.body, r.is_approved, r.created_at,
            p.title AS product_title, p.id AS product_id
     FROM product_reviews r
     JOIN products p ON p.id = r.product_id
     WHERE r.store_id = $1 AND r.rating > 0
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [storeId, limit, offset]
  );
  return rows;
}

/**
 * Update review approval status (owner).
 */
async function updateReviewApproval(storeId, reviewId, isApproved) {
  const { rows } = await pool.query(
    `UPDATE product_reviews SET is_approved = $1
     WHERE id = $2 AND store_id = $3
     RETURNING *`,
    [isApproved, reviewId, storeId]
  );
  return rows[0] ?? null;
}

/**
 * Delete a review (owner).
 */
async function deleteReview(storeId, reviewId) {
  const { rowCount } = await pool.query(
    `DELETE FROM product_reviews WHERE id = $1 AND store_id = $2`,
    [reviewId, storeId]
  );
  return rowCount > 0;
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return "***";
  const [local, domain] = email.split("@");
  const masked = local.length <= 2
    ? local[0] + "*"
    : local[0] + "*".repeat(local.length - 2) + local[local.length - 1];
  return `${masked}@${domain}`;
}

module.exports = {
  createReviewToken,
  getReviewByToken,
  submitReview,
  listProductReviews,
  listStoreReviews,
  updateReviewApproval,
  deleteReview,
};
