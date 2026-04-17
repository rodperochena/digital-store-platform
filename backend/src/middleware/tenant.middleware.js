"use strict";

// Middleware: tenantResolver
// Runs on every request. Sets req.tenant based on the Host header:
//   1. Custom domain (non-platform host) → DB lookup via domains.queries
//   2. Subdomain of the platform base domain → req.tenant = { slug }
//   3. Reserved slug → req.tenant = { slug: null, reserved: true, raw }
//   4. No match → req.tenant = null
// Routes decide what to do with req.tenant; this middleware never rejects.
// Important: step 1 is async (DB call). For step 2+ it's synchronous.

const { RESERVED_TENANT_SLUGS } = require("../config/tenancy.constants");

const TENANCY_BASE_DOMAIN = String(process.env.TENANCY_BASE_DOMAIN || "")
  .trim()
  .toLowerCase();

const PLATFORM_DOMAIN = String(process.env.PLATFORM_DOMAIN || "")
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
 * Returns true if the host is the platform's own domain (not a custom domain).
 * Platform domains: localhost, *.localhost, TENANCY_BASE_DOMAIN, *.TENANCY_BASE_DOMAIN,
 *                   PLATFORM_DOMAIN, *.PLATFORM_DOMAIN, bare IP addresses.
 */
function isPlatformHost(host) {
  if (!host) return true;
  if (isIpLiteral(host)) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;

  if (TENANCY_BASE_DOMAIN) {
    if (host === TENANCY_BASE_DOMAIN || host.endsWith(`.${TENANCY_BASE_DOMAIN}`)) return true;
  }
  if (PLATFORM_DOMAIN) {
    if (host === PLATFORM_DOMAIN || host.endsWith(`.${PLATFORM_DOMAIN}`)) return true;
  }
  return false;
}

/**
 * Middleware that sets req.tenant based on:
 *  1. Custom domain (Host header, if not a platform domain) — DB lookup
 *  2. Host subdomain (for platform-hosted stores)
 *
 * Behavior:
 * - Custom domain resolves  => req.tenant = { customDomain: true, store: <row> }
 * - Subdomain tenant found  => req.tenant = { slug }
 * - Reserved subdomain      => req.tenant = { slug:null, reserved:true, raw }
 * - Nothing matches         => req.tenant = null
 *
 * NOTE: Subdomain path does NOT validate existence in DB (routes do that).
 */
function tenantResolver(req, res, next) {
  const rawHost  = req.headers.host;
  const host     = stripPort(rawHost);

  // ── Step 1: Custom domain resolution ──────────────────────────────────────
  // TODO: Add in-memory cache for custom domain lookups (TTL 5 min)
  if (host && !isPlatformHost(host)) {
    // Lazily require to avoid circular dep / startup cost when unused
    const { getStoreByCustomDomain } = require("../db/queries/domains.queries");
    getStoreByCustomDomain(host)
      .then((store) => {
        if (store) {
          req.tenant = { customDomain: true, store };
        } else {
          req.tenant = null;
        }
        return next();
      })
      .catch(() => {
        // DB failure — fall through without custom domain resolution
        req.tenant = null;
        return next();
      });
    return; // async path — next() called inside promise
  }

  // ── Step 2: Subdomain resolution (platform-hosted) ────────────────────────
  const slug = extractSubdomainFromHost(rawHost);

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
