"use strict";

// Middleware: requestId
// Assigns a unique request ID to every incoming request (from x-request-id header, or generated).
// Also monkey-patches res.json so that any error response that forgot to set request_id gets it
// automatically — this saves us from having to thread req.id through every error path.

const crypto = require("crypto");

function requestId(req, res, next) {
  const incoming = String(req.get("x-request-id") || "").trim();

  let id = incoming;
  // Basic sanity: avoid empty or absurdly long values.
  if (!id || id.length < 8 || id.length > 200) {
    id = crypto.randomUUID
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString("hex");
  }

  req.id = id;
  res.setHeader("x-request-id", id);

  // Inject request_id into JSON error responses if missing.
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    try {
      if (body && typeof body === "object" && !Array.isArray(body) && !Buffer.isBuffer(body)) {
        if (body.error === true && (body.request_id === undefined || body.request_id === null)) {
          body = { ...body, request_id: req.id || null };
        }
      }
    } catch (_) {
      // Never block response due to formatting/injection logic.
    }
    return originalJson(body);
  };

  return next();
}

module.exports = { requestId };
