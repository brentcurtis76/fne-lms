// @vitest-environment node
/**
 * S3 — the TS↔SQL pair that is maintained by hand.
 *
 * `security_audit_events.action` is constrained by a CHECK in the migration, and
 * `SECURITY_AUDIT_ACTIONS` in `lib/security/audit.ts` mirrors it so callers get
 * a compile-time union. Two hand-maintained lists that must agree is exactly the
 * shape that silently drifts — the project already carries one such pair (the
 * Zoom applies-from sets) and protects it with a test rather than a convention.
 *
 * This parses the migration and compares the two sets. Drift fails Gate 2, long
 * before a `23514 check constraint violated` shows up in production on the one
 * code path that emits the new action.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SECURITY_AUDIT_ACTIONS, SECURITY_AUDIT_OUTCOMES } from '../../../lib/security/audit';

const MIGRATION = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'supabase',
  'migrations',
  '20260818120000_security_audit_events.sql'
);

/** Pulls the quoted values out of a `CHECK (col = ANY (ARRAY[...]))` clause. */
function constraintValues(sql: string, constraintName: string): string[] {
  const start = sql.indexOf(`CONSTRAINT ${constraintName}`);
  if (start === -1) throw new Error(`constraint ${constraintName} not found in the migration`);

  const arrayStart = sql.indexOf('ARRAY[', start);
  const arrayEnd = sql.indexOf(']', arrayStart);
  if (arrayStart === -1 || arrayEnd === -1) {
    throw new Error(`constraint ${constraintName} is not in the expected ARRAY[...] form`);
  }

  return [...sql.slice(arrayStart, arrayEnd).matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
}

/** The migration with `--` comment lines removed, so a matrix that DOCUMENTS
 *  TRUNCATE is not mistaken for a statement that PERFORMS one. */
function statementsOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

describe('security_audit_events — the SQL CHECK and the TypeScript union agree', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('parses the migration (guards the guard)', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.security_audit_events');
  });

  it('the action sets are set-equal', () => {
    const fromSql = constraintValues(sql, 'security_audit_events_action_check');
    expect([...fromSql].sort()).toEqual([...SECURITY_AUDIT_ACTIONS].sort());
  });

  it('the outcome sets are set-equal', () => {
    const fromSql = constraintValues(sql, 'security_audit_events_outcome_check');
    expect([...fromSql].sort()).toEqual([...SECURITY_AUDIT_OUTCOMES].sort());
  });

  it('the migration is additive — it drops and truncates nothing', () => {
    // The project forbids destructive migrations outright; this pins it for the
    // one migration this branch adds rather than trusting review to notice.
    // Comment lines are stripped, and the match is anchored to the start of a
    // line: the header matrix and the COMMENT ON TABLE text both mention that
    // TRUNCATE is REVOKED, which is the opposite of performing one. What must
    // not exist is a statement that BEGINS with a destructive verb.
    const statements = statementsOnly(sql);
    expect(statements).not.toMatch(/^\s*DROP\s+(TABLE|COLUMN|POLICY|CONSTRAINT|INDEX|SCHEMA)\b/im);
    expect(statements).not.toMatch(/^\s*TRUNCATE\b/im);
    expect(statements).not.toMatch(/^\s*ALTER\s+TABLE[^\n]*\bDROP\b/im);
    expect(statements).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });

  it('the migration enables RLS and revokes the default public grants', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON public.security_audit_events FROM anon;');
    expect(sql).toContain('REVOKE ALL ON public.security_audit_events FROM authenticated;');
    expect(sql).toContain('GRANT SELECT ON public.security_audit_events TO authenticated;');
  });
});
