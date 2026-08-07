// Storage layer — a simple key/value store, same shape as the local SQLite
// version (one table: key, value, updated_at), just backed by Postgres so
// it works on Vercel's stateless serverless functions instead of a local
// file. The REST API in app.js, and everything in the frontend, is
// completely unaware this swap happened — same endpoints, same responses.
//
// Uses the standard "pg" (node-postgres) driver rather than a
// provider-specific one (like Neon's own HTTP-based client) — pg works
// against ANY real Postgres server over the standard wire protocol, so
// this same code runs unchanged against Neon today, and later against AWS
// RDS or Aurora Postgres (or any other Postgres) with nothing to change
// except the connection string. That portability is the whole point.
//
// Uses a small connection pool sized for serverless (many short-lived
// function instances) — works the same way on a normal long-running server
// too, just with more headroom to spare.

const { Pool } = require('pg');

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  console.error('[db] No database connection string found in environment variables.');
  console.error('[db] Checked: DATABASE_URL, POSTGRES_URL, DATABASE_URL_UNPOOLED, POSTGRES_URL_NON_POOLING.');
  console.error('[db] Make sure a Postgres database (e.g. Neon) is connected to this project in the Storage tab.');
}

let pool = null;
function getPool() {
  if (!pool) {
    if (!connectionString) {
      throw new Error('No database connection configured — see server logs for which environment variable names were checked.');
    }
    pool = new Pool({
      connectionString,
      // Most managed Postgres providers (Neon, AWS RDS, Aurora) require SSL
      // and use certificates not worth manually verifying here — this
      // still encrypts the connection, just doesn't pin the exact CA chain.
      ssl: { rejectUnauthorized: false },
      max: 5, // small on purpose — safe for many concurrent serverless instances, plenty for a normal server too
    });
  }
  return pool;
}

let tableReadyPromise = null;
function ensureTable() {
  const p = getPool();
  if (!tableReadyPromise) {
    tableReadyPromise = p.query(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }
  return tableReadyPromise;
}

async function kvGet(key) {
  await ensureTable();
  const { rows } = await getPool().query('SELECT key, value FROM kv_store WHERE key = $1', [key]);
  return rows[0] || null;
}

async function kvSet(key, value) {
  await ensureTable();
  await getPool().query(
    `INSERT INTO kv_store (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [key, value]
  );
}

async function kvDelete(key) {
  await ensureTable();
  await getPool().query('DELETE FROM kv_store WHERE key = $1', [key]);
}

async function kvList(prefix) {
  await ensureTable();
  const { rows } = prefix
    ? await getPool().query('SELECT key FROM kv_store WHERE key LIKE $1 ORDER BY key', [prefix + '%'])
    : await getPool().query('SELECT key FROM kv_store ORDER BY key');
  return rows.map(r => r.key);
}

module.exports = { kvGet, kvSet, kvDelete, kvList };
