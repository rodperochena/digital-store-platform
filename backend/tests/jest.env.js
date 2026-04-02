"use strict";

// IMPORTANT: Load .env BEFORE any imports that read env vars (like src/db/pool.js)
require("dotenv").config({ quiet: true });

process.env.NODE_ENV = "test";
process.env.ADMIN_KEY = process.env.ADMIN_KEY || "test_admin_key";
process.env.TENANCY_BASE_DOMAIN = process.env.TENANCY_BASE_DOMAIN || "localhost";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy_not_real";
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_dummy_not_real";
process.env.APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
process.env.BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5051";
process.env.MAILER_PROVIDER = process.env.MAILER_PROVIDER || "log";
process.env.DELIVERY_TOKEN_TTL_HOURS = process.env.DELIVERY_TOKEN_TTL_HOURS || "72";

// Optional: disable rate limiting in tests (only if your middleware reads these flags)
process.env.RL_PUBLIC_DISABLED = process.env.RL_PUBLIC_DISABLED || "1";
process.env.RL_CHECKOUT_DISABLED = process.env.RL_CHECKOUT_DISABLED || "1";

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/postgres";

process.env.DATABASE_SSL = process.env.DATABASE_SSL || "false";
