"use strict";

const { pool } = require("../pool");

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];

  const map = new Map();
  for (const it of items) {
    const prev = map.get(it.product_id);
    if (!prev) {
      map.set(it.product_id, { product_id: it.product_id, quantity: it.quantity });
    } else {
      prev.quantity += it.quantity;
    }
  }
  return Array.from(map.values());
}

async function createOrder(storeId, { customer_user_id, items }) {
  const client = await pool.connect();
  const normalizedItems = normalizeItems(items);

  try {
    await client.query("BEGIN");

    // IMPORTANT:
    // - Public contract: if store does not exist OR is disabled => return null (public will respond 404)
    // - Do not leak internal enabled/disabled state via public API.
    const storeRes = await client.query(
      `
      SELECT currency, is_enabled
      FROM stores
      WHERE id = $1
      LIMIT 1;
      `,
      [storeId]
    );

    const store = storeRes.rows[0] || null;
    if (!store) {
      await client.query("ROLLBACK");
      return null;
    }
    if (store.is_enabled !== true) {
      await client.query("ROLLBACK");
      return null;
    }

    const storeCurrency = String(store.currency || "usd").toLowerCase();
    const productIds = normalizedItems.map((it) => it.product_id);

    const productsRes = await client.query(
      `
      SELECT id, price_cents, currency
      FROM products
      WHERE store_id = $1 AND id = ANY($2::uuid[]);
      `,
      [storeId, productIds]
    );

    const rows = productsRes.rows || [];
    const productsMap = new Map(
      rows.map((p) => [
        p.id,
        {
          price_cents: p.price_cents,
          currency: String(p.currency || "").toLowerCase(),
        },
      ])
    );

    for (const it of normalizedItems) {
      const prod = productsMap.get(it.product_id);
      if (!prod) {
        const err = new Error("One or more products not found for this store");
        err.statusCode = 400;
        throw err;
      }
      if (prod.currency && prod.currency !== storeCurrency) {
        const err = new Error("Product currency mismatch for this store");
        err.statusCode = 409;
        throw err;
      }
    }

    let totalCents = 0;
    for (const it of normalizedItems) {
      const unitPrice = productsMap.get(it.product_id).price_cents;
      totalCents += unitPrice * it.quantity;
    }

    const orderRes = await client.query(
      `
      INSERT INTO orders (store_id, customer_user_id, status, total_cents, currency)
      VALUES ($1, $2, 'pending', $3, $4)
      RETURNING id, store_id, customer_user_id, status, total_cents, currency, created_at, updated_at;
      `,
      [storeId, customer_user_id ?? null, totalCents, storeCurrency]
    );

    const order = orderRes.rows[0];

    // MVP ok: loop inserts. (Later: bulk insert for scale.)
    for (const it of normalizedItems) {
      const unitPrice = productsMap.get(it.product_id).price_cents;
      await client.query(
        `
        INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents)
        VALUES ($1, $2, $3, $4);
        `,
        [order.id, it.product_id, it.quantity, unitPrice]
      );
    }

    await client.query("COMMIT");
    return order;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function listOrdersByStore(storeId, { limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 100));

  const res = await pool.query(
    `
    SELECT
      id,
      store_id,
      customer_user_id,
      status,
      total_cents,
      currency,
      stripe_payment_intent_id,
      created_at,
      updated_at
    FROM orders
    WHERE store_id = $1
    ORDER BY created_at DESC
    LIMIT $2;
    `,
    [storeId, safeLimit]
  );

  return res.rows;
}

async function getOrderWithItems(storeId, orderId) {
  const orderRes = await pool.query(
    `
    SELECT id, store_id, customer_user_id, status, total_cents, currency, stripe_payment_intent_id, created_at, updated_at
    FROM orders
    WHERE store_id = $1 AND id = $2
    LIMIT 1;
    `,
    [storeId, orderId]
  );

  const order = orderRes.rows[0];
  if (!order) return null;

  const itemsRes = await pool.query(
    `
    SELECT
      oi.id,
      oi.order_id,
      oi.product_id,
      oi.quantity,
      oi.unit_price_cents,
      oi.created_at,
      p.title
    FROM order_items oi
    JOIN orders o
      ON o.id = oi.order_id
     AND o.store_id = $2
    JOIN products p
      ON p.id = oi.product_id
     AND p.store_id = o.store_id
    WHERE oi.order_id = $1
    ORDER BY oi.created_at ASC;
    `,
    [orderId, storeId]
  );

  return { order, items: itemsRes.rows };
}

async function markOrderPaid(storeId, orderId) {
  const currentRes = await pool.query(
    `
    SELECT id, store_id, customer_user_id, status, total_cents, currency, stripe_payment_intent_id, created_at, updated_at
    FROM orders
    WHERE store_id = $1 AND id = $2
    LIMIT 1;
    `,
    [storeId, orderId]
  );

  const current = currentRes.rows[0] || null;
  if (!current) return { kind: "NOT_FOUND" };

  if (current.status === "paid") return { kind: "OK", order: current };
  if (current.status !== "pending") return { kind: "INVALID_STATE", status: current.status };

  const updateRes = await pool.query(
    `
    UPDATE orders
    SET status = 'paid',
        updated_at = NOW()
    WHERE store_id = $1 AND id = $2 AND status = 'pending'
    RETURNING id, store_id, customer_user_id, status, total_cents, currency, stripe_payment_intent_id, created_at, updated_at;
    `,
    [storeId, orderId]
  );

  const updated = updateRes.rows[0] || null;
  if (!updated) {
    const reread = await pool.query(
      `
      SELECT id, store_id, customer_user_id, status, total_cents, currency, stripe_payment_intent_id, created_at, updated_at
      FROM orders
      WHERE store_id = $1 AND id = $2
      LIMIT 1;
      `,
      [storeId, orderId]
    );

    const now = reread.rows[0] || null;
    if (!now) return { kind: "NOT_FOUND" };
    if (now.status === "paid") return { kind: "OK", order: now };
    return { kind: "INVALID_STATE", status: now.status };
  }

  return { kind: "OK", order: updated };
}

async function attachPaymentIntent(storeId, orderId, paymentIntentId) {
  const pi = String(paymentIntentId || "").trim();

  const res = await pool.query(
    `
    SELECT id, stripe_payment_intent_id
    FROM orders
    WHERE store_id = $1 AND id = $2
    LIMIT 1;
    `,
    [storeId, orderId]
  );

  const row = res.rows[0] || null;
  if (!row) return { kind: "NOT_FOUND" };

  if (row.stripe_payment_intent_id === pi) return { kind: "OK" };

  if (row.stripe_payment_intent_id && row.stripe_payment_intent_id !== pi) {
    return { kind: "CONFLICT" };
  }

  // Ensure PI isn't already attached to another order in this store
  const dupRes = await pool.query(
    `
    SELECT id
    FROM orders
    WHERE store_id = $1
      AND stripe_payment_intent_id = $2
      AND id <> $3
    LIMIT 1;
    `,
    [storeId, pi, orderId]
  );

  if (dupRes.rows[0]) return { kind: "CONFLICT_PI_IN_USE" };

  // Try to attach (race-safe)
  try {
    const upd = await pool.query(
      `
      UPDATE orders
      SET stripe_payment_intent_id = $3,
          updated_at = NOW()
      WHERE store_id = $1
        AND id = $2
        AND stripe_payment_intent_id IS NULL;
      `,
      [storeId, orderId, pi]
    );
  
    if (upd.rowCount === 1) return { kind: "OK" };
  } catch (err) {
    // Unique index: uniq_orders_store_payment_intent
    if (err && err.code === "23505") {
      return { kind: "CONFLICT_PI_IN_USE" };
    }
    throw err;
  }

  // Someone else may have updated between our read and update → re-read
  const reread = await pool.query(
    `
    SELECT stripe_payment_intent_id
    FROM orders
    WHERE store_id = $1 AND id = $2
    LIMIT 1;
    `,
    [storeId, orderId]
  );

  const now = reread.rows[0] || null;
  if (!now) return { kind: "NOT_FOUND" };

  if (now.stripe_payment_intent_id === pi) return { kind: "OK" };
  if (now.stripe_payment_intent_id && now.stripe_payment_intent_id !== pi) return { kind: "CONFLICT" };

  // Shouldn't happen, but keep it safe
  return { kind: "OK" };
}

async function markOrderPaidByPaymentIntent(storeId, paymentIntentId) {
  const pi = String(paymentIntentId || "").trim();

  const res = await pool.query(
    `
    SELECT id
    FROM orders
    WHERE store_id = $1 AND stripe_payment_intent_id = $2
    LIMIT 1;
    `,
    [storeId, pi]
  );

  const row = res.rows[0] || null;
  if (!row) return { kind: "NOT_FOUND" };

  return markOrderPaid(storeId, row.id);
}

async function resolveEnabledStoreIdBySlug(slug) {
  const s = String(slug || "").trim().toLowerCase();
  if (!s) return null;

  const res = await pool.query(
    `
    SELECT id
    FROM stores
    WHERE slug = $1
      AND is_enabled = true
    LIMIT 1;
    `,
    [s]
  );

  return res.rows[0]?.id ?? null;
}

module.exports = {
  createOrder,
  resolveEnabledStoreIdBySlug,
  listOrdersByStore,
  getOrderWithItems,
  markOrderPaid,
  attachPaymentIntent,
  markOrderPaidByPaymentIntent,
};
