"use strict";

const crypto = require("crypto");

function requestId(req, res, next) {
  const incoming = String(req.get("x-request-id") || "").trim();

  let id = incoming;
  if (!id || id.length < 8 || id.length > 200) {
    id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
  }

  req.id = id;
  res.setHeader("x-request-id", id);
  return next();
}

module.exports = { requestId };
