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
  createPasswordResetToken,
  getPasswordResetToken,
  markPasswordResetTokenUsed,
  updateOwnerPassword,
} = require("../db/queries/owner.queries");

const {
  getStoreBySlug,
  getStoreSettings,
  updateStoreSettings,
  checkSlugAvailable,
  setOnboardingCompleted,
} = require("../db/queries/stores.queries");

const { createProduct, listProductsByStore, getProductById, listProductsWithStats, updateProduct, deleteProduct, duplicateProduct, reorderProducts, bulkUpdateProducts, bulkDeleteProducts, isSlugTaken } = require("../db/queries/products.queries");
const { listContactsUnified, getCustomersSummary } = require("../db/queries/customers.queries");
// Aliased as _pool to make direct raw SQL usage visually distinct from query functions.
// Used only for the customer backfill endpoint where a specialized query doesn't belong in customers.queries.
const { pool: _pool } = require("../db/pool");
const { getOwnerStats } = require("../db/queries/stats.queries");
const { getDashboardStats, getTopProducts, getDailySales, getRecentOrders, getRecentPublishedProducts, getDailyViewStats } = require("../db/queries/dashboard.queries");
const { getNotifications, getUnreadCount, markAsRead, markAllAsRead } = require("../db/queries/notifications.queries");
const { listOrdersByStore, listOrdersEnriched, getOrdersSummary, getOrderWithItems } = require("../db/queries/orders.queries");
const { getFulfillmentByOrderId } = require("../db/queries/fulfillment.queries");
const { resendFulfillment } = require("../lib/fulfillment");
const {
  getRevenueByProduct, getOrdersOverTime, getCustomerStats, getRecentActivity,
  getAnalyticsSummary, getRevenueTimeSeries, getTopProductsBreakdown,
  getGeographyBreakdown, getCustomerBreakdown, getRecentTransactions,
} = require("../db/queries/analytics.queries");
const { periodToDateRange, getDailyViews, getReferrerSources, getViewsByCountry, getTotalViews, getViewsPerProduct } = require("../db/queries/pageviews.queries");
const { listDiscountCodes, createDiscountCode, updateDiscountCode, deleteDiscountCode } = require("../db/queries/discounts.queries");
const { listStoreReviews, updateReviewApproval, deleteReview } = require("../db/queries/reviews.queries");
const {
  createBlogPost, listBlogPostsForOwner, getBlogPostById,
  updateBlogPost, deleteBlogPost, isSlugAvailable,
} = require("../db/queries/blog.queries");
const { listSales, getSaleById, createSale, updateSale, deleteSale } = require("../db/queries/sales.queries");
const { listSubscribers, countSubscribers, deleteSubscriber } = require("../db/queries/subscribers.queries");
const {
  createCampaign, getCampaignById, listCampaigns, updateCampaign, deleteCampaign,
  prepareCampaignRecipients, getCampaignStats, duplicateCampaign,
} = require("../db/queries/campaigns.queries");
const { sendCampaign } = require("../lib/campaignSender");
const {
  addCustomDomain, getDomainByStoreId, updateDomainStatus, deleteCustomDomain, isDomainTaken,
} = require("../db/queries/domains.queries");
const { verifyDomain, CNAME_TARGET } = require("../lib/dnsVerifier");

const { generateToken, hashToken, hashPassword, verifyPassword } = require("../lib/ownerAuth");

// ── File upload (multer + Supabase Storage) ───────────────────────────────────

let multerUpload = null;
let storage = null;

try {
  const multer = require("multer");
  storage = require("../lib/storage");
  multerUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB hard limit at middleware level
  });
} catch {
  // multer or storage not available — upload endpoints will return 503
}

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
    id:                       row.id,
    slug:                     row.slug,
    name:                     row.name,
    currency:                 row.currency,
    primary_color:            row.primary_color,
    secondary_color:          row.secondary_color          ?? null,
    logo_url:                 row.logo_url,
    is_enabled:               row.is_enabled,
    tagline:                  row.tagline                  ?? null,
    description:              row.description              ?? null,
    social_twitter:           row.social_twitter           ?? null,
    social_instagram:         row.social_instagram         ?? null,
    social_youtube:           row.social_youtube           ?? null,
    social_website:           row.social_website           ?? null,
    storefront_config:        row.storefront_config        ?? {},
    font_family:              row.font_family              ?? "system",
    is_paused:                row.is_paused                ?? false,
    pause_message:            row.pause_message            ?? null,
    onboarding_completed_at:  row.onboarding_completed_at  ?? null,
    created_at:               row.created_at,
    updated_at:               row.updated_at,
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
  secondary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "secondary_color must be a hex color like #RRGGBB")
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
  tagline:           z.string().max(150).optional(),
  description:       z.string().max(2000).optional(),
  social_twitter:    z.string().max(500).optional(),
  social_instagram:  z.string().max(500).optional(),
  social_youtube:    z.string().max(500).optional(),
  social_website:    z.string().max(500).optional(),
  storefront_config: z.object({
    hero: z.object({
      enabled:    z.boolean().optional(),
      heading:    z.string().max(120).optional(),
      subheading: z.string().max(200).optional(),
      image_url:  z.string().max(500).optional(),
      cta_text:   z.string().max(50).optional(),
      cta_url:    z.string().max(500).optional(),
    }).optional(),
    featured_product_id:       z.string().uuid().nullable().optional(),
    layout:                    z.enum(["grid", "list"]).optional(),
    show_description_on_cards: z.boolean().optional(),
    show_search:               z.boolean().optional(),
    announcement: z.object({
      enabled:    z.boolean().optional(),
      text:       z.string().max(200).optional(),
      bg_color:   z.string().max(7).optional(),
      text_color: z.string().max(7).optional(),
    }).optional(),
    footer_text: z.string().max(200).optional(),
  }).passthrough().optional(),
  font_family:       z.enum(["system", "rounded", "serif"]).optional(),
  is_paused:         z.boolean().optional(),
  pause_message:     z.string().max(500).optional(),
});

const createOwnerProductSchema = z.object({
  title:                    z.string().min(1).max(200),
  description:              z.string().max(5000).optional(),
  short_description:        z.string().max(200).optional().nullable(),
  price_cents:              z.number().int().nonnegative(),
  delivery_url:             z.string().url("delivery_url must be a valid URL").optional(),
  image_url:                z.string().url().optional(),
  is_active:                z.boolean().optional(),
  product_type:             z.string().max(50).optional(),
  product_category:         z.string().max(50).optional(),
  product_tags:             z.array(z.string().max(50)).max(10).optional(),
  visibility:               z.enum(["published", "draft", "unlisted"]).default("published"),
  video_url:                z.string().url().max(500).optional(),
  file_size_display:        z.string().max(50).optional(),
  delivery_file_key:        z.string().max(500).optional().nullable(),
  delivery_file_size_bytes: z.number().int().nonnegative().optional().nullable(),
  delivery_file_name:       z.string().max(255).optional().nullable(),
  image_urls:               z.array(z.string().url()).max(10).optional(),
  pricing_type:             z.enum(["fixed", "pay_what_you_want"]).optional(),
  minimum_price_cents:      z.number().int().min(100).optional(),
  seo_title:                z.string().max(100).optional().nullable(),
  seo_description:          z.string().max(300).optional().nullable(),
  slug:                     z.string().max(100).regex(/^[a-z0-9-]*$/, "Slug can only contain lowercase letters, numbers, and hyphens").optional().nullable(),
  cta_text:                 z.string().max(50).optional().nullable(),
});

const updateOwnerProductSchema = z.object({
  title:                    z.string().min(1).max(200).optional(),
  description:              z.string().max(5000).optional(),
  short_description:        z.string().max(200).optional().nullable(),
  price:                    z.number().nonnegative().optional(), // dollars — converted to cents in handler
  price_cents:              z.number().int().nonnegative().optional(),
  delivery_url:             z.string().url().optional().nullable(),
  image_url:                z.string().url().nullable().optional(),
  is_active:                z.boolean().optional(),
  product_type:             z.string().max(50).nullable().optional(),
  product_category:         z.string().max(50).nullable().optional(),
  product_tags:             z.array(z.string().max(50)).max(10).optional(),
  visibility:               z.enum(["published", "draft", "unlisted"]).optional(),
  video_url:                z.string().url().max(500).nullable().optional(),
  file_size_display:        z.string().max(50).nullable().optional(),
  delivery_file_key:        z.string().max(500).nullable().optional(),
  delivery_file_size_bytes: z.number().int().nonnegative().nullable().optional(),
  delivery_file_name:       z.string().max(255).nullable().optional(),
  image_urls:               z.array(z.string().url()).max(10).optional(),
  pricing_type:             z.enum(["fixed", "pay_what_you_want"]).optional(),
  minimum_price_cents:      z.number().int().min(0).optional(),
  seo_title:                z.string().max(100).optional().nullable(),
  seo_description:          z.string().max(300).optional().nullable(),
  slug:                     z.string().max(100).regex(/^[a-z0-9-]*$/, "Slug can only contain lowercase letters, numbers, and hyphens").optional().nullable(),
  cta_text:                 z.string().max(50).optional().nullable(),
});

// POST /api/owner/claim-access — Public
// First-time store setup: verifies the bootstrap token (from dev provisioning flow), hashes the
// chosen password, marks the account as claimed, and returns the first session token.
// Once claimed, the bootstrap token is cleared and login is used for all future sessions.
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

// POST /api/owner/login — Public
// Authenticates by email or store slug + password. Returns a session token + store data.
// Supports email login (if identifier contains @) or slug login for backward compat.
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

// POST /api/owner/logout — Owner session required
// Revokes the current session token. Subsequent requests with the same token get 401.
router.post("/logout", requireOwnerSession, async (req, res, next) => {
  try {
    await revokeOwnerSession(req.ownerTokenHash);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// GET /api/owner/account — Owner session required
// Returns owner profile fields (name, email). No password_hash.
router.get("/account", requireOwnerSession, async (req, res, next) => {
  try {
    const account = await getOwnerAccount(req.ownerStoreId);
    return res.json({ account: account ?? {} });
  } catch (err) {
    return next(err);
  }
});

// GET /api/owner/session — Owner session required
// Used by the frontend to validate a stored token and get current store settings.
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

// GET /api/owner/store — Owner session required
// Returns the owner's store settings (safe subset — internal fields stripped by safeStore()).
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

// PATCH /api/owner/store — Owner session required
// Updates store branding and settings. Currency changes are blocked once products exist.
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

// ⚠️ ROUTE ORDER MATTERS: literal paths must come before parameterized paths.
// /account/password must be before any future /account/:param route.

// PATCH /api/owner/account/password — Owner session required
// Requires the current password before accepting the new one (no reset-token bypass here).

const changePasswordSchema = z.object({
  current_password: z.string().min(8),
  new_password:     z.string().min(8).max(128),
});

router.patch(
  "/account/password",
  requireOwnerSession,
  validateBody(changePasswordSchema),
  async (req, res, next) => {
    const { current_password, new_password } = req.validatedBody;
    try {
      const account = await getOwnerAccountByStoreId(req.ownerStoreId);
      if (!account || !account.password_hash) {
        return jsonError(req, res, 401, "UNAUTHORIZED", "Account not found or not claimed");
      }
      const valid = await verifyPassword(current_password, account.password_hash);
      if (!valid) {
        return jsonError(req, res, 401, "WRONG_PASSWORD", "Current password is incorrect");
      }
      const newHash = await hashPassword(new_password);
      await updateOwnerPassword(account.id, newHash);
      return res.json({ ok: true, message: "Password updated" });
    } catch (err) {
      return next(err);
    }
  }
);

// PATCH /api/owner/account — Owner session required
// Updates owner profile fields (email, first_name, last_name). At least one field required.

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

// GET /api/owner/check-email/:email — Public
// Checks if an email is already registered as an owner account. Used in sign-up form to give
// early feedback without waiting for form submit. Only returns true for claimed accounts.

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

// GET /api/owner/check-slug/:slug — Public
// Checks if a store slug is available. Used during onboarding before the owner commits to a username.

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

// GET /api/owner/stats — Owner session required
// Returns aggregate revenue + order + product stats for the dashboard header.
router.get("/stats", requireOwnerSession, async (req, res, next) => {
  try {
    const stats = await getOwnerStats(req.ownerStoreId);
    return res.json({ stats });
  } catch (err) {
    return next(err);
  }
});

// GET /api/owner/dashboard-stats — Owner session required
// Returns the full dashboard home page data: stats cards, top products, daily sales chart,
// recent orders, recently published products, and daily view counts.
// All queries run in parallel via Promise.all. Accepts ?period= (7d, 30d, 60d, 90d).
router.get("/dashboard-stats", requireOwnerSession, async (req, res, next) => {
  try {
    const periodMap = { "7d": 7, "30d": 30, "60d": 60, "90d": 90 };
    const chartDays = periodMap[req.query.period] ?? 30;

    const [stats, topProducts, dailySales, recentOrders, recentProducts, viewStats] = await Promise.all([
      getDashboardStats(req.ownerStoreId),
      getTopProducts(req.ownerStoreId, 5),
      getDailySales(req.ownerStoreId, chartDays),
      getRecentOrders(req.ownerStoreId, 5),
      getRecentPublishedProducts(req.ownerStoreId, 3),
      getDailyViewStats(req.ownerStoreId),
    ]);
    return res.json({
      stats,
      topProducts,
      dailySales,
      recentOrders,
      recentProducts,
      daily_views:       viewStats.daily_views,
      total_views_today: viewStats.total_views_today,
      total_views_7d:    viewStats.total_views_7d,
    });
  } catch (err) {
    return next(err);
  }
});

// ⚠️ ROUTE ORDER MATTERS: literal paths must come before parameterized paths.
// products/reorder  must be before  products/:id  (see PATCH block below).
// products-with-stats is a different top-level path and does not conflict.

// GET /api/owner/products — Owner session required
// Returns all products for the owner's store (all visibility states).
router.get("/products", requireOwnerSession, async (req, res, next) => {
  try {
    const products = await listProductsByStore(req.ownerStoreId);
    return res.json({ products });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/owner/products/export-csv ────────────────────────────────────────
// CRITICAL: before /products/:id — otherwise "export-csv" is treated as a UUID.

router.get("/products/export-csv", requireOwnerSession, async (req, res, next) => {
  try {
    const products = await listProductsWithStats(req.ownerStoreId);
    const cols = [
      "title","description","price","currency","visibility",
      "product_type","product_category","delivery_url","image_url",
      "sales_count","revenue","created_at","updated_at",
    ];
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [cols.join(",")];
    for (const p of products) {
      rows.push([
        escape(p.title),
        escape(p.description),
        (p.price_cents / 100).toFixed(2),
        p.currency || "usd",
        p.visibility || "draft",
        p.product_type || "",
        p.product_category || "",
        escape(p.delivery_url),
        escape(p.image_url),
        p.sales_count || 0,
        ((p.revenue_cents || 0) / 100).toFixed(2),
        p.created_at ? new Date(p.created_at).toISOString() : "",
        p.updated_at ? new Date(p.updated_at).toISOString() : "",
      ].join(","));
    }
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="products-export-${today}.csv"`);
    return res.send(rows.join("\n"));
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/owner/products/upload-deliverable ───────────────────────────────
// CRITICAL: literal route, must be before /products/:id

router.post("/products/upload-deliverable", requireOwnerSession, (req, res, next) => {
  if (!multerUpload || !storage) {
    return res.status(503).json({ error: true, code: "NOT_CONFIGURED", message: "File upload is not configured on this server" });
  }
  multerUpload.single("file")(req, res, async (multerErr) => {
    if (multerErr) return res.status(400).json({ error: true, code: "UPLOAD_ERROR", message: multerErr.message });
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: true, code: "NO_FILE", message: "No file uploaded" });

      if (!storage.ALLOWED_DELIVERABLE_TYPES.has(file.mimetype)) {
        return res.status(400).json({ error: true, code: "INVALID_TYPE", message: `File type "${file.mimetype}" is not allowed` });
      }
      if (file.size > storage.MAX_DELIVERABLE_SIZE) {
        return res.status(400).json({ error: true, code: "FILE_TOO_LARGE", message: `File exceeds ${storage.MAX_DELIVERABLE_SIZE / 1024 / 1024}MB limit` });
      }

      const result = await storage.uploadDeliverable(req.ownerStoreId, file, file.originalname);
      return res.json({
        key:         result.key,
        size:        result.size,
        name:        result.name,
        sizeDisplay: storage.formatFileSize(result.size),
      });
    } catch (err) {
      return res.status(500).json({ error: true, code: "UPLOAD_FAILED", message: err.message });
    }
  });
});

// ── POST /api/owner/products/upload-image ─────────────────────────────────────
// CRITICAL: literal route, must be before /products/:id

router.post("/products/upload-image", requireOwnerSession, (req, res, next) => {
  if (!multerUpload || !storage) {
    return res.status(503).json({ error: true, code: "NOT_CONFIGURED", message: "File upload is not configured on this server" });
  }
  multerUpload.single("image")(req, res, async (multerErr) => {
    if (multerErr) return res.status(400).json({ error: true, code: "UPLOAD_ERROR", message: multerErr.message });
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: true, code: "NO_FILE", message: "No file uploaded" });

      if (!storage.ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
        return res.status(400).json({ error: true, code: "INVALID_TYPE", message: "Only JPG, PNG, WebP, and GIF images are allowed" });
      }
      if (file.size > storage.MAX_IMAGE_SIZE) {
        return res.status(400).json({ error: true, code: "FILE_TOO_LARGE", message: `Image exceeds ${storage.MAX_IMAGE_SIZE / 1024 / 1024}MB limit` });
      }

      const productId = (req.body && req.body.product_id) || `temp-${Date.now()}`;
      const publicUrl = await storage.uploadProductImage(req.ownerStoreId, productId, file, file.originalname);
      return res.json({ url: publicUrl });
    } catch (err) {
      return res.status(500).json({ error: true, code: "UPLOAD_FAILED", message: err.message });
    }
  });
});

// ── GET /api/owner/products/csv-template ──────────────────────────────────────

router.get("/products/csv-template", requireOwnerSession, (req, res) => {
  const content = [
    "# PRODUCT IMPORT TEMPLATE — Instructions",
    "#",
    "# Required fields: title, price, delivery_url",
    "# Optional fields: description, visibility, product_type, image_url",
    "#",
    "# VISIBILITY values (optional — defaults to 'draft' if empty):",
    "#   active    = Visible on your storefront (customers can buy)",
    "#   draft     = Hidden from storefront (work in progress)",
    "#   inactive  = Not listed on storefront but accessible via direct link",
    "#",
    "# PRODUCT TYPE values (optional — leave empty if unsure):",
    "#   template, ebook, design-asset, photo-video, audio-music,",
    "#   preset-filter, font, software-code, ai-prompt, printable,",
    "#   spreadsheet, other",
    "#",
    "# PRICE: Use numbers only, no currency symbols. Example: 9.99",
    "#",
    "# Lines starting with # are automatically skipped during import.",
    "#",
    "title,price,delivery_url,description,visibility,product_type,image_url",
    "My Digital Product,9.99,https://example.com/download/file.zip,A great digital product,draft,template,https://example.com/image.jpg",
  ].join("\n") + "\n";
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="product-import-template.csv"');
  return res.send(content);
});

// ── POST /api/owner/products/import-csv ───────────────────────────────────────
// Accepts JSON { csvContent: "..." } to avoid needing a multipart parser.

router.post("/products/import-csv", requireOwnerSession, async (req, res, next) => {
  try {
    const { csvContent } = req.body;
    if (!csvContent || typeof csvContent !== "string") {
      return jsonError(req, res, 400, "BAD_REQUEST", "csvContent is required");
    }

    // Skip comment lines (# prefix) and empty lines
    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

    if (lines.length < 2) {
      return jsonError(req, res, 400, "BAD_REQUEST", "CSV must have a header row and at least one data row");
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    for (const required of ["title", "price", "delivery_url"]) {
      if (!headers.includes(required)) {
        return jsonError(req, res, 400, "BAD_REQUEST", `Missing required column: ${required}`);
      }
    }

    const col = (row, name) => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? (row[idx] ?? "").trim() : "";
    };

    // Accept user-friendly labels and map to DB values
    const VISIBILITY_MAP = {
      active: "published",
      published: "published",
      draft: "draft",
      inactive: "unlisted",
      unlisted: "unlisted",
    };

    const VALID_TYPES = new Set([
      "template", "ebook", "design-asset", "photo-video", "audio-music",
      "preset-filter", "font", "software-code", "ai-prompt", "printable",
      "spreadsheet", "other",
    ]);

    function parsePrice(raw) {
      if (!raw) return null;
      const cleaned = String(raw).replace(/[$,\s]/g, "").trim();
      const num = parseFloat(cleaned);
      if (isNaN(num) || num < 0) return null;
      return Math.round(num * 100);
    }

    let imported = 0;
    let skipped = 0;
    const warnings = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const rowNum = i + 1;
      const values = lines[i].split(",");
      const title        = col(values, "title");
      const priceStr     = col(values, "price");
      const delivery_url = col(values, "delivery_url");

      if (!title) {
        errors.push({ row: rowNum, field: "title", message: "Missing title" });
        skipped++; continue;
      }
      if (!delivery_url) {
        errors.push({ row: rowNum, field: "delivery_url", message: "Missing delivery_url" });
        skipped++; continue;
      }
      if (!delivery_url.startsWith("http://") && !delivery_url.startsWith("https://")) {
        errors.push({ row: rowNum, field: "delivery_url", message: `delivery_url must start with http:// or https://` });
        skipped++; continue;
      }

      const price_cents = parsePrice(priceStr);
      if (price_cents === null) {
        errors.push({ row: rowNum, field: "price", message: `Invalid price: '${priceStr}'` });
        skipped++; continue;
      }

      const visRaw = col(values, "visibility").toLowerCase();
      let visibility = VISIBILITY_MAP[visRaw];
      if (visibility === undefined) {
        visibility = "draft";
        if (visRaw) {
          warnings.push({ row: rowNum, field: "visibility", message: `Unknown visibility '${visRaw}', defaulting to 'draft'` });
        }
      }

      const typeRaw = col(values, "product_type").toLowerCase();
      let product_type = null;
      if (typeRaw) {
        if (VALID_TYPES.has(typeRaw)) {
          product_type = typeRaw;
        } else {
          warnings.push({ row: rowNum, field: "product_type", message: `Unknown type '${typeRaw}', leaving empty` });
        }
      }

      try {
        await createProduct(req.ownerStoreId, {
          title,
          description: col(values, "description") || "",
          price_cents,
          delivery_url,
          image_url: col(values, "image_url") || null,
          product_type,
          visibility,
          is_active: true, // always true for imports — visibility controls storefront display
        });
        imported++;
      } catch (err) {
        errors.push({ row: rowNum, field: null, message: err.message });
        skipped++;
      }
    }

    return res.json({ imported, skipped, warnings, errors });
  } catch (err) {
    return next(err);
  }
});

// ── PATCH /api/owner/products/bulk-update ─────────────────────────────────────
// CRITICAL: before /products/:id

const bulkUpdateSchema = z.object({
  product_ids: z.array(z.string().uuid()).min(1).max(50),
  updates: z
    .object({
      visibility:  z.enum(["published", "draft", "unlisted"]).optional(),
      price_cents: z.number().int().nonnegative().optional(),
    })
    .refine(
      (u) => u.visibility !== undefined || u.price_cents !== undefined,
      { message: "At least one update field (visibility or price_cents) is required" }
    ),
});

router.patch(
  "/products/bulk-update",
  requireOwnerSession,
  validateBody(bulkUpdateSchema),
  async (req, res, next) => {
    try {
      const { product_ids, updates } = req.validatedBody;
      const result = await bulkUpdateProducts(req.ownerStoreId, product_ids, updates);
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/owner/products/bulk-delete ──────────────────────────────────────
// POST (not DELETE) for reliable body parsing. CRITICAL: before /products/:id routes.

const bulkDeleteSchema = z.object({
  product_ids: z.array(z.string().uuid()).min(1).max(50),
});

router.post(
  "/products/bulk-delete",
  requireOwnerSession,
  validateBody(bulkDeleteSchema),
  async (req, res, next) => {
    try {
      const { product_ids } = req.validatedBody;
      const result = await bulkDeleteProducts(req.ownerStoreId, product_ids);
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/owner/products/:id ───────────────────────────────────────────────

router.get(
  "/products/:id",
  requireOwnerSession,
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      const product = await getProductById(req.ownerStoreId, req.params.id);
      if (!product) return jsonError(req, res, 404, "NOT_FOUND", "Product not found");
      return res.json({ product });
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/owner/products-with-stats ────────────────────────────────────────

router.get("/products-with-stats", requireOwnerSession, async (req, res, next) => {
  try {
    const products = await listProductsWithStats(req.ownerStoreId);
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
      const { slug } = req.validatedBody;
      if (slug) {
        const taken = await isSlugTaken(req.ownerStoreId, slug, null);
        if (taken) return jsonError(req, res, 400, "SLUG_TAKEN", "This URL slug is already used by another product");
      }
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

// ── PATCH /api/owner/products/reorder ─────────────────────────────────────────
// Must be before /products/:id so "reorder" is not treated as a UUID param.

const reorderSchema = z.object({
  order: z.array(z.object({
    id:         z.string().uuid(),
    sort_order: z.number().int().nonnegative(),
  })).min(1),
});

router.patch(
  "/products/reorder",
  requireOwnerSession,
  validateBody(reorderSchema),
  async (req, res, next) => {
    try {
      await reorderProducts(req.ownerStoreId, req.validatedBody.order);
      return res.json({ ok: true });
    } catch (err) {
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
      const { price, price_cents, ...rest } = req.validatedBody;
      const updates = { ...rest };
      if (price !== undefined) {
        updates.price_cents = Math.round(price * 100);
      } else if (price_cents !== undefined) {
        updates.price_cents = price_cents;
      }

      if (Object.keys(updates).length === 0) {
        return jsonError(req, res, 400, "BAD_REQUEST", "No fields to update");
      }

      // ── Slug uniqueness check ─────────────────────────────────────────────────
      if (updates.slug) {
        const taken = await isSlugTaken(req.ownerStoreId, updates.slug, req.params.id);
        if (taken) return jsonError(req, res, 400, "SLUG_TAKEN", "This URL slug is already used by another product");
      }

      // ── Storage cleanup: delete removed images from Supabase ──────────────────
      if (storage && (updates.image_urls !== undefined || updates.image_url !== undefined)) {
        const existing = await getProductById(req.ownerStoreId, req.params.id);
        if (existing) {
          const supabaseBase = process.env.SUPABASE_URL
            ? `${process.env.SUPABASE_URL}/storage/v1/object/public/${storage.BUCKETS.PRODUCT_IMAGES}/`
            : null;

          // Collect all URLs currently stored for this product
          const oldUrls = new Set([
            ...(existing.image_urls || []),
            ...(existing.image_url ? [existing.image_url] : []),
          ]);

          // Collect URLs that will remain after this update
          const newImageUrls = updates.image_urls !== undefined ? updates.image_urls : existing.image_urls;
          const newImageUrl  = updates.image_url  !== undefined ? updates.image_url  : existing.image_url;
          const keepUrls = new Set([
            ...(newImageUrls || []),
            ...(newImageUrl ? [newImageUrl] : []),
          ]);

          // Delete any Supabase-hosted images that were removed
          if (supabaseBase) {
            for (const url of oldUrls) {
              if (!keepUrls.has(url) && url && url.startsWith(supabaseBase)) {
                const key = url.slice(supabaseBase.length);
                storage.deleteFile(storage.BUCKETS.PRODUCT_IMAGES, key); // fire-and-forget
              }
            }
          }
        }
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

// ⚠️ ROUTE ORDER MATTERS: literal paths must come before parameterized paths.
// /orders/summary, /orders/export-csv MUST be before /orders/:orderId.

// ── GET /api/owner/orders ─────────────────────────────────────────────────────

router.get("/orders", requireOwnerSession, async (req, res, next) => {
  try {
    const { search, status, date_from, date_to, product_id, sort_by } = req.query;
    const orders = await listOrdersEnriched(req.ownerStoreId, {
      search,
      status,
      dateFrom:  date_from,
      dateTo:    date_to,
      productId: product_id,
      sortBy:    sort_by,
    });
    return res.json({ orders });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/owner/orders/summary ─────────────────────────────────────────────
// Literal route — must be before GET /orders/:orderId.

router.get("/orders/summary", requireOwnerSession, async (req, res, next) => {
  try {
    const { date_from, date_to, status, product_id } = req.query;
    const summary = await getOrdersSummary(req.ownerStoreId, {
      dateFrom:  date_from,
      dateTo:    date_to,
      status,
      productId: product_id,
    });
    return res.json(summary);
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/owner/orders/export-csv ─────────────────────────────────────────
// Literal route — must be before GET /orders/:orderId.

router.get("/orders/export-csv", requireOwnerSession, async (req, res, next) => {
  try {
    const { search, status, date_from, date_to, product_id, sort_by } = req.query;
    const orders = await listOrdersEnriched(req.ownerStoreId, {
      search,
      status,
      dateFrom:  date_from,
      dateTo:    date_to,
      productId: product_id,
      sortBy:    sort_by,
      limit:     500,
    });

    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const fmtDate = (d) => d ? new Date(d).toISOString().replace("T", " ").substring(0, 19) : "";
    const header = ["order_id", "date", "buyer_email", "product_names", "quantity", "subtotal", "discount", "total", "currency", "payment_status", "delivery_status", "delivered_at"];
    const rows = orders.map((o) => {
      const subtotal = ((o.total_cents + (o.discount_amount_cents || 0)) / 100).toFixed(2);
      const discount = o.discount_amount_cents > 0 ? (o.discount_amount_cents / 100).toFixed(2) : "0.00";
      const delivStatus = o.fulfillment_status
        ? o.fulfillment_status
        : (o.status === "paid" ? "awaiting_delivery" : "not_applicable");
      return [
        o.id,
        fmtDate(o.created_at),
        o.buyer_email ?? "",
        (o.product_names ?? []).join("; "),
        o.item_count ?? 1,
        subtotal,
        discount,
        (o.total_cents / 100).toFixed(2),
        (o.currency || "usd").toUpperCase(),
        o.status,
        delivStatus,
        fmtDate(o.fulfillment_opened_at),
      ];
    });

    const csv = [
      header.map(escape).join(","),
      ...rows.map((r) => r.map(escape).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"orders.csv\"");
    return res.send(csv);
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

// ⚠️ ROUTE ORDER MATTERS: literal sub-paths must be registered before parameterized paths.
// /notifications/unread-count and /notifications/read-all before /notifications/:id/read

// ── GET /api/owner/notifications ─────────────────────────────────────────────

router.get("/notifications", requireOwnerSession, async (req, res, next) => {
  try {
    const limit      = Math.min(Number(req.query.limit) || 20, 100);
    const offset     = Math.max(Number(req.query.offset) || 0, 0);
    const unreadOnly = req.query.unread_only === "true";
    const data = await getNotifications(req.ownerStoreId, { limit, offset, unreadOnly });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/owner/notifications/unread-count ────────────────────────────────

router.get("/notifications/unread-count", requireOwnerSession, async (req, res, next) => {
  try {
    const data = await getUnreadCount(req.ownerStoreId);
    return res.json(data);
  } catch (err) {
    return next(err);
  }
});

// ── PATCH /api/owner/notifications/read-all ──────────────────────────────────

router.patch("/notifications/read-all", requireOwnerSession, async (req, res, next) => {
  try {
    await markAllAsRead(req.ownerStoreId);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// ── PATCH /api/owner/notifications/:id/read ──────────────────────────────────

router.patch(
  "/notifications/:id/read",
  requireOwnerSession,
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      await markAsRead(req.ownerStoreId, req.params.id);
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  }
);

// ⚠️ ROUTE ORDER MATTERS: /analytics/overview and /analytics/views must come
//    before /analytics so Express doesn't attempt to match them as a param.

// ── GET /api/owner/analytics/overview ────────────────────────────────────────

router.get("/analytics/overview", requireOwnerSession, async (req, res, next) => {
  try {
    const allowed   = ["7d", "30d", "60d", "90d", "all"];
    const period    = allowed.includes(req.query.period) ? req.query.period : "30d";
    const productId = req.query.product_id || null;
    const groupBy   = ["daily","weekly","monthly","quarterly","yearly"].includes(req.query.group_by)
      ? req.query.group_by
      : "daily";

    // Date range: accept ISO timestamps or YYYY-MM-DD from query params
    let startDate, endDate;
    if (req.query.start_date && req.query.end_date) {
      const s = new Date(req.query.start_date);
      const e = new Date(req.query.end_date);
      if (!isNaN(s) && !isNaN(e) && s <= e) {
        startDate = s.toISOString();
        endDate   = e.toISOString();
      }
    }
    if (!startDate || !endDate) {
      const r = periodToDateRange(period);
      startDate = new Date(r.startDate + "T00:00:00Z").toISOString();
      endDate   = new Date(r.endDate   + "T23:59:59.999Z").toISOString();
    }

    const storeId   = req.ownerStoreId;
    const dateRange = { productId, startDate, endDate };
    const salesDays = Math.min({ "7d": 7, "30d": 30, "60d": 60, "90d": 90 }[period] ?? 30, 90);

    const [
      viewTotals, dailyViews, referrerSources, viewsByCountry, topByViews, salesData, topByRevenue,
      summary, revenueTimeSeries, topProductsBreakdown, geographyBreakdown,
      customerBreakdown, recentTransactions,
    ] = await Promise.all([
      getTotalViews(storeId, dateRange),
      getDailyViews(storeId, dateRange),
      getReferrerSources(storeId, dateRange),
      getViewsByCountry(storeId, dateRange),
      getViewsPerProduct(storeId, { startDate, endDate, limit: 10 }),
      getDailySales(storeId, salesDays),
      getTopProducts(storeId, 10),
      getAnalyticsSummary(storeId, startDate, endDate, productId),
      getRevenueTimeSeries(storeId, startDate, endDate, groupBy, productId),
      getTopProductsBreakdown(storeId, startDate, endDate),
      getGeographyBreakdown(storeId, startDate, endDate),
      getCustomerBreakdown(storeId, startDate, endDate),
      getRecentTransactions(storeId, startDate, endDate, 5),
    ]);

    const totalSalesCents = salesData.reduce((s, d) => s + d.revenue_cents, 0);
    const totalOrders     = salesData.reduce((s, d) => s + d.orders_count,  0);
    const conversionRate  = viewTotals.unique > 0
      ? Math.round((totalOrders / viewTotals.unique) * 1000) / 10
      : 0;

    return res.json({
      // ── Existing fields (unchanged) ─────────────────────────────────────────
      views: {
        total:  viewTotals.total,
        unique: viewTotals.unique,
        daily:  dailyViews,
      },
      sales: {
        total_cents: totalSalesCents,
        count:       totalOrders,
        daily: salesData.map((d) => ({
          date:        d.day,
          sales_cents: d.revenue_cents,
          order_count: d.orders_count,
        })),
      },
      conversion_rate:          conversionRate,
      referrer_sources:         referrerSources,
      views_by_country:         viewsByCountry,
      top_products_by_views:    topByViews,
      top_products_by_revenue:  topByRevenue,
      // ── New fields ──────────────────────────────────────────────────────────
      summary,
      revenueTimeSeries,
      topProducts:         topProductsBreakdown,
      geography:           geographyBreakdown,
      customerBreakdown,
      recentTransactions,
      dateRange: {
        startDate,
        endDate,
        previousStartDate: summary.previousStartDate,
        previousEndDate:   summary.previousEndDate,
        groupBy,
      },
    });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/owner/analytics/views ───────────────────────────────────────────

router.get("/analytics/views", requireOwnerSession, async (req, res, next) => {
  try {
    const allowed = ["7d", "30d", "60d", "90d", "all"];
    const period    = allowed.includes(req.query.period) ? req.query.period : "30d";
    const productId = req.query.product_id || null;

    const { startDate, endDate } = periodToDateRange(period);
    const storeId   = req.ownerStoreId;
    const dateRange = { productId, startDate, endDate };

    const [viewTotals, dailyViews, referrerSources, viewsByCountry, topByViews] =
      await Promise.all([
        getTotalViews(storeId, dateRange),
        getDailyViews(storeId, dateRange),
        getReferrerSources(storeId, dateRange),
        getViewsByCountry(storeId, dateRange),
        getViewsPerProduct(storeId, { startDate, endDate, limit: 10 }),
      ]);

    return res.json({
      daily_views:      dailyViews,
      total_views:      viewTotals.total,
      unique_visitors:  viewTotals.unique,
      referrer_sources: referrerSources,
      views_by_country: viewsByCountry,
      top_products:     topByViews,
    });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/owner/analytics ──────────────────────────────────────────────────

router.get("/analytics", requireOwnerSession, async (req, res, next) => {
  try {
    const period = ["7d", "30d", "90d", "all"].includes(req.query.period)
      ? req.query.period
      : "30d";

    const [revenueByProduct, ordersOverTime, customerStats, recentActivity] = await Promise.all([
      getRevenueByProduct(req.ownerStoreId),
      getOrdersOverTime(req.ownerStoreId, period),
      getCustomerStats(req.ownerStoreId),
      getRecentActivity(req.ownerStoreId, 10),
    ]);

    return res.json({ revenueByProduct, ordersOverTime, customerStats, recentActivity });
  } catch (err) {
    return next(err);
  }
});

// ── Discount Code schemas ─────────────────────────────────────────────────────

const createDiscountSchema = z.object({
  code:             z.string().min(1).max(50),
  description:      z.string().max(500).optional(),
  discount_type:    z.enum(["percentage", "fixed"]),
  discount_value:   z.number().positive(),
  max_uses:         z.number().int().positive().optional(),
  min_order_cents:  z.number().int().nonnegative().optional(),
  expires_at:       z.string().datetime({ offset: true }).optional(),
  active:           z.boolean().optional(),
});

const updateDiscountSchema = z.object({
  code:             z.string().min(1).max(50).optional(),
  description:      z.string().max(500).optional(),
  discount_type:    z.enum(["percentage", "fixed"]).optional(),
  discount_value:   z.number().positive().optional(),
  max_uses:         z.number().int().positive().nullable().optional(),
  min_order_cents:  z.number().int().nonnegative().optional(),
  expires_at:       z.string().datetime({ offset: true }).nullable().optional(),
  active:           z.boolean().optional(),
});

// ── GET /api/owner/discounts ──────────────────────────────────────────────────

router.get("/discounts", requireOwnerSession, async (req, res, next) => {
  try {
    const codes = await listDiscountCodes(req.ownerStoreId);
    return res.json({ codes });
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/owner/discounts ─────────────────────────────────────────────────

router.post(
  "/discounts",
  requireOwnerSession,
  validateBody(createDiscountSchema),
  async (req, res, next) => {
    try {
      const code = await createDiscountCode(req.ownerStoreId, req.validatedBody);
      return res.status(201).json({ code });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({
          error: true, code: "CONFLICT",
          message: "A discount code with this name already exists",
          path: req.originalUrl, request_id: req.id || null,
        });
      }
      return next(err);
    }
  }
);

// ── PATCH /api/owner/discounts/:id ────────────────────────────────────────────

router.patch(
  "/discounts/:id",
  requireOwnerSession,
  requireUuidParam("id"),
  validateBody(updateDiscountSchema),
  async (req, res, next) => {
    try {
      const code = await updateDiscountCode(req.ownerStoreId, req.params.id, req.validatedBody);
      if (!code) return jsonError(req, res, 404, "NOT_FOUND", "Discount code not found");
      return res.json({ code });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({
          error: true, code: "CONFLICT",
          message: "A discount code with this name already exists",
          path: req.originalUrl, request_id: req.id || null,
        });
      }
      return next(err);
    }
  }
);

// ── DELETE /api/owner/discounts/:id ──────────────────────────────────────────

router.delete(
  "/discounts/:id",
  requireOwnerSession,
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      const deleted = await deleteDiscountCode(req.ownerStoreId, req.params.id);
      if (!deleted) return jsonError(req, res, 404, "NOT_FOUND", "Discount code not found");
      return res.json({ deleted: true });
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/owner/forgot-password ──────────────────────────────────────────
// Public — no auth required.

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

router.post(
  "/forgot-password",
  validateBody(forgotPasswordSchema),
  async (req, res, next) => {
    const { email } = req.validatedBody;
    try {
      // Always return 200 to avoid email enumeration
      const account = await getOwnerAccountByEmail(email);
      if (account && account.is_claimed) {
        const { raw, hash } = generateToken();
        await createPasswordResetToken(account.id, hash);

        // Send email (fire-and-forget — don't block response)
        const { sendEmail } = require("../lib/mailer");
        const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/owner/reset-password?token=${raw}`;
        sendEmail({
          to: email,
          subject: "Reset your password",
          text: `Click this link to reset your password (expires in 1 hour):\n\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
          html: `<p>Click the link below to reset your password. It expires in <strong>1 hour</strong>.</p>
                 <p><a href="${resetUrl}">${resetUrl}</a></p>
                 <p>If you didn't request this, you can ignore this email.</p>`,
        }).catch(() => {});
      }
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/owner/reset-password ───────────────────────────────────────────
// Public — no auth required.

const resetPasswordSchema = z.object({
  token:    z.string().min(1),
  password: z.string().min(8).max(128),
});

router.post(
  "/reset-password",
  validateBody(resetPasswordSchema),
  async (req, res, next) => {
    const { token, password } = req.validatedBody;
    try {
      const tokenHash = hashToken(token);
      const record = await getPasswordResetToken(tokenHash);

      if (!record) {
        return jsonError(req, res, 400, "INVALID_TOKEN", "Invalid or expired reset token");
      }
      if (record.used_at) {
        return jsonError(req, res, 400, "TOKEN_USED", "This reset link has already been used");
      }
      if (new Date(record.expires_at) <= new Date()) {
        return jsonError(req, res, 400, "TOKEN_EXPIRED", "This reset link has expired");
      }

      const passwordHash = await hashPassword(password);
      await updateOwnerPassword(record.owner_id, passwordHash);
      await markPasswordResetTokenUsed(record.id);

      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  }
);

// ⚠️ ROUTE ORDER MATTERS: literal paths must come before parameterized paths.
// customers/backfill, customers/summary, customers/export-csv BEFORE any customers/:id.

// POST /api/owner/customers/backfill — Owner session required
// Backfills store_customers from paid order history. Safe to re-run (upsert logic).
// Useful when a store had orders before the customers table existed, or after a data migration.
router.post("/customers/backfill", requireOwnerSession, async (req, res, next) => {
  try {
    const result = await _pool.query(
      `INSERT INTO store_customers
         (store_id, email, first_seen_at, last_seen_at, order_count, total_spent_cents)
       SELECT
         o.store_id,
         o.buyer_email,
         MIN(o.created_at),
         MAX(o.created_at),
         COUNT(*)::int,
         COALESCE(SUM(o.total_cents), 0)::bigint
       FROM orders o
       WHERE o.store_id = $1
         AND o.status = 'paid'
         AND o.buyer_email IS NOT NULL
       GROUP BY o.store_id, o.buyer_email
       ON CONFLICT (store_id, email) DO UPDATE SET
         order_count       = EXCLUDED.order_count,
         total_spent_cents = EXCLUDED.total_spent_cents,
         last_seen_at      = EXCLUDED.last_seen_at
       RETURNING email`,
      [req.ownerStoreId]
    );
    return res.json({ backfilled: result.rowCount });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/owner/customers/summary ─────────────────────────────────────────

router.get("/customers/summary", requireOwnerSession, async (req, res, next) => {
  try {
    const summary = await getCustomersSummary(req.ownerStoreId);
    return res.json(summary);
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/owner/customers ──────────────────────────────────────────────────

router.get("/customers", requireOwnerSession, async (req, res, next) => {
  try {
    const { search } = req.query;
    const customers = await listContactsUnified(req.ownerStoreId, { search });
    return res.json({ customers });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/owner/customers/export-csv ──────────────────────────────────────

router.get("/customers/export-csv", requireOwnerSession, async (req, res, next) => {
  try {
    const contacts = await listContactsUnified(req.ownerStoreId, {});
    const header = ["email", "display_name", "contact_type", "order_count", "total_spent", "marketing_opt_in", "first_seen", "last_seen"];
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = contacts.map((c) => [
      c.email,
      c.display_name ?? "",
      c.contact_type,
      c.order_count,
      (c.total_spent_cents / 100).toFixed(2),
      c.marketing_opt_in ? "yes" : "no",
      c.first_seen_at ? new Date(c.first_seen_at).toISOString() : "",
      c.last_seen_at  ? new Date(c.last_seen_at).toISOString()  : "",
    ]);
    const csv = [
      header.map(escape).join(","),
      ...rows.map((r) => r.map(escape).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"contacts.csv\"");
    return res.send(csv);
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/owner/products/:id/duplicate ────────────────────────────────────

router.post(
  "/products/:id/duplicate",
  requireOwnerSession,
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      const product = await duplicateProduct(req.params.id, req.ownerStoreId);
      if (!product) return jsonError(req, res, 404, "NOT_FOUND", "Product not found");
      return res.status(201).json({ product });
    } catch (err) {
      return next(err);
    }
  }
);

// ⚠️ ROUTE ORDER MATTERS: /blog/check-slug/:slug MUST come before /blog/:id
//    and /blog/new, otherwise Express would treat "check-slug" as a post UUID.

// ── GET /api/owner/blog/check-slug/:slug ─────────────────────────────────────

router.get(
  "/blog/check-slug/:slug",
  requireOwnerSession,
  async (req, res, next) => {
    try {
      const slug          = String(req.params.slug || "").toLowerCase();
      const excludePostId = req.query.exclude || null;
      const available     = await isSlugAvailable(req.ownerStoreId, slug, excludePostId);
      return res.json({ available });
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/owner/blog ───────────────────────────────────────────────────────

router.get("/blog", requireOwnerSession, async (req, res, next) => {
  try {
    const status = ["draft", "published"].includes(req.query.status) ? req.query.status : undefined;
    const limit  = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const data   = await listBlogPostsForOwner(req.ownerStoreId, { status, limit, offset });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
});

// ── Blog post Zod schemas ─────────────────────────────────────────────────────

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const createBlogPostSchema = z.object({
  title:               z.string().min(1).max(200),
  slug:                z.string().regex(slugPattern, "Slug must be lowercase alphanumeric with hyphens").max(100),
  body:                z.string().min(1),
  excerpt:             z.string().max(300).optional(),
  cover_image_url:     z.string().url().optional().or(z.literal("")),
  status:              z.enum(["draft", "published"]).optional(),
  seo_title:           z.string().max(70).optional(),
  seo_description:     z.string().max(160).optional(),
  featured_product_id: z.string().uuid().optional().nullable(),
  author_name:         z.string().max(100).optional(),
});

const updateBlogPostSchema = createBlogPostSchema.partial();

// ── POST /api/owner/blog ──────────────────────────────────────────────────────

router.post(
  "/blog",
  requireOwnerSession,
  validateBody(createBlogPostSchema),
  async (req, res, next) => {
    try {
      const { cover_image_url, ...rest } = req.validatedBody;
      // Treat empty string as null
      const data = { ...rest, cover_image_url: cover_image_url || null };

      // Check slug uniqueness
      const available = await isSlugAvailable(req.ownerStoreId, data.slug);
      if (!available) {
        return jsonError(req, res, 409, "SLUG_TAKEN", "A post with this slug already exists");
      }

      const post = await createBlogPost(req.ownerStoreId, data);
      return res.status(201).json({ post });
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/owner/blog/:id ───────────────────────────────────────────────────

router.get(
  "/blog/:id",
  requireOwnerSession,
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      const post = await getBlogPostById(req.ownerStoreId, req.params.id);
      if (!post) return jsonError(req, res, 404, "NOT_FOUND", "Blog post not found");
      return res.json({ post });
    } catch (err) {
      return next(err);
    }
  }
);

// ── PATCH /api/owner/blog/:id ─────────────────────────────────────────────────

router.patch(
  "/blog/:id",
  requireOwnerSession,
  requireUuidParam("id"),
  validateBody(updateBlogPostSchema),
  async (req, res, next) => {
    try {
      const { cover_image_url, ...rest } = req.validatedBody;
      const updates = { ...rest };
      if ("cover_image_url" in req.validatedBody) {
        updates.cover_image_url = cover_image_url || null;
      }

      // If slug is being changed, verify uniqueness
      if (updates.slug) {
        const available = await isSlugAvailable(req.ownerStoreId, updates.slug, req.params.id);
        if (!available) {
          return jsonError(req, res, 409, "SLUG_TAKEN", "A post with this slug already exists");
        }
      }

      const post = await updateBlogPost(req.ownerStoreId, req.params.id, updates);
      if (!post) return jsonError(req, res, 404, "NOT_FOUND", "Blog post not found");
      return res.json({ post });
    } catch (err) {
      return next(err);
    }
  }
);

// ── DELETE /api/owner/blog/:id ────────────────────────────────────────────────

router.delete(
  "/blog/:id",
  requireOwnerSession,
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      const deleted = await deleteBlogPost(req.ownerStoreId, req.params.id);
      if (!deleted) return jsonError(req, res, 404, "NOT_FOUND", "Blog post not found");
      return res.json({ deleted: true });
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/owner/complete-onboarding ──────────────────────────────────────

router.post("/complete-onboarding", requireOwnerSession, async (req, res, next) => {
  try {
    await setOnboardingCompleted(req.ownerStoreId);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// ⚠️ ROUTE ORDER MATTERS: literal sub-paths before parameterized paths.

// ── GET /api/owner/reviews ────────────────────────────────────────────────────

router.get("/reviews", requireOwnerSession, async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const reviews = await listStoreReviews(req.ownerStoreId, { limit, offset });
    return res.json({ reviews });
  } catch (err) {
    return next(err);
  }
});

// ── PATCH /api/owner/reviews/:id ─────────────────────────────────────────────

router.patch(
  "/reviews/:id",
  requireOwnerSession,
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      const isApproved = req.body?.is_approved;
      if (typeof isApproved !== "boolean") {
        return jsonError(req, res, 400, "BAD_REQUEST", "is_approved must be a boolean");
      }
      const review = await updateReviewApproval(req.ownerStoreId, req.params.id, isApproved);
      if (!review) return jsonError(req, res, 404, "NOT_FOUND", "Review not found");
      return res.json({ review });
    } catch (err) {
      return next(err);
    }
  }
);

// ── DELETE /api/owner/reviews/:id ────────────────────────────────────────────

router.delete(
  "/reviews/:id",
  requireOwnerSession,
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      const deleted = await deleteReview(req.ownerStoreId, req.params.id);
      if (!deleted) return jsonError(req, res, 404, "NOT_FOUND", "Review not found");
      return res.json({ deleted: true });
    } catch (err) {
      return next(err);
    }
  }
);

// ── Sales schemas ─────────────────────────────────────────────────────────────

const createSaleSchema = z.object({
  name:           z.string().min(1).max(100),
  discount_type:  z.enum(["percentage", "fixed"]),
  discount_value: z.number().positive(),
  starts_at:      z.string().datetime({ offset: true }).optional().nullable(),
  ends_at:        z.string().datetime({ offset: true }).optional().nullable(),
  apply_to:       z.enum(["all", "selected"]).optional(),
  product_ids:    z.array(z.string().uuid()).optional(),
  is_active:      z.boolean().optional(),
});

const updateSaleSchema = createSaleSchema.partial();

// ── GET /api/owner/sales ──────────────────────────────────────────────────────

router.get("/sales", requireOwnerSession, async (req, res, next) => {
  try {
    const sales = await listSales(req.ownerStoreId);
    return res.json({ sales });
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/owner/sales ─────────────────────────────────────────────────────

router.post(
  "/sales",
  requireOwnerSession,
  validateBody(createSaleSchema),
  async (req, res, next) => {
    try {
      const sale = await createSale(req.ownerStoreId, req.validatedBody);
      return res.status(201).json({ sale });
    } catch (err) {
      return next(err);
    }
  }
);

// ── PATCH /api/owner/sales/:id ────────────────────────────────────────────────

router.patch(
  "/sales/:id",
  requireOwnerSession,
  requireUuidParam("id"),
  validateBody(updateSaleSchema),
  async (req, res, next) => {
    try {
      const sale = await updateSale(req.ownerStoreId, req.params.id, req.validatedBody);
      if (!sale) return jsonError(req, res, 404, "NOT_FOUND", "Sale not found");
      return res.json({ sale });
    } catch (err) {
      return next(err);
    }
  }
);

// ── DELETE /api/owner/sales/:id ───────────────────────────────────────────────

router.delete(
  "/sales/:id",
  requireOwnerSession,
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      const deleted = await deleteSale(req.ownerStoreId, req.params.id);
      if (!deleted) return jsonError(req, res, 404, "NOT_FOUND", "Sale not found");
      return res.json({ deleted: true });
    } catch (err) {
      return next(err);
    }
  }
);

// ⚠️ ROUTE ORDER MATTERS: /subscribers/count and /subscribers/export-csv before /subscribers/:id

// ── GET /api/owner/subscribers ────────────────────────────────────────────────

router.get("/subscribers", requireOwnerSession, async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const subscribers = await listSubscribers(req.ownerStoreId, { limit, offset });
    return res.json({ subscribers });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/owner/subscribers/count ─────────────────────────────────────────

router.get("/subscribers/count", requireOwnerSession, async (req, res, next) => {
  try {
    const count = await countSubscribers(req.ownerStoreId);
    return res.json({ count });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/owner/subscribers/export-csv ────────────────────────────────────

router.get("/subscribers/export-csv", requireOwnerSession, async (req, res, next) => {
  try {
    const subscribers = await listSubscribers(req.ownerStoreId, { limit: 10000, offset: 0 });
    const header = ["email", "first_name", "subscribed_at", "is_active"];
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = subscribers.map((s) => [
      s.email,
      s.first_name ?? "",
      new Date(s.subscribed_at).toISOString(),
      s.is_active ? "true" : "false",
    ]);
    const csv = [
      header.map(escape).join(","),
      ...rows.map((r) => r.map(escape).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"subscribers.csv\"");
    return res.send(csv);
  } catch (err) {
    return next(err);
  }
});

// ── DELETE /api/owner/subscribers/:id ────────────────────────────────────────

router.delete(
  "/subscribers/:id",
  requireOwnerSession,
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      const deleted = await deleteSubscriber(req.ownerStoreId, req.params.id);
      if (!deleted) return jsonError(req, res, 404, "NOT_FOUND", "Subscriber not found");
      return res.json({ deleted: true });
    } catch (err) {
      return next(err);
    }
  }
);

// ── Campaign Zod schemas ──────────────────────────────────────────────────────

const createCampaignSchema = z.object({
  subject:      z.string().min(1).max(200),
  preview_text: z.string().max(200).optional(),
  body_html:    z.string().min(1),
  body_text:    z.string().optional(),
});

const updateCampaignSchema = createCampaignSchema.partial();

// ── GET /api/owner/campaigns ──────────────────────────────────────────────────

router.get("/campaigns", requireOwnerSession, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || "50", 10), 200);
    const offset = Math.max(parseInt(req.query.offset || "0",  10), 0);
    const result = await listCampaigns(req.ownerStoreId, { limit, offset });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/owner/campaigns ─────────────────────────────────────────────────

router.post(
  "/campaigns",
  requireOwnerSession,
  validateBody(createCampaignSchema),
  async (req, res, next) => {
    try {
      const campaign = await createCampaign(req.ownerStoreId, req.validatedBody);
      return res.status(201).json(campaign);
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/owner/campaigns/:id ──────────────────────────────────────────────

router.get(
  "/campaigns/:id",
  requireOwnerSession,
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      const campaign = await getCampaignById(req.ownerStoreId, req.params.id);
      if (!campaign) return jsonError(req, res, 404, "NOT_FOUND", "Campaign not found");
      return res.json(campaign);
    } catch (err) {
      return next(err);
    }
  }
);

// ── PATCH /api/owner/campaigns/:id ───────────────────────────────────────────

router.patch(
  "/campaigns/:id",
  requireOwnerSession,
  requireUuidParam("id"),
  validateBody(updateCampaignSchema),
  async (req, res, next) => {
    try {
      const campaign = await updateCampaign(req.ownerStoreId, req.params.id, req.validatedBody);
      if (!campaign) return jsonError(req, res, 404, "NOT_FOUND", "Campaign not found");
      return res.json(campaign);
    } catch (err) {
      if (err.statusCode) return jsonError(req, res, err.statusCode, "CONFLICT", err.message);
      return next(err);
    }
  }
);

// ── DELETE /api/owner/campaigns/:id ──────────────────────────────────────────

router.delete(
  "/campaigns/:id",
  requireOwnerSession,
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      const result = await deleteCampaign(req.ownerStoreId, req.params.id);
      if (!result.deleted) {
        const status = result.reason === "NOT_FOUND" ? 404 : 409;
        const code   = result.reason === "NOT_FOUND" ? "NOT_FOUND" : "INVALID_STATUS";
        const msg    = result.reason === "NOT_FOUND"
          ? "Campaign not found"
          : "Only draft or failed campaigns can be deleted";
        return jsonError(req, res, status, code, msg);
      }
      return res.json({ deleted: true });
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/owner/campaigns/:id/send ───────────────────────────────────────

router.post(
  "/campaigns/:id/send",
  requireOwnerSession,
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      const campaign = await getCampaignById(req.ownerStoreId, req.params.id);
      if (!campaign) return jsonError(req, res, 404, "NOT_FOUND", "Campaign not found");
      if (!["draft"].includes(campaign.status)) {
        return jsonError(req, res, 409, "INVALID_STATUS", "Only draft campaigns can be sent");
      }

      // Fire-and-forget — send runs async, endpoint returns immediately
      sendCampaign(req.ownerStoreId, campaign.id).catch((err) => {
        console.error("sendCampaign background error", { campaignId: campaign.id, err: err.message });
      });

      return res.json({ ok: true, message: "Campaign is being sent" });
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/owner/campaigns/:id/stats ───────────────────────────────────────

router.get(
  "/campaigns/:id/stats",
  requireOwnerSession,
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      const stats = await getCampaignStats(req.ownerStoreId, req.params.id);
      if (!stats) return jsonError(req, res, 404, "NOT_FOUND", "Campaign not found");
      return res.json(stats);
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/owner/campaigns/:id/duplicate ───────────────────────────────────

router.post(
  "/campaigns/:id/duplicate",
  requireOwnerSession,
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      const campaign = await duplicateCampaign(req.ownerStoreId, req.params.id);
      if (!campaign) return jsonError(req, res, 404, "NOT_FOUND", "Campaign not found");
      return res.status(201).json(campaign);
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/owner/campaigns/:id/preview ────────────────────────────────────

router.post(
  "/campaigns/:id/preview",
  requireOwnerSession,
  requireUuidParam("id"),
  async (req, res, next) => {
    try {
      const campaign = await getCampaignById(req.ownerStoreId, req.params.id);
      if (!campaign) return jsonError(req, res, 404, "NOT_FOUND", "Campaign not found");

      const { sendEmail } = require("../lib/mailer");

      const to = req.body?.to;
      if (!to || typeof to !== "string") {
        return jsonError(req, res, 400, "BAD_REQUEST", "body.to (email address) is required");
      }

      const store = await getStoreSettings(req.ownerStoreId);
      const accent    = store?.primary_color  || "#0d6efd";
      const storeName = store?.name          || "Your Store";
      const logoUrl   = store?.logo_url      || null;
      const logoHtml  = logoUrl
        ? `<img src="${logoUrl}" alt="${storeName}" style="height:36px;object-fit:contain;display:block;margin-bottom:12px" />`
        : "";

      const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
        <tr><td style="background:${accent};height:4px"></td></tr>
        <tr><td style="padding:28px 32px 16px">${logoHtml}<span style="font-size:18px;font-weight:700;color:#111827">${storeName}</span></td></tr>
        <tr><td style="padding:0 32px 28px;font-size:15px;color:#374151;line-height:1.7">${campaign.body_html}</td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;background:#fafafa">
          <p style="margin:0;font-size:12px;color:#9ca3af">This is a preview email sent by ${storeName}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const text = (campaign.body_text || campaign.body_html.replace(/<[^>]+>/g, "")).trim();

      await sendEmail({ to, subject: `[PREVIEW] ${campaign.subject}`, text, html });
      return res.json({ ok: true, sent_to: to });
    } catch (err) {
      return next(err);
    }
  }
);

// ── Domain helpers ────────────────────────────────────────────────────────────

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function normalizeDomain(raw) {
  let d = String(raw || "").trim().toLowerCase();
  // Strip protocol
  d = d.replace(/^https?:\/\//i, "");
  // Strip path/query/fragment
  d = d.split("/")[0];
  // Strip port
  d = d.split(":")[0];
  // Strip www. prefix
  if (d.startsWith("www.")) d = d.slice(4);
  return d;
}

function buildDnsInstructions(domain, verificationToken) {
  return {
    cname_target: CNAME_TARGET,
    txt_host:     `_dsp-verify.${domain}`,
    txt_value:    verificationToken,
  };
}

// ── GET /api/owner/domain ─────────────────────────────────────────────────────

router.get("/domain", requireOwnerSession, async (req, res, next) => {
  try {
    const row = await getDomainByStoreId(req.ownerStoreId);
    if (!row) return res.json({ domain: null });
    return res.json({
      domain: row,
      dns_instructions: buildDnsInstructions(row.domain, row.verification_token),
    });
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/owner/domain ────────────────────────────────────────────────────

const addDomainSchema = z.object({
  domain: z.string().min(1).max(253),
});

router.post(
  "/domain",
  requireOwnerSession,
  validateBody(addDomainSchema),
  async (req, res, next) => {
    try {
      const raw = req.validatedBody.domain;
      const domain = normalizeDomain(raw);

      // Validate format
      if (!DOMAIN_RE.test(domain)) {
        return jsonError(req, res, 400, "INVALID_DOMAIN", "Domain format is invalid. Use a hostname like store.yourdomain.com");
      }

      // Reject reserved / platform domains
      const platformDomain = (process.env.PLATFORM_DOMAIN || "").trim().toLowerCase();
      const reservedList = ["localhost", "127.0.0.1", "::1"];
      if (reservedList.includes(domain)) {
        return jsonError(req, res, 400, "RESERVED_DOMAIN", "This domain cannot be used");
      }
      if (platformDomain && (domain === platformDomain || domain.endsWith(`.${platformDomain}`))) {
        return jsonError(req, res, 400, "RESERVED_DOMAIN", "Platform domains cannot be used as custom domains");
      }

      // Check if another store already owns this domain
      const taken = await isDomainTaken(domain, req.ownerStoreId);
      if (taken) {
        return jsonError(req, res, 409, "DOMAIN_TAKEN", "This domain is already connected to another store");
      }

      // Check if the store already has an active/pending/verified domain
      const existing = await getDomainByStoreId(req.ownerStoreId);
      if (existing) {
        return jsonError(req, res, 400, "DOMAIN_EXISTS", "You already have a domain configured. Remove it first to add a new one.");
      }

      const verificationToken = require("crypto").randomBytes(16).toString("hex");
      const row = await addCustomDomain(req.ownerStoreId, { domain, verificationToken });

      return res.status(201).json({
        domain: row,
        dns_instructions: buildDnsInstructions(domain, verificationToken),
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/owner/domain/verify ─────────────────────────────────────────────

router.post("/domain/verify", requireOwnerSession, async (req, res, next) => {
  try {
    const row = await getDomainByStoreId(req.ownerStoreId);
    if (!row) return jsonError(req, res, 404, "NOT_FOUND", "No domain configured for this store");

    const checks = await verifyDomain(row.domain, row.verification_token);
    const now = new Date();

    if (checks.cname_valid && checks.txt_valid) {
      await updateDomainStatus(row.id, {
        status:       "active",
        dnsVerifiedAt: now,
        lastCheckAt:  now,
        lastCheckError: null,
      });
      return res.json({ verified: true, domain: row.domain, status: "active", checks });
    }

    // Build a human-readable error summary
    const errors = [];
    if (!checks.cname_valid) {
      errors.push(
        checks.cname_value
          ? `CNAME/A record found (${checks.cname_value}) but not pointing to ${CNAME_TARGET}.`
          : `CNAME record not found or not pointing to ${CNAME_TARGET}. DNS changes can take up to 48 hours to propagate.`
      );
    }
    if (!checks.txt_valid) {
      errors.push(
        `Verification TXT record not found. Make sure you added a TXT record at _dsp-verify.${row.domain} with the value shown above.`
      );
    }

    await updateDomainStatus(row.id, {
      lastCheckAt:   now,
      lastCheckError: errors.join(" | "),
    });

    return res.json({
      verified: false,
      domain:   row.domain,
      status:   row.status,
      checks,
      errors,
    });
  } catch (err) {
    return next(err);
  }
});

// ── DELETE /api/owner/domain ──────────────────────────────────────────────────

router.delete("/domain", requireOwnerSession, async (req, res, next) => {
  try {
    const row = await getDomainByStoreId(req.ownerStoreId);
    if (!row) return jsonError(req, res, 404, "NOT_FOUND", "No domain configured for this store");
    await deleteCustomDomain(req.ownerStoreId, row.id);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = { ownerRouter: router };
