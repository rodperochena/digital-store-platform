"use strict";

// Lib: fulfillment
// Orchestrates the post-payment delivery flow: generates a one-time download token, builds
// and sends the fulfillment email, then records the result in order_fulfillments.
// Important constraint: errors here must NEVER propagate back to the Stripe webhook — the webhook
// must return 200 even if fulfillment fails, or Stripe will retry and we'll double-charge nothing
// but potentially send duplicate emails. Callers use .catch() on both exported functions.
//
// triggerFulfillment — idempotent: ON CONFLICT (order_id) DO NOTHING prevents double-sends.
// resendFulfillment  — owner-initiated re-send; issues a fresh token (old link becomes invalid).

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
const { createNotification } = require("../db/queries/notifications.queries");
const { createReviewToken } = require("../db/queries/reviews.queries");

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

function buildDeliveryEmailHtml({ storeName, accentColor, logoUrl, items, deliveryUrl, ttlHours, order, reviewLinks }) {
  const accent = accentColor || "#0d6efd";

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${storeName}" style="height:36px;object-fit:contain;display:block;margin-bottom:12px" />`
    : "";

  const currency = (order?.currency || "usd").toUpperCase();
  const totalCents = order?.total_cents ?? items.reduce((s, i) => s + (i.unit_price_cents ?? 0) * (i.quantity ?? 1), 0);

  const itemRows = items.map((item) => {
    const qty = item.quantity ?? 1;
    const unitCents = item.unit_price_cents ?? null;
    const lineCents = unitCents != null ? unitCents * qty : null;
    const priceCell = lineCents != null
      ? `<td style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#374151;text-align:right;white-space:nowrap">${currency} ${(lineCents / 100).toFixed(2)}</td>`
      : "";
    return `
    <tr>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#374151">
        ${item.title}${qty > 1 ? ` × ${qty}` : ""}
      </td>
      ${priceCell}
    </tr>`;
  }).join("");

  const totalRow = totalCents > 0 ? `
    <tr>
      <td style="padding:8px 0 0;font-size:14px;font-weight:700;color:#111827">Total</td>
      <td style="padding:8px 0 0;font-size:14px;font-weight:700;color:#111827;text-align:right;white-space:nowrap">${currency} ${(totalCents / 100).toFixed(2)}</td>
    </tr>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
        <!-- Header bar -->
        <tr><td style="background:${accent};height:4px"></td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 32px 24px">
          ${logoHtml}
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827">${storeName}</h1>
          <h2 style="margin:0 0 20px;font-size:16px;font-weight:600;color:#374151">Your download is ready</h2>
          <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6">
            Thank you for your purchase! Your files are ready to download.
          </p>
          <!-- Order summary -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border-top:1px solid #f0f0f0">
            ${itemRows}
            ${totalRow}
          </table>
          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td style="border-radius:6px;background:${accent}">
              <a href="${deliveryUrl}" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:6px">
                Download your files
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5">
            This link expires in ${ttlHours} hours and is single-use.<br />
            If the button doesn't work, copy and paste this URL:<br />
            <a href="${deliveryUrl}" style="color:${accent};word-break:break-all">${deliveryUrl}</a>
          </p>
          ${reviewLinks && reviewLinks.length > 0 ? `
          <div style="margin-top:24px;padding-top:16px;border-top:1px solid #f0f0f0">
            <p style="margin:0 0 8px;font-size:13px;color:#374151;font-weight:600">Enjoyed your purchase?</p>
            ${reviewLinks.map(({ title, url }) => `
            <p style="margin:0 0 6px;font-size:12px;color:#6b7280">
              Leave a review for <strong>${title}</strong>:
              <a href="${url}" style="color:${accent}">${url}</a>
            </p>`).join("")}
          </div>` : ""}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;background:#fafafa">
          <p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${storeName} via digital store platform</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendFulfillmentEmail({ order, items, storeName, accentColor, logoUrl, deliveryUrl, ttlHours, reviewLinks }) {
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
      ...(reviewLinks && reviewLinks.length > 0 ? [
        "",
        "Enjoyed your purchase? Leave a review:",
        ...reviewLinks.map(({ title, url }) => `  ${title}: ${url}`),
      ] : []),
    ].join("\n"),
    html: buildDeliveryEmailHtml({ storeName, accentColor, logoUrl, items, deliveryUrl, ttlHours, order, reviewLinks }),
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
  const accentColor = store?.primary_color || "#0d6efd";
  const logoUrl = store?.logo_url || null;
  const deliveryUrl = buildDeliveryUrl(deliveryToken);

  // Generate review tokens for each item (fire-and-forget if DB unavailable)
  const frontendBase = (process.env.APP_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
  const reviewLinks = [];
  for (const item of items) {
    try {
      const token = await createReviewToken(storeId, item.product_id, orderId, order.buyer_email);
      reviewLinks.push({ title: item.title, url: `${frontendBase}/review/${token}` });
    } catch {
      // Never block fulfillment if review token creation fails
    }
  }

  try {
    await sendFulfillmentEmail({ order, items, storeName, accentColor, logoUrl, deliveryUrl, ttlHours, reviewLinks });
    await markFulfillmentSent(row.id);
    console.log("Fulfillment email sent", { orderId, to: order.buyer_email });
    createNotification(storeId, {
      type:     "delivery_sent",
      title:    "Delivery email sent",
      body:     `Product delivered to ${order.buyer_email}`,
      metadata: { order_id: orderId, email: order.buyer_email },
    }).catch(() => {});
  } catch (err) {
    await markFulfillmentFailed(row.id, err.message).catch(() => {});
    console.error("Fulfillment email failed", { orderId, err: err.message });
    createNotification(storeId, {
      type:     "delivery_failed",
      title:    "Delivery failed",
      body:     `Failed to deliver to ${order.buyer_email}: ${err.message}`,
      metadata: { order_id: orderId, email: order.buyer_email, error: err.message },
    }).catch(() => {});
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
  const accentColor = store?.primary_color || "#0d6efd";
  const logoUrl = store?.logo_url || null;
  const deliveryUrl = buildDeliveryUrl(deliveryToken);

  try {
    await sendFulfillmentEmail({ order, items, storeName, accentColor, logoUrl, deliveryUrl, ttlHours });
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
