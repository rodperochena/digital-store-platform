"use strict";

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("../src/db/pool");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");
const UP_DIR = path.join(MIGRATIONS_DIR, "up");

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(client) {
  const res = await client.query(
    `SELECT id FROM schema_migrations ORDER BY id ASC;`
  );
  return new Set(res.rows.map((r) => r.id));
}

function listUpMigrations() {
  return fs
    .readdirSync(UP_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function applyMigration(client, id, sql) {
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(`INSERT INTO schema_migrations (id) VALUES ($1);`, [id]);
    await client.query("COMMIT");
    console.log(`✅ Applied migration: ${id}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function main() {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    const applied = await getAppliedMigrations(client);
    const migrations = listUpMigrations();

    let appliedCount = 0;

    for (const file of migrations) {
      if (applied.has(file)) continue;

      const fullPath = path.join(UP_DIR, file);
      const sql = fs.readFileSync(fullPath, "utf8");
      await applyMigration(client, file, sql);
      appliedCount++;
    }

    if (appliedCount === 0) {
      console.log("✅ No pending migrations.");
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
});
