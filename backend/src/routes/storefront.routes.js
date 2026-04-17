"use strict";

// Routes: storefront (slug-based)
// Public storefront endpoints accessed via /api/store/:subdomain/*.
// These are slug-in-URL routes — the store is identified by the :subdomain param.
// Route order is important here: /blog and /blog/recent must come before /blog/:postSlug.
// Side effects: POST /track writes page view analytics (fire-and-forget, never fails the response).

const express = require("express");
const crypto  = require("crypto");
const {
  getEnabledStoreMetaBySlug,
  listPublicProductsByStoreSlug,
  getPublicProductBySlugAndId,
} = require("../db/queries/storefront.queries");
const { recordPageView } = require("../db/queries/pageviews.queries");
const { getReviewByToken, submitReview, listProductReviews } = require("../db/queries/reviews.queries");
const { listPublishedPosts, getPublishedPostBySlug, getRecentPublishedPosts } = require("../db/queries/blog.queries");
const { getActiveSale } = require("../db/queries/sales.queries");
const { upsertSubscriber, getSubscriberByToken, unsubscribeByToken } = require("../db/queries/subscribers.queries");
const { pool } = require("../db/pool");

const { requireSlugParam } = require("../middleware/storefront.middleware");
const { requireUuidParam } = require("../middleware/validate.middleware");

const router = express.Router();

// ── Referrer classification ────────────────────────────────────────────────────

function classifyReferrer(referrer) {
  if (!referrer) return "direct";
  const r = referrer.toLowerCase();
  if (/google|bing|yahoo|duckduckgo|baidu/.test(r))                                   return "search";
  if (/facebook|instagram|twitter|x\.com|tiktok|youtube|linkedin|pinterest|reddit/.test(r)) return "social";
  if (/mail|gmail|outlook/.test(r))                                                    return "email";
  if (/gclid|fbclid|utm_medium=cpc|utm_source=ads/.test(r))                           return "ads";
  return "referral";
}

// POST /api/store/:slug/track — Public
// Records a page view for analytics. Responds 200 immediately before any DB work
// so tracking can never slow down or fail the storefront. All errors are swallowed.
// Side effect: inserts into page_views.
router.post(
  "/store/:subdomain/track",
  requireSlugParam("subdomain"),
  async (req, res) => {
    // Always respond 200 immediately — tracking must never block or fail the storefront
    res.json({ ok: true });

    try {
      const slug = req.storeSlug;

      // Resolve store_id
      const store = await getEnabledStoreMetaBySlug(slug);
      if (!store) return;

      const { page_type, product_id, referrer, visitor_id } = req.body ?? {};
      const validPageType = ["storefront", "product"].includes(page_type) ? page_type : "storefront";

      // Country from deployment-platform headers (Cloudflare, Vercel, etc.)
      // x-test-country is sent by the frontend in dev mode for testing
      const ipCountry = (
        req.headers["cf-ipcountry"] ||
        req.headers["x-vercel-ip-country"] ||
        req.headers["x-country-code"] ||
        req.headers["x-test-country"] ||
        null
      );
      if (ipCountry === "XX") return; // Cloudflare sends XX for unknown

      // Derive visitor_id: use client-supplied one, or hash IP+UA
      const effectiveVisitorId = visitor_id
        || crypto.createHash("sha256")
            .update(`${req.ip}:${req.headers["user-agent"] || ""}`)
            .digest("hex")
            .slice(0, 16);

      await recordPageView(store.id, {
        productId:      product_id || null,
        pageType:       validPageType,
        visitorId:      effectiveVisitorId,
        ipCountry:      typeof ipCountry === "string" ? ipCountry.slice(0, 2).toUpperCase() : null,
        referrer:       typeof referrer  === "string" ? referrer.slice(0, 512)  : null,
        referrerSource: classifyReferrer(referrer),
        userAgent:      (req.headers["user-agent"] || "").slice(0, 256),
      });
    } catch {
      // Never let tracking errors surface
    }
  }
);

// GET /api/store/:subdomain/meta — Public
// Returns public store branding/settings. Only returned if the store is enabled.
router.get(
  "/store/:subdomain/meta",
  requireSlugParam("subdomain"),
  async (req, res, next) => {
    try {
      const slug = req.storeSlug;

      const store = await getEnabledStoreMetaBySlug(slug);
      if (!store) {
        return res.status(404).json({
          error: true,
          code: "NOT_FOUND",
          message: "Store not found",
          path: req.originalUrl,
        });
      }

      return res.json({ store });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/store/:subdomain/products — Public
// Returns the store's published products. delivery_url is excluded from the response.
router.get(
  "/store/:subdomain/products",
  requireSlugParam("subdomain"),
  async (req, res, next) => {
    try {
      const slug = req.storeSlug;

      const store = await getEnabledStoreMetaBySlug(slug);
      if (!store) {
        return res.status(404).json({
          error: true,
          code: "NOT_FOUND",
          message: "Store not found",
          path: req.originalUrl,
        });
      }

      const products = await listPublicProductsByStoreSlug(slug);
      return res.json({ products });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/store/:subdomain/products/:productId — Public
// Returns a single product (published or unlisted). Never returns delivery_url.
router.get(
  "/store/:subdomain/products/:productId",
  requireSlugParam("subdomain"),
  requireUuidParam("productId"),
  async (req, res, next) => {
    try {
      const slug = req.storeSlug;
      const { productId } = req.params;

      const product = await getPublicProductBySlugAndId(slug, productId);
      if (!product) {
        return res.status(404).json({
          error: true,
          code: "NOT_FOUND",
          message: "Product not found",
          path: req.originalUrl,
        });
      }

      return res.json({ product });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/store/:subdomain/active-sale — Public
// Returns the currently active sale for the store, or null if none.

router.get(
  "/store/:subdomain/active-sale",
  requireSlugParam("subdomain"),
  async (req, res, next) => {
    try {
      const store = await getEnabledStoreMetaBySlug(req.storeSlug);
      if (!store) {
        return res.status(404).json({ error: true, code: "NOT_FOUND", message: "Store not found", path: req.originalUrl });
      }
      const sale = await getActiveSale(store.id);
      return res.json({ sale: sale ?? null });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/store/:subdomain/products/:productId/reviews — Public
// Returns paginated approved reviews for a product.

router.get(
  "/store/:subdomain/products/:productId/reviews",
  requireSlugParam("subdomain"),
  requireUuidParam("productId"),
  async (req, res, next) => {
    try {
      const limit  = Math.min(Number(req.query.limit) || 20, 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const reviews = await listProductReviews(req.params.productId, { limit, offset });
      return res.json({ reviews });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/review/:token — Public
// Loads a review prompt by its one-time token (sent in the fulfillment email).

router.get("/review/:token", async (req, res, next) => {
  try {
    const review = await getReviewByToken(req.params.token);
    if (!review) {
      return res.status(404).json({ error: true, code: "NOT_FOUND", message: "Review link not found or already used", path: req.originalUrl });
    }
    return res.json({ review });
  } catch (err) {
    return next(err);
  }
});

// POST /api/review/:token — Public
// Submits a rating + optional text for a product. Token is consumed on first use (409 if reused).

router.post("/review/:token", async (req, res, next) => {
  try {
    const { rating, body } = req.body ?? {};
    const r = parseInt(rating, 10);
    if (!r || r < 1 || r > 5) {
      return res.status(400).json({ error: true, code: "BAD_REQUEST", message: "rating must be 1-5", path: req.originalUrl });
    }
    const review = await submitReview(req.params.token, { rating: r, body: body || null });
    if (!review) {
      return res.status(409).json({ error: true, code: "CONFLICT", message: "Review already submitted or token invalid", path: req.originalUrl });
    }
    return res.json({ ok: true, review });
  } catch (err) {
    return next(err);
  }
});

// POST /api/store/:subdomain/subscribe — Public
// Subscribes an email to the store's mailing list. Returns 201 on new, 200 if already subscribed.

router.post(
  "/store/:subdomain/subscribe",
  requireSlugParam("subdomain"),
  async (req, res, next) => {
    try {
      const { email, first_name } = req.body ?? {};
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return res.status(400).json({ error: true, code: "BAD_REQUEST", message: "Valid email required", path: req.originalUrl });
      }
      const store = await getEnabledStoreMetaBySlug(req.storeSlug);
      if (!store) {
        return res.status(404).json({ error: true, code: "NOT_FOUND", message: "Store not found", path: req.originalUrl });
      }
      const { isNew } = await upsertSubscriber(store.id, { email, first_name });
      return res.status(isNew ? 201 : 200).json({ ok: true, already_subscribed: !isNew });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/store/:subdomain/check-email-optin — Public
// Checks whether an email has marketing_opt_in=true in store_customers.
// Always returns { opted_in: false } on any error — never fails the UI.

router.post(
  "/store/:subdomain/check-email-optin",
  requireSlugParam("subdomain"),
  async (req, res) => {
    try {
      const { email } = req.body ?? {};
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return res.json({ opted_in: false });
      }
      const store = await getEnabledStoreMetaBySlug(req.storeSlug);
      if (!store) return res.json({ opted_in: false });

      const result = await pool.query(
        `SELECT marketing_opt_in FROM store_customers
         WHERE store_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1`,
        [store.id, email.trim()]
      );
      return res.json({ opted_in: result.rows[0]?.marketing_opt_in || false });
    } catch {
      return res.json({ opted_in: false });
    }
  }
);

// GET /api/unsubscribe/:token — Public
// Loads unsubscribe page data (email, store name, current status) for the unsubscribe confirmation UI.

router.get("/unsubscribe/:token", async (req, res, next) => {
  try {
    const sub = await getSubscriberByToken(req.params.token);
    if (!sub) {
      return res.status(404).json({ error: true, code: "NOT_FOUND", message: "Unsubscribe link not found", path: req.originalUrl });
    }
    return res.json({ subscriber: { email: sub.email, store_name: sub.store_name, is_active: sub.is_active } });
  } catch (err) {
    return next(err);
  }
});

// GET /api/store/:subdomain/blog — Public
// Returns paginated published blog posts. Route must remain before /blog/:postSlug to avoid
// Express treating "blog" as a :postSlug value in a hypothetical /store/:subdomain/:param route.

router.get(
  "/store/:subdomain/blog",
  requireSlugParam("subdomain"),
  async (req, res, next) => {
    try {
      const store = await getEnabledStoreMetaBySlug(req.storeSlug);
      if (!store) {
        return res.status(404).json({ error: true, code: "NOT_FOUND", message: "Store not found", path: req.originalUrl });
      }
      const limit  = Math.min(Number(req.query.limit) || 10, 50);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const data   = await listPublishedPosts(store.id, { limit, offset });
      return res.json(data);
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/store/:subdomain/blog/recent — Public
// Returns the N most recent published posts (default 3, max 10). Used for sidebar/widget.

router.get(
  "/store/:subdomain/blog/recent",
  requireSlugParam("subdomain"),
  async (req, res, next) => {
    try {
      const store = await getEnabledStoreMetaBySlug(req.storeSlug);
      if (!store) {
        return res.status(404).json({ error: true, code: "NOT_FOUND", message: "Store not found", path: req.originalUrl });
      }
      const limit = Math.min(Number(req.query.limit) || 3, 10);
      const posts = await getRecentPublishedPosts(store.id, limit);
      return res.json({ posts });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/store/:subdomain/blog/:postSlug — Public
// Returns a single published blog post by its URL slug.

router.get(
  "/store/:subdomain/blog/:postSlug",
  requireSlugParam("subdomain"),
  async (req, res, next) => {
    try {
      const store = await getEnabledStoreMetaBySlug(req.storeSlug);
      if (!store) {
        return res.status(404).json({ error: true, code: "NOT_FOUND", message: "Store not found", path: req.originalUrl });
      }
      const post = await getPublishedPostBySlug(store.id, req.params.postSlug);
      if (!post) {
        return res.status(404).json({ error: true, code: "NOT_FOUND", message: "Post not found", path: req.originalUrl });
      }
      return res.json({ post });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/unsubscribe/:token — Public
// Confirms the unsubscribe and marks the subscriber as inactive.

router.post("/unsubscribe/:token", async (req, res, next) => {
  try {
    const sub = await unsubscribeByToken(req.params.token);
    if (!sub) {
      return res.status(404).json({ error: true, code: "NOT_FOUND", message: "Unsubscribe link not found", path: req.originalUrl });
    }
    return res.json({ ok: true, unsubscribed: sub.email });
  } catch (err) {
    return next(err);
  }
});

module.exports = { storefrontRouter: router };
