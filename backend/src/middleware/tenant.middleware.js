"use strict";

const { RESERVED_TENANT_SLUGS } = require("../config/tenancy.constants");

const TENANCY_BASE_DOMAIN = String(process.env.TENANCY_BASE_DOMAIN || "")
  .trim()
  .toLowerCase();

// Keep consistent with your store slug rules (you mentioned: lowercase letters, numbers, hyphens)
const TENANT_SLUG_RE = /^[a-z0-9-]+$/;

function stripPort(hostHeader) {
  if (!hostHeader) return "";

  const raw = String(hostHeader).trim().toLowerCase();
  if (!raw) return "";

  // IPv6 literal format: [::1]:5051
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    if (end === -1) return "";
    return raw.slice(0, end + 1); // keep [::1]
  }

  // Normal host:port
  return raw.split(":")[0].trim();
}

function isIpLiteral(host) {
  if (!host) return false;

  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;

  // IPv6 literal comes like "[::1]"
  if (host.startsWith("[") && host.endsWith("]")) return true;

  return false;
}

function extractSubdomainFromHost(hostHeader) {
  if (!hostHeader) return null;

  const host = stripPort(hostHeader);
  if (!host) return null;

  // If it's an IPv4/IPv6 literal, no subdomain concept here
  if (isIpLiteral(host)) return null;

  // If a base domain is configured, only accept hosts that end with it.
  // Strict: only one label allowed before the base domain.
  if (TENANCY_BASE_DOMAIN) {
    const base = TENANCY_BASE_DOMAIN;

    if (host === base) return null;

    const suffix = `.${base}`;
    if (!host.endsWith(suffix)) return null;

    const prefix = host.slice(0, -suffix.length);
    if (!prefix) return null;

    // Strict: only a single label allowed before the base domain
    if (prefix.includes(".")) return null;

    // Enforce slug format
    if (!TENANT_SLUG_RE.test(prefix)) return null;

    return prefix;
  }

  // Fallback (no base domain configured):
  // Require 3+ labels so "example.com" does not map to tenant "example".
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 3) return null;

  const candidate = parts[0] || null;
  if (!candidate) return null;

  if (!TENANT_SLUG_RE.test(candidate)) return null;

  return candidate;
}

/**
 * Middleware that sets req.tenant based on Host subdomain.
 *
 * Behavior:
 * - If no subdomain tenant => req.tenant = null
 * - If reserved subdomain => req.tenant = { slug:null, reserved:true, raw }
 * - Else => req.tenant = { slug }
 *
 * NOTE: This does NOT validate existence in DB (routes do that).
 */
function tenantResolver(req, res, next) {
  const host = req.headers.host;
  const slug = extractSubdomainFromHost(host);

  if (!slug) {
    req.tenant = null;
    return next();
  }

  if (RESERVED_TENANT_SLUGS && RESERVED_TENANT_SLUGS.has(slug)) {
    req.tenant = { slug: null, reserved: true, raw: slug };
    return next();
  }

  req.tenant = { slug };
  return next();
}

module.exports = {
  tenantResolver,
  extractSubdomainFromHost,
};
