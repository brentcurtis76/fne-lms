/**
 * SM-02 — schema-faithful in-memory Supabase double for the school hours report totals.
 *
 * Column lists are copied from `supabase/migrations/00000000000000_baseline.sql`
 * (`schools.tenant_kind` from 20260902162557, `contract_hours_ledger.effective_minutes`
 * from 20260813120200). The query builder answers only what PostgREST would: unknown
 * columns are 42703, a response never carries more than {@link MAX_ROWS_PER_RESPONSE}
 * rows, and faults can be injected per table, per call or per page.
 *
 * `get_bucket_summary` and {@link expectedSchoolSummary} are written from the SQL in
 * `supabase/migrations/20260813120200_session_hour_overrides.sql` (get_bucket_summary),
 * in integer hundredths, and never call production code. Synthetic data only.
 */

export type Row = Record<string, unknown>;

export type PgError = { code: string; message: string; details: string | null; hint: string | null };

export function pgError(code: string, message: string): PgError {
  return { code, message, details: null, hint: null };
}

/** PostgREST `max-rows`: one response never carries more rows than this. */
export const MAX_ROWS_PER_RESPONSE = 1000;

type EmbedDef = { table: string; localKey: string; foreignKey: string; many: boolean };

type TableDef = { columns: string[]; embeds?: Record<string, EmbedDef> };

export const SCHEMA: Record<string, TableDef> = {
  schools: { columns: ['id', 'name', 'has_generations', 'cliente_id', 'logo_url', 'tenant_kind'] },
  clientes: { columns: ['id', 'nombre_legal', 'nombre_fantasia', 'school_id'] },
  programas: { columns: ['id', 'codigo_servicio', 'nombre', 'horas_totales', 'activo'] },
  contratos: {
    columns: [
      'id',
      'numero_contrato',
      'fecha_contrato',
      'cliente_id',
      'programa_id',
      'estado',
      'is_anexo',
      'parent_contrato_id',
      'anexo_numero',
      'horas_contratadas',
    ],
    embeds: { programas: { table: 'programas', localKey: 'programa_id', foreignKey: 'id', many: false } },
  },
  hour_types: { columns: ['id', 'key', 'display_name', 'modality', 'sort_order', 'is_active'] },
  contract_hour_allocations: {
    columns: [
      'id',
      'contrato_id',
      'hour_type_id',
      'allocated_hours',
      'is_fixed_allocation',
      'adds_to_allocation_id',
      'created_at',
      'created_by',
    ],
  },
  contract_hours_ledger: {
    columns: [
      'id',
      'allocation_id',
      'session_id',
      'hours',
      'status',
      'session_date',
      'is_over_budget',
      'is_manual',
      'admin_override',
      'recorded_by',
      'planned_minutes_snapshot',
      'effective_minutes',
    ],
  },
  consultor_sessions: {
    columns: [
      'id',
      'title',
      'session_date',
      'scheduled_duration_minutes',
      'actual_duration_minutes',
      'status',
      'hour_type_key',
      'contrato_id',
      'school_id',
      'is_active',
    ],
    embeds: {
      session_facilitators: { table: 'session_facilitators', localKey: 'id', foreignKey: 'session_id', many: true },
    },
  },
  session_facilitators: {
    columns: ['id', 'session_id', 'user_id'],
    embeds: { profiles: { table: 'profiles', localKey: 'user_id', foreignKey: 'id', many: false } },
  },
  profiles: { columns: ['id', 'first_name', 'last_name'] },
};

export type Tables = Record<keyof typeof SCHEMA, Row[]>;

export function emptyTables(): Tables {
  return Object.fromEntries(Object.keys(SCHEMA).map((t) => [t, []])) as unknown as Tables;
}

// ============================================================
// Row builders (baseline NOT NULL columns filled with synthetic values)
// ============================================================

export const SYNTHETIC_USER = '00000000-0000-4000-8000-00000000a000';

export function school(id: number, name: string, tenant_kind = 'client'): Row {
  return { id, name, has_generations: false, cliente_id: null, logo_url: null, tenant_kind };
}

export function cliente(id: string, school_id: number): Row {
  return { id, nombre_legal: `Sostenedor ${id}`, nombre_fantasia: `Cliente ${id}`, school_id };
}

export function programa(id: string, nombre: string): Row {
  return { id, codigo_servicio: null, nombre, horas_totales: null, activo: true };
}

export function hourType(id: string, key: string, display_name: string, sort_order: number): Row {
  return { id, key, display_name, modality: 'presencial', sort_order, is_active: true };
}

export function contrato(r: {
  id: string;
  numero: string;
  cliente_id: string;
  programa_id: string | null;
  horas: number | null;
  estado?: string;
  is_anexo?: boolean;
  parent_contrato_id?: string | null;
}): Row {
  return {
    id: r.id,
    numero_contrato: r.numero,
    fecha_contrato: '2026-03-01',
    cliente_id: r.cliente_id,
    programa_id: r.programa_id,
    estado: r.estado ?? 'activo',
    is_anexo: r.is_anexo ?? false,
    parent_contrato_id: r.parent_contrato_id ?? null,
    anexo_numero: r.is_anexo ? 1 : null,
    horas_contratadas: r.horas,
  };
}

export function allocation(r: {
  id: string;
  contrato_id: string;
  hour_type_id: string;
  hours: number;
  adds_to?: string | null;
  fixed?: boolean;
}): Row {
  return {
    id: r.id,
    contrato_id: r.contrato_id,
    hour_type_id: r.hour_type_id,
    allocated_hours: r.hours,
    is_fixed_allocation: r.fixed ?? false,
    adds_to_allocation_id: r.adds_to ?? null,
    created_at: '2026-03-01T12:00:00Z',
    created_by: SYNTHETIC_USER,
  };
}

export function ledger(r: {
  id: string;
  allocation_id: string;
  status: string;
  hours: number;
  effective_minutes?: number | null;
  session_id?: string | null;
  is_manual?: boolean;
}): Row {
  return {
    id: r.id,
    allocation_id: r.allocation_id,
    session_id: r.session_id ?? null,
    hours: r.hours,
    status: r.status,
    session_date: '2026-04-15',
    is_over_budget: false,
    is_manual: r.is_manual ?? false,
    admin_override: r.effective_minutes !== undefined && r.effective_minutes !== null,
    recorded_by: SYNTHETIC_USER,
    planned_minutes_snapshot: null,
    effective_minutes: r.effective_minutes ?? null,
  };
}

export function session(r: {
  id: string;
  contrato_id: string;
  hour_type_key: string;
  scheduled_minutes: number;
  title: string;
  date: string;
  status?: string;
}): Row {
  return {
    id: r.id,
    title: r.title,
    session_date: r.date,
    scheduled_duration_minutes: r.scheduled_minutes,
    actual_duration_minutes: null,
    status: r.status ?? 'completada',
    hour_type_key: r.hour_type_key,
    contrato_id: r.contrato_id,
    school_id: null,
    is_active: true,
  };
}

// ============================================================
// SQL-derived arithmetic (integer hundredths — numeric(8,2)/numeric(6,2))
// ============================================================

/** A stored numeric(·,2) value as hundredths. */
function cents(value: unknown): number {
  return Math.round(Number(value) * 100);
}

/**
 * One ledger row's billable value in hundredths:
 * `COALESCE(round(effective_minutes::numeric / 60, 2), hours)`. effective_minutes is a
 * non-negative integer (CHECK >= 0), so half-up rounding is exact in integers.
 */
export function ledgerRowCents(row: Row): number {
  const minutes = row.effective_minutes;
  if (minutes !== null && minutes !== undefined) {
    return Math.floor((Number(minutes) * 100 + 30) / 60);
  }
  return cents(row.hours);
}

const COUNTED_STATUSES = ['reservada', 'consumida', 'penalizada'];

/** `get_bucket_summary(p_contrato_id)` evaluated over the in-memory tables. */
export function bucketSummarySql(tables: Tables, contratoId: string): Row[] {
  const allocations = tables.contract_hour_allocations;
  const directIds = allocations.filter((a) => a.contrato_id === contratoId).map((a) => a.id);

  // effective_allocations: direct UNION ALL one-hop annexes (no de-duplication).
  const effective = [
    ...allocations.filter((a) => a.contrato_id === contratoId).map((a) => ({ a, isAnnex: false })),
    ...allocations
      .filter((a) => a.adds_to_allocation_id !== null && directIds.includes(a.adds_to_allocation_id))
      .map((a) => ({ a, isAnnex: true })),
  ];

  type Totals = { allocated: number; fixed: boolean; annex: number; reserved: number; consumed: number };
  const byType = new Map<unknown, Totals>();
  for (const { a, isAnnex } of effective) {
    const t = byType.get(a.hour_type_id) ?? { allocated: 0, fixed: false, annex: 0, reserved: 0, consumed: 0 };
    t.allocated += cents(a.allocated_hours);
    t.fixed = t.fixed || a.is_fixed_allocation === true;
    if (isAnnex) t.annex += cents(a.allocated_hours);
    byType.set(a.hour_type_id, t);
  }
  for (const { a } of effective) {
    for (const l of tables.contract_hours_ledger) {
      if (l.allocation_id !== a.id || !COUNTED_STATUSES.includes(String(l.status))) continue;
      const t = byType.get(a.hour_type_id)!;
      if (l.status === 'reservada') t.reserved += ledgerRowCents(l);
      else t.consumed += ledgerRowCents(l);
    }
  }

  const out: Array<{ sort: number; row: Row }> = [];
  for (const [hourTypeId, t] of byType) {
    const ht = tables.hour_types.find((h) => h.id === hourTypeId);
    if (!ht) continue; // JOIN hour_types
    out.push({
      sort: Number(ht.sort_order),
      row: {
        hour_type_key: ht.key,
        display_name: ht.display_name,
        allocated_hours: t.allocated / 100,
        reserved_hours: t.reserved / 100,
        consumed_hours: t.consumed / 100,
        available_hours: (t.allocated - t.reserved - t.consumed) / 100,
        is_fixed_allocation: t.fixed,
        annex_hours: t.annex / 100,
      },
    });
  }
  return out.sort((x, y) => x.sort - y.sort).map((o) => o.row);
}

export type ExpectedSummary = {
  total_contracted_hours: number;
  total_allocated: number;
  total_reserved: number;
  total_consumed: number;
  total_available: number;
};

/**
 * Oracle: the school-wide totals with each contributing allocation and ledger row counted
 * once. Membership is the set union, over the school's active contracts, of each
 * get_bucket_summary effective_allocations set, keyed by allocation id.
 */
export function expectedSchoolSummary(tables: Tables, schoolId: number): ExpectedSummary | null {
  const schoolRow = tables.schools.find((s) => s.id === schoolId);
  if (!schoolRow || schoolRow.tenant_kind !== 'client') return null;

  const clienteIds = tables.clientes.filter((c) => c.school_id === schoolId).map((c) => c.id);
  const active = tables.contratos.filter((c) => clienteIds.includes(c.cliente_id) && c.estado === 'activo');

  const members = new Map<unknown, Row>();
  for (const c of active) {
    const direct = tables.contract_hour_allocations.filter((a) => a.contrato_id === c.id);
    const directIds = direct.map((a) => a.id);
    const annexes = tables.contract_hour_allocations.filter(
      (a) => a.adds_to_allocation_id !== null && directIds.includes(a.adds_to_allocation_id)
    );
    for (const a of [...direct, ...annexes]) members.set(a.id, a);
  }

  const ledgerRows = new Map<unknown, Row>();
  for (const l of tables.contract_hours_ledger) {
    if (members.has(l.allocation_id) && COUNTED_STATUSES.includes(String(l.status))) ledgerRows.set(l.id, l);
  }

  const contracted = active.reduce((s, c) => s + cents(c.horas_contratadas ?? 0), 0);
  const allocated = [...members.values()].reduce((s, a) => s + cents(a.allocated_hours), 0);
  let reserved = 0;
  let consumed = 0;
  for (const l of ledgerRows.values()) {
    if (l.status === 'reservada') reserved += ledgerRowCents(l);
    else consumed += ledgerRowCents(l);
  }

  return {
    total_contracted_hours: contracted / 100,
    total_allocated: allocated / 100,
    total_reserved: reserved / 100,
    total_consumed: consumed / 100,
    total_available: (allocated - reserved - consumed) / 100,
  };
}

// ============================================================
// PostgREST-like client
// ============================================================

export type Filter = { column: string; op: 'eq' | 'in'; value: unknown };

export type QueryInfo = {
  /** Table name, or `rpc:<fn>` for an RPC. */
  table: string;
  select: string;
  filters: Filter[];
  order: Array<{ column: string; ascending: boolean }>;
  range: { from: number; to: number } | null;
  /** 0-based count of earlier requests to the same table in this client. */
  callIndex: number;
  params?: Record<string, unknown>;
};

export type FaultResult = 'throw' | { error: PgError } | { data: unknown };

export type Fault = { table: string; when?: (q: QueryInfo) => boolean; result: FaultResult };

export type ClientOptions = {
  faults?: Fault[];
  /** Deterministic shuffle of storage order before every read. */
  shuffleSeed?: number;
  /**
   * A server `max-rows` below the requested page size, applied to ranged reads only (the
   * school-wide aggregation's), so the unranged per-contract reads stay complete.
   */
  rangedMaxRows?: number;
};

function splitTopLevel(select: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of select) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
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

function projectRow(tables: Tables, table: string, select: string, row: Row): Row | PgError {
  const def = SCHEMA[table];
  const out: Row = {};
  for (const part of splitTopLevel(select)) {
    const embed = EMBED_RE.exec(part);
    if (embed) {
      const rel = def.embeds?.[embed[1]];
      if (!rel) return pgError('PGRST200', `Could not find a relationship between '${table}' and '${embed[1]}'`);
      const related = (tables[rel.table] ?? []).filter((r) => r[rel.foreignKey] === row[rel.localKey]);
      const projected: Row[] = [];
      for (const r of related) {
        const p = projectRow(tables, rel.table, embed[2], r);
        if ('code' in p && 'hint' in p) return p;
        projected.push(p as Row);
      }
      out[embed[1]] = rel.many ? projected : projected[0] ?? null;
    } else if (part === '*') {
      Object.assign(out, row);
    } else if (!def.columns.includes(part)) {
      return pgError('42703', `column ${table}.${part} does not exist`);
    } else {
      out[part] = row[part] ?? null;
    }
  }
  return out;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(rows: T[], rand: (() => number) | null): T[] {
  const copy = [...rows];
  if (!rand) return copy;
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function compare(left: unknown, right: unknown): number {
  if (left === right) return 0;
  return (left as number | string) < (right as number | string) ? -1 : 1;
}

export type Result = { data: unknown; error: PgError | null };

export type FixtureClient = {
  from: (table: string) => unknown;
  rpc: (fn: string, params: Record<string, unknown>) => PromiseLike<Result>;
  /** Every request that reached the client, in order. */
  log: QueryInfo[];
};

export function createFixtureClient(tables: Tables, options: ClientOptions = {}): FixtureClient {
  const log: QueryInfo[] = [];
  const calls = new Map<string, number>();
  const rand = options.shuffleSeed === undefined ? null : mulberry32(options.shuffleSeed);

  function record(info: Omit<QueryInfo, 'callIndex'>): QueryInfo {
    const callIndex = calls.get(info.table) ?? 0;
    calls.set(info.table, callIndex + 1);
    const full = { ...info, callIndex };
    log.push(full);
    return full;
  }

  function applyFault(info: QueryInfo): Promise<Result> | null {
    const fault = (options.faults ?? []).find((f) => f.table === info.table && (!f.when || f.when(info)));
    if (!fault) return null;
    if (fault.result === 'throw') return Promise.reject(new Error('fetch failed: synthetic socket reset'));
    if ('error' in fault.result) return Promise.resolve({ data: null, error: fault.result.error });
    return Promise.resolve({ data: fault.result.data, error: null });
  }

  function run(info: QueryInfo, limit: number | null): Result {
    const def = SCHEMA[info.table];
    if (!def) return { data: null, error: pgError('42P01', `relation "public.${info.table}" does not exist`) };
    for (const f of info.filters) {
      if (!def.columns.includes(f.column)) {
        return { data: null, error: pgError('42703', `column ${info.table}.${f.column} does not exist`) };
      }
    }
    for (const o of info.order) {
      if (!def.columns.includes(o.column)) {
        return { data: null, error: pgError('42703', `column ${info.table}.${o.column} does not exist`) };
      }
    }

    let rows = shuffled(tables[info.table] ?? [], rand).filter((row) =>
      info.filters.every((f) =>
        f.op === 'eq' ? row[f.column] === f.value : (f.value as unknown[]).includes(row[f.column])
      )
    );

    if (info.order.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const { column, ascending } of info.order) {
          const l = a[column];
          const r = b[column];
          if (l === r) continue;
          // Postgres: ASC NULLS LAST, DESC NULLS FIRST.
          if (l === null || l === undefined) return ascending ? 1 : -1;
          if (r === null || r === undefined) return ascending ? -1 : 1;
          return compare(l, r) * (ascending ? 1 : -1);
        }
        return 0;
      });
    }

    if (info.range) rows = rows.slice(info.range.from, info.range.to + 1);
    if (info.range && options.rangedMaxRows !== undefined) rows = rows.slice(0, options.rangedMaxRows);
    if (limit !== null) rows = rows.slice(0, limit);
    rows = rows.slice(0, MAX_ROWS_PER_RESPONSE);

    const data: Row[] = [];
    for (const row of rows) {
      const projected = projectRow(tables, info.table, info.select, row);
      if ('code' in projected && 'hint' in projected) return { data: null, error: projected as PgError };
      data.push(projected as Row);
    }
    return { data, error: null };
  }

  function from(table: string) {
    const state = {
      select: '*',
      filters: [] as Filter[],
      order: [] as QueryInfo['order'],
      range: null as QueryInfo['range'],
      limit: null as number | null,
    };

    function execute(mode: 'many' | 'single' | 'maybeSingle'): Promise<Result> {
      const info = record({
        table,
        select: state.select,
        filters: [...state.filters],
        order: [...state.order],
        range: state.range,
      });
      const faulted = applyFault(info);
      if (faulted) return faulted;
      const result = run(info, state.limit);
      if (result.error || mode === 'many') return Promise.resolve(result);
      const list = result.data as Row[];
      if (list.length === 1) return Promise.resolve({ data: list[0], error: null });
      if (list.length === 0 && mode === 'maybeSingle') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({
        data: null,
        error: pgError('PGRST116', 'JSON object requested, multiple (or no) rows returned'),
      });
    }

    const builder = {
      select(columns: string) {
        state.select = columns.replace(/\s+/g, ' ').trim();
        return builder;
      },
      eq(column: string, value: unknown) {
        state.filters.push({ column, op: 'eq', value });
        return builder;
      },
      in(column: string, values: unknown[]) {
        state.filters.push({ column, op: 'in', value: [...values] });
        return builder;
      },
      order(column: string, opts?: { ascending?: boolean }) {
        state.order.push({ column, ascending: opts?.ascending ?? true });
        return builder;
      },
      range(fromIndex: number, toIndex: number) {
        state.range = { from: fromIndex, to: toIndex };
        return builder;
      },
      limit(count: number) {
        state.limit = count;
        return builder;
      },
      single() {
        return execute('single');
      },
      maybeSingle() {
        return execute('maybeSingle');
      },
      then<A, B>(onFulfilled?: (r: Result) => A | PromiseLike<A>, onRejected?: (e: unknown) => B | PromiseLike<B>) {
        return execute('many').then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  function rpc(fn: string, params: Record<string, unknown>): PromiseLike<Result> {
    const info = record({ table: `rpc:${fn}`, select: '', filters: [], order: [], range: null, params });
    const faulted = applyFault(info);
    if (faulted) return faulted;
    if (fn !== 'get_bucket_summary') {
      return Promise.resolve({ data: null, error: pgError('42883', `function public.${fn} does not exist`) });
    }
    return Promise.resolve({ data: bucketSummarySql(tables, String(params.p_contrato_id)), error: null });
  }

  return { from, rpc, log };
}

/** Requests made by the school-wide aggregation (allocations, ledger by allocation). */
export function aggregationReads(log: QueryInfo[]): QueryInfo[] {
  return log.filter(
    (q) =>
      q.table === 'contract_hour_allocations' ||
      (q.table === 'contract_hours_ledger' && q.filters.some((f) => f.column === 'allocation_id'))
  );
}

// ============================================================
// Scenarios
// ============================================================

export const SCHOOL_ID = 42;
export const SCHOOL_NAME = 'Colegio Sintetico Los Arrayanes';
export const CLIENTE_ID = 'c1000000-0000-4000-8000-000000000001';
export const PROGRAMA_A = 'p1000000-0000-4000-8000-000000000001';
export const PROGRAMA_B = 'p1000000-0000-4000-8000-000000000002';
export const HT_ASESORIA = 'h1000000-0000-4000-8000-000000000001';
export const HT_TALLER = 'h1000000-0000-4000-8000-000000000002';

export const PARENT_CONTRATO = 'k1000000-0000-4000-8000-000000000001';
export const ANNEX_CONTRATO = 'k1000000-0000-4000-8000-000000000002';
export const INDEPENDENT_CONTRATO = 'k1000000-0000-4000-8000-000000000003';

export const PARENT_ALLOC = 'a1000000-0000-4000-8000-000000000001';
export const ANNEX_ALLOC = 'a1000000-0000-4000-8000-000000000002';
export const INDEPENDENT_ALLOC = 'a1000000-0000-4000-8000-000000000003';
export const PARENT_SESSION = 's1000000-0000-4000-8000-000000000001';

/** School, cliente, two programs and two hour types, with no contracts. */
export function baseTables(): Tables {
  const t = emptyTables();
  t.schools.push(school(SCHOOL_ID, SCHOOL_NAME));
  t.clientes.push(cliente(CLIENTE_ID, SCHOOL_ID));
  t.programas.push(programa(PROGRAMA_A, 'Programa Sintetico Alfa'), programa(PROGRAMA_B, 'Programa Sintetico Beta'));
  t.hour_types.push(
    hourType(HT_ASESORIA, 'asesoria_tecnica_presencial', 'Asesoria Tecnica', 1),
    hourType(HT_TALLER, 'talleres_presenciales', 'Talleres Presenciales', 2)
  );
  return t;
}

/**
 * D1: parent 50 h + linked annex 10 h + independent 20 h (three active contracts).
 * Parent consumed 2 and reserved 2, annex consumed 1. Contracted hours deliberately
 * differ from allocated hours (52 + 10 + 20 = 82).
 */
export function parentAnnexTables(): Tables {
  const t = baseTables();
  t.contratos.push(
    contrato({ id: PARENT_CONTRATO, numero: 'SIN-2026-001', cliente_id: CLIENTE_ID, programa_id: PROGRAMA_A, horas: 52 }),
    contrato({
      id: ANNEX_CONTRATO,
      numero: 'SIN-2026-001-A1',
      cliente_id: CLIENTE_ID,
      programa_id: PROGRAMA_A,
      horas: 10,
      is_anexo: true,
      parent_contrato_id: PARENT_CONTRATO,
    }),
    contrato({ id: INDEPENDENT_CONTRATO, numero: 'SIN-2026-002', cliente_id: CLIENTE_ID, programa_id: PROGRAMA_B, horas: 20 })
  );
  t.contract_hour_allocations.push(
    allocation({ id: PARENT_ALLOC, contrato_id: PARENT_CONTRATO, hour_type_id: HT_ASESORIA, hours: 50 }),
    allocation({ id: ANNEX_ALLOC, contrato_id: ANNEX_CONTRATO, hour_type_id: HT_ASESORIA, hours: 10, adds_to: PARENT_ALLOC }),
    allocation({ id: INDEPENDENT_ALLOC, contrato_id: INDEPENDENT_CONTRATO, hour_type_id: HT_TALLER, hours: 20 })
  );
  t.contract_hours_ledger.push(
    ledger({
      id: 'l1000000-0000-4000-8000-000000000001',
      allocation_id: PARENT_ALLOC,
      status: 'consumida',
      hours: 2,
      session_id: PARENT_SESSION,
    }),
    ledger({ id: 'l1000000-0000-4000-8000-000000000002', allocation_id: PARENT_ALLOC, status: 'reservada', hours: 2 }),
    ledger({ id: 'l1000000-0000-4000-8000-000000000003', allocation_id: ANNEX_ALLOC, status: 'consumida', hours: 1 })
  );
  t.consultor_sessions.push(
    session({
      id: PARENT_SESSION,
      contrato_id: PARENT_CONTRATO,
      hour_type_key: 'asesoria_tecnica_presencial',
      scheduled_minutes: 120,
      title: 'Sesion sintetica de acompanamiento',
      date: '2026-04-15',
    })
  );
  t.profiles.push({ id: SYNTHETIC_USER, first_name: 'Consultora', last_name: 'Sintetica' });
  t.session_facilitators.push({ id: 'f1000000-0000-4000-8000-000000000001', session_id: PARENT_SESSION, user_id: SYNTHETIC_USER });
  return t;
}
