"use strict";

const rateLimit = require("express-rate-limit");

// express-rate-limit v7 helper (IPv6-safe). Falls back for older versions.
const ipKeyGenerator =
  typeof rateLimit.ipKeyGenerator === "function"
    ? rateLimit.ipKeyGenerator
    : (req) => req.ip || "unknown";

function getTenantId(req) {
  return String(
    (req.tenant && req.tenant.slug) ||
      (req.params && req.params.slug) ||
      (req.params && req.params.storeId) ||
      "public"
  )
    .trim()
    .toLowerCase();
}

function tenantKey(req /*, res */) {
  // IMPORTANT: use ipKeyGenerator(req) (IPv6-safe) instead of req.ip directly
  const ip = ipKeyGenerator(req);
  const tenant = getTenantId(req);
  return `${ip}:${tenant}`;
}

function isTrue(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .match(/^(1|true|yes|on)$/);
}

function json429(req, message) {
  return {
    error: true,
    code: "RATE_LIMITED",
    message: message || "Too many requests",
    path: req.originalUrl,
  };
}

// ---- Env knobs ----
// General public traffic (meta/products)
const RL_PUBLIC_DISABLED = isTrue(process.env.RL_PUBLIC_DISABLED);
const RL_PUBLIC_WINDOW_MS = Number(process.env.RL_PUBLIC_WINDOW_MS) || 60_000;
const RL_PUBLIC_MAX = Number(process.env.RL_PUBLIC_MAX) || 300;

// Checkout / order creation (stricter)
const RL_CHECKOUT_DISABLED = isTrue(process.env.RL_CHECKOUT_DISABLED);
const RL_CHECKOUT_WINDOW_MS = Number(process.env.RL_CHECKOUT_WINDOW_MS) || 60_000;
const RL_CHECKOUT_MAX = Number(process.env.RL_CHECKOUT_MAX) || 30;

const noop = (req, res, next) => next();

const publicLimiter = RL_PUBLIC_DISABLED
  ? noop
  : rateLimit({
      windowMs: RL_PUBLIC_WINDOW_MS,
      max: RL_PUBLIC_MAX,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      keyGenerator: tenantKey,
      skip: (req) => {
        // Always skip preflight
        if (req.method === "OPTIONS") return true;

        // Avoid double-limiting checkout endpoints that have checkoutLimiter
        const p = req.path || "";
        if (p.endsWith("/orders")) return true;

        return false;
      },
      handler: (req, res) => res.status(429).json(json429(req, "Too many requests")),
    });

const checkoutLimiter = RL_CHECKOUT_DISABLED
  ? noop
  : rateLimit({
      windowMs: RL_CHECKOUT_WINDOW_MS,
      max: RL_CHECKOUT_MAX,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      keyGenerator: tenantKey,
      skip: (req) => req.method === "OPTIONS",
      handler: (req, res) =>
        res.status(429).json(json429(req, "Too many checkout attempts. Try again later.")),
    });

module.exports = { publicLimiter, checkoutLimiter };
