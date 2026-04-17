"use strict";

// Middleware: requireUuidParam + validateBody
// requireUuidParam — early-returns 400 if a route param isn't a valid UUID format.
//   Prevents garbage values from reaching queries and avoids confusing Postgres cast errors.
// validateBody — runs a Zod schema against req.body; attaches req.validatedBody on success.
//   Keeping validation in middleware keeps route handlers clean and testable.

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuidParam(paramName) {
  return (req, res, next) => {
    const value = String(req.params?.[paramName] || "").trim();
    if (!uuidRegex.test(value)) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: `Invalid ${paramName}`,
        path: req.originalUrl,
        request_id: req.id || null,
      });
    }
    return next();
  };
}

function validateBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: true,
        code: "BAD_REQUEST",
        message: "Invalid request body",
        issues: parsed.error.issues,
        path: req.originalUrl,
        request_id: req.id || null,
      });
    }
    req.validatedBody = parsed.data;
    return next();
  };
}

module.exports = { requireUuidParam, validateBody };
