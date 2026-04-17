"use strict";

// Middleware: requireSlugParam + requireTenantSlug
// Two complementary slug-extraction middlewares for the two routing strategies:
//   requireSlugParam  — for slug-in-URL routes like /store/:subdomain/*
//   requireTenantSlug — for Host-based routes like /storefront/* where the slug comes from the subdomain
// Both attach req.storeSlug on success. Both reject reserved slugs (api, www, admin, etc.).

const {
    RESERVED_TENANT_SLUGS,
    isValidTenantSlug,
  } = require("../config/tenancy.constants");

// Validates the named URL param as a store slug and attaches req.storeSlug.
// Rejects empty, malformed, or reserved slugs with 400 before any DB call is made.
function requireSlugParam(paramName) {
  return (req, res, next) => {
    const slug = String(req.params?.[paramName] || "").trim().toLowerCase();

    if (!isValidTenantSlug(slug) || RESERVED_TENANT_SLUGS.has(slug)) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: `Invalid ${paramName}`,
        path: req.originalUrl,
        request_id: req.id || null,
      });
    }

    req.storeSlug = slug;
    return next();
  };
}

// Reads req.tenant (set by tenantResolver) and validates it as a store slug.
// tenantResolver sets: null (no subdomain), { reserved, raw } (reserved slug), or { slug } (valid).
// We do a double-check against the reserved list here because the tenant middleware is shared
// across all routes and we want each consumer to enforce its own access rules.
function requireTenantSlug(req, res, next) {
    // tenantResolver sets:
    // - null when no subdomain
    // - { slug:null, reserved:true, raw } when reserved
    // - { slug } when valid-looking subdomain exists
    if (!req.tenant) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: "Missing tenant subdomain",
        path: req.originalUrl,
        request_id: req.id || null,
      });
    }
  
    if (req.tenant.reserved === true) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: "Reserved subdomain cannot be used as store",
        path: req.originalUrl,
        request_id: req.id || null,
      });
    }
  
    const raw = String(req.tenant?.slug || "").trim().toLowerCase();
    if (!raw) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: "Missing tenant subdomain",
        path: req.originalUrl,
        request_id: req.id || null,
      });
    }
  
    if (!isValidTenantSlug(raw)) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: "Invalid tenant subdomain",
        path: req.originalUrl,
        request_id: req.id || null,
      });
    }
  
    if (RESERVED_TENANT_SLUGS.has(raw)) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: "Reserved subdomain cannot be used as store",
        path: req.originalUrl,
        request_id: req.id || null,
      });
    }
  
    req.storeSlug = raw;
    return next();
}

module.exports = { requireSlugParam, requireTenantSlug };
