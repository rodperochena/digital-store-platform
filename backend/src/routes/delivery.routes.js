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

const router = express.Router();

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

    const deliverable = result.items.filter((i) => i.delivery_url);
    if (!deliverable.length) {
      return res.status(404).json({ error: true, code: "NOT_FOUND", message: "No downloadable files found" });
    }

    // MVP: redirect to the first item's delivery_url.
    // Multi-item orders: buyer gets the first file; future improvement can show a list page.
    return res.redirect(302, deliverable[0].delivery_url);
  } catch (err) {
    return next(err);
  }
});

module.exports = { deliveryRouter: router };
