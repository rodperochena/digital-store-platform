"use strict";

// Queries: custom domains
// Manages the custom_domains table for white-label store hostnames.
// getStoreByCustomDomain is called on every request by tenantResolver for non-platform Host headers —
// it should be fast (indexed on domain column).

const { pool } = require("../pool");

// ── Add a custom domain ───────────────────────────────────────────────────────

async function addCustomDomain(storeId, { domain, verificationToken }) {
  const { rows } = await pool.query(
    `INSERT INTO custom_domains (store_id, domain, verification_token)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [storeId, domain, verificationToken]
  );
  return rows[0];
}

// ── Get active/pending/verified domain for a store ────────────────────────────

async function getDomainByStoreId(storeId) {
  const { rows } = await pool.query(
    `SELECT * FROM custom_domains
     WHERE store_id = $1 AND status IN ('pending', 'verified', 'active')
     LIMIT 1`,
    [storeId]
  );
  return rows[0] ?? null;
}

// ── Get store by custom domain (for tenant resolution) ────────────────────────

async function getStoreByCustomDomain(domain) {
  const { rows } = await pool.query(
    `SELECT s.id, s.slug, s.name, s.currency, s.primary_color, s.secondary_color,
            s.logo_url, s.is_enabled, s.tagline, s.description,
            s.social_twitter, s.social_instagram, s.social_youtube, s.social_website,
            s.storefront_config, s.font_family, s.is_paused, s.pause_message
     FROM custom_domains cd
     JOIN stores s ON s.id = cd.store_id
     WHERE cd.domain = $1 AND cd.status = 'active' AND s.is_enabled = true
     LIMIT 1`,
    [domain]
  );
  return rows[0] ?? null;
}

// ── Update domain status ──────────────────────────────────────────────────────

async function updateDomainStatus(domainId, { status, dnsVerifiedAt, lastCheckAt, lastCheckError }) {
  const sets = ["updated_at = NOW()"];
  const vals = [];
  let i = 1;

  if (status !== undefined)         { sets.push(`status = $${i++}`);           vals.push(status); }
  if (dnsVerifiedAt !== undefined)  { sets.push(`dns_verified_at = $${i++}`);  vals.push(dnsVerifiedAt); }
  if (lastCheckAt !== undefined)    { sets.push(`last_check_at = $${i++}`);    vals.push(lastCheckAt); }
  if (lastCheckError !== undefined) { sets.push(`last_check_error = $${i++}`); vals.push(lastCheckError ? String(lastCheckError).slice(0, 500) : null); }

  vals.push(domainId);
  const { rows } = await pool.query(
    `UPDATE custom_domains SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    vals
  );
  return rows[0] ?? null;
}

// ── Delete a custom domain ────────────────────────────────────────────────────

async function deleteCustomDomain(storeId, domainId) {
  const { rowCount } = await pool.query(
    `DELETE FROM custom_domains WHERE id = $1 AND store_id = $2`,
    [domainId, storeId]
  );
  return rowCount > 0;
}

// ── List all domains for a store (including failed ones) ──────────────────────

async function listDomains(storeId) {
  const { rows } = await pool.query(
    `SELECT * FROM custom_domains WHERE store_id = $1 ORDER BY created_at DESC`,
    [storeId]
  );
  return rows;
}

// ── Check if a domain is already registered by any store ─────────────────────

async function isDomainTaken(domain, excludeStoreId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM custom_domains WHERE domain = $1 AND store_id != $2 LIMIT 1`,
    [domain, excludeStoreId]
  );
  return rows.length > 0;
}

module.exports = {
  addCustomDomain,
  getDomainByStoreId,
  getStoreByCustomDomain,
  updateDomainStatus,
  deleteCustomDomain,
  listDomains,
  isDomainTaken,
};
