// @vitest-environment node
/**
 * Z2-5a — lib/services/school-hours-report.ts :: fetchSchoolReportData.
 *
 * The first suite that EXECUTES this function. Both pre-existing suites
 * (`__tests__/api/hour-tracking/school-report.test.ts` and `school-report-pdf.test.ts`)
 * `vi.mock` the whole module out and assert on the handler around it, which is how a
 * sessions query naming two columns `consultor_sessions` does not have shipped and stayed
 * broken in production: the drill-down under every hour bucket has always been empty.
 *
 * The Supabase double is therefore SCHEMA-FAITHFUL rather than table-name-keyed. It parses
 * the `select()` string, the `.eq()`/`.in()` filters and the `.order()` column against a
 * column list mirrored from `supabase/migrations/00000000000000_baseline.sql`, and answers
 * an unknown column the way PostgREST does — `42703 column ... does not exist`. A double
 * that ignored the select string would pass against the broken query, which is precisely
 * the failure this suite exists to prevent.
 *
 * Synthetic data only — no real school, consultant or student appears here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { fetchSchoolReportData } from '../../../lib/services/school-hours-report';

// ============================================================
// Schema model — mirrored from the baseline dump
// ============================================================

type Row = Record<string, unknown>;

type PgError = { code: string; message: string; details: string | null; hint: string | null };

function pgError(code: string, message: string): PgError {
  return { code, message, details: null, hint: null };
}

type TableDef = { columns: string[]; relations?: Record<string, string> };

/**
 * `consultor_sessions` carries `session_date` and the generated
 * `scheduled_duration_minutes`; it has never carried `scheduled_date` or
 * `planned_duration_minutes`, and no migration adds either.
 */
const BASE_SCHEMA: Record<string, TableDef> = {
  schools: { columns: ['id', 'name'] },
  clientes: { columns: ['id', 'school_id'] },
  contratos: {
    columns: [
      'id',
      'numero_contrato',
      'is_annexo',
      'horas_contratadas',
      'programa_id',
      'cliente_id',
      'estado',
    ],
    relations: { programas: 'programas' },
  },
  programas: { columns: ['id', 'nombre'] },
  consultor_sessions: {
    columns: [
      'id',
      'title',
      'session_date',
      'start_time',
      'end_time',
      'scheduled_duration_minutes',
      'actual_duration_minutes',
      'status',
      'hour_type_key',
      'contrato_id',
      'school_id',
      'is_active',
    ],
    relations: { session_facilitators: 'session_facilitators' },
  },
  session_facilitators: {
    columns: ['id', 'session_id', 'user_id'],
    relations: { profiles: 'profiles' },
  },
  profiles: { columns: ['id', 'first_name', 'last_name'] },
  contract_hours_ledger: { columns: ['session_id', 'status', 'is_over_budget'] },
};

// ============================================================
// select() parsing — embeds are relations, bare tokens are columns
// ============================================================

/** Split a select string on commas that sit outside any embed parentheses. */
function splitTopLevel(select: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = '';

  for (const ch of select) {
    if (ch === '(') {
      depth += 1;
      buf += ch;
    } else if (ch === ')') {
      depth -= 1;
      buf += ch;
    } else if (ch === ',' && depth === 0) {
      parts.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  parts.push(buf);

  return parts.map((p) => p.trim()).filter(Boolean);
}

const EMBED_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)$/;

/** Returns the PostgREST error an unknown column/relation would produce, or null. */
function validateSelect(
  schema: Record<string, TableDef>,
  table: string,
  select: string
): PgError | null {
  const def = schema[table];
  if (!def) return pgError('42P01', `relation "public.${table}" does not exist`);

  for (const part of splitTopLevel(select)) {
    const embed = EMBED_RE.exec(part);

    if (embed) {
      const target = def.relations?.[embed[1]];
      if (!target) {
        return pgError(
          'PGRST200',
          `Could not find a relationship between '${table}' and '${embed[1]}'`
        );
      }
      const nested = validateSelect(schema, target, embed[2]);
      if (nested) return nested;
      continue;
    }

    if (part === '*') continue;

    if (!def.columns.includes(part)) {
      return pgError('42703', `column ${table}.${part} does not exist`);
    }
  }

  return null;
}

/** PostgREST returns only what was asked for; embeds come back as the fixture stored them. */
function project(select: string, row: Row): Row {
  const out: Row = {};

  for (const part of splitTopLevel(select)) {
    const embed = EMBED_RE.exec(part);
    if (embed) {
      out[embed[1]] = row[embed[1]] ?? null;
    } else if (part === '*') {
      Object.assign(out, row);
    } else {
      out[part] = row[part] ?? null;
    }
  }

  return out;
}

// ============================================================
// Chainable query double
// ============================================================

type Filter = { column: string; kind: 'eq' | 'in'; value: unknown; values?: unknown[] };

type QueryLog = { table: string; select: string; filters: Filter[]; order: string | null };

type ClientOptions = {
  schools?: Row[];
  clientes?: Row[];
  contratos?: Row[];
  sessions?: Row[];
  ledger?: Row[];
  buckets?: Record<string, Row[]>;
  /** Per-table column-list overrides, for reproducing a table that lacks a column. */
  schemaOverrides?: Record<string, TableDef>;
};

function buildClient(options: ClientOptions, log: QueryLog[]) {
  const schema = { ...BASE_SCHEMA, ...(options.schemaOverrides ?? {}) };

  const tables: Record<string, Row[]> = {
    schools: options.schools ?? [],
    clientes: options.clientes ?? [],
    contratos: options.contratos ?? [],
    consultor_sessions: options.sessions ?? [],
    contract_hours_ledger: options.ledger ?? [],
  };

  function makeQuery(table: string) {
    const rows = tables[table] ?? [];
    const filters: Filter[] = [];
    let selectStr = '*';
    let orderBy: { column: string; ascending: boolean } | null = null;
    let rowLimit: number | null = null;

    function settle(): { data: unknown; error: PgError | null } {
      log.push({
        table,
        select: selectStr,
        filters: [...filters],
        order: orderBy?.column ?? null,
      });

      const def = schema[table];
      if (!def) {
        return { data: null, error: pgError('42P01', `relation "public.${table}" does not exist`) };
      }

      const selectError = validateSelect(schema, table, selectStr);
      if (selectError) return { data: null, error: selectError };

      // A filter or sort on a column the table does not have fails the same way.
      for (const filter of filters) {
        if (!def.columns.includes(filter.column)) {
          return {
            data: null,
            error: pgError('42703', `column ${table}.${filter.column} does not exist`),
          };
        }
      }
      if (orderBy && !def.columns.includes(orderBy.column)) {
        return {
          data: null,
          error: pgError('42703', `column ${table}.${orderBy.column} does not exist`),
        };
      }

      let matched = rows.filter((row) =>
        filters.every((filter) =>
          filter.kind === 'eq'
            ? Object.is(row[filter.column], filter.value)
            : (filter.values ?? []).some((candidate) => Object.is(row[filter.column], candidate))
        )
      );

      if (orderBy) {
        const { column, ascending } = orderBy;
        matched = [...matched].sort((a, b) => {
          const left = a[column];
          const right = b[column];
          if (left === right) return 0;
          if (left === null || left === undefined) return 1;
          if (right === null || right === undefined) return -1;
          return (left < right ? -1 : 1) * (ascending ? 1 : -1);
        });
      }

      if (rowLimit !== null) matched = matched.slice(0, rowLimit);

      return { data: matched.map((row) => project(selectStr, row)), error: null };
    }

    const query = {
      select(value: string) {
        selectStr = value;
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push({ column, kind: 'eq', value });
        return query;
      },
      in(column: string, values: unknown[]) {
        filters.push({ column, kind: 'in', value: values, values });
        return query;
      },
      order(column: string, opts?: { ascending?: boolean }) {
        orderBy = { column, ascending: opts?.ascending ?? true };
        return query;
      },
      limit(count: number) {
        rowLimit = count;
        return query;
      },
      single() {
        return {
          then(resolve: (value: unknown) => void) {
            const result = settle();
            if (result.error) return resolve(result);
            const list = (result.data ?? []) as Row[];
            if (list.length === 0) {
              return resolve({
                data: null,
                error: pgError('PGRST116', 'JSON object requested, multiple (or no) rows returned'),
              });
            }
            return resolve({ data: list[0], error: null });
          },
        };
      },
      then(resolve: (value: unknown) => void) {
        resolve(settle());
      },
    };

    return query;
  }

  return {
    from: (table: string) => makeQuery(table),
    rpc: (fn: string, params: Record<string, unknown>) => ({
      then(resolve: (value: unknown) => void) {
        if (fn !== 'get_bucket_summary') {
          return resolve({
            data: null,
            error: pgError('42883', `function public.${fn} does not exist`),
          });
        }
        const key = String(params.p_contrato_id);
        return resolve({ data: (options.buckets ?? {})[key] ?? [], error: null });
      },
    }),
  };
}

type ServiceClient = Parameters<typeof fetchSchoolReportData>[0];

function clientFor(options: ClientOptions, log: QueryLog[] = []) {
  return buildClient(options, log) as unknown as ServiceClient;
}

// ============================================================
// Synthetic fixtures
// ============================================================

const SCHOOL_ID = 77;
const SCHOOL_NAME = 'Colegio Sintético Los Aromos';
const CLIENTE_ID = 'cli-11111111-1111-4111-8111-111111111111';
const CONTRATO_ID = 'ctr-22222222-2222-4222-8222-222222222222';
const PROGRAMA_ID = 'prg-33333333-3333-4333-8333-333333333333';

const SESSION_MARCH = 'ses-44444444-4444-4444-8444-444444444444';
const SESSION_APRIL = 'ses-55555555-5555-4555-8555-555555555555';
const SESSION_OTHER_BUCKET = 'ses-66666666-6666-4666-8666-666666666666';

const BUCKET_KEY = 'acompanamiento';
const OTHER_BUCKET_KEY = 'diagnostico';

const sessionFixtures: Row[] = [
  {
    id: SESSION_MARCH,
    title: 'Taller de planificación',
    session_date: '2026-03-10',
    actual_duration_minutes: 90,
    scheduled_duration_minutes: 60,
    status: 'completada',
    hour_type_key: BUCKET_KEY,
    contrato_id: CONTRATO_ID,
    session_facilitators: [{ profiles: { first_name: 'Ana', last_name: 'Rojas' } }],
  },
  {
    id: SESSION_APRIL,
    title: 'Sesión de seguimiento',
    session_date: '2026-04-02',
    actual_duration_minutes: null,
    scheduled_duration_minutes: 120,
    status: 'programada',
    hour_type_key: BUCKET_KEY,
    contrato_id: CONTRATO_ID,
    session_facilitators: [],
  },
  {
    id: SESSION_OTHER_BUCKET,
    title: 'Diagnóstico inicial',
    session_date: '2026-05-01',
    actual_duration_minutes: 45,
    scheduled_duration_minutes: 45,
    status: 'completada',
    hour_type_key: OTHER_BUCKET_KEY,
    contrato_id: CONTRATO_ID,
    session_facilitators: [{ profiles: { first_name: 'Luis', last_name: 'Pérez' } }],
  },
];

const bucketFixtures: Row[] = [
  {
    hour_type_key: BUCKET_KEY,
    display_name: 'Acompañamiento',
    allocated_hours: 40,
    reserved_hours: 2,
    consumed_hours: 1.5,
    available_hours: 36.5,
    is_fixed_allocation: false,
    annex_hours: 0,
  },
  {
    hour_type_key: OTHER_BUCKET_KEY,
    display_name: 'Diagnóstico',
    allocated_hours: 10,
    reserved_hours: 0,
    consumed_hours: 0.75,
    available_hours: 9.25,
    is_fixed_allocation: true,
    annex_hours: 0,
  },
];

function baseOptions(overrides: Partial<ClientOptions> = {}): ClientOptions {
  return {
    schools: [{ id: SCHOOL_ID, name: SCHOOL_NAME }],
    clientes: [{ id: CLIENTE_ID, school_id: SCHOOL_ID }],
    contratos: [
      {
        id: CONTRATO_ID,
        numero_contrato: 'CTR-2026-001',
        is_annexo: false,
        horas_contratadas: 50,
        programa_id: PROGRAMA_ID,
        cliente_id: CLIENTE_ID,
        estado: 'activo',
        programas: { id: PROGRAMA_ID, nombre: 'Acompañamiento Directivo' },
      },
    ],
    sessions: sessionFixtures,
    ledger: [
      { session_id: SESSION_MARCH, status: 'consumida', is_over_budget: false },
      { session_id: SESSION_OTHER_BUCKET, status: 'consumida', is_over_budget: true },
    ],
    buckets: { [CONTRATO_ID]: bucketFixtures },
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe('fetchSchoolReportData', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns buckets whose session drill-down is populated', async () => {
    const log: QueryLog[] = [];
    const result = await fetchSchoolReportData(clientFor(baseOptions(), log), SCHOOL_ID);

    expect(result).not.toBeNull();
    expect(result!.school_name).toBe(SCHOOL_NAME);
    expect(result!.programs).toHaveLength(1);
    expect(result!.programs[0].programa_name).toBe('Acompañamiento Directivo');

    const contract = result!.programs[0].contracts[0];
    expect(contract.numero_contrato).toBe('CTR-2026-001');
    expect(contract.buckets).toHaveLength(2);

    // The drill-down is the thing that has been empty in production.
    const bucket = contract.buckets.find((b) => b.hour_type_key === BUCKET_KEY)!;
    expect(bucket.sessions).toHaveLength(2);

    // `.order('session_date', { ascending: false })` — newest first.
    expect(bucket.sessions.map((s) => s.session_id)).toEqual([SESSION_APRIL, SESSION_MARCH]);

    // The sessions query ran against a real column, so the ledger sub-query ran too.
    expect(log.some((entry) => entry.table === 'contract_hours_ledger')).toBe(true);
  });

  it('maps each session from the columns the table actually has', async () => {
    const result = await fetchSchoolReportData(clientFor(baseOptions()), SCHOOL_ID);
    const bucket = result!.programs[0].contracts[0].buckets.find(
      (b) => b.hour_type_key === BUCKET_KEY
    )!;

    const [april, march] = bucket.sessions;

    // actual_duration_minutes is null → falls back to scheduled_duration_minutes (120 → 2h).
    expect(april).toMatchObject({
      session_id: SESSION_APRIL,
      title: 'Sesión de seguimiento',
      date: '2026-04-02',
      consultant_name: 'Sin asignar',
      hours: 2,
      status: 'reservada', // no ledger entry → fallback from `programada`
      is_over_budget: false,
    });

    // actual_duration_minutes present (90 → 1.5h); ledger entry is authoritative.
    expect(march).toMatchObject({
      session_id: SESSION_MARCH,
      title: 'Taller de planificación',
      date: '2026-03-10',
      consultant_name: 'Ana Rojas',
      hours: 1.5,
      status: 'consumida',
      is_over_budget: false,
    });
  });

  it('keeps each bucket to its own hour_type_key', async () => {
    const result = await fetchSchoolReportData(clientFor(baseOptions()), SCHOOL_ID);
    const buckets = result!.programs[0].contracts[0].buckets;

    const acompanamiento = buckets.find((b) => b.hour_type_key === BUCKET_KEY)!;
    const diagnostico = buckets.find((b) => b.hour_type_key === OTHER_BUCKET_KEY)!;

    expect(acompanamiento.sessions.map((s) => s.session_id)).not.toContain(SESSION_OTHER_BUCKET);
    expect(diagnostico.sessions.map((s) => s.session_id)).toEqual([SESSION_OTHER_BUCKET]);
    // is_over_budget is read per session, not per bucket.
    expect(diagnostico.sessions[0].is_over_budget).toBe(true);
  });

  it('asks consultor_sessions only for columns it has', async () => {
    const log: QueryLog[] = [];
    await fetchSchoolReportData(clientFor(baseOptions(), log), SCHOOL_ID);

    const sessionQueries = log.filter((entry) => entry.table === 'consultor_sessions');
    expect(sessionQueries.length).toBeGreaterThan(0);

    for (const entry of sessionQueries) {
      expect(entry.select).not.toMatch(/scheduled_date/);
      expect(entry.select).not.toMatch(/planned_duration_minutes/);
      expect(entry.order).toBe('session_date');
      expect(validateSelect(BASE_SCHEMA, 'consultor_sessions', entry.select)).toBeNull();
    }
  });

  it('fails loudly when the sessions query errors instead of reporting an empty bucket', async () => {
    // Reproduces production before this fix: the table does not have the column asked for.
    const options = baseOptions({
      schemaOverrides: {
        consultor_sessions: {
          columns: ['id', 'title', 'status', 'hour_type_key', 'contrato_id'],
          relations: { session_facilitators: 'session_facilitators' },
        },
      },
    });

    await expect(fetchSchoolReportData(clientFor(options), SCHOOL_ID)).rejects.toThrow(
      /No se pudieron obtener las sesiones del bucket "acompanamiento"/
    );

    // The log must identify which contract and bucket failed.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(`contrato=${CONTRATO_ID}, bucket=${BUCKET_KEY}`),
      expect.objectContaining({ code: '42703' })
    );
  });

  it('returns null for a school that does not exist', async () => {
    const result = await fetchSchoolReportData(clientFor(baseOptions({ schools: [] })), SCHOOL_ID);
    expect(result).toBeNull();
  });

  it('returns an empty program list when the school has no active contracts', async () => {
    const result = await fetchSchoolReportData(clientFor(baseOptions({ contratos: [] })), SCHOOL_ID);
    expect(result).toEqual({ school_id: SCHOOL_ID, school_name: SCHOOL_NAME, programs: [] });
  });
});
