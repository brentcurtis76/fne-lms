// @vitest-environment node
/**
 * Z7-R5.2 — executable production inventory for direct and transitive ledger consumers.
 * New roots, table touches, RPCs/views/functions, SQL aliases, or dependency edges must
 * be explicitly classified here before the suite returns green.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type UseClass = 'billable' | 'aggregate' | 'status-only' | 'write' | 'historical';

const ROOT = process.cwd();
const NON_PRODUCTION_ROOTS = new Set([
  '.git', '.next', '__mocks__', '__tests__', 'coverage', 'docs', 'node_modules',
  'playwright-report', 'public', 'scripts', 'styles', 'supabase', 'test-results', 'tests',
]);

function filesBelow(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function productionTypescriptFiles(root = ROOT): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && !NON_PRODUCTION_ROOTS.has(entry.name)) {
      return filesBelow(join(root, entry.name));
    }
    return entry.isFile() ? [join(root, entry.name)] : [];
  }).filter((path) =>
    /\.tsx?$/.test(path) &&
    !path.includes('/__tests__/') &&
    !/\.(?:test|spec)\.[^.]+$/.test(path)
  );
}

type DiscoveredCall = { method: 'from' | 'rpc'; target?: string; unsupported?: string };

function discoverSupabaseCalls(source: string, file = 'probe.ts'): DiscoveredCall[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const strings = new Map<string, string>();
  const aliases = new Map<string, 'from' | 'rpc'>();

  function resolve(node: ts.Expression | undefined): string | undefined {
    if (!node) return undefined;
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isIdentifier(node)) return strings.get(node.text);
    return undefined;
  }

  function collect(node: ts.Node): void {
    if (ts.isVariableDeclaration(node)) {
      if (ts.isIdentifier(node.name)) {
        const value = resolve(node.initializer);
        if (value !== undefined) strings.set(node.name.text, value);
      } else if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          const sourceName = element.propertyName && ts.isIdentifier(element.propertyName)
            ? element.propertyName.text
            : ts.isIdentifier(element.name) ? element.name.text : '';
          if ((sourceName === 'from' || sourceName === 'rpc') && ts.isIdentifier(element.name)) {
            aliases.set(element.name.text, sourceName);
          }
        }
      }
    }
    ts.forEachChild(node, collect);
  }
  collect(sf);

  const calls: DiscoveredCall[] = [];
  const likelySupabaseReceiver = (expression: ts.Expression): boolean =>
    /(?:supabase|client|service|database|\bdb\b)/i.test(expression.getText(sf)) &&
    !/\.storage\b/i.test(expression.getText(sf));
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      let method: 'from' | 'rpc' | undefined;
      if (ts.isPropertyAccessExpression(node.expression) &&
          (node.expression.name.text === 'from' || node.expression.name.text === 'rpc')) {
        method = node.expression.name.text;
      } else if (ts.isElementAccessExpression(node.expression)) {
        const name = resolve(node.expression.argumentExpression);
        if (name === 'from' || name === 'rpc') method = name;
        else if (name === undefined && likelySupabaseReceiver(node.expression.expression)) {
          calls.push({ method: 'from', unsupported: 'dynamic callable name' });
        }
      } else if (ts.isIdentifier(node.expression)) {
        method = aliases.get(node.expression.text);
      }
      if (method) {
        const target = resolve(node.arguments[0]);
        const receiverLikely = !ts.isPropertyAccessExpression(node.expression) ||
          likelySupabaseReceiver(node.expression.expression);
        calls.push(target === undefined
          ? receiverLikely ? { method, unsupported: 'dynamic target' } : { method }
          : { method, target });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return calls;
}

function directTableTouchCount(source: string): number {
  return discoverSupabaseCalls(source).filter((call) =>
    call.method === 'from' && call.target === 'contract_hours_ledger').length;
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
  return discoverSupabaseCalls(source)
    .flatMap((call) => call.target && targets.has(call.target) ? [call.target] : []);
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

const DYNAMIC_NON_LEDGER_CALLS: Record<string, string> = {
  'lib/propuestas/scripts/seed-db.ts:from:dynamic target':
    'local seed loop over a closed proposal-table literal list',
  'lib/zoom/attendance-store.ts:from:dynamic target':
    'closed attendance identity-source descriptor; never a financial table',
  'utils/meetingUtils.ts:from:dynamic target':
    'closed meeting-child table selector; never a financial table',
};

function stripSqlComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
}

/** Alias-independent active `alias.hours` reads plus ledger `SET hours =` writes. */
function sqlDirectHoursUseCount(source: string): number {
  const sql = stripSqlComments(source);
  const aliases = new Set<string>();
  const aliasPattern = /\b(?:FROM|JOIN)\s+(?:"?public"?\.)?"?contract_hours_ledger"?(?:\s+(?:AS\s+)?("[^"]+"|[A-Za-z_][\w]*))?/gi;
  const reserved = new Set(['where', 'join', 'left', 'right', 'inner', 'outer', 'cross', 'on', 'group', 'order', 'limit', 'union']);
  for (const match of sql.matchAll(aliasPattern)) {
    const raw = match[1];
    if (raw && !reserved.has(raw.replaceAll('"', '').toLowerCase())) aliases.add(raw);
  }

  let count = 0;
  for (const alias of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const bounded = alias.startsWith('"') ? escaped : `\\b${escaped}\\b`;
    count += sql.match(new RegExp(`${bounded}\\s*\\.\\s*"?hours"?`, 'gi'))?.length ?? 0;
  }
  count += sql.match(/(?:\bcontract_hours_ledger\b|"contract_hours_ledger")\s*\.\s*"?hours"?/gi)?.length ?? 0;
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
    'historical', 'historical', 'historical', 'historical', 'historical',
  ],
  'supabase/migrations/20260809120000_fix_bucket_summary_fanout.sql': [
    'historical', 'historical',
  ],
  'supabase/migrations/20260809120100_reschedule_rpc_uses_bucket_summary.sql': [
    'historical', 'historical', 'write',
  ],
  'supabase/migrations/20260813120200_session_hour_overrides.sql': [
    'aggregate', 'aggregate', 'billable',
  ],
  'supabase/migrations/20260813120300_reschedule_availability_guard.sql': [
    'historical', 'write',
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
  'supabase/migrations/20260813120300_reschedule_availability_guard.sql': [
    'reschedule_session_hours:write/fail-closed/direct',
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

  it('fails closed on every unsupported dynamic callable or target in production', () => {
    const unsupported = productionTypescriptFiles().flatMap((path) =>
      discoverSupabaseCalls(readFileSync(path, 'utf8'), path)
        .filter((call) => call.unsupported)
        .map((call) => `${relative(ROOT, path)}:${call.method}:${call.unsupported}`)
    );
    expect(unsupported).toEqual(Object.keys(DYNAMIC_NON_LEDGER_CALLS));
    expect(Object.values(DYNAMIC_NON_LEDGER_CALLS).every(Boolean)).toBe(true);
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

  it('mutation probes bite on all supported TS forms, SQL aliases, and dependency edges', () => {
    expect(directTableTouchCount("client.from ( 'contract_hours_ledger' ).select('*')")).toBe(1);

    const syntaxForms = `
      const TABLE = 'contract_hours_ledger';
      const RPC = 'get_bucket_summary';
      const METHOD = 'from';
      client.from(TABLE);
      client[METHOD]('contract_hours_ledger');
      client['from']<LedgerRow>('contract_hours_ledger');
      const { from: readTable, rpc } = client;
      readTable('contract_hours_ledger');
      rpc(RPC);
    `;
    const discovered = discoverSupabaseCalls(syntaxForms);
    expect(discovered.filter((call) => call.target === 'contract_hours_ledger')).toHaveLength(4);
    expect(discovered.some((call) => call.target === 'get_bucket_summary')).toBe(true);
    expect(discovered.filter((call) => call.unsupported)).toEqual([]);
    expect(discoverSupabaseCalls('client[method](target)')[0].unsupported).toBe('dynamic callable name');
    expect(discoverSupabaseCalls('client.from(target)')[0].unsupported).toBe('dynamic target');

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
    expect(sqlDirectHoursUseCount(
      'SELECT contract_hours_ledger.hours FROM public.contract_hours_ledger;'
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      'SELECT "ledger rows"."hours" FROM "public"."contract_hours_ledger" AS "ledger rows";'
    )).toBe(1);

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

  it('discovers a newly introduced production TypeScript root', () => {
    const probeRoot = join(ROOT, 'future_z7_inventory_probe');
    const probeFile = join(probeRoot, 'consumer.ts');
    try {
      mkdirSync(probeRoot);
      writeFileSync(probeFile, "client.from('contract_hours_ledger').select('hours');\n");
      expect(productionTypescriptFiles()).toContain(probeFile);
      expect(directTableTouchCount(readFileSync(probeFile, 'utf8'))).toBe(1);
    } finally {
      rmSync(probeRoot, { recursive: true, force: true });
    }
  });
});
