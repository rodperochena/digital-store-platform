"use strict";

const { pool } = require("./pool");

/**
 * Normalize items:
 * - Merge duplicate product_id lines by summing quantities.
 * - Keeps deterministic order by first appearance.
 *
 * Defensive: returns [] if items is not an array (should not happen due to Zod).
 */
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

/**
 * Creates an order + items in a single transaction.
 * - Validates products belong to the store
 * - Computes total from DB prices (DB is source of truth)
 * - Snapshots unit_price_cents into order_items
 */
async function createOrder(storeId, { customer_user_id, items }) {
  const client = await pool.connect();

  // Defensive: normalize duplicates in case frontend sends repeated product_ids.
  const normalizedItems = normalizeItems(items);

  try {
    await client.query("BEGIN");

    // Load store currency (DB is source of truth)
    const storeRes = await client.query(
      `
      SELECT currency
      FROM stores
      WHERE id = $1
      LIMIT 1;
      `,
      [storeId]
    );

    const store = storeRes.rows[0] || null;
    if (!store) {
      const err = new Error("Store not found");
      err.statusCode = 404;
      throw err;
    }

    const storeCurrency = String(store.currency || "usd").toLowerCase();

    const productIds = normalizedItems.map((it) => it.product_id);

    // Load prices for products that belong to this store
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

    // Ensure every requested product exists for this store
    for (const it of normalizedItems) {
        const prod = productsMap.get(it.product_id);
        if (!prod) {
          const err = new Error("One or more products not found for this store");
          err.statusCode = 400;
          throw err;
        }
        if (prod.currency && prod.currency !== String(storeCurrency).toLowerCase()) {
          const err = new Error("Product currency mismatch for this store");
          err.statusCode = 409;
          throw err;
        }
    }

    // Compute total (DB prices only)
    let totalCents = 0;
    for (const it of normalizedItems) {
        const unitPrice = productsMap.get(it.product_id).price_cents;
        totalCents += unitPrice * it.quantity;
    }

    // Create order
    const orderRes = await client.query(
      `
      INSERT INTO orders (store_id, customer_user_id, status, total_cents, currency)
      VALUES ($1, $2, 'pending', $3, $4)
      RETURNING id, store_id, customer_user_id, status, total_cents, currency, created_at, updated_at;
      `,
      [storeId, customer_user_id ?? null, totalCents, storeCurrency]
    );

    const order = orderRes.rows[0];

    // Create order_items (snapshot unit_price_cents)
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

/**
 * List orders for a store (admin).
 * Safe default: limit 50 (max 100)
 */
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
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = $1
    ORDER BY oi.created_at ASC;
    `,
    [orderId]
  );

  return { order, items: itemsRes.rows };
}

/**
 * Transition an order to "paid".
 * Rules:
 * - pending -> paid allowed
 * - already paid: idempotent OK
 * - other states blocked
 *
 * Return shape:
 * - { kind: "OK", order }
 * - { kind: "NOT_FOUND" }
 * - { kind: "INVALID_STATE", status }
 */
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

  if (current.status === "paid") {
    return { kind: "OK", order: current };
  }

  if (current.status !== "pending") {
    return { kind: "INVALID_STATE", status: current.status };
  }

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
    // race-safe reread
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

/**
 * Attach a Stripe PaymentIntent id to an order.
 * Rules:
 * - Order must exist and belong to store
 * - If already has same payment_intent_id => OK (idempotent)
 * - If already has different payment_intent_id => CONFLICT
 *
 * NOTE: A later hardening step should enforce PaymentIntent uniqueness per store.
 */
async function attachPaymentIntent(storeId, orderId, paymentIntentId) {
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

  if (row.stripe_payment_intent_id === paymentIntentId) {
    return { kind: "OK" };
  }

  if (row.stripe_payment_intent_id && row.stripe_payment_intent_id !== paymentIntentId) {
    return { kind: "CONFLICT" };
  }
  // Defensive: ensure this payment intent isn't already attached to another order in this store
  const dupRes = await pool.query(
    `
    SELECT id
    FROM orders
    WHERE store_id = $1
      AND stripe_payment_intent_id = $2
      AND id <> $3
    LIMIT 1;
    `,
    [storeId, paymentIntentId, orderId]
  );

  if (dupRes.rows[0]) {
    return { kind: "CONFLICT_PI_IN_USE" };
  }

  await pool.query(
    `
    UPDATE orders
    SET stripe_payment_intent_id = $3,
        updated_at = NOW()
    WHERE store_id = $1 AND id = $2 AND stripe_payment_intent_id IS NULL;
    `,
    [storeId, orderId, paymentIntentId]
  );

  return { kind: "OK" };
}

/**
 * Mark order paid by Stripe PaymentIntent id (webhook-safe).
 * - Finds order by store_id + payment_intent_id
 * - Uses same transition rules as markOrderPaid
 *
 * NOTE: A later hardening step should enforce PaymentIntent uniqueness per store.
 */
async function markOrderPaidByPaymentIntent(storeId, paymentIntentId) {
  const res = await pool.query(
    `
    SELECT id
    FROM orders
    WHERE store_id = $1 AND stripe_payment_intent_id = $2
    LIMIT 1;
    `,
    [storeId, paymentIntentId]
  );

  const row = res.rows[0] || null;
  if (!row) return { kind: "NOT_FOUND" };

  return markOrderPaid(storeId, row.id);
}

module.exports = {
  createOrder,
  listOrdersByStore,
  getOrderWithItems,
  markOrderPaid,
  attachPaymentIntent,
  markOrderPaidByPaymentIntent,
};
