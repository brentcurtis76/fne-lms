import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintManifestSafety, syntheticMarker } from './manifest.mjs';
import { sanitizeReason } from './schema-attestation.mjs';

/**
 * Audit record for a write verb (apply / reset). Non-PII by construction:
 * manifest version + digest, target class + project ref, operator label,
 * timestamps and row counts. It is linted with the same safety rules as a
 * manifest before it is written, so a secret or an email can never land in
 * the audit directory.
 */

const OPERATOR_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/i;

export function assertOperatorLabel(operator) {
  if (typeof operator !== 'string' || !OPERATOR_RE.test(operator) || operator.includes('@')) {
    throw new Error('refusing: --operator must be a short handle (letters, digits, . _ -), never an email');
  }
  return operator;
}

/**
 * R11: a failed or partial write verb ALSO leaves an audit record. `failure`
 * carries the stage that failed and a sanitized reason: keys, URLs and
 * emails are redacted before the record is built, and the same safety lint
 * as a manifest runs afterwards — a record that still looks unsafe is
 * refused rather than written.
 */
export function buildFailureAuditRecord({ verb, manifest, target, operator, startedAt, finishedAt, stage, error, actorKind }) {
  return buildAuditRecord({
    verb,
    manifest,
    target,
    operator,
    startedAt,
    finishedAt,
    counts: null,
    ok: false,
    actorKind,
    failure: { stage: stage ?? verb, reason: sanitizeReason(error?.message ?? String(error ?? 'unknown')) },
  });
}

export function buildAuditRecord({ verb, manifest, target, operator, startedAt, finishedAt, counts, ok, actorKind, failure = null }) {
  const record = {
    schemaVersion: 1,
    verb,
    ok,
    ...syntheticMarker(manifest),
    failure,
    manifestVersion: manifest.manifestVersion,
    manifestMode: manifest.mode,
    manifestDigest: manifest.digest,
    targetName: target.targetName,
    environmentClass: target.environmentClass,
    projectRef: target.projectRef,
    operator: assertOperatorLabel(operator),
    actorKind,
    startedAt,
    finishedAt,
    counts,
  };
  const findings = lintManifestSafety(record);
  if (findings.length > 0) {
    throw new Error(`refusing to emit audit record: ${findings.map((f) => `${f.path} (${f.rule})`).join('; ')}`);
  }
  return Object.freeze(record);
}

export function auditFileName(record) {
  const stamp = record.finishedAt.replace(/[:.]/g, '-');
  return `${stamp}-${record.verb}-${record.manifestVersion}-${record.manifestDigest.slice(0, 8)}.json`;
}

export function writeAuditRecord(record, dir) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, auditFileName(record));
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return path;
}
