// Shared by the picture harness: where things are, the local stack's settings, the roles and their made-up accounts.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..', '..', '..');
export const STATE = process.env.RD_STATE || join(homedir(), '.cache', 'genera-rd-safety');
export const PICTURES = process.env.RD_PICTURES || join(homedir(), 'Projects', 'genera-redesign', 'pictures');
export const INDEX = join(ROOT, 'docs', 'plan', 'redesign', 'inventory', 'data', '_index.json');
export const FIXTURES = JSON.parse(readFileSync(join(ROOT, 'scripts', 'ci', 'e2e-fixtures.json'), 'utf8'));

// The moment every picture is taken at, as far as the browser knows. It must lie in the past (a browser clock ahead of
// the real one makes the sign-in library think its session expired). The sample content is dated around it.
export const HARNESS_NOW = '2026-11-13T12:00:00-03:00';

// One made-up account per role (scripts/ci/e2e-fixtures.json). "anon" is a visitor who is not signed in.
export const ROLES = {
  admin: 'admin',
  consultor: 'consultorAssigned',
  equipo_directivo: 'directivo',
  lider_generacion: 'generationLeader',
  lider_comunidad: 'gcLeader',
  supervisor_de_red: 'networkSupervisor',
  community_manager: 'communityManager',
  docente: 'docente',
  encargado_licitacion: 'procurementManager',
  anon: null,
};

const LOCAL = new Set(['127.0.0.1', 'localhost', '::1']);

// The recorded stack (written by stack.sh). Refuses anything that is not on this machine.
let recorded = null; // read once: a seed file may set environment values later for application code it loads
export function stack() {
  if (recorded) return recorded;
  const f = join(STATE, 'stack.env');
  const env = {};
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Inside a run of scripts/ci/e2e-local.sh (a browser test that wants the sample content): its own settings.
    Object.assign(env, {
      API_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, DB_URL: process.env.SUPABASE_DB_URL || 'unknown',
      APP_PORT: process.env.E2E_PORT || '3000', PROJECT_ID: process.env.E2E_LOCAL_PROJECT_ID || 'unknown',
    });
  } else {
    if (!existsSync(f)) throw new Error(`no stack recorded in ${f}; run scripts/redesign/harness/stack.sh up`);
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^'(.*)'$/, '$1');
    }
  }
  for (const k of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY', 'DB_URL', 'APP_PORT', 'PROJECT_ID']) {
    if (!env[k]) throw new Error(`stack.env has no ${k}`);
  }
  if (!LOCAL.has(new URL(env.API_URL).hostname)) throw new Error(`refusing: the recorded stack is not local (${env.API_URL})`);
  // The database address too: the seed speaks to it directly. ('unknown' is a run that gave none; psql then fails by itself.)
  if (env.DB_URL !== 'unknown') {
    let dbHost = null;
    try { dbHost = new URL(env.DB_URL).hostname; } catch { /* not an address */ }
    if (!dbHost || !LOCAL.has(dbHost)) throw new Error('refusing: the database address of the stack is not local');
  }
  env.APP = `http://localhost:${env.APP_PORT}`;
  recorded = env;
  return env;
}

export async function serviceClient() {
  const { createClient } = await import('@supabase/supabase-js');
  const s = stack();
  return createClient(s.API_URL, s.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

// profile id of every made-up account, by its key in the fixtures (admin, docente, consultorAssigned, …).
export async function fixtureUserIds(supabase) {
  const emails = Object.fromEntries(Object.entries(FIXTURES.users).map(([k, u]) => [u.email, k]));
  const { data, error } = await supabase.from('profiles').select('id, email').in('email', Object.keys(emails));
  if (error) throw new Error(`profiles: ${error.message}`);
  const ids = {};
  for (const row of data) ids[emails[row.email]] = row.id;
  const missing = Object.keys(FIXTURES.users).filter((k) => !ids[k]);
  if (missing.length) throw new Error(`accounts not seeded: ${missing.join(', ')} (run stack.sh seed)`);
  return ids;
}
