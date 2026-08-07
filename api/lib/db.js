// Storage layer — a simple key/value store, same shape as the local SQLite
// version (one table: key, value, updated_at), just backed by Postgres so
// it works on Vercel's stateless serverless functions instead of a local
// file. The REST API in app.js, and everything in the frontend, is
// completely unaware this swap happened — same endpoints, same responses.
//
// Uses @vercel/postgres, which reads its connection string from the
// POSTGRES_URL environment variable automatically. On Vercel, that's
// injected for you the moment you attach a Postgres database to the
// project (Storage tab → Create Database). For local development, copy
// that same connection string into your own .env file.

const { sql } = require('@vercel/postgres');

let tableReadyPromise = null;
function ensureTable() {
  if (!tableReadyPromise) {
    tableReadyPromise = sql`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
  }
  return tableReadyPromise;
}

async function kvGet(key) {
  await ensureTable();
  const { rows } = await sql`SELECT key, value FROM kv_store WHERE key = ${key}`;
  return rows[0] || null;
}

async function kvSet(key, value) {
  await ensureTable();
  await sql`
    INSERT INTO kv_store (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
  `;
}

async function kvDelete(key) {
  await ensureTable();
  await sql`DELETE FROM kv_store WHERE key = ${key}`;
}

async function kvList(prefix) {
  await ensureTable();
  const { rows } = prefix
    ? await sql`SELECT key FROM kv_store WHERE key LIKE ${prefix + '%'} ORDER BY key`
    : await sql`SELECT key FROM kv_store ORDER BY key`;
  return rows.map(r => r.key);
}

module.exports = { kvGet, kvSet, kvDelete, kvList };
