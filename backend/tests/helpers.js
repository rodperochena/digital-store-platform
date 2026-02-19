"use strict";

/**
 * tests/helpers.js
 *
 * Shared helpers for Jest + Supertest integration tests.
 * - Exports a single Express app instance (createApp()) for supertest
 * - Provides small admin helper wrappers
 * - Tracks created store IDs for optional cleanup in afterAll
 */

global.__TEST_STORE_IDS__ = global.__TEST_STORE_IDS__ || new Set();

const request = require("supertest"); // supertest exports a function
const { createApp } = require("../src/app");

const app = createApp();

// Prefer env, but safe default for local tests
const ADMIN_KEY = process.env.ADMIN_KEY || "test_admin_key";

function randSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

/**
 * Create a store (admin).
 * Notes:
 * - Many of your admin routes require enable + patch settings after creation.
 * - We track storeId to allow cleanup later.
 */
async function createStore({ slug, name, currency = "usd" }) {
  const res = await request(app)
    .post("/api/stores")
    .set("x-admin-key", ADMIN_KEY)
    .set("Content-Type", "application/json")
    .send({ slug, name, currency });

  const storeId = res.body?.store?.id;
  if (storeId) {
    global.__TEST_STORE_IDS__.add(storeId);
  }

  return res;
}

/**
 * Enable a store (admin).
 */
async function enableStore(storeId) {
  return request(app)
    .patch(`/api/stores/${storeId}/enable`)
    .set("x-admin-key", ADMIN_KEY);
}

/**
 * Patch store settings (admin).
 */
async function patchStoreSettings(storeId, settings) {
  return request(app)
    .patch(`/api/stores/${storeId}/settings`)
    .set("x-admin-key", ADMIN_KEY)
    .set("Content-Type", "application/json")
    .send(settings);
}

/**
 * Create a product (admin).
 */
async function createProduct(storeId, product) {
  return request(app)
    .post(`/api/stores/${storeId}/products`)
    .set("x-admin-key", ADMIN_KEY)
    .set("Content-Type", "application/json")
    .send(product);
}

module.exports = {
  request,
  app,
  ADMIN_KEY,
  randSuffix,
  createStore,
  enableStore,
  patchStoreSettings,
  createProduct,
};
