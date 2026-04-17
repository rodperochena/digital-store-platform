"use strict";

// Queries: discount codes
// Discount code CRUD and validation. validateDiscountCode computes the discount amount inline —
// the result is passed directly to createOrder so there's no gap between validation and order creation.

const { pool } = require("../pool");

async function listDiscountCodes(storeId) {
  const res = await pool.query(
    `SELECT id, code, description, discount_type, discount_value,
            max_uses, use_count, min_order_cents, expires_at, active, created_at
     FROM discount_codes
     WHERE store_id = $1
     ORDER BY created_at DESC`,
    [storeId]
  );
  return res.rows;
}

async function createDiscountCode(storeId, {
  code, description, discount_type, discount_value,
  max_uses, min_order_cents, expires_at, active,
}) {
  const res = await pool.query(
    `INSERT INTO discount_codes
       (store_id, code, description, discount_type, discount_value,
        max_uses, min_order_cents, expires_at, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      storeId,
      String(code).toUpperCase().trim(),
      description ?? null,
      discount_type,
      discount_value,
      max_uses ?? null,
      min_order_cents ?? 0,
      expires_at ?? null,
      active !== false,
    ]
  );
  return res.rows[0];
}

async function updateDiscountCode(storeId, codeId, fields) {
  const allowed = ["code", "description", "discount_type", "discount_value",
                   "max_uses", "min_order_cents", "expires_at", "active"];
  const sets = [];
  const values = [storeId, codeId];
  let idx = 3;

  for (const key of allowed) {
    if (key in fields) {
      const val = key === "code" ? String(fields[key]).toUpperCase().trim() : fields[key];
      sets.push(`${key} = $${idx++}`);
      values.push(val ?? null);
    }
  }

  if (sets.length === 0) return null;

  const res = await pool.query(
    `UPDATE discount_codes SET ${sets.join(", ")}
     WHERE store_id = $1 AND id = $2
     RETURNING *`,
    values
  );
  return res.rows[0] ?? null;
}

async function deleteDiscountCode(storeId, codeId) {
  const res = await pool.query(
    `DELETE FROM discount_codes WHERE store_id = $1 AND id = $2 RETURNING id`,
    [storeId, codeId]
  );
  return res.rowCount > 0;
}

async function validateDiscountCode(storeId, code, orderSubtotalCents) {
  const res = await pool.query(
    `SELECT id, code, discount_type, discount_value, max_uses, use_count,
            min_order_cents, expires_at, active
     FROM discount_codes
     WHERE store_id = $1 AND code = $2
     LIMIT 1`,
    [storeId, String(code).toUpperCase().trim()]
  );

  const dc = res.rows[0];
  if (!dc) return { valid: false, reason: "Code not found" };
  if (!dc.active) return { valid: false, reason: "Code is inactive" };
  if (dc.expires_at && new Date(dc.expires_at) < new Date()) {
    return { valid: false, reason: "Code has expired" };
  }
  if (dc.max_uses !== null && dc.use_count >= dc.max_uses) {
    return { valid: false, reason: "Code has reached its usage limit" };
  }
  if (orderSubtotalCents < dc.min_order_cents) {
    return {
      valid: false,
      reason: `Minimum order of ${dc.min_order_cents} cents required`,
    };
  }

  let discountAmountCents;
  if (dc.discount_type === "percentage") {
    discountAmountCents = Math.round((orderSubtotalCents * Number(dc.discount_value)) / 100);
  } else {
    discountAmountCents = Math.min(Number(dc.discount_value) * 100, orderSubtotalCents);
  }

  return {
    valid: true,
    discount_code_id: dc.id,
    code: dc.code,
    discount_type: dc.discount_type,
    discount_value: dc.discount_value,
    discount_amount_cents: discountAmountCents,
  };
}

async function incrementDiscountUse(discountCodeId) {
  await pool.query(
    `UPDATE discount_codes SET use_count = use_count + 1 WHERE id = $1`,
    [discountCodeId]
  );
}

module.exports = {
  listDiscountCodes,
  createDiscountCode,
  updateDiscountCode,
  deleteDiscountCode,
  validateDiscountCode,
  incrementDiscountUse,
};
