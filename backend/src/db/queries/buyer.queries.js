"use strict";

// Queries: buyer accounts + sessions
// Buyer-facing auth storage: accounts (one per store+email), sessions, and password reset tokens.
// Structure mirrors owner.queries.js intentionally — keeps the mental model consistent for future developers.

const { pool } = require("../pool");

// ── buyer_accounts ─────────────────────────────────────────────────────────────

async function createBuyerAccount(storeId, { email, passwordHash, displayName, marketingOptIn }) {
  const sql = `
    INSERT INTO buyer_accounts (store_id, email, password_hash, display_name, marketing_opt_in)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, store_id, email, display_name, marketing_opt_in, created_at;
  `;
  const res = await pool.query(sql, [
    storeId,
    email.toLowerCase().trim(),
    passwordHash,
    displayName ?? null,
    marketingOptIn ?? false,
  ]);
  return res.rows[0];
}

async function getBuyerAccountByEmail(storeId, email) {
  const sql = `
    SELECT id, store_id, email, password_hash, display_name, marketing_opt_in, created_at, updated_at
    FROM buyer_accounts
    WHERE store_id = $1 AND LOWER(email) = LOWER($2)
    LIMIT 1;
  `;
  const res = await pool.query(sql, [storeId, email]);
  return res.rows[0] || null;
}

async function getBuyerAccountById(id) {
  const sql = `
    SELECT id, store_id, email, display_name, marketing_opt_in, created_at, updated_at
    FROM buyer_accounts
    WHERE id = $1
    LIMIT 1;
  `;
  const res = await pool.query(sql, [id]);
  return res.rows[0] || null;
}

async function updateBuyerProfile(buyerAccountId, { displayName, marketingOptIn }) {
  const setClauses = ["updated_at = NOW()"];
  const values     = [buyerAccountId];
  let idx = 2;

  if (displayName !== undefined) {
    setClauses.push(`display_name = $${idx++}`);
    values.push(displayName ?? null);
  }
  if (marketingOptIn !== undefined) {
    setClauses.push(`marketing_opt_in = $${idx++}`);
    values.push(marketingOptIn);
  }

  if (setClauses.length === 1) return; // only updated_at — skip

  await pool.query(
    `UPDATE buyer_accounts SET ${setClauses.join(", ")} WHERE id = $1`,
    values
  );
}

async function updateBuyerPassword(buyerAccountId, passwordHash) {
  await pool.query(
    `UPDATE buyer_accounts SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
    [buyerAccountId, passwordHash]
  );
}

// ── buyer_sessions ────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function createBuyerSession(buyerAccountId, storeId, tokenHash) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const sql = `
    INSERT INTO buyer_sessions (buyer_account_id, store_id, token_hash, expires_at)
    VALUES ($1, $2, $3, $4)
    RETURNING id, buyer_account_id, store_id, expires_at, created_at;
  `;
  const res = await pool.query(sql, [buyerAccountId, storeId, tokenHash, expiresAt]);
  return res.rows[0];
}

async function getBuyerSessionByTokenHash(tokenHash) {
  const sql = `
    SELECT id, buyer_account_id, store_id, expires_at, revoked_at, created_at, last_seen_at
    FROM buyer_sessions
    WHERE token_hash = $1
    LIMIT 1;
  `;
  const res = await pool.query(sql, [tokenHash]);
  return res.rows[0] || null;
}

async function revokeBuyerSession(tokenHash) {
  await pool.query(
    `UPDATE buyer_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
}

async function touchBuyerSession(sessionId) {
  await pool.query(
    `UPDATE buyer_sessions SET last_seen_at = NOW() WHERE id = $1`,
    [sessionId]
  );
}

// ── buyer_password_reset_tokens ───────────────────────────────────────────────

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

async function createBuyerPasswordResetToken(buyerAccountId, tokenHash) {
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  // Invalidate any existing unused tokens for this buyer first
  await pool.query(
    `UPDATE buyer_password_reset_tokens SET used_at = NOW()
     WHERE buyer_account_id = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [buyerAccountId]
  );
  const sql = `
    INSERT INTO buyer_password_reset_tokens (buyer_account_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
    RETURNING id, expires_at;
  `;
  const res = await pool.query(sql, [buyerAccountId, tokenHash, expiresAt]);
  return res.rows[0];
}

async function getBuyerPasswordResetToken(tokenHash) {
  const sql = `
    SELECT id, buyer_account_id, expires_at, used_at
    FROM buyer_password_reset_tokens
    WHERE token_hash = $1
    LIMIT 1;
  `;
  const res = await pool.query(sql, [tokenHash]);
  return res.rows[0] || null;
}

async function markBuyerPasswordResetTokenUsed(tokenId) {
  await pool.query(
    `UPDATE buyer_password_reset_tokens SET used_at = NOW() WHERE id = $1`,
    [tokenId]
  );
}

// ── Buyer orders ──────────────────────────────────────────────────────────────

async function listBuyerOrders(storeId, buyerEmail) {
  const sql = `
    SELECT
      o.id,
      o.status,
      o.total_cents,
      o.currency,
      o.created_at,
      o.buyer_email,
      (
        SELECT json_agg(json_build_object(
          'product_id', oi.product_id,
          'title',      p.title,
          'quantity',   oi.quantity,
          'unit_price_cents', oi.unit_price_cents
        ) ORDER BY oi.id)
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = o.id
      ) AS items
    FROM orders o
    WHERE o.store_id = $1 AND LOWER(o.buyer_email) = LOWER($2)
    ORDER BY o.created_at DESC
    LIMIT 100;
  `;
  const res = await pool.query(sql, [storeId, buyerEmail]);
  return res.rows;
}

async function getBuyerOrder(storeId, orderId, buyerEmail) {
  const sql = `
    SELECT
      o.id,
      o.status,
      o.total_cents,
      o.currency,
      o.created_at,
      o.buyer_email,
      (
        SELECT json_agg(json_build_object(
          'product_id', oi.product_id,
          'title',      p.title,
          'quantity',   oi.quantity,
          'unit_price_cents', oi.unit_price_cents,
          'image_url',  p.image_url
        ) ORDER BY oi.id)
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = o.id
      ) AS items
    FROM orders o
    WHERE o.store_id = $1 AND o.id = $2 AND LOWER(o.buyer_email) = LOWER($3)
    LIMIT 1;
  `;
  const res = await pool.query(sql, [storeId, orderId, buyerEmail]);
  return res.rows[0] || null;
}

// ── Link buyer account to store_customers record ───────────────────────────────

async function linkBuyerAccountToCustomer(storeId, email, buyerAccountId) {
  await pool.query(
    `UPDATE store_customers
     SET buyer_account_id = $3
     WHERE store_id = $1 AND LOWER(email) = LOWER($2) AND buyer_account_id IS NULL`,
    [storeId, email, buyerAccountId]
  );
}

module.exports = {
  createBuyerAccount,
  getBuyerAccountByEmail,
  getBuyerAccountById,
  updateBuyerProfile,
  updateBuyerPassword,
  createBuyerSession,
  getBuyerSessionByTokenHash,
  revokeBuyerSession,
  touchBuyerSession,
  createBuyerPasswordResetToken,
  getBuyerPasswordResetToken,
  markBuyerPasswordResetTokenUsed,
  listBuyerOrders,
  getBuyerOrder,
  linkBuyerAccountToCustomer,
};
