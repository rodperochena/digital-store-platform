"use strict";

// Queries: store customers + contacts
// store_customers is built from paid orders (upserted in the Stripe webhook).
// listContactsUnified merges store_customers and store_subscribers into one unified contact list
// so the owner dashboard has a single view of all people, regardless of how they interacted.
// upsertCustomer uses ON CONFLICT DO UPDATE to handle concurrent webhook deliveries safely.

const { pool } = require("../pool");

/**
 * Upsert a buyer into store_customers after a paid order.
 * Updates last_seen_at, increments order_count, and adds to total_spent_cents.
 * Optionally links a buyer_account_id and records marketing_opt_in.
 */
async function upsertCustomer(storeId, { email, displayName, totalSpentCents, marketingOptIn, buyerAccountId, country } = {}) {
  const sql = `
    INSERT INTO store_customers (store_id, email, display_name, total_spent_cents, marketing_opt_in, buyer_account_id, country)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (store_id, email) DO UPDATE
      SET last_seen_at      = NOW(),
          order_count       = store_customers.order_count + 1,
          total_spent_cents = store_customers.total_spent_cents + EXCLUDED.total_spent_cents,
          display_name      = COALESCE(EXCLUDED.display_name, store_customers.display_name),
          marketing_opt_in  = CASE
            WHEN EXCLUDED.marketing_opt_in = TRUE THEN TRUE
            ELSE store_customers.marketing_opt_in
          END,
          buyer_account_id  = COALESCE(store_customers.buyer_account_id, EXCLUDED.buyer_account_id),
          country           = COALESCE(store_customers.country, EXCLUDED.country)
    RETURNING id;
  `;
  await pool.query(sql, [
    storeId,
    email,
    displayName ?? null,
    totalSpentCents ?? 0,
    marketingOptIn ?? false,
    buyerAccountId ?? null,
    country ?? null,
  ]);

  // Auto-sync buyer_account_id and marketing_opt_in from buyer_accounts.
  // Handles the case where the account was created before the first purchase
  // (linkBuyerAccountToCustomer ran but store_customers didn't exist yet).
  await pool.query(
    `UPDATE store_customers sc
     SET buyer_account_id = COALESCE(sc.buyer_account_id, ba.id),
         marketing_opt_in = CASE WHEN ba.marketing_opt_in = TRUE THEN TRUE ELSE sc.marketing_opt_in END
     FROM buyer_accounts ba
     WHERE ba.store_id = $1
       AND LOWER(ba.email) = LOWER($2)
       AND sc.store_id = $1
       AND LOWER(sc.email) = LOWER($2)`,
    [storeId, email]
  );
}

async function listCustomers(storeId, { search } = {}) {
  const conditions = ["c.store_id = $1"];
  const values = [storeId];
  let idx = 2;

  if (search) {
    conditions.push(`(c.email ILIKE $${idx} OR c.display_name ILIKE $${idx})`);
    values.push(`%${search}%`);
    idx++;
  }

  const sql = `
    SELECT
      c.id,
      c.email,
      c.display_name,
      c.order_count,
      c.total_spent_cents,
      c.first_seen_at,
      c.last_seen_at
    FROM store_customers c
    WHERE ${conditions.join(" AND ")}
    ORDER BY c.last_seen_at DESC;
  `;
  const result = await pool.query(sql, values);
  return result.rows;
}

/**
 * Enriched customer list with last product, last order date, subscriber status.
 * Supports search, filter (one-time / repeat / subscribers), and sort.
 */
async function listCustomersEnriched(storeId, { search, filter, sortBy = "recent" } = {}) {
  const conditions = ["sc.store_id = $1"];
  const values = [storeId];
  let idx = 2;

  if (search && search.trim()) {
    conditions.push(`sc.email ILIKE $${idx}`);
    values.push(`%${search.trim()}%`);
    idx++;
  }

  if (filter === "one-time") {
    conditions.push("sc.order_count = 1");
  } else if (filter === "repeat") {
    conditions.push("sc.order_count > 1");
  } else if (filter === "subscribers") {
    conditions.push(
      `EXISTS (SELECT 1 FROM store_subscribers ss WHERE ss.store_id = sc.store_id AND ss.email = sc.email AND ss.is_active = true)`
    );
  }

  const orderByMap = {
    recent:  "sc.last_seen_at DESC NULLS LAST",
    spent:   "sc.total_spent_cents DESC",
    orders:  "sc.order_count DESC",
    alpha:   "sc.email ASC",
    oldest:  "sc.first_seen_at ASC NULLS LAST",
  };
  const orderBy = orderByMap[sortBy] || "sc.last_seen_at DESC NULLS LAST";

  const sql = `
    SELECT
      sc.id,
      sc.email,
      sc.display_name,
      sc.order_count,
      sc.total_spent_cents,
      sc.first_seen_at,
      sc.last_seen_at,
      (SELECT o.created_at
       FROM orders o
       WHERE o.store_id = sc.store_id AND o.buyer_email = sc.email AND o.status = 'paid'
       ORDER BY o.created_at DESC LIMIT 1) AS last_order_at,
      (SELECT p.title
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       WHERE o.store_id = sc.store_id AND o.buyer_email = sc.email AND o.status = 'paid'
       ORDER BY o.created_at DESC LIMIT 1) AS last_product_name,
      EXISTS (
        SELECT 1 FROM store_subscribers ss
        WHERE ss.store_id = sc.store_id AND ss.email = sc.email AND ss.is_active = true
      ) AS is_subscriber
    FROM store_customers sc
    WHERE ${conditions.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT 500;
  `;
  const result = await pool.query(sql, values);
  return result.rows;
}

/**
 * Unified contact list: buyers (store_customers) UNION subscriber-only contacts.
 * Includes contact_type: 'member_subscriber' | 'member' | 'guest_subscriber' | 'guest' | 'subscriber_only'
 */
async function listContactsUnified(storeId, { search } = {}) {
  const searchParam = (search && search.trim()) ? search.trim() : null;

  const sql = `
    WITH subs AS (
      SELECT email FROM store_subscribers
      WHERE store_id = $1 AND is_active = true
    ),
    contacts AS (
      SELECT
        sc.id,
        sc.email,
        sc.display_name,
        sc.order_count,
        sc.total_spent_cents,
        sc.first_seen_at,
        sc.last_seen_at,
        sc.buyer_account_id,
        sc.marketing_opt_in,
        sc.country,
        (s.email IS NOT NULL)   AS is_subscriber,
        (SELECT o.created_at
           FROM orders o
          WHERE o.store_id = sc.store_id AND o.buyer_email = sc.email AND o.status = 'paid'
          ORDER BY o.created_at DESC LIMIT 1) AS last_order_at,
        (SELECT p.title
           FROM orders o
           JOIN order_items oi ON oi.order_id = o.id
           JOIN products p    ON p.id = oi.product_id
          WHERE o.store_id = sc.store_id AND o.buyer_email = sc.email AND o.status = 'paid'
          ORDER BY o.created_at DESC LIMIT 1) AS last_product_name
      FROM store_customers sc
      LEFT JOIN subs s ON s.email = sc.email
      WHERE sc.store_id = $1

      UNION ALL

      SELECT
        NULL::uuid,
        ss.email,
        NULL,
        0,
        0::bigint,
        ss.subscribed_at,
        ss.subscribed_at,
        NULL::uuid,
        true,
        NULL::char(2),
        true,
        NULL,
        NULL
      FROM store_subscribers ss
      WHERE ss.store_id = $1
        AND ss.is_active = true
        AND ss.email NOT IN (SELECT email FROM store_customers WHERE store_id = $1)
    )
    SELECT
      id,
      email,
      display_name,
      order_count,
      total_spent_cents,
      first_seen_at,
      last_seen_at,
      buyer_account_id,
      marketing_opt_in,
      country,
      is_subscriber,
      last_order_at,
      last_product_name,
      CASE
        WHEN buyer_account_id IS NOT NULL AND is_subscriber THEN 'member_subscriber'
        WHEN buyer_account_id IS NOT NULL                   THEN 'member'
        WHEN is_subscriber AND order_count = 0              THEN 'subscriber_only'
        WHEN is_subscriber                                  THEN 'guest_subscriber'
        ELSE 'guest'
      END AS contact_type
    FROM contacts
    WHERE ($2::text IS NULL OR email ILIKE '%' || $2 || '%')
    ORDER BY last_seen_at DESC NULLS LAST
    LIMIT 500;
  `;

  const result = await pool.query(sql, [storeId, searchParam]);
  return result.rows;
}

/**
 * Summary stats for the contacts stat cards — includes all 5 contact types.
 */
async function getCustomersSummary(storeId) {
  const res = await pool.query(
    `WITH subs AS (
       SELECT email FROM store_subscribers WHERE store_id = $1 AND is_active = true
     )
     SELECT
       COUNT(*)::int                                                                       AS total_buyers,
       (SELECT COUNT(*)::int FROM store_subscribers
         WHERE store_id = $1 AND is_active = true
           AND email NOT IN (SELECT email FROM store_customers WHERE store_id = $1))       AS subscriber_only_count,
       COUNT(CASE WHEN sc.order_count = 1 THEN 1 END)::int                                AS one_time_buyers,
       COUNT(CASE WHEN sc.order_count > 1 THEN 1 END)::int                                AS repeat_buyers,
       COALESCE(AVG(sc.total_spent_cents)::bigint, 0)                                     AS avg_spend,
       COUNT(CASE WHEN sc.marketing_opt_in = true THEN 1 END)::int                        AS marketing_opted_in_buyers,
       COUNT(CASE WHEN sc.buyer_account_id IS NOT NULL THEN 1 END)::int                   AS registered_count,
       COUNT(CASE WHEN sc.buyer_account_id IS NULL     AND s.email IS NULL  THEN 1 END)::int AS guest_count,
       COUNT(CASE WHEN sc.buyer_account_id IS NULL     AND s.email IS NOT NULL THEN 1 END)::int AS guest_subscriber_count,
       COUNT(CASE WHEN sc.buyer_account_id IS NOT NULL AND s.email IS NULL  THEN 1 END)::int AS member_count,
       COUNT(CASE WHEN sc.buyer_account_id IS NOT NULL AND s.email IS NOT NULL THEN 1 END)::int AS member_subscriber_count,
       COALESCE(SUM(sc.total_spent_cents), 0)::bigint                                          AS total_lifetime_value
     FROM store_customers sc
     LEFT JOIN subs s ON s.email = sc.email
     WHERE sc.store_id = $1`,
    [storeId]
  );
  const r                  = res.rows[0];
  const totalBuyers        = Number(r.total_buyers);
  const subscriberOnlyCount = Number(r.subscriber_only_count);
  const totalContacts      = totalBuyers + subscriberOnlyCount;
  const registeredCount    = Number(r.registered_count);
  const guestSubCount      = Number(r.guest_subscriber_count);
  const memberSubCount     = Number(r.member_subscriber_count);
  const subscribedBuyers   = guestSubCount + memberSubCount;

  return {
    // New fields
    totalContacts,
    totalBuyers,
    subscriberOnlyCount,
    oneTimeBuyers:         Number(r.one_time_buyers),
    repeatBuyers:          Number(r.repeat_buyers),
    avgSpend:              Number(r.avg_spend),
    marketingOptedIn:      Number(r.marketing_opted_in_buyers),
    registeredCount,
    guestCount:            Number(r.guest_count),
    guestSubscriberCount:  guestSubCount,
    memberCount:           Number(r.member_count),
    memberSubscriberCount: memberSubCount,
    registrationRate:    totalBuyers > 0 ? Math.round((registeredCount / totalBuyers) * 100) : 0,
    repeatRate:          totalBuyers > 0 ? Math.round((Number(r.repeat_buyers) / totalBuyers) * 100) : 0,
    totalLifetimeValue:  Number(r.total_lifetime_value),
    // Backward-compat aliases
    totalCustomers:    totalBuyers,
    avgCustomerValue:  Number(r.avg_spend),
    subscribedBuyers,
    subscriptionRate:  totalBuyers > 0 ? Math.round((subscribedBuyers / totalBuyers) * 100) : 0,
  };
}

module.exports = { upsertCustomer, listCustomers, listCustomersEnriched, listContactsUnified, getCustomersSummary };
