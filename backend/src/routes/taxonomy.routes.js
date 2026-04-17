"use strict";

// Routes: taxonomy
// Public, unauthenticated. Returns platform-wide product taxonomy data (types, categories, tags).
// These are read-only reference data — no write endpoints here.

const express = require("express");
const { getTypes, getCategoriesByType, getAllTags, searchTags } = require("../db/queries/taxonomy.queries");

const router = express.Router();

// GET /api/taxonomy/types — Public
// Returns all product type definitions (ebook, template, font, etc.).
router.get("/taxonomy/types", async (req, res, next) => {
  try {
    const types = await getTypes();
    return res.json({ types });
  } catch (err) {
    return next(err);
  }
});

// GET /api/taxonomy/types/:typeSlug/categories — Public
// Returns categories for a specific product type.
router.get("/taxonomy/types/:typeSlug/categories", async (req, res, next) => {
  try {
    const categories = await getCategoriesByType(req.params.typeSlug);
    return res.json({ categories });
  } catch (err) {
    return next(err);
  }
});

// GET /api/taxonomy/tags?search=... — Public
// Returns all tags, or filters to matching ones if ?search= is provided.
router.get("/taxonomy/tags", async (req, res, next) => {
  try {
    const { search } = req.query;
    const tags = search && search.trim()
      ? await searchTags(search.trim(), 20)
      : await getAllTags();
    return res.json({ tags });
  } catch (err) {
    return next(err);
  }
});

module.exports = { taxonomyRouter: router };
