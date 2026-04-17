"use strict";

// Queries: owner notifications
// In-app notification inbox for owner dashboard events (sales, fulfillment, campaigns).
// createNotification is called fire-and-forget in many places — failure must never propagate.

const { pool } = require("../pool");

async function getNotifications(storeId, { limit = 20, offset = 0, unreadOnly = false } = {}) {
  const safeLimit  = Math.max(1, Math.min(Number(limit)  || 20, 100));
  const safeOffset = Math.max(0, Number(offset) || 0);

  const filter = unreadOnly ? "AND is_read = false" : "";

  const [notifRes, countRes] = await Promise.all([
    pool.query(
      `SELECT id, type, title, body, metadata, is_read, created_at
       FROM owner_notifications
       WHERE store_id = $1 ${filter}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [storeId, safeLimit, safeOffset]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM owner_notifications
       WHERE store_id = $1 AND is_read = false`,
      [storeId]
    ),
  ]);

  return {
    notifications: notifRes.rows,
    unread_count:  countRes.rows[0]?.count ?? 0,
  };
}

async function getUnreadCount(storeId) {
  const res = await pool.query(
    `SELECT COUNT(*)::int AS count FROM owner_notifications WHERE store_id = $1 AND is_read = false`,
    [storeId]
  );
  return { count: res.rows[0]?.count ?? 0 };
}

async function markAsRead(storeId, notificationId) {
  await pool.query(
    `UPDATE owner_notifications SET is_read = true WHERE store_id = $1 AND id = $2`,
    [storeId, notificationId]
  );
}

async function markAllAsRead(storeId) {
  await pool.query(
    `UPDATE owner_notifications SET is_read = true WHERE store_id = $1 AND is_read = false`,
    [storeId]
  );
}

async function createNotification(storeId, { type, title, body = null, metadata = {} }) {
  await pool.query(
    `INSERT INTO owner_notifications (store_id, type, title, body, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [storeId, type, title, body, JSON.stringify(metadata)]
  );
}

module.exports = { getNotifications, getUnreadCount, markAsRead, markAllAsRead, createNotification };
