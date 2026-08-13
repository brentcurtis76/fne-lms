// @vitest-environment node
/**
 * Z7-R5.2 — executable production inventory for direct and transitive ledger consumers.
 * New roots, table touches, RPCs/views/functions, SQL aliases, or dependency edges must
 * be explicitly classified here before the suite returns green.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

type UseClass = 'billable' | 'aggregate' | 'status-only' | 'write' | 'historical';

const ROOT = process.cwd();
const PRODUCTION_TS_ROOTS = [
  'components',
  'config',
  'constants',
  'contexts',
  'hooks',
  'lib',
  'pages',
  'src',
  'types',
  'utils',
] as const;

function filesBelow(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function productionTypescriptFiles(): string[] {
  const rootFiles = readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(ROOT, entry.name));
  return [
    ...rootFiles,
    ...PRODUCTION_TS_ROOTS.flatMap((directory) => filesBelow(join(ROOT, directory))),
  ].filter((path) =>
    /\.tsx?$/.test(path) &&
    !path.includes('/__tests__/') &&
    !/\.test\.[^.]+$/.test(path)
  );
}

function directTableTouchCount(source: string): number {
  return source.match(/\.from\s*\(\s*['"]contract_hours_ledger['"]\s*\)/g)?.length ?? 0;
}

const DIRECT_TS_TOUCHES: Record<string, UseClass[]> = {
  'components/workspace/WorkspaceSessionsTab.tsx': ['status-only'],
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

interface SqlObjectDefinition {
  file: string;
  type: 'function' | 'view' | 'materialized view';
  name: string;
  body: string;
}

function sqlObjectDefinitions(source: string, file: string): SqlObjectDefinition[] {
  const definitions: SqlObjectDefinition[] = [];
  const functionPattern = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?"?([A-Za-z_][\w]*)"?[\s\S]*?\bAS\s+\$([A-Za-z_]*)\$([\s\S]*?)\$\2\$/gi;
  for (const match of source.matchAll(functionPattern)) {
    definitions.push({ file, type: 'function', name: match[1], body: match[3] });
  }
  const viewPattern = /CREATE\s+(?:OR\s+REPLACE\s+)?((?:MATERIALIZED\s+)?VIEW)\s+(?:"?public"?\.)?"?([A-Za-z_][\w]*)"?\s+AS\s+([\s\S]*?);/gi;
  for (const match of source.matchAll(viewPattern)) {
    definitions.push({
      file,
      type: match[1].toLowerCase() as 'view' | 'materialized view',
      name: match[2],
      body: match[3],
    });
  }
  return definitions;
}

function ledgerObjectNames(definitions: SqlObjectDefinition[]): Set<string> {
  const names = new Set(
    definitions
      .filter((definition) => /\bcontract_hours_ledger\b/i.test(definition.body))
      .map((definition) => definition.name)
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const definition of definitions) {
      if (names.has(definition.name)) continue;
      if ([...names].some((name) => new RegExp(`\\b${name}\\b`, 'i').test(definition.body))) {
        names.add(definition.name);
        changed = true;
      }
    }
  }
  return names;
}

function indirectCalls(source: string, targets: Set<string>): string[] {
  const calls: string[] = [];
  const pattern = /\.(?:rpc|from)\s*\(\s*(['"])([A-Za-z_][\w]*)\1/g;
  for (const match of source.matchAll(pattern)) {
    if (targets.has(match[2])) calls.push(match[2]);
  }
  return calls;
}

/** Source-order role + authority; `non-authoritative` means no financial write trusts it. */
const INDIRECT_TS_CONSUMERS: Record<string, string[]> = {
  'lib/services/hour-tracking.ts': [
    'get_bucket_summary:write-precondition/fail-closed',
    'apply_session_reschedule:write/fail-closed',
  ],
  'lib/services/school-hours-report.ts': ['get_bucket_summary:aggregate/fail-closed'],
  'pages/admin/sessions/create.tsx': ['get_bucket_summary:financial-preview/non-authoritative'],
  'pages/api/admin/sessions/[id]/hour-override.ts': [
    'apply_session_hour_override:write/fail-closed-admin-db-auth',
  ],
  'pages/api/consultant-earnings/[consultant_id].ts': [
    'get_consultant_earnings:billable/fail-closed',
  ],
  'pages/api/consultant-earnings/[consultant_id]/pdf.ts': [
    'get_consultant_earnings:billable/fail-closed',
  ],
  'pages/api/contracts/[id]/hours/index.ts': ['get_bucket_summary:aggregate/fail-closed'],
  'pages/api/contracts/[id]/hours/reallocate.ts': [
    'get_bucket_summary:write-precondition/fail-closed',
    'get_bucket_summary:post-write-display/non-authoritative',
  ],
};

function stripSqlComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
}

/** Alias-independent active `alias.hours` reads plus ledger `SET hours =` writes. */
function sqlDirectHoursUseCount(source: string): number {
  const sql = stripSqlComments(source);
  const aliases = new Set<string>();
  const aliasPattern = /\b(?:FROM|JOIN)\s+(?:"?public"?\.)?"?contract_hours_ledger"?\s+(?:AS\s+)?"?([A-Za-z_][\w]*)"?/gi;
  for (const match of sql.matchAll(aliasPattern)) aliases.add(match[1]);

  let count = 0;
  for (const alias of aliases) {
    count += sql.match(new RegExp(`\\b${alias}\\.hours\\b`, 'gi'))?.length ?? 0;
  }
  const updatePattern = /\bUPDATE\s+(?:"?public"?\.)?"?contract_hours_ledger"?(?:\s+(?:AS\s+)?"?[A-Za-z_][\w]*"?)?\s+SET\s+([\s\S]*?)(?:\bWHERE\b|;)/gi;
  for (const match of sql.matchAll(updatePattern)) {
    count += match[1].match(/\bhours\s*=/gi)?.length ?? 0;
  }
  return count;
}

const SQL_DIRECT_HOURS_USES: Record<string, UseClass[]> = {
  'supabase/migrations/00000000000000_baseline.sql': [
    'historical', 'historical', 'historical', 'historical', 'historical', 'historical',
  ],
  'supabase/migrations/20260805120000_reschedule_hours_rpc.sql': [
    'historical', 'historical', 'historical', 'historical',
  ],
  'supabase/migrations/20260809120000_fix_bucket_summary_fanout.sql': [
    'historical', 'historical',
  ],
  'supabase/migrations/20260809120100_reschedule_rpc_uses_bucket_summary.sql': [
    'historical', 'write',
  ],
  'supabase/migrations/20260813120200_session_hour_overrides.sql': [
    'aggregate', 'aggregate', 'billable',
  ],
};

const SQL_LEDGER_OBJECTS: Record<string, string[]> = {
  'supabase/migrations/00000000000000_baseline.sql': [
    'get_bucket_summary:historical/direct',
    'get_consultant_earnings:historical/direct',
  ],
  'supabase/migrations/20260805120000_reschedule_hours_rpc.sql': [
    'reschedule_session_hours:historical/direct',
  ],
  'supabase/migrations/20260808120000_session_reschedule_atomic.sql': [
    'apply_session_reschedule:write/fail-closed/transitive',
  ],
  'supabase/migrations/20260809120000_fix_bucket_summary_fanout.sql': [
    'get_bucket_summary:historical/direct',
  ],
  'supabase/migrations/20260809120100_reschedule_rpc_uses_bucket_summary.sql': [
    'reschedule_session_hours:write/fail-closed/direct',
  ],
  'supabase/migrations/20260813120200_session_hour_overrides.sql': [
    'apply_session_hour_override:write/fail-closed/direct',
    'get_bucket_summary:aggregate/direct',
    'get_consultant_earnings:billable/direct',
  ],
};

function expectExactCounts(actual: Record<string, number>, expected: Record<string, unknown[]>): void {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const [path, count] of Object.entries(actual)) {
    expect(expected[path], path).toHaveLength(count);
  }
}

describe('contract_hours_ledger production consumer inventory', () => {
  const migrationFiles = filesBelow(join(ROOT, 'supabase/migrations'))
    .filter((candidate) => candidate.endsWith('.sql'));
  const definitions = migrationFiles.flatMap((path) =>
    sqlObjectDefinitions(readFileSync(path, 'utf8'), relative(ROOT, path))
  );
  const objectNames = ledgerObjectNames(definitions);

  it('scans every production TypeScript root and classifies all direct table touches', () => {
    const actual: Record<string, number> = {};
    for (const path of productionTypescriptFiles()) {
      const count = directTableTouchCount(readFileSync(path, 'utf8'));
      if (count > 0) actual[relative(ROOT, path)] = count;
    }
    expectExactCounts(actual, DIRECT_TS_TOUCHES);
  });

  it('classifies every direct or transitive SQL function/view consumer', () => {
    const actual: Record<string, number> = {};
    const directNames = new Set(
      definitions
        .filter((definition) => /\bcontract_hours_ledger\b/i.test(definition.body))
        .map((definition) => definition.name)
    );
    for (const definition of definitions.filter((candidate) => objectNames.has(candidate.name))) {
      const path = definition.file;
      actual[path] = (actual[path] ?? 0) + 1;
      expect(SQL_LEDGER_OBJECTS[path]?.some((entry) =>
        entry.startsWith(`${definition.name}:`) &&
        entry.endsWith(directNames.has(definition.name) ? '/direct' : '/transitive')
      ), `${path}:${definition.name}`).toBe(true);
    }
    expectExactCounts(actual, SQL_LEDGER_OBJECTS);
  });

  it('classifies every production RPC/view call into the discovered SQL dependency graph', () => {
    const actual: Record<string, number> = {};
    for (const path of productionTypescriptFiles()) {
      const calls = indirectCalls(readFileSync(path, 'utf8'), objectNames);
      if (calls.length === 0) continue;
      const relativePath = relative(ROOT, path);
      actual[relativePath] = calls.length;
      expect(calls).toEqual(
        INDIRECT_TS_CONSUMERS[relativePath]?.map((entry) => entry.split(':')[0])
      );
    }
    expectExactCounts(actual, INDIRECT_TS_CONSUMERS);
  });

  it('discovers active raw-hours SQL under arbitrary aliases, excluding comments', () => {
    const actual: Record<string, number> = {};
    for (const path of migrationFiles) {
      const count = sqlDirectHoursUseCount(readFileSync(path, 'utf8'));
      if (count > 0) actual[relative(ROOT, path)] = count;
    }
    expectExactCounts(actual, SQL_DIRECT_HOURS_USES);
  });

  it('mutation probes bite on direct, multiline RPC, alternate alias, and view/function edges', () => {
    expect(directTableTouchCount("client.from ( 'contract_hours_ledger' ).select('*')")).toBe(1);

    const multilineRpc = `
      const { data, error } = await client
        .rpc(
          'get_bucket_summary',
          { p_contrato_id: id }
        );`;
    expect(indirectCalls(multilineRpc, objectNames)).toEqual(['get_bucket_summary']);

    const alternateAlias = `
      SELECT ledger_rows.hours
      FROM public.contract_hours_ledger AS ledger_rows;`;
    expect(sqlDirectHoursUseCount(alternateAlias)).toBe(1);

    const syntheticSql = `
      CREATE VIEW public.synthetic_ledger_view AS
        SELECT ledger_rows.hours FROM public.contract_hours_ledger ledger_rows;
      CREATE FUNCTION public.synthetic_ledger_function() RETURNS SETOF numeric
      LANGUAGE sql AS $body$
        SELECT hours FROM public.synthetic_ledger_view
      $body$;`;
    const syntheticDefinitions = sqlObjectDefinitions(syntheticSql, 'synthetic.sql');
    const syntheticTargets = ledgerObjectNames(syntheticDefinitions);
    expect([...syntheticTargets].sort()).toEqual([
      'synthetic_ledger_function',
      'synthetic_ledger_view',
    ]);
    expect(indirectCalls("client.from('synthetic_ledger_view')", syntheticTargets)).toEqual([
      'synthetic_ledger_view',
    ]);

    // These representative mutations are detected but intentionally absent from
    // the production classifications: the same exact-count assertions above would
    // therefore go red if any were inserted into a production root/migration.
    expect(DIRECT_TS_TOUCHES['components/synthetic.tsx']).toBeUndefined();
    expect(INDIRECT_TS_CONSUMERS['pages/synthetic.ts']).toBeUndefined();
    expect(SQL_DIRECT_HOURS_USES['supabase/migrations/synthetic.sql']).toBeUndefined();
    expect(SQL_LEDGER_OBJECTS['supabase/migrations/synthetic.sql']).toBeUndefined();
  });
});
