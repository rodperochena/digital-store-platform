"use strict";

const { pool } = require("./pool");

/**
 * Creates an order + items in a single transaction.
 * - Validates products belong to the same store
 * - Computes total from DB prices (DB is source of truth)
 */
async function createOrder(storeId, { customer_user_id, items }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Load product prices from DB, ensure they belong to store
    const productIds = items.map((it) => it.product_id);

    const productsRes = await client.query(
      `
      SELECT id, price_cents
      FROM products
      WHERE store_id = $1 AND id = ANY($2::uuid[]);
      `,
      [storeId, productIds]
    );

    const productsMap = new Map(
      productsRes.rows.map((p) => [p.id, p.price_cents])
    );

    // Ensure every requested product exists for this store
    for (const it of items) {
      if (!productsMap.has(it.product_id)) {
        const err = new Error("One or more products not found for this store");
        err.statusCode = 400;
        throw err;
      }
    }

    // 2) Compute total
    let totalCents = 0;
    for (const it of items) {
      const unitPrice = productsMap.get(it.product_id);
      totalCents += unitPrice * it.quantity;
    }

    // 3) Create order
    const orderRes = await client.query(
      `
      INSERT INTO orders (store_id, customer_user_id, status, total_cents, currency)
      VALUES ($1, $2, 'pending', $3, 'usd')
      RETURNING id, store_id, customer_user_id, status, total_cents, currency, created_at, updated_at;
      `,
      [storeId, customer_user_id ?? null, totalCents]
    );

    const order = orderRes.rows[0];

    // 4) Create order_items (snapshot unit_price_cents)
    for (const it of items) {
      const unitPrice = productsMap.get(it.product_id);
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

async function getOrderWithItems(storeId, orderId) {
  // Ensure order belongs to store
  const orderRes = await pool.query(
    `
    SELECT id, store_id, customer_user_id, status, total_cents, currency, created_at, updated_at
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

async function markOrderPaid(storeId, orderId) {
  const sql = `
    UPDATE orders
    SET status = 'paid',
        updated_at = NOW()
    WHERE store_id = $1 AND id = $2
    RETURNING id, store_id, customer_user_id, status, total_cents, currency, created_at, updated_at;
  `;

  const result = await pool.query(sql, [storeId, orderId]);
  return result.rows[0] || null;
}

module.exports = { createOrder, getOrderWithItems, markOrderPaid };
