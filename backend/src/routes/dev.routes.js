"use strict";

/**
 * DEV-ONLY routes.
 * Never mounted in production (NODE_ENV === 'production').
 * Each handler is also individually guarded by devOnly middleware.
 */

const crypto = require("crypto");
const express = require("express");

const { createStore, enableStore } = require("../db/queries/stores.queries");
const { createOwnerAccount } = require("../db/queries/owner.queries");
const { markOrderPaid } = require("../db/queries/orders.queries");
const { requireOwnerSession } = require("../middleware/ownerAuth.middleware");
const { requireUuidParam } = require("../middleware/validate.middleware");
const { generateToken } = require("../lib/ownerAuth");
const { RESERVED_TENANT_SLUGS, SLUG_REGEX } = require("../config/tenancy.constants");

const router = express.Router();

const BOOTSTRAP_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateSlug() {
  return `store-${crypto.randomBytes(3).toString("hex")}`;
}

// ── Middleware ────────────────────────────────────────────────────────────────

function devOnly(req, res, next) {
  if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
    return res.status(404).json({
      error: true,
      code: "NOT_FOUND",
      message: "Not found",
      path: req.originalUrl,
    });
  }
  return next();
}

// ── POST /api/dev/provision-store ─────────────────────────────────────────────

/**
 * Simulates a customer purchase.
 * Creates a store + owner_account and returns a one-time bootstrap token.
 *
 * IMPORTANT:
 * - Does NOT return the platform ADMIN_KEY.
 * - Returns a short-lived bootstrap token for the claim-access flow only.
 * - The bootstrap token is NOT a session token or persistent credential.
 */
router.post("/provision-store", devOnly, async (req, res, next) => {
  // Accept optional store name from sign-up form
  const rawName = req.body?.store_name;
  const storeName =
    typeof rawName === "string" && rawName.trim().length >= 2
      ? rawName.trim().slice(0, 100)
      : "My Store";

  // Attempt slug generation with retry on uniqueness collision
  const MAX_RETRIES = 5;
  let store = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const slug = generateSlug();

    if (RESERVED_TENANT_SLUGS.has(slug) || !SLUG_REGEX.test(slug)) {
      continue;
    }

    try {
      store = await createStore({ slug, name: storeName, currency: "usd" });
      break;
    } catch (err) {
      if (err && err.code === "23505") {
        // Unique constraint on slug — try a different one
        continue;
      }
      return next(err);
    }
  }

  if (!store) {
    return res.status(500).json({
      error: true,
      code: "INTERNAL",
      message: "Could not generate a unique store slug after multiple attempts",
      path: req.originalUrl,
    });
  }

  // Enable the store immediately
  try {
    await enableStore(store.id);
  } catch (err) {
    return next(err);
  }

  // Generate bootstrap token (one-time claim, short-lived)
  const { raw: bootstrapToken, hash: bootstrapTokenHash } = generateToken();
  const bootstrapExpiresAt = new Date(Date.now() + BOOTSTRAP_TTL_MS);

  // Create owner_account with the bootstrap token
  try {
    await createOwnerAccount(store.id, {
      bootstrapTokenHash,
      bootstrapTokenExpiresAt: bootstrapExpiresAt,
    });
  } catch (err) {
    return next(err);
  }

  console.log("DEV_STORE_PROVISIONED", {
    store_id: store.id,
    slug: store.slug,
    request_id: req.id || null,
  });

  return res.status(201).json({
    store_id:                   store.id,
    slug:                       store.slug,
    setup_path:                 "/owner/claim-access",
    bootstrap_token:            bootstrapToken,    // dev-only; frontend stores temporarily
    bootstrap_expires_in_seconds: Math.floor(BOOTSTRAP_TTL_MS / 1000),
  });
});

// ── POST /api/dev/orders/:orderId/mark-paid ───────────────────────────────────

/**
 * Dev-only owner-safe endpoint to simulate payment completion.
 *
 * Requirements:
 * - Requires a valid owner session (Authorization: Bearer <token>)
 * - Verifies the order belongs to the owner's store
 * - Never used in production
 * - Reuses existing markOrderPaid query logic
 */
router.post(
  "/orders/:orderId/mark-paid",
  devOnly,
  requireOwnerSession,
  requireUuidParam("orderId"),
  async (req, res, next) => {
    try {
      const { orderId } = req.params;
      const storeId = req.ownerStoreId; // always from session, never from client

      const result = await markOrderPaid(storeId, orderId);

      if (result.kind === "NOT_FOUND") {
        return res.status(404).json({
          error: true,
          code: "NOT_FOUND",
          message: "Order not found",
          path: req.originalUrl,
          request_id: req.id || null,
        });
      }

      if (result.kind === "INVALID_STATE") {
        return res.status(409).json({
          error: true,
          code: "CONFLICT",
          message: `Cannot mark paid from status '${result.status}'`,
          path: req.originalUrl,
          request_id: req.id || null,
        });
      }

      return res.json({ order: result.order });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = { devRouter: router };
