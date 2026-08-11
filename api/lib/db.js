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

const rawConnectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

// Neon's pooled connection string includes "channel_binding=require" — a
// newer, fairly obscure Postgres security parameter. Node's own URL parser
// handles it fine, but the "pg" library's internal connection-string parser
// doesn't, and silently corrupts the parsed host (this is what was causing
// "getaddrinfo ENOTFOUND base"). It isn't needed for the connection itself
// to work (sslmode=require already covers the encryption requirement), so
// it's safe to drop before handing the string to pg.
function sanitizeConnectionString(str) {
  if (!str) return str;
  try {
    const url = new URL(str);
    url.searchParams.delete('channel_binding');
    return url.toString();
  } catch (e) {
    return str; // couldn't parse — leave as-is, the real error will surface below
  }
}
const connectionString = sanitizeConnectionString(rawConnectionString);

if (!connectionString) {
  console.error('[db] No database connection string found in environment variables.');
  console.error('[db] Checked: DATABASE_URL, POSTGRES_URL, DATABASE_URL_UNPOOLED, POSTGRES_URL_NON_POOLING.');
  console.error('[db] Make sure a Postgres database (e.g. Neon) is connected to this project in the Storage tab.');
} else {
  // Logs only the host/port/database — never the username or password —
  // so a misconfigured .env file (stray quotes, a line break in the
  // middle of the string, a partial paste, etc.) is immediately obvious
  // in the terminal instead of showing up later as a cryptic DNS error.
  try {
    const parsed = new URL(connectionString);
    console.log(`[db] Connection string parsed OK — host: ${parsed.hostname}, port: ${parsed.port || '(default)'}, database: ${parsed.pathname.replace('/', '') || '(none)'}`);
  } catch (e) {
    console.error('[db] DATABASE_URL does not look like a valid connection string:', e.message);
    console.error('[db] It should be ONE line, starting with postgresql:// or postgres://, with no surrounding quotes.');
  }
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
