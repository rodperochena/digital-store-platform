"use strict";

// Config: tenancy constants
// Single source of truth for store slug rules and the reserved slug list.
// Used by tenant.middleware.js, storefront.middleware.js, stores.routes.js, and dev.routes.js.
// RESERVED_TENANT_SLUGS prevents store creation or routing on platform-internal names.
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
  return SLUG_REGEX.test(slug);
}

module.exports = {
  RESERVED_TENANT_SLUGS,
  SLUG_REGEX,
  isValidTenantSlug,
};
