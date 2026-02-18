"use strict";

// Single source of truth for tenant/store slugs.

// Reserved names that must NEVER map to a tenant store.
const RESERVED_TENANT_SLUGS = new Set([
  "api",
  "www",
  "admin",
  "static",
  "assets",
  "cdn",
]);

// Tenant slug rules: 2-63 chars, lowercase letters/numbers/hyphen only.
const SLUG_REGEX = /^[a-z0-9-]{2,63}$/;

function isValidTenantSlug(slug) {
  return SLUG_REGEX.test(String(slug || ""));
}

module.exports = {
  RESERVED_TENANT_SLUGS,
  SLUG_REGEX,
  isValidTenantSlug,
};

