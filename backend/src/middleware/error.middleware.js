"use strict";

function statusToCode(status) {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 503) return "UNAVAILABLE";
  return "INTERNAL";
}

function notFoundHandler(req, res, next) {
  return res.status(404).json({
    error: true,
    code: "NOT_FOUND",
    message: "Route not found",
    path: req.originalUrl,
    request_id: req.id || null,
  });
}

function errorHandler(err, req, res, next) {
  const reqId = req.id || null;

  // Postgres unique violation: 23505
  if (err && err.code === "23505") {
    console.warn("REQ_ERROR", {
      reqId,
      method: req.method,
      path: req.originalUrl,
      status: 409,
      code: "CONFLICT",
      message: "Resource already exists",
      pgCode: err.code || null,
    });

    return res.status(409).json({
      error: true,
      code: "CONFLICT",
      message: "Resource already exists",
      path: req.originalUrl,
      request_id: reqId,
    });
  }

  const status = Number(err?.statusCode) || 500;
  const code = statusToCode(status);

  const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
  const rawMessage = err?.message || "Internal server error";

  // Don't leak internal errors in prod for 500+
  const safeMessage = status >= 500 && isProd ? "Internal server error" : rawMessage;

  const logPayload = {
    reqId,
    method: req.method,
    path: req.originalUrl,
    status,
    code,
    message: rawMessage,
    pgCode: err?.code || null,
  };

  if (status >= 500) console.error("REQ_ERROR", logPayload);
  else console.warn("REQ_ERROR", logPayload);

  const payload = {
    error: true,
    code,
    message: safeMessage,
    path: req.originalUrl,
    request_id: reqId,
  };

  if (Array.isArray(err?.issues) && err.issues.length > 0) {
    payload.issues = err.issues;
  }

  return res.status(status).json(payload);
}

module.exports = { notFoundHandler, errorHandler };
