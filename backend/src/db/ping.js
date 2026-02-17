"use strict";

const { pool } = require("./pool");

async function pingDb() {
  const res = await pool.query("SELECT 1 AS ok");
  return res.rows?.[0]?.ok === 1;
}

module.exports = { pingDb };
