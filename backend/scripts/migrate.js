"use strict";

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("../src/db/pool");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");
const UP_DIR = path.join(MIGRATIONS_DIR, "up");
const DOWN_DIR = path.join(MIGRATIONS_DIR, "down");

function usage() {
  console.log(`
Usage:
  node scripts/migrate.js up
  node scripts/migrate.js down [count]
  node scripts/migrate.js status

Examples:
  node scripts/migrate.js
  node scripts/migrate.js up
  node scripts/migrate.js down
  node scripts/migrate.js down 3
  node scripts/migrate.js status
`.trim());
}

function listSqlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function readSql(dir, filename) {
  const fullPath = path.join(dir, filename);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing migration file: ${fullPath}`);
  }
  return fs.readFileSync(fullPath, "utf8");
}

async function schemaMigrationsExists(client) {
  const res = await client.query(
    `SELECT to_regclass('public.schema_migrations') AS tbl;`
  );
  return res.rows[0]?.tbl != null;
}

async function getAppliedMap(client) {
  const exists = await schemaMigrationsExists(client);
  if (!exists) return new Map();

  const res = await client.query(
    `SELECT id, applied_at FROM schema_migrations ORDER BY id ASC;`
  );

  const map = new Map();
  for (const r of res.rows) map.set(r.id, r.applied_at);
  return map;
}

async function applyUpMigration(client, id, sql) {
  await client.query("BEGIN");
  try {
    // Execute SQL (can be empty, but we still record it)
    if (sql && sql.trim()) {
      await client.query(sql);
    }

    // Record applied migration (works for 001 because it creates the table)
    await client.query(
      `INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING;`,
      [id]
    );

    await client.query("COMMIT");
    console.log(`✅ Applied: ${id}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function rollbackDownMigration(client, id, downSql) {
  await client.query("BEGIN");
  try {
    // Delete record FIRST (important if down SQL drops schema_migrations, e.g. migration 001)
    const exists = await schemaMigrationsExists(client);
    if (!exists) {
      throw new Error(
        `Cannot rollback ${id}: schema_migrations table does not exist.`
      );
    }

    await client.query(`DELETE FROM schema_migrations WHERE id = $1;`, [id]);

    // Execute down SQL
    if (downSql && downSql.trim()) {
      await client.query(downSql);
    }

    await client.query("COMMIT");
    console.log(`↩️  Rolled back: ${id}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

function assertDownFilesExist(upFiles) {
  const downFiles = new Set(listSqlFiles(DOWN_DIR));
  const missing = upFiles.filter((f) => !downFiles.has(f));
  if (missing.length) {
    throw new Error(
      `Missing down migration(s): ${missing.join(", ")} (expected in ${DOWN_DIR})`
    );
  }
}

async function cmdUp(client) {
  const upFiles = listSqlFiles(UP_DIR);
  if (upFiles.length === 0) {
    console.log("ℹ️  No migrations found in migrations/up.");
    return;
  }

  // Ensure all down files exist (so system is always reversible)
  assertDownFilesExist(upFiles);

  const applied = await getAppliedMap(client);

  let count = 0;
  for (const file of upFiles) {
    if (applied.has(file)) continue;

    const sql = readSql(UP_DIR, file);
    await applyUpMigration(client, file, sql);
    count++;
  }

  if (count === 0) console.log("✅ No pending migrations.");
}

async function cmdDown(client, count) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`Invalid down count: ${count}`);
  }

  const upFiles = listSqlFiles(UP_DIR);
  if (upFiles.length === 0) {
    console.log("ℹ️  No migrations found in migrations/up.");
    return;
  }

  assertDownFilesExist(upFiles);

  const appliedMap = await getAppliedMap(client);
  if (appliedMap.size === 0) {
    console.log("✅ No applied migrations to roll back.");
    return;
  }

  const appliedIds = Array.from(appliedMap.keys()).sort(); // applied order
  const toRollback = appliedIds.slice(-count).reverse(); // rollback newest first

  if (toRollback.length === 0) {
    console.log("✅ Nothing to roll back.");
    return;
  }

  for (const id of toRollback) {
    const downSql = readSql(DOWN_DIR, id);
    await rollbackDownMigration(client, id, downSql);
  }
}

async function cmdStatus(client) {
  const upFiles = listSqlFiles(UP_DIR);
  const appliedMap = await getAppliedMap(client);

  if (upFiles.length === 0) {
    console.log("ℹ️  No migrations found in migrations/up.");
    return;
  }

  // nice output
  console.log("Migration status:");
  for (const file of upFiles) {
    const appliedAt = appliedMap.get(file);
    if (appliedAt) {
      console.log(`  ✅ ${file}  (applied_at: ${new Date(appliedAt).toISOString()})`);
    } else {
      console.log(`  ⏳ ${file}  (pending)`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = (args[0] || "up").toLowerCase();

  const client = await pool.connect();
  try {
    if (cmd === "up") {
      await cmdUp(client);
    } else if (cmd === "down") {
      const n = args[1] ? parseInt(args[1], 10) : 1;
      await cmdDown(client, n);
    } else if (cmd === "status") {
      await cmdStatus(client);
    } else if (cmd === "help" || cmd === "--help" || cmd === "-h") {
      usage();
    } else {
      usage();
      process.exitCode = 2;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Migration error:", err.message);
  process.exit(1);
});
