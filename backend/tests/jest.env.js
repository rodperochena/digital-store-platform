"use strict";

// IMPORTANT: Load .env BEFORE any imports that read env vars (like src/db/pool.js)
require("dotenv").config({ quiet: true });

process.env.NODE_ENV = "test";
process.env.ADMIN_KEY = process.env.ADMIN_KEY || "test_admin_key";
process.env.TENANCY_BASE_DOMAIN = process.env.TENANCY_BASE_DOMAIN || "localhost";

// Optional: disable rate limiting in tests (only if your middleware reads these flags)
process.env.RL_PUBLIC_DISABLED = process.env.RL_PUBLIC_DISABLED || "1";
process.env.RL_CHECKOUT_DISABLED = process.env.RL_CHECKOUT_DISABLED || "1";
