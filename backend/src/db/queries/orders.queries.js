"use strict";

// Queries: orders
// Core order lifecycle queries: create, fetch, mark paid, attach payment/checkout session IDs.
// createOrder runs inside a transaction — it verifies the store is enabled AND all products exist
// before inserting, so a partial order is never possible.
// markOrderPaid is idempotent: already-paid returns kind:"OK", transitioned:false.

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

// Updates sales_count on all products in a paid order. Fire-and-forget — called from the webhook.
async function incrementProductSalesCount(productIds) {
  if (!productIds || productIds.length === 0) return;
  await pool.query(
    `UPDATE products SET sales_count = sales_count + 1 WHERE id = ANY($1::uuid[])`,
    [productIds]
  );
}

// Creates a pending order inside a transaction. Validates store is enabled and all products exist
// before inserting. Returns null (not an error) if store is disabled — routes map this to a public 404.
// I'm using a transaction here to ensure we never have an order without all its items.
async function createOrder(storeId, { customer_user_id, items, buyer_email, discount_code_id, discount_amount_cents, buyer_country, marketing_opt_in }) {
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

    // Build a map of item-level sale prices (if provided by caller)
    const itemSalePriceMap = new Map();
    for (const it of items) {
      if (it.sale_price_cents != null) {
        itemSalePriceMap.set(it.product_id, Math.max(0, it.sale_price_cents));
      }
    }

    let totalCents = 0;
    for (const it of normalizedItems) {
      // Use sale price if provided, otherwise fall back to base price
      const unitPrice = itemSalePriceMap.has(it.product_id)
        ? itemSalePriceMap.get(it.product_id)
        : productsMap.get(it.product_id).price_cents;
      totalCents += unitPrice * it.quantity;
    }

    const discountCents = Math.max(0, Math.min(Number(discount_amount_cents) || 0, totalCents));
    const finalTotal = totalCents - discountCents;

    const orderRes = await client.query(
      `
      INSERT INTO orders (store_id, customer_user_id, status, total_cents, currency, buyer_email, discount_code_id, discount_amount_cents, buyer_country, marketing_opt_in)
      VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, store_id, customer_user_id, status, total_cents, currency, buyer_email, discount_code_id, discount_amount_cents, buyer_country, marketing_opt_in, created_at, updated_at;
      `,
      [storeId, customer_user_id ?? null, finalTotal, storeCurrency, buyer_email ?? null, discount_code_id ?? null, discountCents, buyer_country ?? null, marketing_opt_in ?? false]
    );

    const order = orderRes.rows[0];

    // MVP ok: loop inserts. (Later: bulk insert for scale.)
    for (const it of normalizedItems) {
      // Use sale price if provided, otherwise fall back to base price
      const unitPrice = itemSalePriceMap.has(it.product_id)
        ? itemSalePriceMap.get(it.product_id)
        : productsMap.get(it.product_id).price_cents;
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

async function listOrdersByStore(storeId, { limit = 50, search, status } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 100));

  const conditions = ["store_id = $1"];
  const values     = [storeId];
  let   idx        = 2;

  if (status && ["pending", "paid", "failed", "refunded"].includes(status)) {
    conditions.push(`status = $${idx++}`);
    values.push(status);
  }

  if (search && search.trim()) {
    conditions.push(`(buyer_email ILIKE $${idx} OR id::text ILIKE $${idx})`);
    values.push(`%${search.trim()}%`);
    idx++;
  }

  values.push(safeLimit);

  const res = await pool.query(
    `
    SELECT
      id,
      store_id,
      customer_user_id,
      status,
      total_cents,
      currency,
      buyer_email,
      stripe_payment_intent_id,
      created_at,
      updated_at
    FROM orders
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT $${idx};
    `,
    values
  );

  return res.rows;
}

async function getOrderWithItems(storeId, orderId) {
  const orderRes = await pool.query(
    `
    SELECT id, store_id, customer_user_id, status, total_cents, currency,
           stripe_payment_intent_id, stripe_checkout_session_id,
           buyer_email, discount_amount_cents, created_at, updated_at
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
      p.title,
      p.delivery_url,
      p.image_url
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

  // Customer stats from store_customers (may not exist for guest orders)
  let customer = null;
  if (order.buyer_email) {
    const customerRes = await pool.query(
      `SELECT email, order_count, total_spent_cents, first_seen_at, last_seen_at
       FROM store_customers
       WHERE store_id = $1 AND email = $2
       LIMIT 1`,
      [storeId, order.buyer_email]
    );
    customer = customerRes.rows[0] ?? null;
  }

  return { order, items: itemsRes.rows, customer };
}

// Idempotent: already-paid returns { kind: "OK", transitioned: false }.
// Uses a check-then-update pattern with a re-read to handle concurrent webhook deliveries safely.
// The UPDATE itself has AND status = 'pending' to prevent a race condition where two webhooks
// both read "pending" and both try to transition.
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

  if (current.status === "paid") return { kind: "OK", order: current, transitioned: false };
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
    if (now.status === "paid") return { kind: "OK", order: now, transitioned: false };
    return { kind: "INVALID_STATE", status: now.status };
  }

  return { kind: "OK", order: updated, transitioned: true };
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

// Returns the store ID for a given slug only if the store is enabled.
// Returns null for both "not found" and "disabled" — intentionally the same response (no info leak).
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

// Persists the Stripe Checkout Session ID on the order after the session is created.
// ON CONFLICT on the unique index catches the (rare) case where two sessions race to the same order.
async function attachCheckoutSession(orderId, checkoutSessionId) {
  const cs = String(checkoutSessionId || "").trim();
  try {
    await pool.query(
      `UPDATE orders
       SET stripe_checkout_session_id = $2, updated_at = NOW()
       WHERE id = $1 AND stripe_checkout_session_id IS NULL`,
      [orderId, cs]
    );
  } catch (err) {
    if (err && err.code === "23505") {
      // Unique constraint: session already attached to another order
      const conflict = new Error("Checkout session ID conflict");
      conflict.statusCode = 409;
      throw conflict;
    }
    throw err;
  }
}

/**
 * Enriched order list — includes product names, item count, fulfillment status.
 * Supports optional filters: status, search, dateFrom, dateTo, productId, sortBy.
 */
async function listOrdersEnriched(storeId, {
  limit = 100,
  search,
  status,
  dateFrom,
  dateTo,
  productId,
  sortBy = "newest",
} = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));

  const orderByMap = {
    newest:  "o.created_at DESC",
    oldest:  "o.created_at ASC",
    highest: "o.total_cents DESC",
    lowest:  "o.total_cents ASC",
  };
  const orderBy = orderByMap[sortBy] || "o.created_at DESC";

  const values = [storeId];
  let idx = 2;

  const statusParam  = (status && ["pending", "paid", "failed", "refunded"].includes(status)) ? status : null;
  const searchParam  = (search && search.trim()) ? search.trim() : null;
  const dateFromParm = dateFrom || null;
  const dateToParm   = dateTo   || null;
  const productParm  = productId || null;

  values.push(statusParam, searchParam, dateFromParm, dateToParm, productParm, safeLimit);

  const sql = `
    SELECT
      o.id,
      o.store_id,
      o.status,
      o.total_cents,
      o.currency,
      o.buyer_email,
      o.created_at,
      o.updated_at,
      o.discount_code_id,
      o.discount_amount_cents,
      o.stripe_checkout_session_id,
      COALESCE(
        (SELECT array_agg(p.title ORDER BY oi.created_at)
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = o.id),
        ARRAY[]::text[]
      ) AS product_names,
      (SELECT p.title
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = o.id
       LIMIT 1) AS primary_product_name,
      (SELECT COUNT(*)::int FROM order_items WHERE order_id = o.id) AS item_count,
      f.status             AS fulfillment_status,
      f.sent_at            AS fulfillment_sent_at,
      f.opened_at          AS fulfillment_opened_at,
      f.delivery_expires_at,
      CASE WHEN ba.id IS NOT NULL THEN 'member' ELSE 'guest' END AS buyer_type,
      ba.display_name      AS buyer_display_name,
      COALESCE(o.buyer_country, sc.country) AS buyer_country
    FROM orders o
    LEFT JOIN order_fulfillments f
      ON f.order_id = o.id AND f.store_id = o.store_id
    LEFT JOIN buyer_accounts ba
      ON ba.store_id = o.store_id AND ba.email = o.buyer_email
    LEFT JOIN store_customers sc
      ON sc.store_id = o.store_id AND sc.email = o.buyer_email
    WHERE o.store_id = $1
      AND ($2::text IS NULL OR o.status = $2)
      AND ($3::text IS NULL OR o.buyer_email ILIKE '%' || $3 || '%' OR o.id::text ILIKE '%' || $3 || '%')
      AND ($4::timestamptz IS NULL OR o.created_at >= $4)
      AND ($5::timestamptz IS NULL OR o.created_at <= $5)
      AND ($6::uuid IS NULL OR o.id IN (SELECT order_id FROM order_items WHERE product_id = $6))
    ORDER BY ${orderBy}
    LIMIT $7;
  `;

  const res = await pool.query(sql, values);
  return res.rows;
}

/**
 * Summary stats for the orders page stat cards.
 * Supports same date/status/product filters as the list.
 */
async function getOrdersSummary(storeId, { dateFrom, dateTo, status, productId } = {}) {
  const statusParam = (status && ["pending", "paid", "failed", "refunded"].includes(status)) ? status : null;
  const dateFromParm = dateFrom || null;
  const dateToParm   = dateTo   || null;
  const productParm  = productId || null;

  const res = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.total_cents ELSE 0 END), 0)::bigint AS total_revenue,
      COUNT(*)::int                                                                          AS order_count,
      COUNT(CASE WHEN o.status = 'paid'     THEN 1 END)::int                               AS paid_count,
      COUNT(CASE WHEN o.status = 'pending'  THEN 1 END)::int                               AS pending_count,
      COUNT(CASE WHEN o.status = 'failed'   THEN 1 END)::int                               AS failed_count,
      COUNT(CASE WHEN o.status = 'refunded' THEN 1 END)::int                               AS refunded_count,
      COUNT(CASE WHEN f.status IN ('sent', 'opened') THEN 1 END)::int                      AS delivered_count
    FROM orders o
    LEFT JOIN order_fulfillments f ON f.order_id = o.id AND f.store_id = o.store_id
    WHERE o.store_id = $1
      AND ($2::text IS NULL OR o.status = $2)
      AND ($3::timestamptz IS NULL OR o.created_at >= $3)
      AND ($4::timestamptz IS NULL OR o.created_at <= $4)
      AND ($5::uuid IS NULL OR o.id IN (SELECT order_id FROM order_items WHERE product_id = $5))
  `, [storeId, statusParam, dateFromParm, dateToParm, productParm]);

  const r = res.rows[0];
  const totalRevenue = Number(r.total_revenue);
  const paidCount    = Number(r.paid_count);
  return {
    totalRevenue,
    orderCount:       Number(r.order_count),
    averageOrderValue: paidCount > 0 ? Math.round(totalRevenue / paidCount) : 0,
    paidCount,
    pendingCount:     Number(r.pending_count),
    failedCount:      Number(r.failed_count),
    refundedCount:    Number(r.refunded_count),
    deliveredCount:   Number(r.delivered_count),
    deliveryRate:     paidCount > 0 ? Math.round((Number(r.delivered_count) / paidCount) * 100) : 0,
  };
}

module.exports = {
  createOrder,
  resolveEnabledStoreIdBySlug,
  listOrdersByStore,
  listOrdersEnriched,
  getOrdersSummary,
  getOrderWithItems,
  markOrderPaid,
  attachPaymentIntent,
  attachCheckoutSession,
  markOrderPaidByPaymentIntent,
  incrementProductSalesCount,
};
