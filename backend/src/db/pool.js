"use strict";

const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("Missing required env var: DATABASE_URL");
}

// If DATABASE_SSL is explicitly set, honor it.
// Otherwise, default to SSL for non-local DBs (Supabase/managed DBs almost always require it).
function shouldUseSsl(databaseUrl) {
  const env = String(process.env.DATABASE_SSL || "").toLowerCase();
  if (env === "true") return true;
  if (env === "false") return false;

  const isLocal =
    databaseUrl.includes("localhost") ||
    databaseUrl.includes("127.0.0.1") ||
    databaseUrl.includes("::1");

  return !isLocal;
}

const useSsl = shouldUseSsl(DATABASE_URL);
if (process.env.NODE_ENV !== "production") {
  console.log("[db] ssl:", useSsl, "DATABASE_SSL:", process.env.DATABASE_SSL || "(auto)");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,

  // Pool tuning (safe defaults)
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30_000),
  connectionTimeoutMillis: Number(process.env.DB_CONN_TIMEOUT_MS || 5_000),

  // Helps with some “idle socket” drops on hosted DBs
  keepAlive: true,
  keepAliveInitialDelayMillis: Number(process.env.DB_KEEPALIVE_DELAY_MS || 10_000),
});

// If pg drops an idle client, you want to know WHY (this is a big source of “intermittent”)
pool.on("error", (err) => {
  console.error("PG_POOL_ERROR", {
    message: err.message,
    code: err.code,
    stack: err.stack,
  });
});

module.exports = { pool };
