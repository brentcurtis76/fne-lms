/**
 * Verify RLS for finance tables: clientes, contratos, cuotas
 * Uses STAGING_* env vars if present, otherwise PROD_*.
 */
const fs = require('fs');
const path = require('path');

function env(key, fallbackKey) {
  return process.env[key] || process.env[fallbackKey] || '';
}

const baseUrl = env('STAGING_SUPABASE_URL', 'PROD_SUPABASE_URL');
const anon = env('STAGING_SUPABASE_ANON_KEY', 'PROD_SUPABASE_ANON_KEY');
const service = env('STAGING_SUPABASE_SERVICE_ROLE_KEY', 'PROD_SUPABASE_SERVICE_ROLE_KEY');

const areaDir = path.join('logs', 'mcp', new Date().toISOString().slice(0,10).replace(/-/g,''), 'finance-rls');
fs.mkdirSync(areaDir, { recursive: true });

async function fetchJson(url, key, extraHeaders={}) {
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...extraHeaders,
    }
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body };
}

(async () => {
  const tables = ['clientes','contratos','cuotas'];
  const summary = { timestamp: new Date().toISOString(), baseUrl, tables: {}, passed: true };

  for (const t of tables) {
    summary.tables[t] = {};
    // Anonymous should be blocked
    const anonRes = await fetchJson(`${baseUrl}/rest/v1/${t}?select=id&limit=1`, anon);
    summary.tables[t].anonymous = { status: anonRes.status, message: anonRes.body?.message || null };
    if (anonRes.status !== 401 && anonRes.status !== 403) summary.passed = false;

    // Service role should have count
    const svcRes = await fetchJson(`${baseUrl}/rest/v1/${t}?select=id&limit=0`, service, { Prefer: 'count=exact' });
    summary.tables[t].service = { status: svcRes.status, contentRange: svcRes.headers['content-range'] || null };
    if (![200,206].includes(svcRes.status)) summary.passed = false;
  }

  fs.writeFileSync(path.join(areaDir, 'verification-summary.json'), JSON.stringify(summary, null, 2));
  console.log('Verification summary saved to', path.join(areaDir, 'verification-summary.json'));
  if (!summary.passed) process.exit(1);
})();

