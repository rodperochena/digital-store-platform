"use strict";

// Middleware: requireOwnerSession
// Validates owner session tokens for store-owner-authenticated routes.
// On success, attaches req.ownerStoreId, req.ownerAccountId, and req.ownerTokenHash.
// Also fires a non-blocking last_seen_at update (fire-and-forget) — failure there must never
// block the actual request.

const { hashToken } = require("../lib/ownerAuth");
const {
  getOwnerSessionByTokenHash,
  touchOwnerSession,
} = require("../db/queries/owner.queries");

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
 * Middleware that validates an owner session token from the Authorization header.
 *
 * Expects: Authorization: Bearer <raw_session_token>
 *
 * On success, attaches to req:
 *   req.ownerSession      — the session DB row
 *   req.ownerStoreId      — session.store_id (source of truth for store scoping)
 *   req.ownerAccountId    — session.owner_account_id
 *   req.ownerTokenHash    — hashed token (for logout)
 */
async function requireOwnerSession(req, res, next) {
  const authHeader = String(req.headers.authorization || "").trim();
  const raw = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!raw) {
    return jsonError(req, res, 401, "UNAUTHORIZED", "Owner session token required");
  }

  try {
    const tokenHash = hashToken(raw);
    const session = await getOwnerSessionByTokenHash(tokenHash);

    if (!session) {
      return jsonError(req, res, 401, "UNAUTHORIZED", "Invalid session");
    }

    if (session.revoked_at) {
      return jsonError(req, res, 401, "UNAUTHORIZED", "Session has been revoked");
    }

    if (new Date(session.expires_at) <= new Date()) {
      return jsonError(req, res, 401, "UNAUTHORIZED", "Session has expired");
    }

    req.ownerSession   = session;
    req.ownerStoreId   = session.store_id;
    req.ownerAccountId = session.owner_account_id;
    req.ownerTokenHash = tokenHash;

    // Fire-and-forget: update last_seen_at without blocking the request
    touchOwnerSession(session.id).catch(() => {});

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireOwnerSession };
