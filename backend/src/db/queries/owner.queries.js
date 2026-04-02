"use strict";

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
};
