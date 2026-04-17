"use strict";

// Lib: buyerAuth
// Crypto primitives for buyer account authentication: token generation, token hashing, and password hashing.
// Intentionally identical algorithm to ownerAuth (same scrypt params, same SHA-256 token scheme).
// Kept as a separate module so buyer and owner auth can diverge without touching each other.

const crypto = require("crypto");

// ── Token ─────────────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically secure opaque token.
 * Returns the raw token (sent to client) and its SHA-256 hash (stored in DB).
 */
function generateToken() {
  const raw  = crypto.randomBytes(32).toString("hex"); // 64-char hex
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

/**
 * Hash a raw token the same way for DB lookup.
 */
function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

// ── Password (scrypt) ─────────────────────────────────────────────────────────

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN  = 64;

/**
 * Hash a plaintext password using scrypt.
 * Returns "salt:derivedKeyHex".
 */
async function hashPassword(password) {
  const salt       = crypto.randomBytes(16).toString("hex");
  const derivedKey = await new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      KEY_LEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, key) => (err ? reject(err) : resolve(key))
    );
  });
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verify a plaintext password against a stored "salt:hash" string.
 * Uses timing-safe comparison.
 */
async function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const colonIdx  = stored.indexOf(":");
  const salt      = stored.slice(0, colonIdx);
  const storedHex = stored.slice(colonIdx + 1);

  let derivedKey;
  try {
    derivedKey = await new Promise((resolve, reject) => {
      crypto.scrypt(
        password,
        salt,
        KEY_LEN,
        { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
        (err, key) => (err ? reject(err) : resolve(key))
      );
    });
  } catch {
    return false;
  }

  const a = derivedKey;
  const b = Buffer.from(storedHex, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { generateToken, hashToken, hashPassword, verifyPassword };
