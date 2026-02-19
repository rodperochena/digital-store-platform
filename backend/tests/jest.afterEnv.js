"use strict";

const { pool } = require("../src/db/pool"); // ajusta si tu export es distinto

afterAll(async () => {
  const ids = Array.from(global.__TEST_STORE_IDS__ || []);
  if (!ids.length) {
    await pool.end();
    return;
  }

  // borra hijos -> padres
  await pool.query(
    `DELETE FROM order_items 
     WHERE order_id IN (SELECT id FROM orders WHERE store_id = ANY($1::uuid[]))`,
    [ids]
  );

  await pool.query(`DELETE FROM orders WHERE store_id = ANY($1::uuid[])`, [ids]);
  await pool.query(`DELETE FROM products WHERE store_id = ANY($1::uuid[])`, [ids]);
  await pool.query(`DELETE FROM stores WHERE id = ANY($1::uuid[])`, [ids]);

  await pool.end();
});
