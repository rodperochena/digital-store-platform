"use strict";

// Queries: owner accounts + sessions
// Manages owner_accounts (one per store), owner_sessions (server-side token store), and
// password_reset_tokens. All token values stored here are SHA-256 hashes — raw tokens
// are only ever returned to the client and never stored.

const { pool } = require("../pool");

// ── owner_accounts ────────────────────────────────────────────────────────────

async function createOwnerAccount(storeId, { bootstrapTokenHash, bootstrapTokenExpiresAt }) {
  const sql = `
    INSERT INTO owner_accounts (store_id, bootstrap_token_hash, bootstrap_token_expires_at)
    VALUES ($1, $2, $3)
    RETURNING id, store_id, is_claimed, bootstrap_token_expires_at, created_at, updated_at;
  `;
  const res = await pool.query(sql, [storeId, bootstrapTokenHash, bootstrapTokenExpiresAt]);
  return res.rows[0];
}

async function getOwnerAccountByStoreId(storeId) {
  const sql = `
    SELECT id, store_id, email, password_hash, is_claimed,
           bootstrap_token_hash, bootstrap_token_expires_at,
           created_at, updated_at
    FROM owner_accounts
    WHERE store_id = $1
    LIMIT 1;
  `;
  const res = await pool.query(sql, [storeId]);
  return res.rows[0] || null;
}

async function getOwnerAccount(storeId) {
  const sql = `
    SELECT first_name, last_name, email
    FROM owner_accounts
    WHERE store_id = $1
    LIMIT 1;
  `;
  const res = await pool.query(sql, [storeId]);
  return res.rows[0] || null;
}

async function checkEmailExists(email) {
  const res = await pool.query(
    `SELECT id FROM owner_accounts
     WHERE LOWER(email) = LOWER($1) AND is_claimed = TRUE
     LIMIT 1`,
    [email]
  );
  return res.rows.length > 0;
}

async function getOwnerAccountByEmail(email) {
  const sql = `
    SELECT id, store_id, email, password_hash, is_claimed,
           bootstrap_token_hash, bootstrap_token_expires_at,
           created_at, updated_at
    FROM owner_accounts
    WHERE LOWER(email) = LOWER($1)
    LIMIT 1;
  `;
  const res = await pool.query(sql, [email]);
  return res.rows[0] || null;
}

/**
 * Mark an owner account as claimed:
 * - set password_hash
 * - set is_claimed = true
 * - clear bootstrap token fields
 */
async function claimOwnerAccount(accountId, passwordHash) {
  const sql = `
    UPDATE owner_accounts
    SET password_hash              = $2,
        is_claimed                 = TRUE,
        bootstrap_token_hash       = NULL,
        bootstrap_token_expires_at = NULL,
        updated_at                 = NOW()
    WHERE id = $1
    RETURNING id, store_id, is_claimed, created_at, updated_at;
  `;
  const res = await pool.query(sql, [accountId, passwordHash]);
  return res.rows[0] || null;
}

// ── owner_sessions ────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function createOwnerSession(ownerAccountId, storeId, tokenHash) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const sql = `
    INSERT INTO owner_sessions (owner_account_id, store_id, token_hash, expires_at)
    VALUES ($1, $2, $3, $4)
    RETURNING id, owner_account_id, store_id, expires_at, created_at;
  `;
  const res = await pool.query(sql, [ownerAccountId, storeId, tokenHash, expiresAt]);
  return res.rows[0];
}

async function getOwnerSessionByTokenHash(tokenHash) {
  const sql = `
    SELECT id, owner_account_id, store_id, expires_at, revoked_at, created_at, last_seen_at
    FROM owner_sessions
    WHERE token_hash = $1
    LIMIT 1;
  `;
  const res = await pool.query(sql, [tokenHash]);
  return res.rows[0] || null;
}

async function revokeOwnerSession(tokenHash) {
  await pool.query(
    `UPDATE owner_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
}

async function touchOwnerSession(sessionId) {
  await pool.query(
    `UPDATE owner_sessions SET last_seen_at = NOW() WHERE id = $1`,
    [sessionId]
  );
}

/**
 * Update owner account fields: email, first_name, last_name.
 * Only fields present in the `fields` object are written.
 */
async function updateOwnerAccount(storeId, fields) {
  const allowed = ["email", "first_name", "last_name"];
  const setClauses = [];
  const values = [storeId];
  let idx = 2;

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      setClauses.push(`${key} = $${idx++}`);
      values.push(fields[key]);
    }
  }

  if (setClauses.length === 0) return;

  setClauses.push(`updated_at = NOW()`);
  await pool.query(
    `UPDATE owner_accounts SET ${setClauses.join(", ")} WHERE store_id = $1`,
    values
  );
}

// ── password_reset_tokens ─────────────────────────────────────────────────────

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

async function createPasswordResetToken(ownerId, tokenHash) {
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  // Invalidate any existing unused tokens for this owner first
  await pool.query(
    `UPDATE password_reset_tokens SET used_at = NOW()
     WHERE owner_id = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [ownerId]
  );
  const sql = `
    INSERT INTO password_reset_tokens (owner_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
    RETURNING id, expires_at;
  `;
  const res = await pool.query(sql, [ownerId, tokenHash, expiresAt]);
  return res.rows[0];
}

async function getPasswordResetToken(tokenHash) {
  const sql = `
    SELECT id, owner_id, expires_at, used_at
    FROM password_reset_tokens
    WHERE token_hash = $1
    LIMIT 1;
  `;
  const res = await pool.query(sql, [tokenHash]);
  return res.rows[0] || null;
}

async function markPasswordResetTokenUsed(tokenId) {
  await pool.query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
    [tokenId]
  );
}

async function updateOwnerPassword(ownerId, passwordHash) {
  await pool.query(
    `UPDATE owner_accounts SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
    [ownerId, passwordHash]
  );
}

module.exports = {
  createOwnerAccount,
  getOwnerAccountByStoreId,
  getOwnerAccount,
  getOwnerAccountByEmail,
  checkEmailExists,
  claimOwnerAccount,
  createOwnerSession,
  getOwnerSessionByTokenHash,
  revokeOwnerSession,
  touchOwnerSession,
  updateOwnerAccount,
  createPasswordResetToken,
  getPasswordResetToken,
  markPasswordResetTokenUsed,
  updateOwnerPassword,
};
