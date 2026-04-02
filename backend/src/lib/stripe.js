"use strict";

let _stripe = null;

/**
 * Returns a lazily-initialized Stripe client.
 * Throws clearly if STRIPE_SECRET_KEY is not set.
 */
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
