import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalJson, sha256 } from './manifest.mjs';

/**
 * Versioned schema attestation (review remediation R10).
 *
 * Column probes through PostgREST proved that a column exists, nothing more.
 * The database function public.pilot_schema_attestation() (migration
 * 20260908110000) returns a deterministic, ordered catalog description of
 * every object the provisioner depends on — tables, columns, RLS state,
 * policies, privileges, unique indexes, triggers, foreign keys (including
 * every foreign key that references a required table), required functions
 * with the md5 of their bodies and their EXECUTE grants. This module hashes
 * that payload and compares it with the digest committed in
 * config/pilot-schema-attestation.json.
 *
 * Fail closed, always:
 *   - no expectation configured            -> stop
 *   - the function is missing / not granted -> stop (unavailable)
 *   - attestation_version differs           -> stop
 *   - any missing table or function         -> stop (named)
 *   - digest differs                        -> stop (drift), with a bounded
 *                                              list of the differing sections
 * Nothing here can bypass the comparison; there is no flag.
 */

export const ATTESTATION_VERSION = 1;
export const SCHEMA_ATTESTATION_CONFIG_PATH = 'config/pilot-schema-attestation.json';

export function computeSchemaDigest(payload) {
  return sha256(canonicalJson(payload));
}

/** Per-section digests so a drift stop can say WHERE without printing definitions. */
export function sectionDigests(payload) {
  const out = {};
  for (const table of payload?.tables ?? []) out[`table:${table.name}`] = sha256(canonicalJson(table));
  for (const fn of payload?.functions ?? []) out[`function:${fn.name}(${fn.arguments ?? ''})`] = sha256(canonicalJson(fn));
  out['referencing_foreign_keys'] = sha256(canonicalJson(payload?.referencing_foreign_keys ?? []));
  return out;
}

export function loadSchemaAttestationConfig(repoRoot = process.cwd(), path = SCHEMA_ATTESTATION_CONFIG_PATH) {
  const raw = JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8'));
  return validateSchemaExpectation(raw);
}

const DIGEST_RE = /^[0-9a-f]{64}$/;

export function validateSchemaExpectation(expectation) {
  if (!expectation || typeof expectation !== 'object') throw new Error('schema attestation expectation is missing');
  if (expectation.schemaVersion !== 1) throw new Error('schema attestation expectation has an unknown schemaVersion');
  if (expectation.attestationVersion !== ATTESTATION_VERSION) throw new Error('schema attestation expectation targets another attestation version');
  if (!DIGEST_RE.test(String(expectation.expectedDigest ?? ''))) throw new Error('schema attestation expectation carries no valid expectedDigest');
  if (expectation.sections && typeof expectation.sections !== 'object') throw new Error('schema attestation expectation sections must be an object');
  return Object.freeze({ ...expectation });
}

/**
 * Pure comparison of an attestation payload with the expectation. Returns
 * `{ ok, digest, stops }`; `stops` is empty only when everything matches.
 */
export function evaluateSchemaAttestation({ payload, expectation }) {
  const stops = [];
  if (!expectation) {
    return { ok: false, digest: null, stops: ['schema attestation: no expectation is configured (config/pilot-schema-attestation.json)'] };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, digest: null, stops: ['schema attestation: the database returned no attestation payload'] };
  }
  if (payload.attestation_version !== expectation.attestationVersion) {
    stops.push(`schema attestation: database attestation_version ${payload.attestation_version} differs from expected ${expectation.attestationVersion}`);
  }
  for (const name of payload.missing_tables ?? []) stops.push(`schema attestation: required table ${name} is missing`);
  for (const name of payload.missing_functions ?? []) stops.push(`schema attestation: required function ${name} is missing`);

  const digest = computeSchemaDigest(payload);
  if (digest !== expectation.expectedDigest) {
    const observed = sectionDigests(payload);
    const expectedSections = expectation.sections ?? {};
    const drifted = Object.keys({ ...observed, ...expectedSections })
      .filter((key) => observed[key] !== expectedSections[key])
      .sort();
    const where = drifted.length > 0 && Object.keys(expectedSections).length > 0
      ? ` (drift in: ${drifted.slice(0, 12).join(', ')}${drifted.length > 12 ? ', …' : ''})`
      : '';
    stops.push(`schema attestation: digest ${digest.slice(0, 16)}… does not match the expected ${String(expectation.expectedDigest).slice(0, 16)}…${where}`);
  }
  return { ok: stops.length === 0, digest, stops };
}

/**
 * Reads the attestation through the store and evaluates it. A store that
 * cannot read it (function missing, privilege missing, network) is a stop —
 * never a pass.
 */
export async function attestSchema(store, expectation) {
  let payload;
  try {
    if (typeof store.readSchemaAttestation !== 'function') throw new Error('store has no readSchemaAttestation');
    payload = await store.readSchemaAttestation();
  } catch (error) {
    return {
      ok: false,
      digest: null,
      stops: [`schema attestation: unavailable (${sanitizeReason(error?.message)})`],
    };
  }
  return evaluateSchemaAttestation({ payload, expectation });
}

/** Edges (child, column, parent, on_delete) that reference any of `parents`, from an attestation payload. */
export function referencingEdges(payload, parents) {
  const wanted = new Set(parents);
  return (payload?.referencing_foreign_keys ?? [])
    .filter((e) => wanted.has(e.parent))
    .map((e) => ({ child: e.child, column: Array.isArray(e.columns) ? e.columns[0] : e.columns, parent: e.parent, onDelete: e.on_delete }))
    .sort((a, b) => `${a.parent}|${a.child}|${a.column}`.localeCompare(`${b.parent}|${b.child}|${b.column}`));
}

/** Strips anything that could be a key, a URL with credentials or an email from an error message. */
export function sanitizeReason(message) {
  return String(message ?? 'unknown')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[url]')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .slice(0, 300);
}
