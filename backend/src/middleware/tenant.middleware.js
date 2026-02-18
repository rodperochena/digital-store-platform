"use strict";

/**
 * Extracts tenant slug from the Host header subdomain.
 *
 * Examples (with TENANCY_BASE_DOMAIN):
 * - base=localhost: demo.localhost -> "demo"
 * - base=example.com: demo.example.com -> "demo"
 * - example.com -> null (no tenant)
 * - foo.bar.example.com -> null (strict)
 *
 * Notes:
 * - In local dev, simulate via: curl -H "Host: demo.localhost" ...
 * - We ignore port (e.g., localhost:5051).
 */

const { RESERVED_TENANT_SLUGS } = require("../config/tenancy.constants");

const TENANCY_BASE_DOMAIN = String(process.env.TENANCY_BASE_DOMAIN || "")
  .trim()
  .toLowerCase();

function extractSubdomainFromHost(hostHeader) {
  if (!hostHeader) return null;

  // Remove port
  const host = String(hostHeader).split(":")[0].toLowerCase();

  // If it's an IPv4/IPv6 literal, no subdomain concept here
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes("]")) return null;

  // If a base domain is configured, only accept hosts that end with it.
  if (TENANCY_BASE_DOMAIN) {
    const base = TENANCY_BASE_DOMAIN;

    if (host === base) return null;

    const suffix = `.${base}`;
    if (!host.endsWith(suffix)) return null;

    const prefix = host.slice(0, -suffix.length);
    if (!prefix) return null;

    // Strict: only a single label allowed before the base domain
    if (prefix.includes(".")) return null;

    return prefix;
  }

  // Fallback (no base domain configured):
  // Only treat as a tenant if there are 3+ labels (prevents example.com -> "example").
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 3) return null;

  return parts[0] || null;
}

/**
 * Middleware that sets req.tenant = { slug } if present.
 * It does NOT validate existence in DB (routes will do that).
 *
 * Behavior:
 * - If no tenant: req.tenant = null
 * - If reserved tenant: req.tenant = { slug:null, reserved:true, raw }
 * - Else: req.tenant = { slug }
 */
function tenantResolver(req, res, next) {
  const host = req.headers.host;
  const slug = extractSubdomainFromHost(host);

  if (!slug) {
    req.tenant = null;
    return next();
  }

  if (RESERVED_TENANT_SLUGS.has(slug)) {
    req.tenant = { slug: null, reserved: true, raw: slug };
    return next();
  }

  req.tenant = { slug };
  return next();
}

module.exports = { tenantResolver, extractSubdomainFromHost };