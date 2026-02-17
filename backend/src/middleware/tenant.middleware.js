"use strict";

/**
 * Extracts tenant slug from the Host header subdomain.
 *
 * Examples:
 * - Host: demo-storefront.localhost -> demo-storefront
 * - Host: demo-storefront.example.com -> demo-storefront
 * - Host: localhost -> null (no subdomain)
 *
 * Notes:
 * - In local dev, simulate via: curl -H "Host: demo-storefront.localhost" ...
 * - We ignore port (e.g., localhost:5051).
 */
function extractSubdomainFromHost(hostHeader) {
  if (!hostHeader) return null;

  // Remove port
  const host = String(hostHeader).split(":")[0].toLowerCase();

  // If it's an IPv4/IPv6 literal, no subdomain concept here
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes("]")) return null;

  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return null; // e.g., "localhost"

  // subdomain is first label
  return parts[0] || null;
}

// Reserved subdomains that should never be treated as store slugs
const RESERVED_SUBDOMAINS = new Set([
  "api",
  "www",
  "admin",
  "static",
  "assets",
  "cdn",
]);

/**
 * Middleware that sets req.tenant = { slug } if present.
 * It does NOT validate existence in DB (routes will do that).
 *
 * Behavior:
 * - If Host subdomain is reserved, treat as no tenant (req.tenant = null)
 */
function tenantResolver(req, res, next) {
  const host = req.headers.host;
  const slug = extractSubdomainFromHost(host);

  if (slug && !RESERVED_SUBDOMAINS.has(slug)) {
    req.tenant = { slug };
  } else {
    req.tenant = null;
  }

  return next();
}

module.exports = { tenantResolver, extractSubdomainFromHost };
