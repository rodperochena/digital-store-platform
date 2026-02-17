"use strict";

const SLUG_REGEX = /^[a-z0-9-]{2,63}$/;

// Reserved hostnames that must NEVER map to a tenant store.
const RESERVED_SLUGS = new Set(["api", "www", "admin"]);

function isValidSlug(slug) {
  return SLUG_REGEX.test(slug);
}

/**
 * Validates a route param slug (e.g., /store/:subdomain/*)
 * and attaches req.storeSlug.
 */
function requireSlugParam(paramName) {
  return (req, res, next) => {
    const slug = String(req.params?.[paramName] || "").trim().toLowerCase();

    if (!isValidSlug(slug) || RESERVED_SLUGS.has(slug)) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: `Invalid ${paramName}`,
        path: req.originalUrl,
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
    const raw = String(req.tenant?.slug || "").trim().toLowerCase();
  
    // If tenantResolver intentionally set null (reserved), raw will be ""
    if (!raw) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: "Missing tenant subdomain",
        path: req.originalUrl,
      });
    }
  
    if (!isValidSlug(raw)) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: "Invalid tenant subdomain",
        path: req.originalUrl,
      });
    }
  
    if (RESERVED_SLUGS.has(raw)) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: "Reserved subdomain cannot be used as store",
        path: req.originalUrl,
      });
    }
  
    req.storeSlug = raw;
    return next();
}
  
module.exports = { requireSlugParam, requireTenantSlug, RESERVED_SLUGS };
