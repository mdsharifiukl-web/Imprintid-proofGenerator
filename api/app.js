// ImprintID API + static frontend — shared between local development
// (server.js) and Vercel (api/index.js both just require this file). All
// the actual route/serving logic lives here in one place so there's a
// single source of truth.

require('dotenv').config();

const path = require('path');
const express = require('express');
const bcFieldMap = require('./bc-field-map.js');
const { kvGet, kvSet, kvDelete, kvList } = require('./lib/db');

const app = express();

// Generous body size limit — proofs and product photos are embedded as
// base64 images, which can be a few MB each once several are combined.
app.use(express.json({ limit: '150mb' }));

// Serves public/index.html (and anything else in that folder) directly from
// this same function — explicit and self-contained, rather than relying on
// Vercel's separate automatic static-file layer, which didn't reliably
// apply to this project's request routing.
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------------------------------------------------------------
// Storage API — same get/set/delete/list shape the app already expects
// ---------------------------------------------------------------
app.get('/api/storage/:key', async (req, res) => {
  try {
    const row = await kvGet(req.params.key);
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.json({ key: row.key, value: row.value, shared: true });
  } catch (err) {
    console.error('[storage GET] failed:', err.message);
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

app.put('/api/storage/:key', async (req, res) => {
  const { value } = req.body || {};
  if (typeof value !== 'string') {
    return res.status(400).json({ error: 'value must be a string' });
  }
  try {
    await kvSet(req.params.key, value);
    res.json({ key: req.params.key, value, shared: true });
  } catch (err) {
    console.error('[storage PUT] failed:', err.message);
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

app.delete('/api/storage/:key', async (req, res) => {
  try {
    await kvDelete(req.params.key);
    res.json({ key: req.params.key, deleted: true, shared: true });
  } catch (err) {
    console.error('[storage DELETE] failed:', err.message);
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

app.get('/api/storage', async (req, res) => {
  try {
    const prefix = req.query.prefix || '';
    const keys = await kvList(prefix);
    res.json({ keys, prefix, shared: true });
  } catch (err) {
    console.error('[storage LIST] failed:', err.message);
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

// Simple health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------
// Business Central integration (optional — only active if configured)
// ---------------------------------------------------------------
const BC = {
  tenantId: process.env.BC_TENANT_ID || '',
  clientId: process.env.BC_CLIENT_ID || '',
  clientSecret: process.env.BC_CLIENT_SECRET || '',
  environment: process.env.BC_ENVIRONMENT || 'Production',
  companyId: process.env.BC_COMPANY_ID || '',
  companyName: process.env.BC_COMPANY_NAME || ''
};

function bcIsConfigured() {
  return !!(BC.tenantId && BC.clientId && BC.clientSecret && (BC.companyId || BC.companyName));
}

// Access tokens are valid ~1 hour — cache and reuse instead of
// re-authenticating on every request. Note: on Vercel, a cold start gets a
// fresh cache each time, so this mainly helps warm invocations.
let bcTokenCache = { token: null, expiresAt: 0 };
async function getBcAccessToken() {
  if (bcTokenCache.token && Date.now() < bcTokenCache.expiresAt - 60000) {
    return bcTokenCache.token;
  }
  const tokenUrl = `https://login.microsoftonline.com/${BC.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: BC.clientId,
    client_secret: BC.clientSecret,
    scope: 'https://api.businesscentral.dynamics.com/.default'
  });
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Azure AD token request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  bcTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in * 1000) };
  return bcTokenCache.token;
}

function bcApiBase() {
  const apiPath = bcFieldMap.customApiPath || 'api/v2.0';
  return `https://api.businesscentral.dynamics.com/v2.0/${BC.tenantId}/${encodeURIComponent(BC.environment)}/${apiPath}`;
}

async function bcFetchJson(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Business Central API request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

// Resolves the company filter once per warm instance and reuses it —
// prefers the ID (more reliable) and falls back to looking up by name.
let bcCompanyIdCache = null;
async function resolveBcCompanyId(token) {
  if (BC.companyId) return BC.companyId;
  if (bcCompanyIdCache) return bcCompanyIdCache;
  const data = await bcFetchJson(`${bcApiBase()}/companies?$filter=${encodeURIComponent(`name eq '${BC.companyName}'`)}`, token);
  const match = (data.value || [])[0];
  if (!match) throw new Error(`No Business Central company found named "${BC.companyName}". Check BC_COMPANY_NAME / BC_COMPANY_ID.`);
  bcCompanyIdCache = match.id;
  return bcCompanyIdCache;
}

app.get('/api/bc/status', (req, res) => {
  res.json({ configured: bcIsConfigured() });
});

app.get('/api/bc/order/:orderNo', async (req, res) => {
  if (!bcIsConfigured()) {
    return res.status(400).json({ error: 'not_configured', message: 'Business Central isn\'t connected yet.' });
  }
  const orderNo = req.params.orderNo;
  try {
    const token = await getBcAccessToken();
    const companyId = await resolveBcCompanyId(token);
    const base = `${bcApiBase()}/companies(${companyId})`;

    const orderData = await bcFetchJson(
      `${base}/salesOrders?$filter=${encodeURIComponent(`number eq '${orderNo}'`)}&$expand=salesOrderLines`,
      token
    );
    const order = (orderData.value || [])[0];
    if (!order) {
      return res.status(404).json({ error: 'not_found', message: `Order "${orderNo}" was not found in Business Central.` });
    }

    const lines = order.salesOrderLines || [];
    const firstItemLine = lines.find(l => l.lineType === 'Item' || l.itemId || l.number) || lines[0] || {};

    function readCustomField(fieldName, fromHeader) {
      if (!fieldName) return '';
      const source = (bcFieldMap.customFieldsOn === 'header' || fromHeader) ? order : firstItemLine;
      return (source && source[fieldName] != null) ? String(source[fieldName]) : '';
    }

    const totalQty = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);

    res.json({
      found: true,
      orderNo: order.number || orderNo,
      customerName: order.customerName || order.sellToCustomerName || '',
      itemCode: firstItemLine.number || firstItemLine.itemNumber || '',
      itemColor: readCustomField(bcFieldMap.itemColorField),
      imprintMethod: readCustomField(bcFieldMap.imprintMethodField),
      totalQty: totalQty || firstItemLine.quantity || '',
      specialRequest: readCustomField(bcFieldMap.specialRequestField) || order.externalDocumentNumber || ''
    });
  } catch (err) {
    console.error('[Business Central] lookup failed:', err.message);
    res.status(502).json({ error: 'bc_error', message: err.message });
  }
});

module.exports = app;
module.exports.bcIsConfigured = bcIsConfigured;
module.exports.BC = BC;
