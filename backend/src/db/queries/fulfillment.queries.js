"use strict";

const { pool } = require("../pool");

/**
 * Insert a fulfillment record for an order.
 * UNIQUE(order_id) → ON CONFLICT DO NOTHING makes this idempotent.
 * Returns { created: true, row } if inserted, { created: false, row: null } if already existed.
 */
async function createOrSkipFulfillment(orderId, storeId, tokenHash, expiresAt, sentToEmail) {
  const res = await pool.query(
    `INSERT INTO order_fulfillments
       (order_id, store_id, delivery_token_hash, delivery_expires_at, sent_to_email)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (order_id) DO NOTHING
     RETURNING *`,
    [orderId, storeId, tokenHash, expiresAt, sentToEmail]
  );

  if (res.rowCount > 0) {
    return { created: true, row: res.rows[0] };
  }
  return { created: false, row: null };
}

/**
 * Look up a fulfillment by the hashed delivery token.
 * Used by the public delivery endpoint.
 */
async function getFulfillmentByTokenHash(tokenHash) {
  const res = await pool.query(
    `SELECT * FROM order_fulfillments WHERE delivery_token_hash = $1 LIMIT 1`,
    [tokenHash]
  );
  return res.rows[0] ?? null;
}

/**
 * Look up a fulfillment by order ID.
 * Used by owner routes to show fulfillment status.
 * Does NOT return delivery_token_hash (excluded from SELECT).
 */
async function getFulfillmentByOrderId(orderId) {
  const res = await pool.query(
    `SELECT id, order_id, store_id, delivery_expires_at, sent_to_email,
            sent_at, opened_at, status, error, created_at, updated_at
     FROM order_fulfillments
     WHERE order_id = $1
     LIMIT 1`,
    [orderId]
  );
  return res.rows[0] ?? null;
}

async function markFulfillmentSent(fulfillmentId) {
  await pool.query(
    `UPDATE order_fulfillments
     SET status = 'sent', sent_at = NOW(), error = NULL, updated_at = NOW()
     WHERE id = $1`,
    [fulfillmentId]
  );
}

async function markFulfillmentFailed(fulfillmentId, errorMsg) {
  await pool.query(
    `UPDATE order_fulfillments
     SET status = 'failed', error = $2, updated_at = NOW()
     WHERE id = $1`,
    [fulfillmentId, String(errorMsg || "Unknown error").slice(0, 500)]
  );
}

async function markFulfillmentOpened(fulfillmentId) {
  await pool.query(
    `UPDATE order_fulfillments
     SET status = 'opened', opened_at = COALESCE(opened_at, NOW()), updated_at = NOW()
     WHERE id = $1 AND status != 'failed'`,
    [fulfillmentId]
  );
}

/**
 * Reset a fulfillment for re-send: new token, new expiry, back to pending.
 * Returns the updated row, or null if not found.
 */
async function updateFulfillmentForResend(fulfillmentId, newTokenHash, newExpiresAt) {
  const res = await pool.query(
    `UPDATE order_fulfillments
     SET delivery_token_hash = $2,
         delivery_expires_at = $3,
         status    = 'pending',
         sent_at   = NULL,
         error     = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [fulfillmentId, newTokenHash, newExpiresAt]
  );
  return res.rows[0] ?? null;
}

module.exports = {
  createOrSkipFulfillment,
  getFulfillmentByTokenHash,
  getFulfillmentByOrderId,
  markFulfillmentSent,
  markFulfillmentFailed,
  markFulfillmentOpened,
  updateFulfillmentForResend,
};
