"use strict";

// DEMO ROUTES — Temporary checkout simulation for demo purposes.
// POST /api/store/:slug/checkout/demo — creates a paid order directly without Stripe.
// GET  /api/store/:slug/orders/:orderId/summary — returns public order summary for success page.
//
// NOTE: These endpoints are intentionally NOT gated by NODE_ENV so they work in the demo
// environment. Remove or disable after the demo is over and Stripe is fully configured.

const express = require("express");
const { z } = require("zod");
const { pool } = require("../db/pool");
const {
  resolveEnabledStoreIdBySlug,
  createOrder,
  markOrderPaid,
} = require("../db/queries/orders.queries");
const { validateDiscountCode, incrementDiscountUse } = require("../db/queries/discounts.queries");
const { getActiveSale, computeSalePriceForProduct } = require("../db/queries/sales.queries");
const { getEnabledStoreMetaBySlug } = require("../db/queries/storefront.queries");
const { triggerFulfillment } = require("../lib/fulfillment");
const { upsertCustomer } = require("../db/queries/customers.queries");
const { validateBody } = require("../middleware/validate.middleware");
const { checkoutLimiter } = require("../middleware/rateLimit.middleware");

const router = express.Router();

function jsonError(req, res, status, code, message) {
  return res.status(status).json({
    error: true,
    code,
    message,
    path: req.originalUrl,
    request_id: req.id || null,
  });
}

// ── POST /api/store/:slug/checkout/demo ───────────────────────────────────────
//
// DEMO ENDPOINT: simulates a paid order without going through Stripe.
// Remove or replace with the real Stripe webhook flow in production.

const demoCheckoutSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity:   z.number().int().positive(),
      })
    )
    .min(1, "items must have at least 1 item"),
  email:         z.string().email(),
  discount_code: z.string().max(50).optional(),
});

router.post(
  "/store/:slug/checkout/demo",
  checkoutLimiter,
  validateBody(demoCheckoutSchema),
  async (req, res, next) => {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const { items, email, discount_code } = req.validatedBody;

    try {
      // 1. Resolve store
      const storeId = await resolveEnabledStoreIdBySlug(slug);
      if (!storeId) return jsonError(req, res, 404, "NOT_FOUND", "Store not found");

      const store = await getEnabledStoreMetaBySlug(slug);
      if (!store) return jsonError(req, res, 404, "NOT_FOUND", "Store not found");
      if (store.is_paused) {
        return jsonError(req, res, 503, "STORE_PAUSED", store.pause_message || "Store is paused");
      }

      // 2. Fetch products + active sale
      const productIds = items.map((i) => i.product_id);
      const [productsRes, activeSale] = await Promise.all([
        pool.query(
          `SELECT id, title, price_cents, pricing_type, minimum_price_cents
           FROM products WHERE store_id = $1 AND id = ANY($2::uuid[])`,
          [storeId, productIds]
        ),
        getActiveSale(storeId),
      ]);
      const productsMap = new Map(productsRes.rows.map((p) => [p.id, p]));

      // Validate all products belong to this store
      for (const item of items) {
        if (!productsMap.has(item.product_id)) {
          return jsonError(req, res, 400, "NOT_FOUND", "One or more products were not found");
        }
      }

      // Apply sale pricing
      for (const [id, p] of productsMap) {
        const salePrice = computeSalePriceForProduct(id, p.price_cents, activeSale);
        p.effective_price_cents = salePrice ?? p.price_cents;
      }

      let subtotalCents = 0;
      for (const item of items) {
        const p = productsMap.get(item.product_id);
        subtotalCents += p.effective_price_cents * item.quantity;
      }

      // 3. Validate discount code if provided
      let discountResult = null;
      if (discount_code) {
        discountResult = await validateDiscountCode(storeId, discount_code, subtotalCents);
        if (!discountResult.valid) {
          return jsonError(req, res, 400, "INVALID_DISCOUNT", discountResult.reason);
        }
      }

      // 4. Create pending order
      const country = (
        req.headers["cf-ipcountry"] ||
        req.headers["x-vercel-ip-country"] ||
        req.headers["x-country"] ||
        req.headers["x-test-country"] || ""
      ).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || null;

      const itemsWithSalePrice = items.map((item) => {
        const p = productsMap.get(item.product_id);
        return {
          ...item,
          sale_price_cents:
            p.effective_price_cents !== p.price_cents ? p.effective_price_cents : undefined,
        };
      });

      const order = await createOrder(storeId, {
        items:                 itemsWithSalePrice,
        buyer_email:           email,
        discount_code_id:      discountResult?.discount_code_id ?? null,
        discount_amount_cents: discountResult?.discount_amount_cents ?? 0,
        buyer_country:         country,
        marketing_opt_in:      false,
      });
      if (!order) return jsonError(req, res, 404, "NOT_FOUND", "Store not found");

      // 5. Mark order paid immediately (skips Stripe entirely)
      await markOrderPaid(storeId, order.id);

      // 6. Increment discount usage (fire-and-forget)
      if (discountResult?.discount_code_id) {
        incrementDiscountUse(discountResult.discount_code_id).catch((err) =>
          console.error("[demo] incrementDiscountUse error", err.message)
        );
      }

      // 7. Upsert customer (fire-and-forget)
      upsertCustomer(storeId, {
        email,
        totalSpentCents: order.total_cents,
        marketingOptIn:  false,
        country,
      }).catch((err) =>
        console.error("[demo] upsertCustomer error", err.message)
      );

      // 8. Trigger fulfillment — sends the download email (fire-and-forget)
      triggerFulfillment(order.id, storeId).catch((err) =>
        console.error("[demo] triggerFulfillment error", { orderId: order.id, err: err.message })
      );

      return res.status(201).json({
        success:     true,
        order_id:    order.id,
        total_cents: order.total_cents,
        email,
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/store/:slug/orders/:orderId/summary ──────────────────────────────
//
// Returns non-sensitive public order info for the success page.
// The order_id UUID is hard to enumerate so this is safe without auth.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get(
  "/store/:slug/orders/:orderId/summary",
  async (req, res, next) => {
    const slug    = String(req.params.slug    || "").trim().toLowerCase();
    const orderId = String(req.params.orderId || "").trim();

    if (!UUID_RE.test(orderId)) {
      return res.status(400).json({ error: true, code: "INVALID_ID", message: "Invalid order ID format" });
    }

    try {
      const storeId = await resolveEnabledStoreIdBySlug(slug);
      if (!storeId) {
        return res.status(404).json({ error: true, code: "NOT_FOUND", message: "Store not found" });
      }

      const [orderRes, itemsRes] = await Promise.all([
        pool.query(
          `SELECT id, status, total_cents, currency, buyer_email, created_at
           FROM orders WHERE store_id = $1 AND id = $2 LIMIT 1`,
          [storeId, orderId]
        ),
        pool.query(
          `SELECT oi.quantity, oi.unit_price_cents, p.title, p.image_url
           FROM order_items oi
           JOIN products p ON p.id = oi.product_id
           WHERE oi.order_id = $1
           ORDER BY oi.created_at ASC`,
          [orderId]
        ),
      ]);

      const order = orderRes.rows[0];
      if (!order) {
        return res.status(404).json({ error: true, code: "NOT_FOUND", message: "Order not found" });
      }

      return res.json({
        order: {
          id:          order.id,
          status:      order.status,
          total_cents: order.total_cents,
          currency:    order.currency,
          buyer_email: order.buyer_email,
          created_at:  order.created_at,
        },
        items: itemsRes.rows,
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = { demoRouter: router };
