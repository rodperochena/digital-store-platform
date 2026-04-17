"use strict";

// Lib: stripe
// Lazily initializes and caches the Stripe client singleton.
// Lazy init means the server boots fine even without STRIPE_SECRET_KEY — the error only surfaces
// when a checkout or webhook route is actually used, giving a clear 503 in that case.

let _stripe = null;

// Returns the Stripe client, initializing it on first call.
// Throws with a clear message if STRIPE_SECRET_KEY is missing — this surfaces as a 503 upstream.
function getStripe() {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY environment variable is not set");
    }
    const Stripe = require("stripe");
    _stripe = new Stripe(key, { apiVersion: "2024-06-20" });
  }
  return _stripe;
}

/** Reset singleton (for tests only). */
function _resetStripe() {
  _stripe = null;
}

module.exports = { getStripe, _resetStripe };
