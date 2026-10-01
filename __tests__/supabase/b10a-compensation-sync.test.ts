// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-B10a-01 C4: `supabase test db` mounts only supabase/tests, so pgTAP 074
 * cannot `\ir` the compensation artifact and carries a verbatim copy instead.
 * This keeps the tested SQL and the shipped SQL the same text.
 */
const ROOT = join(__dirname, '..', '..');
const ARTIFACT = 'supabase/compensation/20261001180000_b10a_restore_authenticated_reads.sql';
const PGTAP = 'supabase/tests/074-b10a-compensation-rollback.sql';

function compensationBlock(path: string): string {
  const text = readFileSync(join(ROOT, path), 'utf8');
  const start = text.indexOf('-- BEGIN COMPENSATION');
  const end = text.indexOf('-- END COMPENSATION');
  expect(start, `${path} has a BEGIN COMPENSATION marker`).toBeGreaterThanOrEqual(0);
  expect(end, `${path} has an END COMPENSATION marker after it`).toBeGreaterThan(start);
  expect(text.indexOf('-- BEGIN COMPENSATION', start + 1), `${path} has exactly one block`).toBe(-1);
  return text.slice(start, end);
}

describe('B10a compensation artifact', () => {
  it('pgTAP 074 applies exactly the artifact SQL', () => {
    expect(compensationBlock(PGTAP)).toBe(compensationBlock(ARTIFACT));
  });

  it('never drops, truncates, disables row security, grants, or reaches anon/PUBLIC', () => {
    const sql = compensationBlock(ARTIFACT)
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
      .toUpperCase();
    for (const forbidden of ['DROP ', 'TRUNCATE', 'DISABLE ROW LEVEL SECURITY', 'GRANT ', ' ANON', 'PUBLIC;', 'TO PUBLIC']) {
      expect(sql, `artifact must not contain ${forbidden.trim()}`).not.toContain(forbidden);
    }
    expect(sql.match(/CREATE POLICY/g)?.length).toBe(4);
    expect(sql.match(/FOR SELECT TO AUTHENTICATED USING \(TRUE\)/g)?.length).toBe(4);
  });

  it('is not a migration (never auto-applied)', () => {
    expect(ARTIFACT.startsWith('supabase/migrations/')).toBe(false);
  });
});
