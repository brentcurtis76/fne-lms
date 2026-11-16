#!/usr/bin/env node
// Invented sample content for the picture harness, on the private local copy only.
//
//   node scripts/redesign/harness/seed.mjs            every module under seed/, in name order
//   node scripts/redesign/harness/seed.mjs 03 08      only the modules whose file name starts with 03 or 08
//   node scripts/redesign/harness/seed.mjs --params   print the ids the modules offer for addresses with a changing part
//
// The made-up accounts come first from scripts/ci/seed-e2e.mjs (stack.sh seed). Each module under seed/ exports:
//   name            a short label
//   seed(ctx)       writes its rows. ctx = { supabase (service role, local), users (profile id by fixture key),
//                   fixtures (scripts/ci/e2e-fixtures.json), now (HARNESS_NOW) }. It must be safe to run twice
//                   (fixed ids, upserts), must set every date it can to a fixed value, and must be invented content.
//   params          { '<address pattern of _index.json>': { default: {…}, <role>: {…} } } — the values for [id] parts
//                   ('?' adds a query string, '#' a fragment).
//   variants        optional: [{ route, name, values, roles }] — further states of an address that get a picture of
//                   their own, recorded as '<route> ~<name>'.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FIXTURES, HARNESS_NOW, serviceClient, fixtureUserIds, stack } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export async function modules(only = []) {
  const files = readdirSync(join(HERE, 'seed')).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
  const picked = only.length ? files.filter((f) => only.some((o) => f.startsWith(o))) : files;
  const out = [];
  for (const f of picked) out.push({ file: f, ...(await import(pathToFileURL(join(HERE, 'seed', f)).href)) });
  return out;
}

export async function allParams() {
  const merged = {};
  for (const m of await modules()) {
    for (const [route, v] of Object.entries(m.params || {})) {
      if (merged[route]) throw new Error(`two seed modules offer ids for ${route}`);
      merged[route] = v;
    }
  }
  return merged;
}

// The roles cache (a materialized view) is created empty by the migrations and the application can only refresh it
// once it has been filled (REFRESH … CONCURRENTLY). In Production it is filled; on a fresh local stack it never is,
// and every read of it fails: an account whose profile has a generation cannot load its own profile. Fill it once,
// so the local copy behaves like Production.
export async function fillRolesCache() {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: stack().DB_URL });
  await client.connect();
  try { await client.query('REFRESH MATERIALIZED VIEW public.user_roles_cache'); } finally { await client.end(); }
  console.log('roles cache filled (public.user_roles_cache)');
}

export async function allVariants() {
  const out = [];
  for (const m of await modules()) out.push(...(m.variants || []));
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--params')) {
    console.log(JSON.stringify(await allParams(), null, 1));
  } else {
    const supabase = await serviceClient(); // refuses a stack that is not local
    const users = await fixtureUserIds(supabase);
    const ctx = { supabase, users, fixtures: FIXTURES, now: HARNESS_NOW };
    for (const m of await modules(args)) {
      const t = Date.now();
      await m.seed(ctx);
      console.log(`seeded ${m.file} (${m.name || ''}) in ${Date.now() - t} ms`);
    }
    await fillRolesCache();
  }
}
