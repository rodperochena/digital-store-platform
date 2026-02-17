"use strict";

function statusToCode(status) {
  if (status === 400) return "BAD_REQUEST";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  return "INTERNAL";
}

function notFoundHandler(req, res, next) {
  return res.status(404).json({
    error: true,
    code: "NOT_FOUND",
    message: "Route not found",
    path: req.originalUrl,
  });
}

function errorHandler(err, req, res, next) {
  // Postgres unique violation: 23505
  if (err && err.code === "23505") {
    return res.status(409).json({
      error: true,
      code: "CONFLICT",
      message: "Resource already exists",
      path: req.originalUrl,
    });
  }

  const status = Number(err?.statusCode) || 500;
  const code = statusToCode(status);

  const payload = {
    error: true,
    code,
    message: err?.message || "Internal server error",
    path: req.originalUrl,
  };

  // Optional: attach validation issues if present
  if (Array.isArray(err?.issues) && err.issues.length > 0) {
    payload.issues = err.issues;
  }

  return res.status(status).json(payload);
}

module.exports = { notFoundHandler, errorHandler };