#!/usr/bin/env node
/**
 * Regenerates the pilot schema attestation expectation from the LOCAL
 * database (review remediation R10).
 *
 *   node scripts/pilot-provisioning/attest-local-schema.mjs            # print digest, compare with the committed file
 *   node scripts/pilot-provisioning/attest-local-schema.mjs --write    # rewrite config/pilot-schema-attestation.json
 *
 * Talks to Postgres directly (pg) on the loopback stack only — it refuses
 * any non-local host — and calls public.pilot_schema_attestation() as the
 * `service_role` role (the only grantee), exactly as the provisioner will.
 * The digest is the sha256 of the canonical JSON payload; the per-section
 * digests let a later drift stop say which object moved.
 *
 * The committed expectation must be regenerated from a fresh
 * `supabase db reset` whenever a migration lands, and the change reviewed
 * like any other: the digest IS the statement "these are the objects the
 * pilot may run against".
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { ATTESTATION_VERSION, SCHEMA_ATTESTATION_CONFIG_PATH, computeSchemaDigest, sectionDigests } from './schema-attestation.mjs';

const { Client } = pg;
const DB_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

function assertLocal(url) {
  const host = new URL(url.replace(/^postgres(ql)?:\/\//, 'http://')).hostname;
  if (!LOCAL_HOSTS.has(host)) throw new Error(`refusing to attest a non-local database host "${host}"`);
}

export async function readLocalAttestation(dbUrl = DB_URL) {
  assertLocal(dbUrl);
  const client = new Client({ connectionString: dbUrl, application_name: 'pilot-schema-attestation' });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE service_role');
    const { rows } = await client.query('SELECT public.pilot_schema_attestation() AS payload');
    await client.query('ROLLBACK');
    return rows[0].payload;
  } finally {
    await client.end();
  }
}

export function buildExpectation(payload, { lastMigration }) {
  return {
    _comment: [
      'Pilot provisioning schema attestation expectation (R10).',
      'expectedDigest = sha256(canonical JSON of public.pilot_schema_attestation()) on a fresh supabase db reset.',
      'Regenerate with: node scripts/pilot-provisioning/attest-local-schema.mjs --write',
      'A target whose attestation digest differs is refused by preflight, apply, verify and reset. There is no bypass.',
    ],
    schemaVersion: 1,
    attestationVersion: ATTESTATION_VERSION,
    expectedDigest: computeSchemaDigest(payload),
    generatedFromMigration: lastMigration,
    tables: (payload.tables ?? []).map((t) => t.name),
    functions: (payload.functions ?? []).map((f) => `${f.name}(${f.arguments ?? ''})`),
    referencingForeignKeys: (payload.referencing_foreign_keys ?? []).length,
    sections: sectionDigests(payload),
  };
}

async function main() {
  const repoRoot = resolve(new URL('../..', import.meta.url).pathname);
  const write = process.argv.includes('--write');
  const payload = await readLocalAttestation();
  if (payload.attestation_version !== ATTESTATION_VERSION) throw new Error(`database attestation_version ${payload.attestation_version} is not ${ATTESTATION_VERSION}`);
  if ((payload.missing_tables ?? []).length || (payload.missing_functions ?? []).length) {
    throw new Error(`local database is missing required objects: ${[...payload.missing_tables, ...payload.missing_functions].join(', ')}`);
  }
  const { readdirSync } = await import('node:fs');
  const migrations = readdirSync(resolve(repoRoot, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
  const expectation = buildExpectation(payload, { lastMigration: migrations[migrations.length - 1] });
  const path = resolve(repoRoot, SCHEMA_ATTESTATION_CONFIG_PATH);
  let committed = null;
  try {
    committed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    committed = null;
  }
  const matches = committed?.expectedDigest === expectation.expectedDigest;
  process.stdout.write(`${JSON.stringify({ digest: expectation.expectedDigest, tables: expectation.tables.length, functions: expectation.functions.length, referencingForeignKeys: expectation.referencingForeignKeys, lastMigration: expectation.generatedFromMigration, committedDigest: committed?.expectedDigest ?? null, matchesCommitted: matches }, null, 2)}\n`);
  if (write) {
    writeFileSync(path, `${JSON.stringify(expectation, null, 2)}\n`);
    process.stdout.write(`wrote ${SCHEMA_ATTESTATION_CONFIG_PATH}\n`);
  } else if (!matches) {
    process.exitCode = 1;
  }
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    process.stderr.write(`schema attestation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
