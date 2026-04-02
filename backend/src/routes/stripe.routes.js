"use strict";

/**
 * Stripe integration:
 *   POST /api/store/:slug/checkout/session  — create Stripe Checkout Session (public)
 *   POST /api/webhook/stripe                — Stripe webhook (raw body, mounted in app.js)
 */

const express = require("express");
const { z } = require("zod");
const { pool } = require("../db/pool");

const {
  createOrder,
  attachPaymentIntent,
  attachCheckoutSession,
  markOrderPaid,
  resolveEnabledStoreIdBySlug,
} = require("../db/queries/orders.queries");

const { getEnabledStoreMetaBySlug } = require("../db/queries/storefront.queries");
const { validateBody } = require("../middleware/validate.middleware");
const { checkoutLimiter } = require("../middleware/rateLimit.middleware");
const { getStripe } = require("../lib/stripe");
const { triggerFulfillment } = require("../lib/fulfillment");

const router = express.Router();

// ── Validation schema ─────────────────────────────────────────────────────────

const createCheckoutSessionSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1, "items must have at least 1 item"),
  buyer_email: z.string().email(),
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
    const { items, buyer_email } = req.validatedBody;

    try {
      // 1. Resolve store (null = not found or disabled)
      const storeId = await resolveEnabledStoreIdBySlug(slug);
      if (!storeId) return jsonError(req, res, 404, "NOT_FOUND", "Store not found");

      const store = await getEnabledStoreMetaBySlug(slug);
      if (!store) return jsonError(req, res, 404, "NOT_FOUND", "Store not found");

      // 2. Create pending local order (validates products exist and belong to store)
      const order = await createOrder(storeId, { items, buyer_email });
      if (!order) return jsonError(req, res, 404, "NOT_FOUND", "Store not found");

      // 3. Fetch product titles for Stripe line items
      const productIds = items.map((i) => i.product_id);
      const productsRes = await pool.query(
        `SELECT id, title, price_cents
         FROM products
         WHERE store_id = $1 AND id = ANY($2::uuid[])`,
        [storeId, productIds]
      );
      const productsMap = new Map(productsRes.rows.map((p) => [p.id, p]));

      const lineItems = items.map((item) => {
        const product = productsMap.get(item.product_id);
        return {
          price_data: {
            currency: store.currency.toLowerCase(),
            product_data: { name: product.title },
            unit_amount: product.price_cents,
          },
          quantity: item.quantity,
        };
      });

      // 4. Create Stripe Checkout Session
      let stripe;
      try {
        stripe = getStripe();
      } catch (err) {
        console.error("Stripe not configured:", err.message);
        return jsonError(req, res, 503, "SERVICE_UNAVAILABLE", "Payment service not configured");
      }

      const appBaseUrl = (process.env.APP_BASE_URL || "http://localhost:5173").replace(/\/$/, "");

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "payment",
        customer_email: buyer_email,
        metadata: {
          order_id: order.id,
          store_id: storeId,
        },
        payment_intent_data: {
          metadata: {
            order_id: order.id,
            store_id: storeId,
          },
        },
        success_url: `${appBaseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&slug=${encodeURIComponent(slug)}`,
        cancel_url: `${appBaseUrl}/store/${encodeURIComponent(slug)}`,
      });

      // 5. Persist checkout session linkage on the order
      await attachCheckoutSession(order.id, session.id);

      return res.status(201).json({
        checkout_url: session.url,
        order_id: order.id,
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

  // Trigger fulfillment (send delivery email). Never throws — errors are logged internally.
  triggerFulfillment(orderId, storeId).catch((err) => {
    console.error("triggerFulfillment error in webhook", { orderId, err: err.message });
  });
}

module.exports = { stripeRouter: router, stripeWebhookHandler };
