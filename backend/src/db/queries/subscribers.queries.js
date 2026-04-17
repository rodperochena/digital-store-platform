"use strict";

// Queries: email subscribers
// Manages store_subscribers (email list opt-ins). upsertSubscriber uses ON CONFLICT to safely handle
// re-subscribes. Unsubscribe tokens are one-time-use links generated at subscription time.

const { pool } = require("../pool");
const crypto   = require("crypto");

function generateUnsubToken() {
  return crypto.randomBytes(24).toString("hex");
}

/**
 * Subscribe an email to a store (idempotent — re-activates if previously unsubscribed).
 * Returns { subscriber, isNew }.
 */
async function upsertSubscriber(storeId, { email, first_name }) {
  const token = generateUnsubToken();
  const { rows } = await pool.query(
    `INSERT INTO store_subscribers (store_id, email, first_name, unsubscribe_token, is_active)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (store_id, email) DO UPDATE
       SET is_active      = true,
           first_name     = COALESCE(EXCLUDED.first_name, store_subscribers.first_name),
           subscribed_at  = CASE WHEN store_subscribers.is_active THEN store_subscribers.subscribed_at ELSE NOW() END
     RETURNING *, (xmax = 0) AS is_new`,
    [storeId, email.toLowerCase().trim(), first_name || null, token]
  );
  const row = rows[0];
  return { subscriber: row, isNew: row?.is_new ?? true };
}

/**
 * Get a subscriber by unsubscribe token.
 */
async function getSubscriberByToken(token) {
  const { rows } = await pool.query(
    `SELECT s.*, st.name AS store_name
     FROM store_subscribers s
     JOIN stores st ON st.id = s.store_id
     WHERE s.unsubscribe_token = $1
     LIMIT 1`,
    [token]
  );
  return rows[0] ?? null;
}

/**
 * Unsubscribe by token.
 */
async function unsubscribeByToken(token) {
  const { rows } = await pool.query(
    `UPDATE store_subscribers SET is_active = false
     WHERE unsubscribe_token = $1
     RETURNING *`,
    [token]
  );
  return rows[0] ?? null;
}

/**
 * List active subscribers for a store (owner).
 */
async function listSubscribers(storeId, { limit = 100, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, email, first_name, subscribed_at, is_active
     FROM store_subscribers
     WHERE store_id = $1
     ORDER BY subscribed_at DESC
     LIMIT $2 OFFSET $3`,
    [storeId, limit, offset]
  );
  return rows;
}

/**
 * Count active subscribers.
 */
async function countSubscribers(storeId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS count FROM store_subscribers WHERE store_id = $1 AND is_active = true`,
    [storeId]
  );
  return parseInt(rows[0]?.count ?? 0, 10);
}

/**
 * Delete a subscriber record (owner hard-delete).
 */
async function deleteSubscriber(storeId, subscriberId) {
  const { rowCount } = await pool.query(
    `DELETE FROM store_subscribers WHERE id = $1 AND store_id = $2`,
    [subscriberId, storeId]
  );
  return rowCount > 0;
}

module.exports = {
  upsertSubscriber,
  getSubscriberByToken,
  unsubscribeByToken,
  listSubscribers,
  countSubscribers,
  deleteSubscriber,
};
