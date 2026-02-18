"use strict";

const { pool } = require("./pool");

function isTransientPgError(err) {
  const msg = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "");

  // Common transient/network/pooler issues
  return (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "57P01" || // admin_shutdown
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("terminating connection") ||
    msg.includes("connection terminated unexpectedly")
  );
}

async function pingDb() {
  const start = Date.now();

  async function attempt() {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1;");
      return { ok: true, ms: Date.now() - start };
    } finally {
      client.release();
    }
  }

  try {
    return await attempt();
  } catch (err) {
    // Retry once if it smells transient
    if (isTransientPgError(err)) {
      try {
        return await attempt();
      } catch (err2) {
        return {
          ok: false,
          ms: Date.now() - start,
          error: { code: err2.code || null, message: err2.message || "unknown" },
        };
      }
    }

    return {
      ok: false,
      ms: Date.now() - start,
      error: { code: err.code || null, message: err.message || "unknown" },
    };
  }
}

module.exports = { pingDb };
