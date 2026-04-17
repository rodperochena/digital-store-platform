"use strict";

// Middleware: requireBuyerSession
// Validates buyer session tokens for buyer-facing authenticated routes.
// Mirrors the owner session pattern but is intentionally kept separate — buyer and owner auth will
// likely diverge (scopes, TTLs, MFA) and sharing one middleware would make that painful.

const { hashToken } = require("../lib/buyerAuth");
const {
  getBuyerSessionByTokenHash,
  touchBuyerSession,
} = require("../db/queries/buyer.queries");

function jsonError(req, res, status, code, message) {
  return res.status(status).json({
    error: true,
    code,
    message,
    path: req.originalUrl,
    request_id: req.id || null,
  });
}

/**
 * Middleware that validates a buyer session token from the Authorization header.
 *
 * Expects: Authorization: Bearer <raw_session_token>
 *
 * On success, attaches to req:
 *   req.buyerSession     — the session DB row
 *   req.buyerAccountId   — session.buyer_account_id
 *   req.buyerStoreId     — session.store_id (source of truth for store scoping)
 *   req.buyerTokenHash   — hashed token (for logout)
 */
async function requireBuyerSession(req, res, next) {
  const authHeader = String(req.headers.authorization || "").trim();
  const raw = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!raw) {
    return jsonError(req, res, 401, "UNAUTHORIZED", "Buyer session token required");
  }

  try {
    const tokenHash = hashToken(raw);
    const session   = await getBuyerSessionByTokenHash(tokenHash);

    if (!session) {
      return jsonError(req, res, 401, "UNAUTHORIZED", "Invalid session");
    }

    if (session.revoked_at) {
      return jsonError(req, res, 401, "UNAUTHORIZED", "Session has been revoked");
    }

    if (new Date(session.expires_at) <= new Date()) {
      return jsonError(req, res, 401, "UNAUTHORIZED", "Session has expired");
    }

    req.buyerSession   = session;
    req.buyerAccountId = session.buyer_account_id;
    req.buyerStoreId   = session.store_id;
    req.buyerTokenHash = tokenHash;

    // Fire-and-forget: update last_seen_at without blocking the request
    touchBuyerSession(session.id).catch(() => {});

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireBuyerSession };
