// @vitest-environment node
/**
 * Z7-R5.2 — executable production inventory for direct and transitive ledger consumers.
 * New roots, table touches, RPCs/views/functions, SQL aliases, or dependency edges must
 * be explicitly classified here before the suite returns green.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

function productionSourceFiles(root = ROOT): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && !NON_PRODUCTION_ROOTS.has(entry.name)) {
      return filesBelow(join(root, entry.name));
    }
    return entry.isFile() ? [join(root, entry.name)] : [];
  }).filter((path) =>
    /\.[jt]sx?$/.test(path) &&
    !/(?:^|\/)(?:__tests__|tests)(?:\/|$)/.test(path) &&
    !/\.(?:test|spec)\.[^.]+$/.test(path)
  );
}

type MethodName = 'from' | 'rpc';
type Binding = { stringValue?: string; method?: MethodName; declared: true };
type DiscoveredCall = {
  method: MethodName | 'unknown';
  target?: string;
  unsupported?: 'dynamic callable name' | 'dynamic target';
  expression?: string;
};

function readPropertyName(node: ts.PropertyName | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return undefined;
}

function discoverSupabaseCalls(source: string, file = 'probe.ts'): DiscoveredCall[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith('.jsx') ? ts.ScriptKind.JSX
      : file.endsWith('.js') ? ts.ScriptKind.JS
        : file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const scopes: Array<Map<string, Binding>> = [new Map()];
  const calls: DiscoveredCall[] = [];

  function binding(name: string): Binding | undefined {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const found = scopes[index].get(name);
      if (found) return found;
    }
    return undefined;
  }

  function resolveString(node: ts.Expression | undefined): string | undefined {
    if (!node) return undefined;
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isIdentifier(node)) return binding(node.text)?.stringValue;
    return undefined;
  }

  function declareName(name: ts.BindingName, initializer?: ts.Expression): void {
    const scope = scopes[scopes.length - 1];
    if (ts.isIdentifier(name)) {
      scope.set(name.text, {
        declared: true,
        stringValue: resolveString(initializer),
      });
      return;
    }
    for (const element of name.elements) {
      if (!ts.isBindingElement(element) || element.dotDotDotToken ||
          !ts.isIdentifier(element.name)) continue;
      const sourceName = readPropertyName(element.propertyName) ?? element.name.text;
      scope.set(element.name.text, {
        declared: true,
        method: sourceName === 'from' || sourceName === 'rpc' ? sourceName : undefined,
      });
    }
  }

  function receiverExcluded(expression: ts.Expression): boolean {
    const text = expression.getText(sf);
    return text === 'Array' || text === 'Buffer' || /\.storage\b/.test(text);
  }

  function withScope(run: () => void): void {
    scopes.push(new Map());
    try { run(); } finally { scopes.pop(); }
  }

  function visit(node: ts.Node): void {
    if (ts.isBlock(node) && node !== sf) {
      withScope(() => node.statements.forEach(visit));
      return;
    }
    if (ts.isFunctionLike(node)) {
      withScope(() => {
        node.parameters.forEach((parameter) => declareName(parameter.name));
        if (node.body) visit(node.body);
      });
      return;
    }
    if (ts.isVariableDeclaration(node)) {
      if (!node.name) return;
      if (node.initializer) visit(node.initializer);
      declareName(node.name, node.initializer);
      return;
    }
    if (ts.isCallExpression(node)) {
      let method: MethodName | undefined;
      let receiver: ts.Expression | undefined;
      if (ts.isPropertyAccessExpression(node.expression) &&
          (node.expression.name.text === 'from' || node.expression.name.text === 'rpc')) {
        method = node.expression.name.text;
        receiver = node.expression.expression;
      } else if (ts.isElementAccessExpression(node.expression)) {
        receiver = node.expression.expression;
        const name = resolveString(node.expression.argumentExpression);
        if (name === 'from' || name === 'rpc') method = name;
        else if (name === undefined && node.arguments.length > 0 && !receiverExcluded(receiver)) {
          calls.push({
            method: 'unknown',
            unsupported: 'dynamic callable name',
            expression: node.expression.argumentExpression?.getText(sf) ?? '<missing>',
          });
        }
      } else if (ts.isIdentifier(node.expression)) {
        method = binding(node.expression.text)?.method;
      }
      if (method && (!receiver || !receiverExcluded(receiver))) {
        const target = resolveString(node.arguments[0]);
        calls.push(target === undefined
          ? {
              method,
              unsupported: 'dynamic target',
              expression: node.arguments[0]?.getText(sf) ?? '<missing>',
            }
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

interface DynamicAllowance {
  symbol: string;
  property?: string;
  allowedValues: string[];
  justification: string;
}

const DYNAMIC_NON_LEDGER_CALLS: Record<string, DynamicAllowance> = {
  'lib/propuestas/scripts/seed-db.ts:from:dynamic target:t': {
    symbol: 'tables',
    allowedValues: [
      'propuesta_fichas_servicio', 'propuesta_consultores',
      'propuesta_documentos_biblioteca', 'propuesta_contenido_bloques',
      'propuesta_plantillas',
    ],
    justification: 'closed proposal seed-table literal list',
  },
  'lib/zoom/attendance-store.ts:from:dynamic target:source.table': {
    symbol: 'EXPECTED_ATTENDEE_SOURCE',
    property: 'table',
    allowedValues: ['meeting_attendees', 'session_attendees'],
    justification: 'closed attendance identity-source descriptor',
  },
  'utils/meetingUtils.ts:from:dynamic target:tableName': {
    symbol: 'tableName',
    allowedValues: ['meeting_commitments', 'meeting_tasks'],
    justification: 'closed meeting-child selector',
  },
  'hooks/useUrlState.ts:unknown:dynamic callable name:method': {
    symbol: 'method',
    allowedValues: ['push', 'replace'],
    justification: 'closed Next router method selector, not a database callable',
  },
};

function finiteDynamicValues(source: string, file: string, allowance: DynamicAllowance): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith('.jsx') ? ts.ScriptKind.JSX
      : file.endsWith('.js') ? ts.ScriptKind.JS
        : file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const values = new Set<string>();

  function stringsBelow(node: ts.Node): void {
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      values.add(node.text);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      stringsBelow(node.whenTrue);
      stringsBelow(node.whenFalse);
      return;
    }
    ts.forEachChild(node, stringsBelow);
  }

  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
        node.name.text === allowance.symbol && node.initializer) {
      if (!allowance.property) {
        stringsBelow(node.initializer);
      } else {
        function propertiesBelow(candidate: ts.Node): void {
          if (ts.isPropertyAssignment(candidate) &&
              readPropertyName(candidate.name) === allowance.property) {
            stringsBelow(candidate.initializer);
            return;
          }
          ts.forEachChild(candidate, propertiesBelow);
        }
        propertiesBelow(node.initializer);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return [...values].sort();
}

function stripSqlComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
}

function unqualifiedHoursIn(selectList: string): number {
  const withoutStrings = selectList.replace(/'(?:''|[^'])*'/g, "''");
  let count = 0;
  for (const match of withoutStrings.matchAll(/"hours"|\bhours\b/gi)) {
    const before = withoutStrings.slice(0, match.index).trimEnd();
    if (before.endsWith('.')) continue;
    if (/\bAS$/i.test(before)) continue;
    count += 1;
  }
  return count;
}

function ledgerBackedCteNames(sql: string): Set<string> {
  const definitions: Array<{ name: string; body: string }> = [];
  const startPattern = /\b("[^"]+"|[A-Za-z_][\w]*)\s+AS\s*\(/gi;
  for (const match of sql.matchAll(startPattern)) {
    const open = (match.index ?? 0) + match[0].lastIndexOf('(');
    let depth = 1;
    let quote: "'" | '"' | null = null;
    let index = open + 1;
    for (; index < sql.length && depth > 0; index += 1) {
      const char = sql[index];
      if (quote) {
        if (char === quote) {
          if (sql[index + 1] === quote) index += 1;
          else quote = null;
        }
        continue;
      }
      if (char === "'" || char === '"') { quote = char; continue; }
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
    }
    if (depth === 0) {
      definitions.push({
        name: match[1].replaceAll('"', ''),
        body: sql.slice(open + 1, index - 1),
      });
    }
  }

  const backed = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const definition of definitions) {
      if (backed.has(definition.name)) continue;
      const dependencies = ['contract_hours_ledger', ...backed];
      if (dependencies.some((name) => new RegExp(
        `\\b(?:FROM|JOIN)\\s+(?:"?public"?\\.)?"?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"?(?![\\w"])`,
        'i'
      ).test(definition.body))) {
        backed.add(definition.name);
        changed = true;
      }
    }
  }
  return backed;
}

/** Qualified, unqualified, and write uses inside a direct ledger query scope. */
function sqlDirectHoursUseCount(source: string): number {
  const sql = stripSqlComments(source);
  const aliases = new Set<string>();
  const aliasPattern = /\b(?:FROM|JOIN)\s+(?:"?public"?\.)?"?contract_hours_ledger"?(?:\s+(?:AS\s+)?("[^"]+"|[A-Za-z_][\w]*))?/gi;
  const reserved = new Set(['where', 'join', 'left', 'right', 'inner', 'outer', 'cross', 'on', 'group', 'order', 'limit', 'union']);
  for (const match of sql.matchAll(aliasPattern)) {
    const raw = match[1];
    if (raw && !reserved.has(raw.replaceAll('"', '').toLowerCase())) aliases.add(raw);
  }

  const backedRelations = ledgerBackedCteNames(sql);
  const localDefinitions = sqlObjectDefinitions(sql, 'inline.sql');
  for (const name of ledgerObjectNames(localDefinitions)) backedRelations.add(name);
  for (const name of backedRelations) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const relationPattern = new RegExp(
      `\\b(?:FROM|JOIN)\\s+(?:"?public"?\\.)?"?${escaped}"?(?:\\s+(?:AS\\s+)?("[^"]+"|[A-Za-z_][\\w]*))?`,
      'gi'
    );
    for (const match of sql.matchAll(relationPattern)) {
      const raw = match[1];
      if (raw && !reserved.has(raw.replaceAll('"', '').toLowerCase())) aliases.add(raw);
      else aliases.add(name);
    }
  }

  let count = 0;
  for (const alias of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const bounded = alias.startsWith('"') ? escaped : `\\b${escaped}\\b`;
    count += sql.match(new RegExp(`${bounded}\\s*\\.\\s*"?hours"?`, 'gi'))?.length ?? 0;
  }
  count += sql.match(/(?:\bcontract_hours_ledger\b|"contract_hours_ledger")\s*\.\s*"?hours"?/gi)?.length ?? 0;
  const directSelectPattern = /\bSELECT\b([\s\S]*?)\b(?:FROM|JOIN)\s+(?:"?public"?\.)?"?contract_hours_ledger"?(?![\w"])/gi;
  for (const match of sql.matchAll(directSelectPattern)) {
    count += unqualifiedHoursIn(match[1]);
  }
  for (const name of backedRelations) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const selectPattern = new RegExp(
      `\\bSELECT\\b([\\s\\S]*?)\\b(?:FROM|JOIN)\\s+(?:"?public"?\\.)?"?${escaped}"?(?![\\w"])`,
      'gi'
    );
    for (const match of sql.matchAll(selectPattern)) {
      count += unqualifiedHoursIn(match[1]);
    }
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
    'historical', 'historical', 'historical', 'historical', 'historical',
  ],
  'supabase/migrations/20260809120000_fix_bucket_summary_fanout.sql': [
    'historical', 'historical',
  ],
  'supabase/migrations/20260809120100_reschedule_rpc_uses_bucket_summary.sql': [
    'historical', 'historical', 'write',
  ],
  'supabase/migrations/20260813120200_session_hour_overrides.sql': [
    'aggregate', 'aggregate', 'billable', 'billable', 'billable',
  ],
  'supabase/migrations/20260813120300_reschedule_availability_guard.sql': [
    'historical', 'write',
  ],
  'supabase/migrations/20260813120500_reschedule_tracking_pair_guard.sql': [
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
  'supabase/migrations/20260813120500_reschedule_tracking_pair_guard.sql': [
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
    for (const path of productionSourceFiles()) {
      const count = directTableTouchCount(readFileSync(path, 'utf8'));
      if (count > 0) actual[relative(ROOT, path)] = count;
    }
    expectExactCounts(actual, DIRECT_TS_TOUCHES);
  });

  it('fails closed on every unsupported dynamic callable or target in production', () => {
    const unsupported = productionSourceFiles().flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return discoverSupabaseCalls(source, path)
        .filter((call) => call.unsupported)
        .map((call) => `${relative(ROOT, path)}:${call.method}:${call.unsupported}:${call.expression}`);
    });
    expect(unsupported.sort()).toEqual(Object.keys(DYNAMIC_NON_LEDGER_CALLS).sort());

    for (const [key, allowance] of Object.entries(DYNAMIC_NON_LEDGER_CALLS)) {
      const path = key.slice(0, key.indexOf(':'));
      const values = finiteDynamicValues(readFileSync(join(ROOT, path), 'utf8'), path, allowance);
      expect(values, `${key}: ${allowance.justification}`).toEqual(
        [...allowance.allowedValues].sort()
      );
      expect(values).not.toContain('contract_hours_ledger');
    }
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
    for (const path of productionSourceFiles()) {
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
    expect(discoverSupabaseCalls('s[method](target)')[0]).toMatchObject({
      method: 'unknown', unsupported: 'dynamic callable name', expression: 'method',
    });
    expect(discoverSupabaseCalls('s.from(target)')[0]).toMatchObject({
      method: 'from', unsupported: 'dynamic target', expression: 'target',
    });
    expect(directTableTouchCount("const target = 'contract_hours_ledger'; s.from(target)")).toBe(1);
    expect(directTableTouchCount(
      "const method = 'from'; const target = 'contract_hours_ledger'; s[method](target)"
    )).toBe(1);
    expect(directTableTouchCount(
      "const {'from': readTable} = s; readTable('contract_hours_ledger')"
    )).toBe(1);

    const shadowed = discoverSupabaseCalls(`
      const TABLE = 'contract_hours_ledger';
      { const TABLE = target; s.from(TABLE); }
    `);
    expect(shadowed).toContainEqual({
      method: 'from', unsupported: 'dynamic target', expression: 'TABLE',
    });

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
      'SELECT hours FROM public.contract_hours_ledger;'
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      'SELECT "hours" FROM "public"."contract_hours_ledger";'
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      'SELECT "ledger rows"."hours" FROM "public"."contract_hours_ledger" AS "ledger rows";'
    )).toBe(1);
    expect(sqlDirectHoursUseCount(`
      WITH ledger_rows AS (
        SELECT * FROM public.contract_hours_ledger
      )
      SELECT hours FROM ledger_rows;
    `)).toBe(1);

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
    expect(sqlDirectHoursUseCount(`
      CREATE VIEW public.synthetic_ledger_view AS
        SELECT * FROM public.contract_hours_ledger;
      CREATE FUNCTION public.synthetic_ledger_function() RETURNS SETOF numeric
      LANGUAGE sql AS $body$
        SELECT hours FROM public.synthetic_ledger_view
      $body$;
    `)).toBe(1);

    // These representative mutations are detected but intentionally absent from
    // the production classifications: the same exact-count assertions above would
    // therefore go red if any were inserted into a production root/migration.
    expect(DIRECT_TS_TOUCHES['components/synthetic.tsx']).toBeUndefined();
    expect(INDIRECT_TS_CONSUMERS['pages/synthetic.ts']).toBeUndefined();
    expect(SQL_DIRECT_HOURS_USES['supabase/migrations/synthetic.sql']).toBeUndefined();
    expect(SQL_LEDGER_OBJECTS['supabase/migrations/synthetic.sql']).toBeUndefined();
  });

  it('validates every finite dynamic allowlist against ledger-value mutations', () => {
    for (const [key, allowance] of Object.entries(DYNAMIC_NON_LEDGER_CALLS)) {
      const path = key.slice(0, key.indexOf(':'));
      const source = readFileSync(join(ROOT, path), 'utf8');
      const candidate = allowance.allowedValues[0];
      const symbolIndex = source.indexOf(`const ${allowance.symbol}`);
      expect(symbolIndex, `${key}: finite declaration must exist`).toBeGreaterThanOrEqual(0);
      const candidateIndex = source.indexOf(`'${candidate}'`, symbolIndex);
      expect(candidateIndex, `${key}: finite source literal must exist`).toBeGreaterThanOrEqual(0);
      const mutated = source.slice(0, candidateIndex) + "'contract_hours_ledger'" +
        source.slice(candidateIndex + candidate.length + 2);
      expect(mutated, `${key}: mutation fixture must change source`).not.toBe(source);
      const values = finiteDynamicValues(mutated, path, allowance);
      expect(values, `${key}: ledger mutation must be visible`).toContain('contract_hours_ledger');
      expect(values, `${key}: exact finite allowlist must reject mutation`).not.toEqual(
        [...allowance.allowedValues].sort()
      );
    }
  });

  it('discovers a newly introduced production JS/JSX root', () => {
    const probeRoot = mkdtempSync(join(ROOT, 'future_z7_inventory_probe-'));
    const jsProbe = join(probeRoot, 'consumer.js');
    const jsxProbe = join(probeRoot, 'consumer.jsx');
    try {
      writeFileSync(jsProbe, "s.from('contract_hours_ledger').select('hours');\n");
      writeFileSync(jsxProbe, "export const C = () => <div>{s.from('contract_hours_ledger')}</div>;\n");
      expect(productionSourceFiles()).toEqual(expect.arrayContaining([jsProbe, jsxProbe]));
      expect(directTableTouchCount(readFileSync(jsProbe, 'utf8'))).toBe(1);
      expect(directTableTouchCount(readFileSync(jsxProbe, 'utf8'))).toBe(1);
    } finally {
      rmSync(probeRoot, { recursive: true, force: true });
    }
  });
});
