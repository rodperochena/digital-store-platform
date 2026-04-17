"use strict";

// Queries: product taxonomy
// Read-only reference data: product types, categories per type, and tags.
// These are platform-wide (not store-scoped) — shared across all stores.

const { pool } = require("../pool");

async function getTypes() {
  const res = await pool.query(
    `SELECT slug, label, icon, sort_order FROM taxonomy_types ORDER BY sort_order`
  );
  return res.rows;
}

async function getCategoriesByType(typeSlug) {
  const res = await pool.query(
    `SELECT slug, type_slug, label, sort_order FROM taxonomy_categories WHERE type_slug = $1 ORDER BY sort_order`,
    [typeSlug]
  );
  return res.rows;
}

async function getAllTags() {
  const res = await pool.query(
    `SELECT slug, label, group_name, sort_order FROM taxonomy_tags ORDER BY group_name, sort_order`
  );
  return res.rows;
}

async function searchTags(query, limit = 20) {
  const res = await pool.query(
    `SELECT slug, label, group_name, sort_order FROM taxonomy_tags
     WHERE label ILIKE '%' || $1 || '%'
     ORDER BY group_name, sort_order LIMIT $2`,
    [query, limit]
  );
  return res.rows;
}

module.exports = { getTypes, getCategoriesByType, getAllTags, searchTags };
