"use strict";

const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("Missing required env var: DATABASE_URL");
}

// Enable SSL only when explicitly requested (production/staging).
// Example: DATABASE_SSL=true
const useSsl = String(process.env.DATABASE_SSL || "").toLowerCase() === "true";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

module.exports = { pool };
