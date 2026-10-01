// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-B10a-01 C4: `supabase test db` mounts only supabase/tests, so pgTAP 074
 * cannot `\ir` the compensation artifact and carries verbatim copies instead:
 * the whole region twice (apply, then idempotent re-run) and the modules block
 * once more (stand-down raises). This keeps every tested copy and the shipped
 * SQL the same text, and keeps executable SQL out of the artifact's unmarked
 * part, where no test would see it.
 */
const ROOT = join(__dirname, '..', '..');
const ARTIFACT = 'supabase/compensation/20261001180000_b10a_restore_authenticated_reads.sql';
const PGTAP = 'supabase/tests/074-b10a-compensation-rollback.sql';
const BEGIN = '-- BEGIN COMPENSATION';
const END = '-- END COMPENSATION';

const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

function regions(text: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf(BEGIN, from);
    if (start < 0) return out;
    const end = text.indexOf(END, start);
    expect(end, 'every BEGIN COMPENSATION has an END').toBeGreaterThan(start);
    out.push(text.slice(start, end + END.length));
    from = end + END.length;
  }
}

function modulesBlock(region: string): string {
  const start = region.indexOf('-- ---- public.modules ----');
  const end = region.indexOf('-- ---- public.', start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  return region.slice(start, end < 0 ? region.indexOf(END) : end);
}

describe('B10a compensation artifact', () => {
  const artifact = read(ARTIFACT);
  const [shipped] = regions(artifact);

  it('has exactly one marked region and nothing but comments outside it', () => {
    expect(regions(artifact)).toHaveLength(1);
    const outside = artifact.replace(shipped, '');
    const code = outside.split('\n').filter((l) => l.trim() !== '' && !l.trimStart().startsWith('--'));
    expect(code).toEqual([]);
  });

  it('pgTAP 074 applies exactly the artifact SQL, twice', () => {
    const copies = regions(read(PGTAP));
    expect(copies).toHaveLength(2);
    for (const copy of copies) expect(copy).toBe(shipped);
  });

  it("pgTAP 074's stand-down probe runs exactly the artifact's modules block", () => {
    const pgtap = read(PGTAP);
    const start = pgtap.indexOf('-- BEGIN MODULES BLOCK\n');
    const end = pgtap.indexOf('-- END MODULES BLOCK');
    expect(start).toBeGreaterThanOrEqual(0);
    // Trailing blank lines differ (the region separates blocks with one); the SQL may not.
    expect(pgtap.slice(start + '-- BEGIN MODULES BLOCK\n'.length, end).trimEnd()).toBe(
      modulesBlock(shipped).trimEnd()
    );
  });

  it('never drops, truncates, disables row security, grants, or reaches anon/PUBLIC', () => {
    const sql = shipped
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
