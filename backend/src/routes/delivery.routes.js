"use strict";

/**
 * Public delivery endpoint.
 * GET /api/deliver/:token
 *
 * - Accepts a short-lived opaque delivery token (from fulfillment email)
 * - Hashes it to look up the fulfillment record
 * - Validates expiry
 * - Marks the fulfillment as opened
 * - Redirects (302) to the first deliverable item's delivery_url
 *
 * Raw delivery_url values are NEVER returned in public API responses.
 * They are only ever reached via this redirect, from a time-limited URL.
 */

const express = require("express");
const { hashToken } = require("../lib/ownerAuth");
const { getFulfillmentByTokenHash, markFulfillmentOpened } = require("../db/queries/fulfillment.queries");
const { getOrderWithItems } = require("../db/queries/orders.queries");

// Optional: Supabase Storage (only available when configured)
let getSignedDeliverableUrl = null;
try {
  ({ getSignedDeliverableUrl } = require("../lib/storage"));
} catch { /* storage not configured */ }

const router = express.Router();

// GET /api/deliver/:token — Public
// Validates the delivery token, marks the fulfillment as opened, and 302-redirects to the download URL.
// If the product uses uploaded storage (delivery_file_key), a signed URL is generated on the fly.
// Delivery URLs are never returned in JSON — they only flow through this redirect.
router.get("/deliver/:token", async (req, res, next) => {
  const token = String(req.params.token || "").trim();

  if (!token) {
    return res.status(400).json({ error: true, code: "BAD_REQUEST", message: "Invalid delivery link" });
  }

  try {
    const tokenHash = hashToken(token);
    const fulfillment = await getFulfillmentByTokenHash(tokenHash);

    if (!fulfillment) {
      return res.status(404).json({ error: true, code: "NOT_FOUND", message: "Invalid or expired delivery link" });
    }

    if (new Date() > new Date(fulfillment.delivery_expires_at)) {
      return res.status(410).json({ error: true, code: "GONE", message: "This download link has expired" });
    }

    // Mark as opened (best-effort, never fails the response)
    markFulfillmentOpened(fulfillment.id).catch((err) => {
      console.warn("markFulfillmentOpened failed", { id: fulfillment.id, err: err.message });
    });

    const result = await getOrderWithItems(fulfillment.store_id, fulfillment.order_id);
    if (!result) {
      return res.status(404).json({ error: true, code: "NOT_FOUND", message: "Order not found" });
    }

    const deliverable = result.items.filter((i) => i.delivery_url || i.delivery_file_key);
    if (!deliverable.length) {
      return res.status(404).json({ error: true, code: "NOT_FOUND", message: "No downloadable files found" });
    }

    // Resolve the actual download URL for the first item.
    // If the product uses an uploaded file (delivery_file_key), generate a signed URL.
    // Otherwise use the external delivery_url directly.
    const item = deliverable[0];
    let redirectUrl;
    if (item.delivery_file_key && getSignedDeliverableUrl) {
      redirectUrl = await getSignedDeliverableUrl(item.delivery_file_key, 3600);
    } else {
      redirectUrl = item.delivery_url;
    }
    return res.redirect(302, redirectUrl);
  } catch (err) {
    return next(err);
  }
});

module.exports = { deliveryRouter: router };
