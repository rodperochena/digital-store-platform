"use strict";

// Routes: Stripe checkout + webhook
// POST /api/store/:slug/checkout/session — public, rate-limited. Creates a Stripe Checkout Session.
// POST /api/webhook/stripe — mounted in app.js with express.raw() BEFORE express.json().
// Payment truth lives in the webhook: the frontend is never trusted to mark orders paid.
// The checkout session handler also validates discounts, applies sale pricing, and creates the order.

const express = require("express");
const { z } = require("zod");
const { pool } = require("../db/pool");

const {
  createOrder,
  attachPaymentIntent,
  attachCheckoutSession,
  markOrderPaid,
  resolveEnabledStoreIdBySlug,
  incrementProductSalesCount,
} = require("../db/queries/orders.queries");

const { getEnabledStoreMetaBySlug } = require("../db/queries/storefront.queries");
const { validateBody } = require("../middleware/validate.middleware");
const { checkoutLimiter } = require("../middleware/rateLimit.middleware");
const { getStripe } = require("../lib/stripe");
const { triggerFulfillment } = require("../lib/fulfillment");
const { validateDiscountCode, incrementDiscountUse } = require("../db/queries/discounts.queries");
const { getActiveSale, computeSalePriceForProduct } = require("../db/queries/sales.queries");
const { sendEmail } = require("../lib/mailer");
const { getStoreSettings } = require("../db/queries/stores.queries");
const { getOwnerAccount } = require("../db/queries/owner.queries");
const { upsertCustomer } = require("../db/queries/customers.queries");
const { createNotification } = require("../db/queries/notifications.queries");

const router = express.Router();

// ── Validation schema ─────────────────────────────────────────────────────────

const createCheckoutSessionSchema = z.object({
  items: z
    .array(
      z.object({
        product_id:         z.string().uuid(),
        quantity:           z.number().int().positive(),
        custom_price_cents: z.number().int().positive().optional(), // for PWYW
      })
    )
    .min(1, "items must have at least 1 item"),
  buyer_email:      z.string().email(),
  discount_code:    z.string().max(50).optional(),
  marketing_opt_in: z.boolean().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonError(req, res, status, code, message) {
  return res.status(status).json({
    error: true,
    code,
    message,
    path: req.originalUrl,
    request_id: req.id || null,
  });
}

// ── POST /api/store/:slug/checkout/session ────────────────────────────────────

/**
 * Creates a Stripe Checkout Session for a public storefront purchase.
 *
 * Flow:
 *   1. Validate store is enabled
 *   2. Create local pending order (validates products belong to this store)
 *   3. Create Stripe Checkout Session with order metadata
 *   4. Persist stripe_checkout_session_id on the order
 *   5. Return { checkout_url, order_id }
 *
 * Payment truth comes from the webhook — the frontend must NOT mark orders paid.
 */
router.post(
  "/store/:slug/checkout/session",
  checkoutLimiter,
  validateBody(createCheckoutSessionSchema),
  async (req, res, next) => {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const { items, buyer_email, discount_code, marketing_opt_in } = req.validatedBody;
    const country = (
      req.headers["cf-ipcountry"] ||
      req.headers["x-vercel-ip-country"] ||
      req.headers["x-country"] ||
      req.headers["x-test-country"] || ""
    ).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || null;

    try {
      // 1. Resolve store (null = not found or disabled)
      const storeId = await resolveEnabledStoreIdBySlug(slug);
      if (!storeId) return jsonError(req, res, 404, "NOT_FOUND", "Store not found");

      const store = await getEnabledStoreMetaBySlug(slug);
      if (!store) return jsonError(req, res, 404, "NOT_FOUND", "Store not found");

      // 1b. Check if store is paused
      if (store.is_paused) {
        return jsonError(req, res, 503, "STORE_PAUSED", store.pause_message || "This store is temporarily paused");
      }

      // 2. Fetch product prices + check active sale
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

      // Validate PWYW custom prices and apply sale pricing
      for (const item of items) {
        const p = productsMap.get(item.product_id);
        if (!p) continue;

        // Apply PWYW custom price if provided
        if (p.pricing_type === "pay_what_you_want" && item.custom_price_cents) {
          const minCents = p.minimum_price_cents ?? 100;
          if (item.custom_price_cents < minCents) {
            return jsonError(req, res, 400, "BELOW_MINIMUM",
              `Minimum price for "${p.title}" is $${(minCents / 100).toFixed(2)}`);
          }
          p.effective_price_cents = item.custom_price_cents;
        } else {
          const salePrice = computeSalePriceForProduct(p.id, p.price_cents, activeSale);
          p.effective_price_cents = salePrice ?? p.price_cents;
        }
      }

      let subtotalCents = 0;
      for (const item of items) {
        const p = productsMap.get(item.product_id);
        if (p) subtotalCents += p.effective_price_cents * item.quantity;
      }

      // 2a. Validate discount code if provided
      let discountResult = null;
      if (discount_code) {
        discountResult = await validateDiscountCode(storeId, discount_code, subtotalCents);
        if (!discountResult.valid) {
          return jsonError(req, res, 400, "INVALID_DISCOUNT", discountResult.reason);
        }
      }

      // 3. Create pending local order (validates products exist and belong to store)
      // Pass sale_price_cents per item so the order total reflects sale pricing
      const itemsWithSalePrice = items.map((item) => {
        const p = productsMap.get(item.product_id);
        return { ...item, sale_price_cents: p?.effective_price_cents !== p?.price_cents ? p.effective_price_cents : undefined };
      });
      const order = await createOrder(storeId, {
        items: itemsWithSalePrice,
        buyer_email,
        discount_code_id:      discountResult?.discount_code_id ?? null,
        discount_amount_cents: discountResult?.discount_amount_cents ?? 0,
        buyer_country:         country,
        marketing_opt_in:      !!marketing_opt_in,
      });
      if (!order) return jsonError(req, res, 404, "NOT_FOUND", "Store not found");

      // 4. Build Stripe line items (sale-adjusted prices)
      const lineItems = items.map((item) => {
        const product = productsMap.get(item.product_id);
        return {
          price_data: {
            currency: store.currency.toLowerCase(),
            product_data: { name: product.title },
            unit_amount: product.effective_price_cents,
          },
          quantity: item.quantity,
        };
      });

      // 5. Create Stripe Checkout Session
      let stripe;
      try {
        stripe = getStripe();
      } catch (err) {
        console.error("Stripe not configured:", err.message);
        return jsonError(req, res, 503, "SERVICE_UNAVAILABLE", "Payment service not configured");
      }

      const appBaseUrl = (process.env.APP_BASE_URL || "http://localhost:5173").replace(/\/$/, "");

      // Build session params — add a Stripe coupon if discount applies
      const sessionParams = {
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "payment",
        customer_email: buyer_email,
        metadata: {
          order_id:         order.id,
          store_id:         storeId,
          discount_code_id: discountResult?.discount_code_id ?? "",
          marketing_opt_in: marketing_opt_in ? "1" : "0",
          country:          country || "",
        },
        payment_intent_data: {
          metadata: {
            order_id: order.id,
            store_id: storeId,
          },
        },
        success_url: `${appBaseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&slug=${encodeURIComponent(slug)}`,
        cancel_url: `${appBaseUrl}/store/${encodeURIComponent(slug)}`,
      };

      // Apply discount as a Stripe coupon so the buyer sees the correct charge amount
      if (discountResult && discountResult.discount_amount_cents > 0) {
        const coupon = await stripe.coupons.create({
          amount_off: discountResult.discount_amount_cents,
          currency: store.currency.toLowerCase(),
          duration: "once",
          name: `Discount: ${discountResult.code}`,
        });
        sessionParams.discounts = [{ coupon: coupon.id }];
        // When using discounts, allow_promotion_codes must be absent
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      // 6. Persist checkout session linkage on the order
      await attachCheckoutSession(order.id, session.id);

      return res.status(201).json({
        checkout_url: session.url,
        order_id: order.id,
        discount_amount_cents: discountResult?.discount_amount_cents ?? 0,
      });
    } catch (err) {
      if (err.statusCode === 400) {
        return jsonError(req, res, 400, "BAD_REQUEST", err.message);
      }
      if (err.statusCode === 404) {
        return jsonError(req, res, 404, "NOT_FOUND", err.message);
      }
      return next(err);
    }
  }
);

// POST /api/store/:slug/validate-discount — Public, rate-limited
// Validates a discount code against the store and subtotal without creating an order.
// Used by the cart UI to show the discount amount before checkout.

const validateDiscountBody = z.object({
  code:            z.string().min(1).max(50),
  subtotal_cents:  z.number().int().nonnegative(),
});

router.post(
  "/store/:slug/validate-discount",
  checkoutLimiter,
  validateBody(validateDiscountBody),
  async (req, res, next) => {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const { code, subtotal_cents } = req.validatedBody;

    try {
      const storeId = await resolveEnabledStoreIdBySlug(slug);
      if (!storeId) return jsonError(req, res, 404, "NOT_FOUND", "Store not found");

      const result = await validateDiscountCode(storeId, code, subtotal_cents);
      if (!result.valid) {
        return res.status(400).json({ valid: false, reason: result.reason });
      }
      return res.json({
        valid: true,
        discount_code_id:     result.discount_code_id,
        code:                 result.code,
        discount_type:        result.discount_type,
        discount_value:       result.discount_value,
        discount_amount_cents: result.discount_amount_cents,
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ── Webhook handler (raw body — mounted directly in app.js) ──────────────────

/**
 * POST /api/webhook/stripe
 *
 * IMPORTANT: this function is exported and mounted with express.raw() middleware
 * in app.js BEFORE express.json(), so req.body is a Buffer here.
 *
 * Handles:
 *   - checkout.session.completed → mark order paid
 *
 * Idempotent: repeated delivery of the same event is safe.
 */
async function stripeWebhookHandler(req, res) {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not set");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    // Invalid signature or malformed payload — do not retry
    console.warn("Stripe webhook signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event.data.object);
    }
    // Other event types are acknowledged but not processed
  } catch (err) {
    console.error("Error processing Stripe webhook event:", err);
    return res.status(500).json({ error: "Internal error processing webhook" });
  }

  return res.json({ received: true });
}

async function handleCheckoutCompleted(session) {
  const orderId = session.metadata?.order_id;
  const storeId = session.metadata?.store_id;
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

  if (!orderId || !storeId) {
    // Metadata missing — log but don't retry (returning 200 to Stripe)
    console.warn("checkout.session.completed: missing order_id/store_id metadata", {
      sessionId: session.id,
    });
    return;
  }

  // Attach payment intent (best-effort, idempotent)
  if (paymentIntentId) {
    await attachPaymentIntent(storeId, orderId, paymentIntentId).catch((err) => {
      console.warn("Failed to attach payment intent during webhook", {
        orderId,
        paymentIntentId,
        err: err.message,
      });
    });
  }

  // Mark order paid — idempotent (already-paid returns kind:"OK")
  const result = await markOrderPaid(storeId, orderId);

  if (result.kind === "NOT_FOUND") {
    console.warn("checkout.session.completed: order not found", { orderId, storeId });
    return;
  }

  if (result.kind === "INVALID_STATE") {
    // Already in a terminal state — that's fine
    return;
  }

  console.log("Order marked paid via Stripe webhook", { orderId, storeId });

  // Only run side-effects on the first transition to paid
  if (result.transitioned) {
    // Increment discount usage (fire-and-forget, idempotent)
    const discountCodeId = session.metadata?.discount_code_id;
    if (discountCodeId) {
      incrementDiscountUse(discountCodeId).catch((err) => {
        console.error("incrementDiscountUse error", { discountCodeId, err: err.message });
      });
    }

    // Increment product sales counts (fire-and-forget)
    pool.query(
      `SELECT product_id FROM order_items WHERE order_id = $1`,
      [orderId]
    ).then(({ rows }) => {
      const productIds = rows.map((r) => r.product_id);
      return incrementProductSalesCount(productIds);
    }).catch((err) => {
      console.error("incrementProductSalesCount error", { orderId, err: err.message });
    });

    // Send seller notification email (fire-and-forget)
    sendSellerNotification(orderId, storeId, session).catch((err) => {
      console.error("sendSellerNotification error", { orderId, err: err.message });
    });

    // Record marketing consent on the order (fire-and-forget)
    const marketingOptIn = session.metadata?.marketing_opt_in === "1";
    if (marketingOptIn) {
      pool.query(
        `UPDATE orders SET marketing_opt_in = TRUE WHERE id = $1`,
        [orderId]
      ).catch((err) => {
        console.error("marketing_opt_in update error", { orderId, err: err.message });
      });
    }

    // Upsert buyer into store_customers (fire-and-forget)
    const buyerEmail    = session.customer_details?.email || session.customer_email;
    const orderCountry  = session.metadata?.country || null;
    if (buyerEmail) {
      pool.query(`SELECT total_cents FROM orders WHERE id = $1 LIMIT 1`, [orderId])
        .then(({ rows }) => {
          const totalSpentCents = rows[0]?.total_cents ?? 0;
          return upsertCustomer(storeId, { email: buyerEmail, totalSpentCents, marketingOptIn, country: orderCountry });
        })
        .catch((err) => {
          console.error("upsertCustomer error", { orderId, err: err.message });
        });

      // Sync opt-in to store_subscribers so contact_type updates correctly
      if (marketingOptIn) {
        pool.query(
          `INSERT INTO store_subscribers (store_id, email, unsubscribe_token, is_active)
           VALUES ($1, $2, encode(gen_random_bytes(32), 'hex'), true)
           ON CONFLICT (store_id, email) DO UPDATE SET is_active = true`,
          [storeId, buyerEmail]
        ).catch((err) => {
          console.error("store_subscribers sync error", { orderId, err: err.message });
        });
      }
    }
  }

  // Create sale notification (fire-and-forget)
  if (result.transitioned) {
    const buyerEmail = session.customer_details?.email || session.customer_email || "unknown";
    pool.query(`SELECT total_cents, currency FROM orders WHERE id = $1 LIMIT 1`, [orderId])
      .then(({ rows }) => {
        const totalCents = rows[0]?.total_cents ?? 0;
        const currency   = (rows[0]?.currency || "usd").toUpperCase();
        const formatted  = `${currency} ${(totalCents / 100).toFixed(2)}`;
        return createNotification(storeId, {
          type:     "sale",
          title:    "New sale!",
          body:     `${buyerEmail} purchased for ${formatted}`,
          metadata: { order_id: orderId, buyer_email: buyerEmail, total_cents: totalCents },
        });
      })
      .catch(() => {});
  }

  // Trigger fulfillment (send delivery email). Never throws — errors are logged internally.
  triggerFulfillment(orderId, storeId).catch((err) => {
    console.error("triggerFulfillment error in webhook", { orderId, err: err.message });
  });
}

async function sendSellerNotification(orderId, storeId, session) {
  const [storeRow, itemsRes] = await Promise.all([
    getStoreSettings(storeId),
    pool.query(
      `SELECT oi.quantity, oi.unit_price_cents, p.title
       FROM order_items oi JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1`,
      [orderId]
    ),
  ]);

  if (!storeRow) return;

  const ownerAccount = await getOwnerAccount(storeId).catch(() => null);
  const toEmail = ownerAccount?.email;
  if (!toEmail) return;

  const storeName = storeRow.name || "Your Store";
  const buyerEmail = session.customer_details?.email || session.customer_email || "unknown";
  const items = itemsRes.rows;
  const totalFormatted = items
    .reduce((sum, i) => sum + i.unit_price_cents * i.quantity, 0);
  const currency = (storeRow.currency || "usd").toUpperCase();

  const itemLines = items
    .map((i) => `  • ${i.title} × ${i.quantity} — ${currency} ${((i.unit_price_cents * i.quantity) / 100).toFixed(2)}`)
    .join("\n");

  const text = `New sale on ${storeName}!\n\nOrder: ${orderId}\nBuyer: ${buyerEmail}\n\n${itemLines}\n\nTotal: ${currency} ${(totalFormatted / 100).toFixed(2)}\n\nLog in to your dashboard to view details.`;

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:${storeRow.primary_color || "#0d6efd"}">New sale on ${storeName}!</h2>
      <p><strong>Order ID:</strong> ${orderId}</p>
      <p><strong>Buyer:</strong> ${buyerEmail}</p>
      <table style="width:100%;border-collapse:collapse;margin:1rem 0">
        ${items.map((i) => `
        <tr>
          <td style="padding:4px 0">${i.title} × ${i.quantity}</td>
          <td style="padding:4px 0;text-align:right">${currency} ${((i.unit_price_cents * i.quantity) / 100).toFixed(2)}</td>
        </tr>`).join("")}
        <tr style="border-top:2px solid #e5e7eb">
          <td style="padding:8px 0;font-weight:600">Total</td>
          <td style="padding:8px 0;text-align:right;font-weight:600">${currency} ${(totalFormatted / 100).toFixed(2)}</td>
        </tr>
      </table>
      <p style="color:#6b7280;font-size:0.875rem">Log in to your dashboard to view and manage this order.</p>
    </div>
  `.trim();

  await sendEmail({
    to: toEmail,
    subject: `New sale: ${currency} ${(totalFormatted / 100).toFixed(2)} on ${storeName}`,
    text,
    html,
  });
}

module.exports = { stripeRouter: router, stripeWebhookHandler };
