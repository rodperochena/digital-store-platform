"use strict";

// Middleware: requireAdminKey
// Guards platform-internal admin routes (store creation, enabling stores, etc.).
// Reads the ADMIN_KEY env var at request time — no startup failure if missing, but will 500 or 401 accordingly.

const crypto = require("crypto");

function jsonError(req, res, status, code, message) {
  return res.status(status).json({
    error: true,
    code,
    message,
    path: req.originalUrl,
    request_id: req.id || null,
  });
}

// Constant-time compare via hashing to avoid length-based timing differences.
function constantTimeEquals(a, b) {
  const ah = crypto.createHash("sha256").update(String(a)).digest();
  const bh = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ah, bh);
}

// Rejects any request that doesn't carry the correct x-admin-key header.
// A missing or misconfigured ADMIN_KEY returns 500 (server config error, not a client error).
// Uses SHA-256 hashing before timingSafeEqual to make length-oracle attacks impossible.
function requireAdminKey(req, res, next) {
  const expected = String(process.env.ADMIN_KEY || "").trim();
  const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";

  if (!expected) {
    // In prod, keep message generic
    return jsonError(
      req,
      res,
      500,
      "INTERNAL",
      isProd ? "Internal server error" : "Server misconfigured: missing ADMIN_KEY"
    );
  }

  const provided = String(req.get("x-admin-key") || "").trim();

  if (!provided || !constantTimeEquals(provided, expected)) {
    return jsonError(req, res, 401, "UNAUTHORIZED", "Unauthorized");
  }

  return next();
}

module.exports = { requireAdminKey };
