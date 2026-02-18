"use strict";

const crypto = require("crypto");

function jsonError(req, res, status, code, message) {
  return res.status(status).json({
    error: true,
    code,
    message,
    path: req.originalUrl,
  });
}

// Constant-time compare via hashing to avoid length-based timing differences.
// (timingSafeEqual throws if buffers differ in length, hashing makes lengths equal.)
function constantTimeEquals(a, b) {
  const ah = crypto.createHash("sha256").update(String(a)).digest();
  const bh = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ah, bh);
}

function requireAdminKey(req, res, next) {
  const expected = String(process.env.ADMIN_KEY || "").trim();

  // Misconfiguration: middleware enabled but no ADMIN_KEY configured
  if (!expected) {
    return jsonError(
      req,
      res,
      500,
      "INTERNAL",
      "Server misconfigured: missing ADMIN_KEY"
    );
  }

  const provided = String(req.get("x-admin-key") || "").trim();

  // Missing or invalid key (return same response to avoid leaking info)
  if (!provided || !constantTimeEquals(provided, expected)) {
    return jsonError(req, res, 401, "UNAUTHORIZED", "Unauthorized");
  }

  return next();
}

module.exports = { requireAdminKey };

