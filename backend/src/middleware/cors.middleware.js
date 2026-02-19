"use strict";

const cors = require("cors");

function parseCsvOrigins(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isLocalDevOrigin(origin) {
  try {
    const u = new URL(origin);
    const host = (u.hostname || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function corsMiddleware() {
  const nodeEnv = String(process.env.NODE_ENV || "development").toLowerCase();

  // In prod: require explicit allowlist (safer).
  // In dev: allow localhost origins by default.
  const allowlist = parseCsvOrigins(process.env.CORS_ORIGIN);
  const allowLocalDev =
    nodeEnv !== "production" && String(process.env.CORS_ALLOW_LOCAL_DEV || "1") !== "0";

  const allowNullOrigin =
    nodeEnv !== "production" && String(process.env.CORS_ALLOW_NULL || "0") === "1";

  if (nodeEnv === "production" && allowlist.length === 0) {
    console.warn(
      "[cors] NODE_ENV=production but CORS_ORIGIN is empty. Browser cross-origin requests will be blocked until configured."
    );
  }

  const options = {
    origin(origin, cb) {
      // No Origin header = curl/server-to-server or same-origin -> allow
      if (!origin) return cb(null, true);

      // Some environments send "null" origin (file://). Allow only if explicitly enabled (dev only).
      if (origin === "null") return cb(null, allowNullOrigin);

      // Explicit allowlist
      if (allowlist.includes(origin)) return cb(null, true);

      // Dev convenience: allow localhost/127.0.0.1 on any port
      if (allowLocalDev && isLocalDevOrigin(origin)) return cb(null, true);

      // Disallowed: return false (no CORS headers) without throwing server errors
      return cb(null, false);
    },

    credentials: String(process.env.CORS_CREDENTIALS || "0") === "1",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-admin-key", "x-request-id"],
    exposedHeaders: ["x-request-id"],
    maxAge: 86400,
  };

  return cors(options);
}

module.exports = { corsMiddleware };
