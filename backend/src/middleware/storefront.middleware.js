"use strict";

const {
    RESERVED_TENANT_SLUGS,
    isValidTenantSlug,
  } = require("../config/tenancy.constants");  

/**
 * Validates a route param slug (e.g., /store/:subdomain/*)
 * and attaches req.storeSlug.
 */
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

/**
 * Requires req.tenant.slug (from Host-based routing) and attaches req.storeSlug.
 */
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
