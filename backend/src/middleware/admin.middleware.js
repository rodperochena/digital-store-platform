"use strict";

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
