"use strict";

const crypto = require("crypto");

/**
 * Owner auth + owner-scoped data endpoints.
 * All routes here are mounted at /api/owner by routes/index.js.
 *
 * Public (no auth):
 *   POST /api/owner/claim-access  — first-time claim with bootstrap token + password
 *   POST /api/owner/login         — subsequent logins
 *
 * Owner session required (Authorization: Bearer <token>):
 *   POST /api/owner/logout
 *   GET  /api/owner/session       — session validation + store/owner info
 *   GET  /api/owner/store         — get current store settings
 *   PATCH /api/owner/store        — update current store settings
 *   GET  /api/owner/products      — list products
 *   POST /api/owner/products      — create product
 *   GET  /api/owner/orders        — list orders
 *   GET  /api/owner/orders/:id    — get order with items
 *
 * IMPORTANT: the platform ADMIN_KEY (x-admin-key) is never used here.
 * Internal admin routes remain unchanged in their own routers.
 */

const express = require("express");
const { z } = require("zod");

const { requireOwnerSession } = require("../middleware/ownerAuth.middleware");
const { requireUuidParam, validateBody } = require("../middleware/validate.middleware");

const {
  getOwnerAccountByStoreId,
  getOwnerAccount,
  getOwnerAccountByEmail,
  checkEmailExists,
  claimOwnerAccount,
  createOwnerSession,
  revokeOwnerSession,
  updateOwnerAccount,
} = require("../db/queries/owner.queries");

const {
  getStoreBySlug,
  getStoreSettings,
  updateStoreSettings,
  checkSlugAvailable,
} = require("../db/queries/stores.queries");

const { createProduct, listProductsByStore, updateProduct, deleteProduct } = require("../db/queries/products.queries");
const { getOwnerStats } = require("../db/queries/stats.queries");
const { listOrdersByStore, getOrderWithItems } = require("../db/queries/orders.queries");
const { getFulfillmentByOrderId } = require("../db/queries/fulfillment.queries");
const { resendFulfillment } = require("../lib/fulfillment");

const { generateToken, hashToken, hashPassword, verifyPassword } = require("../lib/ownerAuth");

const router = express.Router();

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

/** Strip internal fields before returning store to owners. */
function safeStore(row) {
  if (!row) return null;
  return {
    id:            row.id,
    slug:          row.slug,
    name:          row.name,
    currency:      row.currency,
    primary_color: row.primary_color,
    logo_url:      row.logo_url,
    is_enabled:    row.is_enabled,
    created_at:    row.created_at,
    updated_at:    row.updated_at,
  };
}

// ── Validation schemas ────────────────────────────────────────────────────────

const claimAccessSchema = z.object({
  store_id:        z.string().uuid(),
  bootstrap_token: z.string().min(1),
  password:        z.string().min(8).max(128),
});

const loginSchema = z.object({
  // `identifier` may be an email address or a store slug (backward compat)
  identifier: z.string().min(1).max(255),
  password:   z.string().min(1),
});

const updateOwnerStoreSchema = z.object({
  name:          z.string().min(2).max(100).optional(),
  currency:      z.string().min(3).max(10).optional(),
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "primary_color must be a hex color like #RRGGBB")
    .optional(),
  logo_url: z.string().url().optional(),
  slug: z
    .string()
    .min(3, "Store username must be at least 3 characters")
    .max(40, "Store username must be 40 characters or fewer")
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
      "Store username must be lowercase letters, numbers, and hyphens with no leading/trailing hyphens"
    )
    .optional(),
});

const createOwnerProductSchema = z.object({
  title:        z.string().min(1).max(120),
  description:  z.string().max(5000).optional(),
  price_cents:  z.number().int().positive(),
  delivery_url: z.string().url().optional(),
  image_url:    z.string().url().optional(),
  is_active:    z.boolean().optional(),
});

const updateOwnerProductSchema = z.object({
  title:        z.string().min(1).max(120).optional(),
  description:  z.string().max(5000).optional(),
  price:        z.number().positive().optional(), // dollars — converted to cents in handler
  delivery_url: z.string().url().optional(),
  image_url:    z.string().url().nullable().optional(),
  is_active:    z.boolean().optional(),
});

// ── POST /api/owner/claim-access ──────────────────────────────────────────────

router.post(
  "/claim-access",
  validateBody(claimAccessSchema),
  async (req, res, next) => {
    const { store_id, bootstrap_token, password } = req.validatedBody;

    try {
      // 1. Load owner account
      const account = await getOwnerAccountByStoreId(store_id);
      if (!account) {
        return jsonError(req, res, 401, "UNAUTHORIZED", "Invalid claim token");
      }

      // 2. Reject if already claimed
      if (account.is_claimed) {
        return jsonError(req, res, 409, "ALREADY_CLAIMED", "Store access has already been claimed. Use /login instead.");
      }

      // 3. Check bootstrap token exists and is not expired
      if (!account.bootstrap_token_hash || !account.bootstrap_token_expires_at) {
        return jsonError(req, res, 401, "UNAUTHORIZED", "Invalid claim token");
      }

      if (new Date(account.bootstrap_token_expires_at) <= new Date()) {
        return jsonError(req, res, 401, "UNAUTHORIZED", "Claim token has expired");
      }

      // 4. Constant-time compare bootstrap token hash
      const providedHash = hashToken(bootstrap_token);
      const expectedHash = account.bootstrap_token_hash;
      const providedBuf  = Buffer.from(providedHash, "hex");
      const expectedBuf  = Buffer.from(expectedHash, "hex");
      const tokenValid   = providedBuf.length === expectedBuf.length &&
                           crypto.timingSafeEqual(providedBuf, expectedBuf);

      if (!tokenValid) {
        return jsonError(req, res, 401, "UNAUTHORIZED", "Invalid claim token");
      }

      // 5. Hash password and mark account as claimed
      const passwordHash = await hashPassword(password);
      await claimOwnerAccount(account.id, passwordHash);

      // 6. Create a session
      const { raw: sessionToken, hash: tokenHash } = generateToken();
      await createOwnerSession(account.id, store_id, tokenHash);

      // 7. Return session token + store
      const store = await getStoreSettings(store_id);
      return res.status(201).json({
        session_token: sessionToken,
        store: safeStore(store),
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/owner/login ─────────────────────────────────────────────────────

router.post(
  "/login",
  validateBody(loginSchema),
  async (req, res, next) => {
    const { identifier, password } = req.validatedBody;

    try {
      // 1. Resolve owner account — email lookup if "@" present, slug lookup otherwise
      let account = null;
      let resolvedStoreId = null;

      if (identifier.includes("@")) {
        // Email-based login
        account = await getOwnerAccountByEmail(identifier);
        if (account) resolvedStoreId = account.store_id;
      } else {
        // Slug-based login (backward compat)
        const storeRow = await getStoreBySlug(identifier);
        if (storeRow) {
          resolvedStoreId = storeRow.id;
          account = await getOwnerAccountByStoreId(resolvedStoreId);
        }
      }

      if (!account) {
        return jsonError(req, res, 401, "UNAUTHORIZED", "Invalid credentials");
      }

      // 2. Must be claimed
      if (!account.is_claimed || !account.password_hash) {
        return jsonError(req, res, 401, "UNAUTHORIZED", "Store access not yet claimed");
      }

      // 3. Verify password
      const valid = await verifyPassword(password, account.password_hash);
      if (!valid) {
        return jsonError(req, res, 401, "UNAUTHORIZED", "Invalid credentials");
      }

      // 4. Create session
      const { raw: sessionToken, hash: tokenHash } = generateToken();
      await createOwnerSession(account.id, resolvedStoreId, tokenHash);

      // 5. Return
      const store = await getStoreSettings(resolvedStoreId);
      return res.json({
        session_token: sessionToken,
        store: safeStore(store),
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/owner/logout ────────────────────────────────────────────────────

router.post("/logout", requireOwnerSession, async (req, res, next) => {
  try {
    await revokeOwnerSession(req.ownerTokenHash);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/owner/session ────────────────────────────────────────────────────

router.get("/session", requireOwnerSession, async (req, res, next) => {
  try {
    const store = await getStoreSettings(req.ownerStoreId);
    if (!store) {
      return jsonError(req, res, 401, "UNAUTHORIZED", "Session invalid: store not found");
    }
    return res.json({
      valid: true,
      store: safeStore(store),
      owner: {
        store_id:   req.ownerStoreId,
        is_claimed: true,
      },
    });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/owner/store ──────────────────────────────────────────────────────

router.get("/store", requireOwnerSession, async (req, res, next) => {
  try {
    const store = await getStoreSettings(req.ownerStoreId);
    if (!store) {
      return jsonError(req, res, 404, "NOT_FOUND", "Store not found");
    }
    return res.json({ store: safeStore(store) });
  } catch (err) {
    return next(err);
  }
});

// ── PATCH /api/owner/store ────────────────────────────────────────────────────

router.patch(
  "/store",
  requireOwnerSession,
  validateBody(updateOwnerStoreSchema),
  async (req, res, next) => {
    try {
      const updated = await updateStoreSettings(req.ownerStoreId, req.validatedBody);
      if (!updated) {
        return jsonError(req, res, 404, "NOT_FOUND", "Store not found");
      }
      return res.json({ store: safeStore(updated) });
    } catch (err) {
      // Currency-change-after-products error from updateStoreSettings
      if (err.statusCode === 409) {
        return res.status(409).json({
          error: true,
          code: "CONFLICT",
          message: err.message,
          path: req.originalUrl,
          request_id: req.id || null,
        });
      }
      return next(err);
    }
  }
);

// ── PATCH /api/owner/account ──────────────────────────────────────────────────

const updateOwnerAccountSchema = z.object({
  email:      z.string().email().optional(),
  first_name: z.string().min(1).max(100).optional(),
  last_name:  z.string().min(1).max(100).optional(),
}).refine((d) => d.email || d.first_name || d.last_name, {
  message: "At least one field (email, first_name, last_name) is required",
});

router.patch(
  "/account",
  requireOwnerSession,
  validateBody(updateOwnerAccountSchema),
  async (req, res, next) => {
    try {
      await updateOwnerAccount(req.ownerStoreId, req.validatedBody);
      return res.json({ ok: true });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({
          error: true,
          code: "CONFLICT",
          message: "An account with this email already exists",
          path: req.originalUrl,
          request_id: req.id || null,
        });
      }
      return next(err);
    }
  }
);

// ── GET /api/owner/check-email/:email ────────────────────────────────────────
// Public — no auth required. Used during sign-up to detect duplicate emails.

router.get("/check-email/:email", async (req, res, next) => {
  const email = String(req.params.email || "").trim();
  if (!email || !email.includes("@")) {
    return res.json({ exists: false });
  }
  try {
    const exists = await checkEmailExists(email);
    return res.json({ exists });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/owner/check-slug/:slug ───────────────────────────────────────────
// Public — no auth required. Used during onboarding to check username availability.

const SLUG_FORMAT_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

router.get("/check-slug/:slug", async (req, res, next) => {
  const slug = String(req.params.slug || "").toLowerCase();

  if (slug.length < 3 || slug.length > 40 || !SLUG_FORMAT_RE.test(slug)) {
    return res.json({ available: false, reason: "invalid_format" });
  }

  try {
    const available = await checkSlugAvailable(slug);
    return res.json({ available });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/owner/stats ──────────────────────────────────────────────────────

router.get("/stats", requireOwnerSession, async (req, res, next) => {
  try {
    const stats = await getOwnerStats(req.ownerStoreId);
    return res.json({ stats });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/owner/products ───────────────────────────────────────────────────

router.get("/products", requireOwnerSession, async (req, res, next) => {
  try {
    const products = await listProductsByStore(req.ownerStoreId);
    return res.json({ products });
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/owner/products ──────────────────────────────────────────────────

router.post(
  "/products",
  requireOwnerSession,
  validateBody(createOwnerProductSchema),
  async (req, res, next) => {
    try {
      const product = await createProduct(req.ownerStoreId, req.validatedBody);
      return res.status(201).json({ product });
    } catch (err) {
      if (err.statusCode === 400) {
        return res.status(400).json({
          error: true,
          code: "BAD_REQUEST",
          message: err.message,
          path: req.originalUrl,
          request_id: req.id || null,
        });
      }
      return next(err);
    }
  }
);

// ── PATCH /api/owner/products/:id ────────────────────────────────────────────

router.patch(
  "/products/:id",
  requireOwnerSession,
  requireUuidParam("id"),
  validateBody(updateOwnerProductSchema),
  async (req, res, next) => {
    try {
      const { price, ...rest } = req.validatedBody;
      const updates = { ...rest };
      if (price !== undefined) {
        updates.price_cents = Math.round(price * 100);
      }

      if (Object.keys(updates).length === 0) {
        return jsonError(req, res, 400, "BAD_REQUEST", "No fields to update");
      }

      const product = await updateProduct(req.params.id, req.ownerStoreId, updates);
      if (!product) {
        return jsonError(req, res, 404, "NOT_FOUND", "Product not found");
      }
      return res.json({ product });
    } catch (err) {
      return next(err);
    }
  }
);

// ── DELETE /api/owner/products/:id ────────────────────────────────────────────

router.delete(
  "/products/:id",
  requireOwnerSession,
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      const result = await deleteProduct(req.params.id, req.ownerStoreId);
      if (result.kind === "NOT_FOUND") {
        return jsonError(req, res, 404, "NOT_FOUND", "Product not found");
      }
      if (result.kind === "DELETED") {
        return res.json({ deleted: true, deactivated: false });
      }
      // DEACTIVATED — had order references, soft-deleted instead
      return res.json({ deleted: false, deactivated: true, product: result.product });
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/owner/orders ─────────────────────────────────────────────────────

router.get("/orders", requireOwnerSession, async (req, res, next) => {
  try {
    const orders = await listOrdersByStore(req.ownerStoreId);
    return res.json({ orders });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/owner/orders/:orderId ────────────────────────────────────────────

router.get(
  "/orders/:orderId",
  requireOwnerSession,
  requireUuidParam("orderId"),
  async (req, res, next) => {
    try {
      const result = await getOrderWithItems(req.ownerStoreId, req.params.orderId);
      if (!result) {
        return jsonError(req, res, 404, "NOT_FOUND", "Order not found");
      }
      const fulfillment = await getFulfillmentByOrderId(req.params.orderId);
      return res.json({ ...result, fulfillment: fulfillment ?? null });
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/owner/orders/:orderId/resend-delivery ───────────────────────────

router.post(
  "/orders/:orderId/resend-delivery",
  requireOwnerSession,
  requireUuidParam("orderId"),
  async (req, res, next) => {
    try {
      await resendFulfillment(req.params.orderId, req.ownerStoreId);
      return res.json({ ok: true });
    } catch (err) {
      if (err.statusCode === 404) {
        return jsonError(req, res, 404, "NOT_FOUND", err.message);
      }
      if (err.statusCode === 400) {
        return jsonError(req, res, 400, "BAD_REQUEST", err.message);
      }
      if (err.statusCode === 502) {
        return jsonError(req, res, 502, "EMAIL_FAILED", err.message);
      }
      return next(err);
    }
  }
);

module.exports = { ownerRouter: router };
