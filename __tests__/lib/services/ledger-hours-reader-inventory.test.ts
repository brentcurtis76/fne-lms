// @vitest-environment node
/**
 * Z7-R4.3 — fail-on-new production inventory for contract_hours_ledger touches.
 *
 * The review artifact supplies the human explanation for every entry. This test
 * supplies the mechanical completeness boundary: adding a production TS table
 * touch or a SQL `l/chl.hours` expression without updating the classification
 * makes the suite red.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

type UseClass = 'billable' | 'aggregate' | 'status-only' | 'write' | 'historical';

const ROOT = process.cwd();

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

const TYPESCRIPT_TOUCHES: Record<string, UseClass[]> = {
  'lib/services/hour-tracking.ts': [
    'write', 'status-only', 'write', 'status-only', 'write', 'write',
  ],
  'lib/services/school-hours-report.ts': ['billable'],
  'pages/admin/sessions/index.tsx': ['status-only'],
  'pages/api/admin/consultant-rates/[id].ts': ['status-only', 'status-only'],
  'pages/api/admin/sessions/[id]/hours-comparison.ts': ['historical'],
  'pages/api/consultant-earnings/[consultant_id].ts': ['billable'],
  'pages/api/contracts/[id]/hours/allocate.ts': ['status-only'],
  'pages/api/contracts/[id]/hours/ledger/[ledgerId].ts': ['status-only', 'write'],
  'pages/api/contracts/[id]/hours/ledger/csv.ts': ['billable'],
  'pages/api/contracts/[id]/hours/ledger/index.ts': ['historical', 'write'],
  'pages/api/sessions/[id]/approve.ts': ['write'],
  'pages/api/sessions/reports/analytics.ts': ['aggregate'],
  'pages/consultor/sessions/index.tsx': ['status-only'],
};

const SQL_DIRECT_HOURS_USES: Record<string, UseClass[]> = {
  // Baseline definitions are retained migration history and superseded below.
  'supabase/migrations/00000000000000_baseline.sql': [
    'historical', 'historical', 'historical', 'historical', 'historical', 'historical',
  ],
  // This first reschedule definition was replaced by 20260809120100.
  'supabase/migrations/20260805120000_reschedule_hours_rpc.sql': [
    'historical', 'historical', 'historical', 'historical',
  ],
  // This bucket aggregate was replaced by the override-aware Z7 definition.
  'supabase/migrations/20260809120000_fix_bucket_summary_fanout.sql': [
    'historical', 'historical', 'historical',
  ],
  // Active pre-execution reschedule: reads original planned hours, then writes them.
  'supabase/migrations/20260809120100_reschedule_rpc_uses_bucket_summary.sql': [
    'historical', 'write',
  ],
  // Commented superseded claim plus active school/payment billable coalesces.
  'supabase/migrations/20260813120200_session_hour_overrides.sql': [
    'historical', 'aggregate', 'aggregate', 'billable',
  ],
};

describe('contract_hours_ledger.hours production-reader inventory', () => {
  it('classifies every production TypeScript table touch, including non-read exceptions', () => {
    const candidates = [...filesBelow(join(ROOT, 'lib')), ...filesBelow(join(ROOT, 'pages'))]
      .filter((path) => /\.(?:ts|tsx)$/.test(path))
      .filter((path) => !path.includes('/__tests__/') && !/\.test\.[^.]+$/.test(path));
    const actual: Record<string, number> = {};
    for (const path of candidates) {
      const count = readFileSync(path, 'utf8').match(
        /\.from\(['"]contract_hours_ledger['"]\)/g
      )?.length ?? 0;
      if (count > 0) actual[relative(ROOT, path)] = count;
    }

    expect(Object.keys(actual).sort()).toEqual(Object.keys(TYPESCRIPT_TOUCHES).sort());
    for (const [path, count] of Object.entries(actual)) {
      expect(TYPESCRIPT_TOUCHES[path], path).toHaveLength(count);
    }
  });

  it('classifies every direct SQL l.hours/chl.hours expression and hours write', () => {
    const migrationDir = join(ROOT, 'supabase/migrations');
    const actual: Record<string, number> = {};
    for (const path of filesBelow(migrationDir).filter((candidate) => candidate.endsWith('.sql'))) {
      const count = readFileSync(path, 'utf8').match(
        /\b(?:chl|l)\.hours\b|SET hours\s*=/g
      )?.length ?? 0;
      if (count > 0) actual[relative(ROOT, path)] = count;
    }

    expect(Object.keys(actual).sort()).toEqual(Object.keys(SQL_DIRECT_HOURS_USES).sort());
    for (const [path, count] of Object.entries(actual)) {
      expect(SQL_DIRECT_HOURS_USES[path], path).toHaveLength(count);
    }
  });
});
