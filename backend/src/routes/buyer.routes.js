"use strict";

// Routes: buyer account
// Buyer-facing auth and account management for storefront users.
// Store context is always resolved from ?slug= or X-Store-Slug header — buyers belong to a specific store.
//
// Public: POST register, login, forgot-password, reset-password
// Protected (requireBuyerSession): session, logout, profile, change-password, orders, orders/:orderId

const express = require("express");
const { z }   = require("zod");

const { validateBody } = require("../middleware/validate.middleware");
const { requireBuyerSession } = require("../middleware/buyerAuth.middleware");
const { generateToken, hashToken, hashPassword, verifyPassword } = require("../lib/buyerAuth");
const { resolveEnabledStoreIdBySlug } = require("../db/queries/orders.queries");
const { pool } = require("../db/pool");
const {
  createBuyerAccount,
  getBuyerAccountByEmail,
  getBuyerAccountById,
  updateBuyerProfile,
  updateBuyerPassword,
  createBuyerSession,
  revokeBuyerSession,
  createBuyerPasswordResetToken,
  getBuyerPasswordResetToken,
  markBuyerPasswordResetTokenUsed,
  listBuyerOrders,
  getBuyerOrder,
  linkBuyerAccountToCustomer,
} = require("../db/queries/buyer.queries");
const { sendEmail } = require("../lib/mailer");

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

/**
 * Resolve store from ?slug= or X-Store-Slug header.
 * Returns storeId or null.
 */
async function resolveStore(req) {
  const slug = String(
    req.query.slug || req.headers["x-store-slug"] || ""
  ).trim().toLowerCase();
  if (!slug) return null;
  return resolveEnabledStoreIdBySlug(slug);
}

// ── Validation schemas ────────────────────────────────────────────────────────

const registerSchema = z.object({
  slug:             z.string().min(1).max(100),
  email:            z.string().email(),
  password:         z.string().min(8).max(128),
  display_name:     z.string().max(100).optional(),
  marketing_opt_in: z.boolean().optional(),
});

const loginSchema = z.object({
  slug:     z.string().min(1).max(100),
  email:    z.string().email(),
  password: z.string().min(1).max(128),
});

const forgotPasswordSchema = z.object({
  slug:  z.string().min(1).max(100),
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token:    z.string().min(1),
  password: z.string().min(8).max(128),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(128),
  new_password:     z.string().min(8).max(128),
});

const updateProfileSchema = z.object({
  display_name:     z.string().max(100).optional(),
  marketing_opt_in: z.boolean().optional(),
});

// POST /api/buyer/register — Public
// Creates a buyer account and returns a session token. Also links to any existing store_customers record.
// Side effect: fires a fire-and-forget country update on buyer_accounts and store_customers.
router.post("/buyer/register", validateBody(registerSchema), async (req, res, next) => {
  const { slug, email, password, display_name, marketing_opt_in } = req.validatedBody;
  const country = (
    req.headers["cf-ipcountry"] ||
    req.headers["x-vercel-ip-country"] ||
    req.headers["x-country"] ||
    req.headers["x-test-country"] || ""
  ).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || null;

  try {
    const storeId = await resolveEnabledStoreIdBySlug(slug);
    if (!storeId) return jsonError(req, res, 404, "NOT_FOUND", "Store not found");

    const existing = await getBuyerAccountByEmail(storeId, email);
    if (existing) {
      return jsonError(req, res, 409, "ALREADY_EXISTS", "An account with this email already exists");
    }

    const passwordHash = await hashPassword(password);
    const account = await createBuyerAccount(storeId, {
      email,
      passwordHash,
      displayName:    display_name,
      marketingOptIn: marketing_opt_in ?? false,
    });

    // Link to existing store_customers record if one exists
    linkBuyerAccountToCustomer(storeId, email, account.id).catch(() => {});

    const { raw, hash } = generateToken();
    await createBuyerSession(account.id, storeId, hash);

    if (country) {
      pool.query(`UPDATE buyer_accounts SET country = $1 WHERE id = $2`, [country, account.id]).catch(() => {});
      // Registration always overwrites profile country (member's home country takes precedence)
      pool.query(`UPDATE store_customers SET country = $1 WHERE store_id = $2 AND email = $3`, [country, storeId, email]).catch(() => {});
    }

    return res.status(201).json({
      token:      raw,
      account_id: account.id,
      email:      account.email,
      display_name: account.display_name,
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/buyer/login — Public
// Authenticates buyer credentials and returns a session token.
router.post("/buyer/login", validateBody(loginSchema), async (req, res, next) => {
  const { slug, email, password } = req.validatedBody;

  try {
    const storeId = await resolveEnabledStoreIdBySlug(slug);
    if (!storeId) return jsonError(req, res, 404, "NOT_FOUND", "Store not found");

    const account = await getBuyerAccountByEmail(storeId, email);
    if (!account || !account.password_hash) {
      return jsonError(req, res, 401, "UNAUTHORIZED", "Invalid email or password");
    }

    const valid = await verifyPassword(password, account.password_hash);
    if (!valid) {
      return jsonError(req, res, 401, "UNAUTHORIZED", "Invalid email or password");
    }

    const { raw, hash } = generateToken();
    await createBuyerSession(account.id, storeId, hash);

    return res.json({
      token:        raw,
      account_id:   account.id,
      email:        account.email,
      display_name: account.display_name,
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/buyer/forgot-password — Public
// Always returns 200 regardless of whether the email exists (prevents enumeration).
// Side effect: sends a password reset email if account found.
router.post("/buyer/forgot-password", validateBody(forgotPasswordSchema), async (req, res, next) => {
  const { slug, email } = req.validatedBody;

  try {
    const storeId = await resolveEnabledStoreIdBySlug(slug);
    if (!storeId) return jsonError(req, res, 404, "NOT_FOUND", "Store not found");

    // Always return 200 to prevent email enumeration
    const account = await getBuyerAccountByEmail(storeId, email);
    if (account) {
      const { raw, hash } = generateToken();
      await createBuyerPasswordResetToken(account.id, hash);

      const appBaseUrl = (process.env.APP_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
      const resetUrl   = `${appBaseUrl}/store/${slug}/reset-password?token=${raw}`;

      sendEmail({
        to:      email,
        subject: "Reset your password",
        text:    `Click the link below to reset your password. It expires in 1 hour.\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
        html:    `<p>Click the link below to reset your password. It expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
      }).catch((err) => {
        console.error("[buyer] forgot-password email failed:", err.message);
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// POST /api/buyer/reset-password — Public
// Validates the reset token (expiry + used_at) and updates the password. Marks token as used.
router.post("/buyer/reset-password", validateBody(resetPasswordSchema), async (req, res, next) => {
  const { token, password } = req.validatedBody;

  try {
    const tokenHash    = hashToken(token);
    const resetToken   = await getBuyerPasswordResetToken(tokenHash);

    if (!resetToken) {
      return jsonError(req, res, 400, "INVALID_TOKEN", "Invalid or expired reset token");
    }
    if (resetToken.used_at) {
      return jsonError(req, res, 400, "INVALID_TOKEN", "Reset token has already been used");
    }
    if (new Date(resetToken.expires_at) <= new Date()) {
      return jsonError(req, res, 400, "INVALID_TOKEN", "Reset token has expired");
    }

    const passwordHash = await hashPassword(password);
    await updateBuyerPassword(resetToken.buyer_account_id, passwordHash);
    await markBuyerPasswordResetTokenUsed(resetToken.id);

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// GET /api/buyer/session — Protected (requireBuyerSession)
// Returns current buyer account info. Used by the frontend to validate a stored token.
router.get("/buyer/session", requireBuyerSession, async (req, res, next) => {
  try {
    const account = await getBuyerAccountById(req.buyerAccountId);
    if (!account) {
      return jsonError(req, res, 401, "UNAUTHORIZED", "Account not found");
    }
    return res.json({
      account_id:     account.id,
      store_id:       account.store_id,
      email:          account.email,
      display_name:   account.display_name,
      marketing_opt_in: account.marketing_opt_in,
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/buyer/logout — Protected (requireBuyerSession)
// Revokes the current session token. Subsequent requests with the same token will get 401.
router.post("/buyer/logout", requireBuyerSession, async (req, res, next) => {
  try {
    await revokeBuyerSession(req.buyerTokenHash);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// GET /api/buyer/profile — Protected (requireBuyerSession)
// Returns buyer profile fields (no password_hash).
router.get("/buyer/profile", requireBuyerSession, async (req, res, next) => {
  try {
    const account = await getBuyerAccountById(req.buyerAccountId);
    if (!account) {
      return jsonError(req, res, 404, "NOT_FOUND", "Account not found");
    }
    return res.json({
      account_id:       account.id,
      email:            account.email,
      display_name:     account.display_name,
      marketing_opt_in: account.marketing_opt_in,
      created_at:       account.created_at,
    });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/buyer/profile — Protected (requireBuyerSession)
// Updates display_name and/or marketing_opt_in.
router.put("/buyer/profile", requireBuyerSession, validateBody(updateProfileSchema), async (req, res, next) => {
  const { display_name, marketing_opt_in } = req.validatedBody;

  try {
    await updateBuyerProfile(req.buyerAccountId, {
      displayName:    display_name,
      marketingOptIn: marketing_opt_in,
    });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// POST /api/buyer/change-password — Protected (requireBuyerSession)
// Requires current password verification before setting the new one.
router.post("/buyer/change-password", requireBuyerSession, validateBody(changePasswordSchema), async (req, res, next) => {
  const { current_password, new_password } = req.validatedBody;

  try {
    const account = await getBuyerAccountById(req.buyerAccountId);
    if (!account) {
      return jsonError(req, res, 404, "NOT_FOUND", "Account not found");
    }

    // Need password_hash — re-fetch with it
    const fullAccount = await getBuyerAccountByEmail(account.store_id, account.email);
    if (!fullAccount || !fullAccount.password_hash) {
      return jsonError(req, res, 400, "BAD_REQUEST", "No password set on this account");
    }

    const valid = await verifyPassword(current_password, fullAccount.password_hash);
    if (!valid) {
      return jsonError(req, res, 401, "UNAUTHORIZED", "Current password is incorrect");
    }

    const newHash = await hashPassword(new_password);
    await updateBuyerPassword(req.buyerAccountId, newHash);

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// GET /api/buyer/orders — Protected (requireBuyerSession)
// Lists all orders for the authenticated buyer's email in their store.
router.get("/buyer/orders", requireBuyerSession, async (req, res, next) => {
  try {
    const account = await getBuyerAccountById(req.buyerAccountId);
    if (!account) {
      return jsonError(req, res, 404, "NOT_FOUND", "Account not found");
    }
    const orders = await listBuyerOrders(req.buyerStoreId, account.email);
    return res.json({ orders });
  } catch (err) {
    return next(err);
  }
});

// GET /api/buyer/orders/:orderId — Protected (requireBuyerSession)
// Returns a single order scoped to the buyer's email (prevents cross-buyer access).
router.get("/buyer/orders/:orderId", requireBuyerSession, async (req, res, next) => {
  const orderId = String(req.params.orderId || "").trim();

  try {
    const account = await getBuyerAccountById(req.buyerAccountId);
    if (!account) {
      return jsonError(req, res, 404, "NOT_FOUND", "Account not found");
    }
    const order = await getBuyerOrder(req.buyerStoreId, orderId, account.email);
    if (!order) {
      return jsonError(req, res, 404, "NOT_FOUND", "Order not found");
    }
    return res.json({ order });
  } catch (err) {
    return next(err);
  }
});

module.exports = { buyerRouter: router };
