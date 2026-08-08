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
  contract_hours_ledger: {
    columns: [
      'session_id',
      'status',
      'is_over_budget',
      'hours',
      'admin_override',
      'planned_minutes_snapshot',
    ],
  },
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
  /** Makes `get_bucket_summary` fail — the RPC has no select string to break. */
  bucketError?: PgError;
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
        if (options.bucketError) {
          return resolve({ data: null, error: options.bucketError });
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
const SESSION_LEGACY = 'ses-77777777-7777-4777-8777-777777777777';

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
  // Legacy: finalized long before the ledger existed, so it has no entry. Its
  // actual_duration_minutes (30) disagrees with its scheduled duration (90), which is
  // what makes it prove the fallback reads the schedule and not the deprecated column.
  {
    id: SESSION_LEGACY,
    title: 'Sesión heredada sin libro de horas',
    session_date: '2026-02-01',
    actual_duration_minutes: 30,
    scheduled_duration_minutes: 90,
    status: 'completada',
    hour_type_key: BUCKET_KEY,
    contrato_id: CONTRATO_ID,
    session_facilitators: [{ profiles: { first_name: 'Sofía', last_name: 'Muñoz' } }],
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
    // Ledger hours deliberately disagree with actual_duration_minutes/60 (1.5h and
    // 0.75h): the billed figure is the ledger's, not the session column's.
    ledger: [
      {
        session_id: SESSION_MARCH,
        status: 'consumida',
        is_over_budget: false,
        hours: 1.25,
        admin_override: false,
      },
      {
        session_id: SESSION_OTHER_BUCKET,
        status: 'consumida',
        is_over_budget: true,
        hours: 0.5,
        admin_override: false,
      },
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
    expect(bucket.sessions).toHaveLength(3);

    // `.order('session_date', { ascending: false })` — newest first.
    expect(bucket.sessions.map((s) => s.session_id)).toEqual([
      SESSION_APRIL,
      SESSION_MARCH,
      SESSION_LEGACY,
    ]);

    // The sessions query ran against a real column, so the ledger sub-query ran too.
    expect(log.some((entry) => entry.table === 'contract_hours_ledger')).toBe(true);
  });

  it('maps each session from the columns the table actually has', async () => {
    const result = await fetchSchoolReportData(clientFor(baseOptions()), SCHOOL_ID);
    const bucket = result!.programs[0].contracts[0].buckets.find(
      (b) => b.hour_type_key === BUCKET_KEY
    )!;

    const [april, march, legacy] = bucket.sessions;

    // No ledger entry → falls back to scheduled_duration_minutes (120 → 2h). This is the
    // `per_session_display` half of the r13 mode split: the drill-down keeps the fallback
    // (the aggregate dropped it). If this ever yields 0, display behaviour has drifted.
    expect(april).toMatchObject({
      session_id: SESSION_APRIL,
      title: 'Sesión de seguimiento',
      date: '2026-04-02',
      consultant_name: 'Sin asignar',
      hours: 2,
      status: 'reservada', // no ledger entry → fallback from `programada`
      is_over_budget: false,
    });

    // The ledger row is authoritative for BOTH the status and the hours: 1.25 billed,
    // not the 1.5h that actual_duration_minutes (90) would have shown.
    expect(march).toMatchObject({
      session_id: SESSION_MARCH,
      title: 'Taller de planificación',
      date: '2026-03-10',
      consultant_name: 'Ana Rojas',
      hours: 1.25,
      status: 'consumida',
      is_over_budget: false,
    });

    // Legacy session, no ledger row: scheduled 90 → 1.5h. actual_duration_minutes (30)
    // would have shown 0.5h.
    expect(legacy).toMatchObject({
      session_id: SESSION_LEGACY,
      hours: 1.5,
      status: 'consumida', // no ledger entry → fallback from `completada`
    });
  });

  it('keeps each bucket to its own hour_type_key', async () => {
    const result = await fetchSchoolReportData(clientFor(baseOptions()), SCHOOL_ID);
    const buckets = result!.programs[0].contracts[0].buckets;

    const acompanamiento = buckets.find((b) => b.hour_type_key === BUCKET_KEY)!;
    const diagnostico = buckets.find((b) => b.hour_type_key === OTHER_BUCKET_KEY)!;

    expect(acompanamiento.sessions.map((s) => s.session_id)).not.toContain(SESSION_OTHER_BUCKET);
    expect(diagnostico.sessions.map((s) => s.session_id)).toEqual([SESSION_OTHER_BUCKET]);
    // is_over_budget and hours are read per session from the same ledger row.
    expect(diagnostico.sessions[0].is_over_budget).toBe(true);
    expect(diagnostico.sessions[0].hours).toBe(0.5);
  });

  it('asks consultor_sessions only for columns it has', async () => {
    const log: QueryLog[] = [];
    await fetchSchoolReportData(clientFor(baseOptions(), log), SCHOOL_ID);

    const sessionQueries = log.filter((entry) => entry.table === 'consultor_sessions');
    expect(sessionQueries.length).toBeGreaterThan(0);

    for (const entry of sessionQueries) {
      expect(entry.select).not.toMatch(/scheduled_date/);
      expect(entry.select).not.toMatch(/planned_duration_minutes/);
      // The deprecated column is no longer read: hours come from the ledger.
      expect(entry.select).not.toMatch(/actual_duration_minutes/);
      expect(entry.order).toBe('session_date');
      expect(validateSelect(BASE_SCHEMA, 'consultor_sessions', entry.select)).toBeNull();
    }
  });

  it('reads hours from the ledger sub-query it already makes, without a second round trip', async () => {
    const log: QueryLog[] = [];
    await fetchSchoolReportData(clientFor(baseOptions(), log), SCHOOL_ID);

    const ledgerQueries = log.filter((entry) => entry.table === 'contract_hours_ledger');

    // Two buckets, one pre-existing sub-query each — the retarget added no round trip.
    expect(ledgerQueries).toHaveLength(2);

    for (const entry of ledgerQueries) {
      expect(splitTopLevel(entry.select)).toEqual([
        'session_id',
        'status',
        'is_over_budget',
        'hours',
      ]);
      expect(entry.filters).toEqual([
        expect.objectContaining({ column: 'session_id', kind: 'in' }),
      ]);
      expect(validateSelect(BASE_SCHEMA, 'contract_hours_ledger', entry.select)).toBeNull();
    }
  });

  // ============================================================
  // Ledger status semantics — the drill-down renders the status beside the number,
  // so every status shows its own row's `hours` verbatim (Zoom plan §11).
  // ============================================================

  describe('per-session hours by ledger status', () => {
    const STATUS_BUCKET_KEY = 'estados';

    const S_RESERVADA = 'ses-a1000000-0000-4000-8000-000000000001';
    const S_CONSUMIDA = 'ses-a2000000-0000-4000-8000-000000000002';
    const S_DEVUELTA = 'ses-a3000000-0000-4000-8000-000000000003';
    const S_PENALIZADA = 'ses-a4000000-0000-4000-8000-000000000004';
    const S_SIN_LEDGER = 'ses-a5000000-0000-4000-8000-000000000005';
    const S_OVERRIDE = 'ses-a6000000-0000-4000-8000-000000000006';

    /** Every session carries actual_duration_minutes 240 (= 4h) so that any reading of
     * the deprecated column is immediately visible in the assertions below. */
    function statusSession(id: string, date: string, scheduledMinutes: number): Row {
      return {
        id,
        title: `Sesión ${id.slice(4, 6)}`,
        session_date: date,
        actual_duration_minutes: 240,
        scheduled_duration_minutes: scheduledMinutes,
        status: 'completada',
        hour_type_key: STATUS_BUCKET_KEY,
        contrato_id: CONTRATO_ID,
        session_facilitators: [],
      };
    }

    const statusOptions = baseOptions({
      sessions: [
        statusSession(S_RESERVADA, '2026-06-01', 240),
        statusSession(S_CONSUMIDA, '2026-06-02', 240),
        statusSession(S_DEVUELTA, '2026-06-03', 240),
        statusSession(S_PENALIZADA, '2026-06-04', 240),
        statusSession(S_SIN_LEDGER, '2026-06-05', 90),
        statusSession(S_OVERRIDE, '2026-06-06', 240),
      ],
      ledger: [
        { session_id: S_RESERVADA, status: 'reservada', is_over_budget: false, hours: 1.5, admin_override: false },
        { session_id: S_CONSUMIDA, status: 'consumida', is_over_budget: false, hours: 2.25, admin_override: false },
        // executeCancellation rewrites only the status — a devuelta row still holds the
        // full originally-reserved amount.
        { session_id: S_DEVUELTA, status: 'devuelta', is_over_budget: false, hours: 3, admin_override: false },
        { session_id: S_PENALIZADA, status: 'penalizada', is_over_budget: false, hours: 0.75, admin_override: false },
        // S_SIN_LEDGER deliberately has no row.
        { session_id: S_OVERRIDE, status: 'consumida', is_over_budget: false, hours: 1.1, admin_override: true },
      ],
      buckets: {
        [CONTRATO_ID]: [
          {
            hour_type_key: STATUS_BUCKET_KEY,
            display_name: 'Estados',
            allocated_hours: 20,
            reserved_hours: 1.5,
            consumed_hours: 4.1,
            available_hours: 14.4,
            is_fixed_allocation: false,
            annex_hours: 0,
          },
        ],
      },
    });

    async function hoursById(): Promise<Map<string, { hours: number; status: string }>> {
      const result = await fetchSchoolReportData(clientFor(statusOptions), SCHOOL_ID);
      const bucket = result!.programs[0].contracts[0].buckets[0];
      return new Map(bucket.sessions.map((s) => [s.session_id, { hours: s.hours, status: s.status }]));
    }

    it('shows each of the four ledger statuses with its own hours verbatim', async () => {
      const byId = await hoursById();

      expect(byId.get(S_RESERVADA)).toEqual({ hours: 1.5, status: 'reservada' });
      expect(byId.get(S_CONSUMIDA)).toEqual({ hours: 2.25, status: 'consumida' });
      expect(byId.get(S_DEVUELTA)).toEqual({ hours: 3, status: 'devuelta' });
      expect(byId.get(S_PENALIZADA)).toEqual({ hours: 0.75, status: 'penalizada' });
    });

    it('falls back to scheduled_duration_minutes when a session has no ledger row', async () => {
      const byId = await hoursById();

      // 90 scheduled minutes → 1.5h. Never 0 by omission, and never the 4h that
      // actual_duration_minutes holds.
      expect(byId.get(S_SIN_LEDGER)!.hours).toBe(1.5);
    });

    it('passes an admin_override row through with its adjusted hours', async () => {
      const byId = await hoursById();

      expect(byId.get(S_OVERRIDE)!.hours).toBe(1.1);
    });
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

  // ============================================================
  // Sol item 8 — a failed read is never a zero (r27).
  //
  // The bucket summary used to `continue` on error, dropping the contract from the
  // report. What a school then sees is a report with no hours under that contract —
  // pixel-identical to a contract that genuinely has none, and it is the figure an
  // invoice is reconciled against.
  // ============================================================

  describe('a failed ledger read fails the report instead of reading as "no hours"', () => {
    it('throws when get_bucket_summary errors, instead of skipping the contract', async () => {
      const options = baseOptions({
        bucketError: pgError('57014', 'canceling statement due to statement timeout'),
      });

      await expect(fetchSchoolReportData(clientFor(options), SCHOOL_ID)).rejects.toThrow(
        new RegExp(`No se pudo obtener el resumen de horas del contrato ${CONTRATO_ID}`)
      );

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`contrato=${CONTRATO_ID}`),
        expect.objectContaining({ code: '57014' })
      );
    });

    it('reports a contract with genuinely zero buckets as zero, not as a failure', async () => {
      // The other half of the same fix: a SUCCESSFUL summary that returns no rows is a
      // contract with no hours, and it must still render. This is what makes the failure
      // above distinguishable — the two outcomes no longer look alike.
      const result = await fetchSchoolReportData(
        clientFor(baseOptions({ buckets: { [CONTRATO_ID]: [] } })),
        SCHOOL_ID
      );

      const contract = result!.programs[0].contracts[0];
      expect(contract.contrato_id).toBe(CONTRATO_ID);
      expect(contract.buckets).toEqual([]);
      expect(contract.total_reserved).toBe(0);
      expect(contract.total_consumed).toBe(0);
    });

    it('throws when the ledger query errors, instead of billing every session from its schedule', async () => {
      // The scheduled fallback exists for a session with no ledger row. A failed read
      // produced an empty map, so EVERY session in the bucket took that fallback at once
      // and the report showed synthesised hours as though they were billed ones.
      const options = baseOptions({
        schemaOverrides: {
          contract_hours_ledger: { columns: ['session_id', 'status', 'is_over_budget'] },
        },
      });

      await expect(fetchSchoolReportData(clientFor(options), SCHOOL_ID)).rejects.toThrow(
        /No se pudieron obtener las horas registradas del bucket "acompanamiento"/
      );

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`contrato=${CONTRATO_ID}, bucket=${BUCKET_KEY}`),
        expect.objectContaining({ code: '42703' })
      );
    });

    it('still uses the scheduled fallback when a SUCCESSFUL ledger query returns no row', async () => {
      // The criterion that proves the error path was fixed and the feature was not: the
      // legacy session has no ledger row and still reports its scheduled 90 min as 1.5h.
      const result = await fetchSchoolReportData(clientFor(baseOptions()), SCHOOL_ID);
      const bucket = result!.programs[0].contracts[0].buckets.find(
        (b) => b.hour_type_key === BUCKET_KEY
      )!;

      expect(bucket.sessions.find((s) => s.session_id === SESSION_LEGACY)!.hours).toBe(1.5);
      expect(bucket.sessions.find((s) => s.session_id === SESSION_APRIL)!.hours).toBe(2);
    });
  });

  // ============================================================
  // Sol R-B (r29) — the same defect, one step ABOVE the reads r27 fixed.
  //
  // `schools`, `clientes` and `contratos` destructured only `data`. A failed `clientes`
  // read coalesced to `[]` and returned `{ programs: [] }` — a 200 whose whole-school
  // report shows zero contracts and zero hours, pixel-identical to a school with nothing
  // billed. A failed `schools` read became a 404 for a school that exists. Asserted PER
  // READ, because one test over the three cannot say which is still swallowing.
  // ============================================================

  describe('a failed read at the TOP of the report fails the request, per read', () => {
    it('throws when the `schools` read errors, instead of 404-ing a school that exists', async () => {
      const options = baseOptions({ schemaOverrides: { schools: { columns: ['id'] } } });

      await expect(fetchSchoolReportData(clientFor(options), SCHOOL_ID)).rejects.toThrow(
        new RegExp(`No se pudieron obtener los datos del colegio ${SCHOOL_ID}`)
      );

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`school=${SCHOOL_ID}`),
        expect.objectContaining({ code: '42703' })
      );
    });

    it('throws when the `clientes` read errors, instead of reporting zero contracts', async () => {
      const options = baseOptions({ schemaOverrides: { clientes: { columns: ['id'] } } });

      await expect(fetchSchoolReportData(clientFor(options), SCHOOL_ID)).rejects.toThrow(
        new RegExp(`No se pudieron obtener los clientes del colegio ${SCHOOL_NAME}`)
      );

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`school=${SCHOOL_ID}`),
        expect.objectContaining({ code: '42703' })
      );
    });

    it('throws when the `contratos` read errors, instead of reporting zero hours', async () => {
      // Every column the select names is still there; the `estado` FILTER is what fails,
      // so this is a genuine read failure and not a broken select string.
      const options = baseOptions({
        schemaOverrides: {
          contratos: {
            columns: [
              'id',
              'numero_contrato',
              'is_annexo',
              'horas_contratadas',
              'programa_id',
              'cliente_id',
            ],
            relations: { programas: 'programas' },
          },
        },
      });

      await expect(fetchSchoolReportData(clientFor(options), SCHOOL_ID)).rejects.toThrow(
        new RegExp(`No se pudieron obtener los contratos del colegio ${SCHOOL_NAME}`)
      );

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`school=${SCHOOL_ID}`),
        expect.objectContaining({ code: '42703' })
      );
    });

    it('a school with genuinely NO clientes still returns a valid empty report', async () => {
      // The other half, and what makes the failure above distinguishable: emptiness
      // proven by a SUCCESSFUL query still renders, exactly as it did before.
      const result = await fetchSchoolReportData(
        clientFor(baseOptions({ clientes: [] })),
        SCHOOL_ID
      );

      expect(result).toEqual({ school_id: SCHOOL_ID, school_name: SCHOOL_NAME, programs: [] });
    });
  });

  it('returns null for a school that does not exist', async () => {
    // PGRST116 — `.single()` over zero rows — is NOT a failed read. It is the honest 404
    // this function has always returned, and R-B must not turn it into a 500.
    const result = await fetchSchoolReportData(clientFor(baseOptions({ schools: [] })), SCHOOL_ID);
    expect(result).toBeNull();
  });

  it('returns an empty program list when the school has no active contracts', async () => {
    const result = await fetchSchoolReportData(clientFor(baseOptions({ contratos: [] })), SCHOOL_ID);
    expect(result).toEqual({ school_id: SCHOOL_ID, school_name: SCHOOL_NAME, programs: [] });
  });
});
