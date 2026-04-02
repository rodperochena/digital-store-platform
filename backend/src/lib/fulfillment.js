"use strict";

/**
 * Fulfillment orchestrator.
 *
 * triggerFulfillment(orderId, storeId)
 *   Called server-side after a verified payment (webhook or dev mark-paid).
 *   Creates a time-limited delivery token, sends an email, records status.
 *   Idempotent: repeated calls for the same order are no-ops.
 *
 * resendFulfillment(orderId, storeId)
 *   Called from owner resend endpoint. Issues a fresh token and re-sends the email.
 */

const { generateToken } = require("./ownerAuth");
const { sendEmail } = require("./mailer");
const { getOrderWithItems } = require("../db/queries/orders.queries");
const { getStoreSettings } = require("../db/queries/stores.queries");
const {
  createOrSkipFulfillment,
  getFulfillmentByOrderId,
  markFulfillmentSent,
  markFulfillmentFailed,
  updateFulfillmentForResend,
} = require("../db/queries/fulfillment.queries");

const DEFAULT_TTL_HOURS = 72;

function getTtlHours() {
  return Math.max(1, parseInt(process.env.DELIVERY_TOKEN_TTL_HOURS || DEFAULT_TTL_HOURS, 10));
}

function makeExpiresAt(ttlHours) {
  return new Date(Date.now() + ttlHours * 60 * 60 * 1000);
}

function buildDeliveryUrl(token) {
  const base = (process.env.BACKEND_URL || "http://localhost:5051").replace(/\/$/, "");
  return `${base}/api/deliver/${token}`;
}

async function sendFulfillmentEmail({ order, items, storeName, deliveryUrl, ttlHours }) {
  const productTitles = items.map((i) => i.title).join(", ");

  await sendEmail({
    to: order.buyer_email,
    subject: `Your download from ${storeName} is ready`,
    text: [
      `Thank you for your purchase from ${storeName}!`,
      "",
      `You purchased: ${productTitles}`,
      "",
      `Click the link below to access your download (expires in ${ttlHours} hours):`,
      deliveryUrl,
      "",
      "This link is single-use and expires automatically.",
    ].join("\n"),
    html: [
      `<p>Thank you for your purchase from <strong>${storeName}</strong>!</p>`,
      `<p>You purchased: ${productTitles}</p>`,
      `<p><a href="${deliveryUrl}">Download your files</a>`,
      ` (link expires in ${ttlHours} hours)</p>`,
      `<p><em>This link is single-use and expires automatically.</em></p>`,
    ].join(""),
  });
}

/**
 * Trigger fulfillment for a newly paid order.
 * No-op if fulfillment already exists for this order.
 */
async function triggerFulfillment(orderId, storeId) {
  const ttlHours = getTtlHours();
  const expiresAt = makeExpiresAt(ttlHours);

  const result = await getOrderWithItems(storeId, orderId);
  if (!result) {
    console.warn("triggerFulfillment: order not found", { orderId, storeId });
    return;
  }

  const { order, items } = result;

  if (order.status !== "paid") {
    console.warn("triggerFulfillment: order is not paid", { orderId, status: order.status });
    return;
  }

  if (!order.buyer_email) {
    console.warn("triggerFulfillment: no buyer_email, skipping delivery email", { orderId });
    return;
  }

  const { raw: deliveryToken, hash: tokenHash } = generateToken();

  const { created, row } = await createOrSkipFulfillment(
    orderId,
    storeId,
    tokenHash,
    expiresAt,
    order.buyer_email
  );

  if (!created) {
    // Already fulfilled — idempotent, no-op
    console.log("triggerFulfillment: fulfillment already exists, skipping", { orderId });
    return;
  }

  const store = await getStoreSettings(storeId);
  const storeName = store?.name || "Your Store";
  const deliveryUrl = buildDeliveryUrl(deliveryToken);

  try {
    await sendFulfillmentEmail({ order, items, storeName, deliveryUrl, ttlHours });
    await markFulfillmentSent(row.id);
    console.log("Fulfillment email sent", { orderId, to: order.buyer_email });
  } catch (err) {
    await markFulfillmentFailed(row.id, err.message).catch(() => {});
    console.error("Fulfillment email failed", { orderId, err: err.message });
    // Don't rethrow — caller (webhook) must still return 200
  }
}

/**
 * Re-issue a delivery token and re-send the fulfillment email.
 * Used by the owner resend endpoint.
 * Returns { ok: true } or throws.
 */
async function resendFulfillment(orderId, storeId) {
  const result = await getOrderWithItems(storeId, orderId);
  if (!result) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  const { order, items } = result;

  if (order.status !== "paid") {
    const err = new Error("Cannot resend delivery: order is not paid");
    err.statusCode = 400;
    throw err;
  }

  if (!order.buyer_email) {
    const err = new Error("Cannot resend delivery: order has no buyer email");
    err.statusCode = 400;
    throw err;
  }

  const existing = await getFulfillmentByOrderId(orderId);
  if (!existing) {
    const err = new Error("No fulfillment record found for this order");
    err.statusCode = 404;
    throw err;
  }

  const ttlHours = getTtlHours();
  const expiresAt = makeExpiresAt(ttlHours);
  const { raw: deliveryToken, hash: tokenHash } = generateToken();

  await updateFulfillmentForResend(existing.id, tokenHash, expiresAt);

  const store = await getStoreSettings(storeId);
  const storeName = store?.name || "Your Store";
  const deliveryUrl = buildDeliveryUrl(deliveryToken);

  try {
    await sendFulfillmentEmail({ order, items, storeName, deliveryUrl, ttlHours });
    await markFulfillmentSent(existing.id);
    console.log("Fulfillment re-sent", { orderId, to: order.buyer_email });
  } catch (err) {
    await markFulfillmentFailed(existing.id, err.message).catch(() => {});
    console.error("Fulfillment resend email failed", { orderId, err: err.message });
    const mailErr = new Error(`Failed to send delivery email: ${err.message}`);
    mailErr.statusCode = 502;
    throw mailErr;
  }

  return { ok: true };
}

module.exports = { triggerFulfillment, resendFulfillment };
