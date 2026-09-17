// @vitest-environment node
/**
 * SM-02 (A14-4-F01) — school-wide PDF totals count each allocation and ledger row once.
 *
 * Real `fetchSchoolReportData`, real JSON and PDF handlers, real jsPDF/jspdf-autotable and
 * the real `sendAuthError`/`sendApiResponse`. Only the identity (`getApiUser`,
 * `getUserRoles`), the service-role client factory and the logo file read are replaced.
 * The client is the schema-faithful double in `__tests__/fixtures/school-report-totals.ts`,
 * whose `get_bucket_summary` and oracle are derived from the SQL, not from the service.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import * as realFs from 'fs';

import {
  ANNEX_ALLOC,
  ANNEX_CONTRATO,
  CLIENTE_ID,
  HT_ASESORIA,
  HT_TALLER,
  INDEPENDENT_CONTRATO,
  PARENT_ALLOC,
  PARENT_CONTRATO,
  PARENT_SESSION,
  PROGRAMA_A,
  PROGRAMA_B,
  SCHOOL_ID,
  SCHOOL_NAME,
  aggregationReads,
  allocation,
  baseTables,
  bucketSummarySql,
  cliente,
  contrato,
  createFixtureClient,
  expectedSchoolSummary,
  ledger,
  ledgerRowCents,
  parentAnnexTables,
  pgError,
  school,
  session,
  type ClientOptions,
  type Fault,
  type FixtureClient,
  type QueryInfo,
  type Tables,
} from '../../fixtures/school-report-totals';

const { mockGetApiUser, mockCreateServiceRoleClient, mockGetUserRoles, mockReadFileSync } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockGetUserRoles: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-auth')>();
  return { ...actual, getApiUser: mockGetApiUser, createServiceRoleClient: mockCreateServiceRoleClient };
});

vi.mock('../../../utils/roleUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/roleUtils')>();
  return { ...actual, getUserRoles: mockGetUserRoles };
});

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const mocked = { ...actual, readFileSync: mockReadFileSync };
  return { ...mocked, default: mocked };
});

import jsonHandler from '../../../pages/api/school-hours-report/[school_id]/index';
import pdfHandler from '../../../pages/api/school-hours-report/[school_id]/pdf';
import { billableHours } from '../../../lib/services/billable-hours';

// ============================================================
// Identity and invocation
// ============================================================

const ADMIN = { id: 'u1000000-0000-4000-8000-000000000001', roles: [{ role_type: 'admin', school_id: null }] };
const DIRECTIVO = {
  id: 'u1000000-0000-4000-8000-000000000002',
  roles: [{ role_type: 'equipo_directivo', school_id: SCHOOL_ID }],
};

type Identity = { id: string; roles: Array<{ role_type: string; school_id: number | null }> } | null;

type Kind = 'json' | 'pdf';

type CallOptions = {
  tables: Tables;
  clientOptions?: ClientOptions;
  identity?: Identity;
  method?: string;
  query?: Record<string, unknown>;
};

type MockRes = ReturnType<typeof createMocks>['res'];

async function call(kind: Kind, opts: CallOptions): Promise<{ res: MockRes; client: FixtureClient }> {
  const client = createFixtureClient(opts.tables, opts.clientOptions);
  mockCreateServiceRoleClient.mockReturnValue(client);
  const identity = opts.identity === undefined ? DIRECTIVO : opts.identity;
  mockGetApiUser.mockResolvedValue(
    identity ? { user: { id: identity.id }, error: null } : { user: null, error: new Error('No session') }
  );
  mockGetUserRoles.mockResolvedValue(
    identity ? identity.roles.map((r) => ({ ...r, user_id: identity.id, is_active: true })) : []
  );
  const { req, res } = createMocks({
    method: (opts.method ?? 'GET') as 'GET',
    query: (opts.query ?? { school_id: String(SCHOOL_ID) }) as Record<string, string>,
  });
  await (kind === 'json' ? jsonHandler : pdfHandler)(req as never, res as never);
  return { res, client };
}

async function jsonReport(tables: Tables, clientOptions?: ClientOptions) {
  const { res, client } = await call('json', { tables, clientOptions });
  expect(res._getStatusCode()).toBe(200);
  return { body: res._getJSONData(), client };
}

// ============================================================
// Strict PDF text extraction (pdf-lib parse + content-stream literal strings)
// ============================================================

const STRICT_LOAD = { throwOnInvalidObject: true, updateMetadata: false };
const PDF_ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };

function literalStrings(content: string): string[] {
  const strings: string[] = [];
  for (let i = content.indexOf('('); i !== -1; i = content.indexOf('(', i)) {
    let depth = 1;
    let s = '';
    for (i++; depth > 0 && i < content.length; i++) {
      const c = content[i];
      if (c === '\\') {
        const octal = /^[0-7]{1,3}/.exec(content.slice(i + 1, i + 4));
        const next = content[i + 1];
        if (octal) {
          s += String.fromCharCode(parseInt(octal[0], 8));
          i += octal[0].length;
        } else if (next in PDF_ESCAPES) {
          s += PDF_ESCAPES[next];
          i++;
        } else {
          i++;
        }
      } else if (c === '(') {
        depth++;
        s += c;
      } else if (c === ')') {
        if (--depth > 0) s += c;
      } else {
        s += c;
      }
    }
    strings.push(s);
  }
  return strings;
}

async function pdfStrings(res: MockRes): Promise<{ pages: string[][]; all: string[] }> {
  if (res._getStatusCode() !== 200) {
    throw new Error(`expected a PDF, got ${res._getStatusCode()}: ${String(res._getData())}`);
  }
  const bytes = res._getBuffer();
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(res.getHeader('Content-Type')).toBe('application/pdf');
  expect(res.getHeader('Content-Length')).toBe(bytes.length);
  const doc = await PDFDocument.load(bytes, STRICT_LOAD);
  const pages: string[][] = [];
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents];
    const strings: string[] = [];
    for (const stream of streams) {
      if (!(stream instanceof PDFRawStream)) throw new Error('page content is not a raw stream');
      strings.push(...literalStrings(Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')));
    }
    pages.push(strings.map((s) => s.trim()));
  }
  return { pages, all: pages.flat() };
}

const SUMMARY_HEAD = ['Horas Contratadas', 'Consumidas', 'Reservadas', 'Disponibles'];

/** The "Resumen General" table: its title, the four header cells, then the four body cells. */
function summaryRow(strings: string[]): string[] {
  const title = strings.indexOf('Resumen General');
  expect(title).toBeGreaterThanOrEqual(0);
  const head = strings.indexOf(SUMMARY_HEAD[0], title);
  expect(strings.slice(head, head + 4)).toEqual(SUMMARY_HEAD);
  return strings.slice(head + 4, head + 8);
}

/** What the PDF renders for a summary: `toFixed(1)` of each service total. */
function renderedSummary(s: { total_contracted_hours: number; total_consumed: number; total_reserved: number; total_available: number }) {
  return [s.total_contracted_hours, s.total_consumed, s.total_reserved, s.total_available].map((n) => n.toFixed(1));
}

function refusalReads(log: QueryInfo[]): QueryInfo[] {
  return log.filter((q) => q.table !== 'schools');
}

const A = (n: number) => `a5000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const L = (n: number) => `l5000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const K = (n: number) => `k5000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** 1001 allocations on one contract, each with one ledger row, plus 1001 rows on one allocation. */
function paginationTables(): Tables {
  const t = baseTables();
  t.contratos.push(contrato({ id: PARENT_CONTRATO, numero: 'SIN-BIG', cliente_id: CLIENTE_ID, programa_id: PROGRAMA_A, horas: 1000 }));
  for (let i = 0; i < 1001; i++) {
    t.contract_hour_allocations.push(allocation({ id: A(i + 100), contrato_id: PARENT_CONTRATO, hour_type_id: HT_ASESORIA, hours: 1 }));
    t.contract_hours_ledger.push(ledger({ id: L(i + 100), allocation_id: A(i + 100), status: 'reservada', hours: 0.01 }));
    t.contract_hours_ledger.push(ledger({ id: L(i + 5000), allocation_id: A(100), status: 'consumida', hours: 0.01 }));
  }
  return t;
}

const JSON_500 = { error: 'Error inesperado al obtener el reporte de horas' };
const PDF_500 = { error: 'Error al generar el PDF' };

// ============================================================
// Suite
// ============================================================

describe('SM-02 school report totals (real service → JSON/PDF handlers)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFileSync.mockImplementation(realFs.readFileSync as never);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // ------------------------------------------------------------
  describe('D1 parent-annex service→PDF', () => {
    it('D1 parent-annex service→PDF: JSON school_summary counts the annex once (80 / 3 / 2 / 75), contracted 82', async () => {
      const tables = parentAnnexTables();
      const oracle = expectedSchoolSummary(tables, SCHOOL_ID)!;
      expect(oracle).toEqual({
        total_contracted_hours: 82,
        total_allocated: 80,
        total_reserved: 2,
        total_consumed: 3,
        total_available: 75,
      });

      const { body } = await jsonReport(tables);
      expect(body.data.school_summary).toEqual(oracle);

      // The per-contract RPC figures overlap by design: the parent includes the annex.
      const contracts = body.data.programs.flatMap((p: { contracts: unknown[] }) => p.contracts);
      const byId = Object.fromEntries(contracts.map((c: { contrato_id: string }) => [c.contrato_id, c]));
      expect(byId[PARENT_CONTRATO]).toMatchObject({ total_contracted_hours: 52, total_consumed: 3, total_reserved: 2, total_available: 55 });
      expect(byId[ANNEX_CONTRATO]).toMatchObject({ total_contracted_hours: 10, total_consumed: 1, total_reserved: 0, total_available: 9 });
      expect(byId[INDEPENDENT_CONTRATO]).toMatchObject({ total_contracted_hours: 20, total_consumed: 0, total_available: 20 });
    });

    it('D1 parent-annex service→PDF: the PDF summary row renders 82.0 / 3.0 / 2.0 / 75.0, not the overlapping 4.0 / 84.0', async () => {
      const { res } = await call('pdf', { tables: parentAnnexTables() });
      const { all } = await pdfStrings(res);
      expect(summaryRow(all)).toEqual(['82.0', '3.0', '2.0', '75.0']);
    });
  });

  // ------------------------------------------------------------
  describe('D2 membership-and-empty matrix', () => {
    const zero = { total_contracted_hours: 0, total_allocated: 0, total_reserved: 0, total_consumed: 0, total_available: 0 };

    type Case = { name: string; build: () => Tables; expected: typeof zero; programs: number };

    const cases: Case[] = [
      {
        name: 'no clients → valid zero summary',
        build: () => {
          const t = baseTables();
          t.clientes.length = 0;
          return t;
        },
        expected: zero,
        programs: 0,
      },
      {
        name: 'clients but no active contracts → valid zero summary',
        build: () => {
          const t = parentAnnexTables();
          for (const c of t.contratos) c.estado = 'finalizado';
          return t;
        },
        expected: zero,
        programs: 0,
      },
      {
        name: 'active contract with zero buckets and zero ledger → contracted only',
        build: () => {
          const t = baseTables();
          t.contratos.push(contrato({ id: PARENT_CONTRATO, numero: 'SIN-0', cliente_id: CLIENTE_ID, programa_id: PROGRAMA_A, horas: 30 }));
          return t;
        },
        expected: { ...zero, total_contracted_hours: 30 },
        programs: 1,
      },
      {
        name: 'standalone annex (no allocation link) is retained',
        build: () => {
          const t = baseTables();
          t.contratos.push(
            contrato({ id: ANNEX_CONTRATO, numero: 'SIN-A', cliente_id: CLIENTE_ID, programa_id: PROGRAMA_A, horas: 8, is_anexo: true })
          );
          t.contract_hour_allocations.push(allocation({ id: ANNEX_ALLOC, contrato_id: ANNEX_CONTRATO, hour_type_id: HT_ASESORIA, hours: 8 }));
          t.contract_hours_ledger.push(ledger({ id: 'l2000000-0000-4000-8000-000000000001', allocation_id: ANNEX_ALLOC, status: 'consumida', hours: 1.5 }));
          return t;
        },
        expected: { total_contracted_hours: 8, total_allocated: 8, total_reserved: 0, total_consumed: 1.5, total_available: 6.5 },
        programs: 1,
      },
      {
        name: 'only parent active → linked annex allocation and its ledger arrive by one hop',
        build: () => {
          const t = parentAnnexTables();
          t.contratos.find((c) => c.id === ANNEX_CONTRATO)!.estado = 'finalizado';
          t.contratos.find((c) => c.id === INDEPENDENT_CONTRATO)!.estado = 'finalizado';
          return t;
        },
        expected: { total_contracted_hours: 52, total_allocated: 60, total_reserved: 2, total_consumed: 3, total_available: 55 },
        programs: 1,
      },
      {
        name: 'only annex active → annex allocation only, parent ledger excluded',
        build: () => {
          const t = parentAnnexTables();
          t.contratos.find((c) => c.id === PARENT_CONTRATO)!.estado = 'finalizado';
          t.contratos.find((c) => c.id === INDEPENDENT_CONTRATO)!.estado = 'finalizado';
          return t;
        },
        expected: { total_contracted_hours: 10, total_allocated: 10, total_reserved: 0, total_consumed: 1, total_available: 9 },
        programs: 1,
      },
      {
        name: 'multiple programs (parent+annex in Alfa, independent in Beta)',
        build: parentAnnexTables,
        expected: { total_contracted_hours: 82, total_allocated: 80, total_reserved: 2, total_consumed: 3, total_available: 75 },
        programs: 2,
      },
    ];

    it.each(cases)('D2 membership-and-empty matrix: $name', async ({ build, expected, programs }) => {
      const tables = build();
      expect(expectedSchoolSummary(tables, SCHOOL_ID)).toEqual(expected);
      const { body, client } = await jsonReport(tables);
      expect(body.data.school_summary).toEqual(expected);
      expect(body.data.programs).toHaveLength(programs);
      if (programs === 0) expect(aggregationReads(client.log)).toEqual([]);

      const pdf = await call('pdf', { tables: build() });
      expect(summaryRow((await pdfStrings(pdf.res)).all)).toEqual(renderedSummary(expected));
    });

    it('D2 membership-and-empty matrix: per-contract RPC one-hop membership is preserved', () => {
      const tables = parentAnnexTables();
      const parent = bucketSummarySql(tables, PARENT_CONTRATO);
      expect(parent).toEqual([
        expect.objectContaining({ hour_type_key: 'asesoria_tecnica_presencial', allocated_hours: 60, annex_hours: 10, consumed_hours: 3 }),
      ]);
      expect(bucketSummarySql(tables, ANNEX_CONTRATO)).toEqual([
        expect.objectContaining({ allocated_hours: 10, annex_hours: 0, consumed_hours: 1 }),
      ]);
    });
  });

  // ------------------------------------------------------------
  describe('D3 ledger-semantics matrix', () => {
    type RowCase = {
      name: string;
      row: Parameters<typeof ledger>[0] extends infer R ? Omit<R & object, 'id' | 'allocation_id'> & { onAnnex?: boolean } : never;
      reserved: number;
      consumed: number;
      available: number;
    };

    const rowCases: RowCase[] = [
      { name: 'reservada 1.5 → reserved', row: { status: 'reservada', hours: 1.5 }, reserved: 1.5, consumed: 0, available: 11.5 },
      { name: 'consumida 2.25 → consumed', row: { status: 'consumida', hours: 2.25 }, reserved: 0, consumed: 2.25, available: 10.75 },
      { name: 'penalizada 0.75 → consumed', row: { status: 'penalizada', hours: 0.75 }, reserved: 0, consumed: 0.75, available: 12.25 },
      { name: 'devuelta 3 → contributes zero', row: { status: 'devuelta', hours: 3 }, reserved: 0, consumed: 0, available: 13 },
      { name: 'annex ledger row consumida 1', row: { status: 'consumida', hours: 1, onAnnex: true }, reserved: 0, consumed: 1, available: 12 },
      { name: 'manual row, null session, consumida 0.5', row: { status: 'consumida', hours: 0.5, is_manual: true }, reserved: 0, consumed: 0.5, available: 12.5 },
      { name: 'override 45 min over 1 h → 0.75', row: { status: 'consumida', hours: 1, effective_minutes: 45 }, reserved: 0, consumed: 0.75, available: 12.25 },
      { name: 'zero waiver over 2 h → 0', row: { status: 'consumida', hours: 2, effective_minutes: 0 }, reserved: 0, consumed: 0, available: 13 },
      { name: 'fractional 50 min → 0.83', row: { status: 'consumida', hours: 1, effective_minutes: 50 }, reserved: 0, consumed: 0.83, available: 12.17 },
      { name: 'fractional 1 min → 0.02', row: { status: 'reservada', hours: 1, effective_minutes: 1 }, reserved: 0.02, consumed: 0, available: 12.98 },
      { name: 'penalizada 20 min → 0.33', row: { status: 'penalizada', hours: 0.25, effective_minutes: 20 }, reserved: 0, consumed: 0.33, available: 12.67 },
      { name: 'over-consumption keeps negative availability', row: { status: 'consumida', hours: 15.5 }, reserved: 0, consumed: 15.5, available: -2.5 },
    ];

    /** Parent 10 h active; annex 3 h linked, its contract inactive (reached by one hop). */
    function singleRowTables(rc: RowCase): Tables {
      const t = baseTables();
      t.contratos.push(
        contrato({ id: PARENT_CONTRATO, numero: 'SIN-P', cliente_id: CLIENTE_ID, programa_id: PROGRAMA_A, horas: 10 }),
        contrato({ id: ANNEX_CONTRATO, numero: 'SIN-A', cliente_id: CLIENTE_ID, programa_id: PROGRAMA_A, horas: 3, is_anexo: true, estado: 'finalizado' })
      );
      t.contract_hour_allocations.push(
        allocation({ id: PARENT_ALLOC, contrato_id: PARENT_CONTRATO, hour_type_id: HT_ASESORIA, hours: 10 }),
        allocation({ id: ANNEX_ALLOC, contrato_id: ANNEX_CONTRATO, hour_type_id: HT_ASESORIA, hours: 3, adds_to: PARENT_ALLOC })
      );
      const { onAnnex, ...row } = rc.row;
      t.contract_hours_ledger.push(
        ledger({ id: 'l3000000-0000-4000-8000-000000000001', allocation_id: onAnnex ? ANNEX_ALLOC : PARENT_ALLOC, ...row })
      );
      return t;
    }

    it.each(rowCases)('D3 ledger-semantics matrix: $name', async (rc) => {
      const tables = singleRowTables(rc);
      const expected = {
        total_contracted_hours: 10,
        total_allocated: 13,
        total_reserved: rc.reserved,
        total_consumed: rc.consumed,
        total_available: rc.available,
      };
      expect(expectedSchoolSummary(tables, SCHOOL_ID)).toEqual(expected);
      const { body } = await jsonReport(tables);
      expect(body.data.school_summary).toEqual(expected);
    });

    /** Every status and override case on parent and annex, plus a ledger-less session. */
    function mixedTables(): Tables {
      const t = baseTables();
      t.contratos.push(
        contrato({ id: PARENT_CONTRATO, numero: 'SIN-P', cliente_id: CLIENTE_ID, programa_id: PROGRAMA_A, horas: 12 }),
        contrato({ id: ANNEX_CONTRATO, numero: 'SIN-A', cliente_id: CLIENTE_ID, programa_id: PROGRAMA_A, horas: 3, is_anexo: true })
      );
      t.contract_hour_allocations.push(
        allocation({ id: PARENT_ALLOC, contrato_id: PARENT_CONTRATO, hour_type_id: HT_ASESORIA, hours: 5 }),
        allocation({ id: ANNEX_ALLOC, contrato_id: ANNEX_CONTRATO, hour_type_id: HT_ASESORIA, hours: 3, adds_to: PARENT_ALLOC })
      );
      const L = (n: number) => `l4000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
      const S = (n: number) => `s4000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
      t.contract_hours_ledger.push(
        ledger({ id: L(1), allocation_id: PARENT_ALLOC, status: 'reservada', hours: 1.5, session_id: S(1) }),
        ledger({ id: L(2), allocation_id: PARENT_ALLOC, status: 'consumida', hours: 4.25, session_id: S(2) }),
        ledger({ id: L(3), allocation_id: PARENT_ALLOC, status: 'penalizada', hours: 0.75 }),
        ledger({ id: L(4), allocation_id: PARENT_ALLOC, status: 'devuelta', hours: 3 }),
        ledger({ id: L(5), allocation_id: ANNEX_ALLOC, status: 'consumida', hours: 1 }),
        ledger({ id: L(6), allocation_id: ANNEX_ALLOC, status: 'consumida', hours: 0.5, is_manual: true }),
        ledger({ id: L(7), allocation_id: PARENT_ALLOC, status: 'consumida', hours: 1, effective_minutes: 45, session_id: S(3) }),
        ledger({ id: L(8), allocation_id: PARENT_ALLOC, status: 'consumida', hours: 2, effective_minutes: 0 }),
        ledger({ id: L(9), allocation_id: ANNEX_ALLOC, status: 'consumida', hours: 1, effective_minutes: 50 }),
        ledger({ id: L(10), allocation_id: PARENT_ALLOC, status: 'reservada', hours: 1, effective_minutes: 1 }),
        ledger({ id: L(11), allocation_id: PARENT_ALLOC, status: 'penalizada', hours: 0.25, effective_minutes: 20 })
      );
      const base = { contrato_id: PARENT_CONTRATO, hour_type_key: 'asesoria_tecnica_presencial', date: '2026-05-01' };
      t.consultor_sessions.push(
        session({ ...base, id: S(1), scheduled_minutes: 90, title: 'Sesion reservada' }),
        session({ ...base, id: S(2), scheduled_minutes: 255, title: 'Sesion consumida' }),
        session({ ...base, id: S(3), scheduled_minutes: 60, title: 'Sesion ajustada' }),
        // No ledger row: the drill-down shows its schedule (10 h); the aggregate must not.
        session({ ...base, id: S(4), scheduled_minutes: 600, title: 'Sesion sin libro' })
      );
      return t;
    }

    it('D3 ledger-semantics matrix: mixed parent/annex rows, no scheduled fallback in the aggregate, negative availability', async () => {
      const tables = mixedTables();
      // reserved 1.5 + 0.02; consumed 4.25 + 0.75 + 1 + 0.5 + 0.75 + 0 + 0.83 + 0.33.
      const expected = {
        total_contracted_hours: 15,
        total_allocated: 8,
        total_reserved: 1.52,
        total_consumed: 8.41,
        total_available: -1.93,
      };
      expect(expectedSchoolSummary(tables, SCHOOL_ID)).toEqual(expected);

      const { body } = await jsonReport(tables);
      expect(body.data.school_summary).toEqual(expected);

      const parent = body.data.programs[0].contracts.find((c: { contrato_id: string }) => c.contrato_id === PARENT_CONTRATO);
      const sessions = Object.fromEntries(
        parent.buckets[0].sessions.map((s: { title: string; hours: number; status: string }) => [s.title, [s.hours, s.status]])
      );
      expect(sessions).toEqual({
        'Sesion reservada': [1.5, 'reservada'],
        'Sesion consumida': [4.25, 'consumida'],
        'Sesion ajustada': [0.75, 'consumida'],
        'Sesion sin libro': [10, 'consumida'],
      });

      const pdf = await call('pdf', { tables: mixedTables() });
      expect(summaryRow((await pdfStrings(pdf.res)).all)).toEqual(['15.0', '8.4', '1.5', '-1.9']);
    });

    it('D3 ledger-semantics matrix + billable-hours regression: SQL per-row value equals lib billableHours', () => {
      const tables = mixedTables();
      for (const rc of rowCases) tables.contract_hours_ledger.push(...singleRowTables(rc).contract_hours_ledger);
      const counted = tables.contract_hours_ledger.filter((l) => l.status !== 'devuelta');
      expect(counted.length).toBeGreaterThan(15);
      for (const row of counted) {
        const lib = billableHours(
          { status: String(row.status), hours: row.hours as number, effective_minutes: row.effective_minutes as number | null },
          null,
          'per_session_display'
        );
        expect({ id: row.id, value: lib }).toEqual({ id: row.id, value: ledgerRowCents(row) / 100 });
      }
    });
  });

  // ------------------------------------------------------------
  describe('D4 identity-membership-pagination', () => {

    it('D4 identity-membership-pagination: dedupes by allocation/ledger identity, never by equal values', async () => {
      const t = parentAnnexTables();
      // Equal-valued but distinct allocations and ledger rows all count.
      t.contract_hour_allocations.push(allocation({ id: A(1), contrato_id: INDEPENDENT_CONTRATO, hour_type_id: HT_TALLER, hours: 20 }));
      t.contract_hours_ledger.push(
        ledger({ id: L(1), allocation_id: A(1), status: 'consumida', hours: 1 }),
        ledger({ id: L(2), allocation_id: A(1), status: 'consumida', hours: 1 }),
        ledger({ id: L(3), allocation_id: ANNEX_ALLOC, status: 'consumida', hours: 1 })
      );
      const expected = { total_contracted_hours: 82, total_allocated: 100, total_reserved: 2, total_consumed: 6, total_available: 92 };
      expect(expectedSchoolSummary(t, SCHOOL_ID)).toEqual(expected);
      const { body } = await jsonReport(t);
      expect(body.data.school_summary).toEqual(expected);
    });

    function chainTables(middleActive: boolean): Tables {
      const t = baseTables();
      t.contratos.push(
        contrato({ id: K(1), numero: 'SIN-C1', cliente_id: CLIENTE_ID, programa_id: PROGRAMA_A, horas: 10 }),
        contrato({ id: K(2), numero: 'SIN-C2', cliente_id: CLIENTE_ID, programa_id: PROGRAMA_A, horas: 5, is_anexo: true, estado: middleActive ? 'activo' : 'finalizado' }),
        contrato({ id: K(3), numero: 'SIN-C3', cliente_id: CLIENTE_ID, programa_id: PROGRAMA_A, horas: 2, is_anexo: true, estado: 'finalizado' })
      );
      t.contract_hour_allocations.push(
        allocation({ id: A(1), contrato_id: K(1), hour_type_id: HT_ASESORIA, hours: 10 }),
        allocation({ id: A(2), contrato_id: K(2), hour_type_id: HT_ASESORIA, hours: 5, adds_to: A(1) }),
        allocation({ id: A(3), contrato_id: K(3), hour_type_id: HT_ASESORIA, hours: 2, adds_to: A(2) })
      );
      t.contract_hours_ledger.push(
        ledger({ id: L(1), allocation_id: A(1), status: 'consumida', hours: 1 }),
        ledger({ id: L(2), allocation_id: A(2), status: 'consumida', hours: 1 }),
        ledger({ id: L(3), allocation_id: A(3), status: 'consumida', hours: 1 })
      );
      return t;
    }

    it.each([
      { middleActive: false, expected: { total_contracted_hours: 10, total_allocated: 15, total_reserved: 0, total_consumed: 2, total_available: 13 } },
      { middleActive: true, expected: { total_contracted_hours: 15, total_allocated: 17, total_reserved: 0, total_consumed: 3, total_available: 14 } },
    ])('D4 identity-membership-pagination: linked chain stays one hop (middle active: $middleActive)', async ({ middleActive, expected }) => {
      const t = chainTables(middleActive);
      expect(expectedSchoolSummary(t, SCHOOL_ID)).toEqual(expected);
      const { body } = await jsonReport(t);
      expect(body.data.school_summary).toEqual(expected);
    });

    it('D4 identity-membership-pagination: rows outside the selected membership are excluded', async () => {
      const t = parentAnnexTables();
      const OTHER_CLIENTE = 'c9000000-0000-4000-8000-000000000009';
      t.schools.push(school(99, 'Otro Colegio Sintetico'));
      t.clientes.push(cliente(OTHER_CLIENTE, 99));
      t.contratos.push(
        contrato({ id: K(9), numero: 'SIN-OTRO', cliente_id: OTHER_CLIENTE, programa_id: PROGRAMA_A, horas: 99 }),
        contrato({ id: K(8), numero: 'SIN-INACT', cliente_id: CLIENTE_ID, programa_id: PROGRAMA_A, horas: 7, estado: 'finalizado' })
      );
      t.contract_hour_allocations.push(
        allocation({ id: A(9), contrato_id: K(9), hour_type_id: HT_ASESORIA, hours: 99 }),
        // An inactive contract's allocation of this school.
        allocation({ id: A(8), contrato_id: K(8), hour_type_id: HT_ASESORIA, hours: 7 })
      );
      t.contract_hours_ledger.push(
        ledger({ id: L(9), allocation_id: A(9), status: 'consumida', hours: 9 }),
        ledger({ id: L(8), allocation_id: A(8), status: 'reservada', hours: 4 })
      );
      const expected = { total_contracted_hours: 82, total_allocated: 80, total_reserved: 2, total_consumed: 3, total_available: 75 };
      expect(expectedSchoolSummary(t, SCHOOL_ID)).toEqual(expected);
      const { body, client } = await jsonReport(t);
      expect(body.data.school_summary).toEqual(expected);

      // Every aggregation read is restricted to selected contract/allocation IDs.
      const selected = new Set<unknown>([PARENT_CONTRATO, ANNEX_CONTRATO, INDEPENDENT_CONTRATO, ...t.contract_hour_allocations.filter((a) => a.id !== A(9) && a.id !== A(8)).map((a) => a.id)]);
      const reads = aggregationReads(client.log);
      expect(reads.length).toBeGreaterThanOrEqual(3);
      for (const q of reads) {
        const idFilter = q.filters.find((f) => f.column !== 'status')!;
        expect(idFilter.op).toBe('in');
        for (const id of idFilter.value as unknown[]) expect(selected.has(id)).toBe(true);
      }
    });

    it('D4 identity-membership-pagination: shuffled storage order yields the same summary', async () => {
      const results = [];
      for (const seed of [1, 7, 42, 1234]) {
        const { body } = await jsonReport(parentAnnexTables(), { shuffleSeed: seed });
        results.push(body.data.school_summary);
      }
      for (const r of results) expect(r).toEqual(expectedSchoolSummary(parentAnnexTables(), SCHOOL_ID));
    });

    it('D4 identity-membership-pagination: the fixture caps a response at 1000 rows', async () => {
      const t = paginationTables();
      const client = createFixtureClient(t);
      const q = client.from('contract_hour_allocations') as unknown as {
        select: (c: string) => { range: (a: number, b: number) => PromiseLike<{ data: unknown[] }> };
      };
      const { data } = await q.select('id').range(0, 4999);
      expect(data).toHaveLength(1000);
    });

    it('D4 identity-membership-pagination: 1001 allocations and ledger rows across response pages are all counted', async () => {
      const t = paginationTables();
      const expected = { total_contracted_hours: 1000, total_allocated: 1001, total_reserved: 10.01, total_consumed: 10.01, total_available: 980.98 };
      expect(expectedSchoolSummary(t, SCHOOL_ID)).toEqual(expected);
      const { body, client } = await jsonReport(t, { shuffleSeed: 3 });
      expect(body.data.school_summary).toEqual(expected);

      const reads = aggregationReads(client.log);
      expect(reads.some((q) => q.table === 'contract_hour_allocations' && q.range?.from === 1000)).toBe(true);
      expect(reads.some((q) => q.table === 'contract_hours_ledger' && q.range?.from === 1000)).toBe(true);
      for (const q of reads) expect(q.order).toEqual([{ column: 'id', ascending: true }]);
    });

    it('D4 identity-membership-pagination: the fixture can cap ranged responses below the requested page', async () => {
      const client = createFixtureClient(paginationTables(), { rangedMaxRows: 1 });
      const q = client.from('contract_hour_allocations') as unknown as {
        select: (c: string) => { range: (a: number, b: number) => PromiseLike<{ data: unknown[] }> };
      };
      const { data } = await q.select('id').range(0, 999);
      expect(data).toHaveLength(1);
    });

    it.each([1, 2, 7])(
      'D4 identity-membership-pagination: a server cap of %i rows below the page size still reads every row (80 / 2 / 3 / 75)',
      async (cap) => {
        const expected = { total_contracted_hours: 82, total_allocated: 80, total_reserved: 2, total_consumed: 3, total_available: 75 };
        expect(expectedSchoolSummary(parentAnnexTables(), SCHOOL_ID)).toEqual(expected);
        const { body, client } = await jsonReport(parentAnnexTables(), { rangedMaxRows: cap, shuffleSeed: 11 });
        expect(body.data.school_summary).toEqual(expected);

        // Each ranged read starts where the rows actually returned end, and a chunk stops
        // only after a read proves exhaustion by returning nothing.
        const reads = aggregationReads(client.log);
        for (const q of reads) expect(q.range!.to - q.range!.from + 1).toBe(1000);
        const ledgerStarts = reads.filter((q) => q.table === 'contract_hours_ledger').map((q) => q.range!.from);
        expect(ledgerStarts).toEqual(Array.from({ length: Math.ceil(3 / cap) + 1 }, (_, i) => Math.min(i * cap, 3)));
      }
    );

    it('D4 identity-membership-pagination: a 250-row server cap over 1001 rows reaches JSON and the PDF', async () => {
      const t = paginationTables();
      const { body } = await jsonReport(t, { rangedMaxRows: 250, shuffleSeed: 5 });
      expect(body.data.school_summary).toEqual(expectedSchoolSummary(t, SCHOOL_ID));
      const { res } = await call('pdf', { tables: paginationTables(), clientOptions: { rangedMaxRows: 250 } });
      expect(summaryRow((await pdfStrings(res)).all)).toEqual(['1000.0', '10.0', '10.0', '981.0']);
    });

    it('D4 identity-membership-pagination: a one-row server cap reaches the PDF as 82.0 / 3.0 / 2.0 / 75.0', async () => {
      const { res } = await call('pdf', { tables: parentAnnexTables(), clientOptions: { rangedMaxRows: 1 } });
      expect(summaryRow((await pdfStrings(res)).all)).toEqual(['82.0', '3.0', '2.0', '75.0']);
    });

    it('D4 identity-membership-pagination: paginated summary reaches the PDF', async () => {
      const { res } = await call('pdf', { tables: paginationTables() });
      expect(summaryRow((await pdfStrings(res)).all)).toEqual(['1000.0', '10.0', '10.0', '981.0']);
    });
  });

  // ------------------------------------------------------------
  describe('D5 failures', () => {
    const timeout = { error: pgError('57014', 'canceling statement due to statement timeout SECRET-DETAIL') };
    const byColumn = (column: string) => (q: QueryInfo) => q.filters.some((f) => f.column === column);

    type FailCase = { name: string; faults: Fault[]; tables?: () => Tables; clientOptions?: ClientOptions };
    const failCases: FailCase[] = [
      { name: 'direct allocation read error', faults: [{ table: 'contract_hour_allocations', when: byColumn('contrato_id'), result: timeout }] },
      { name: 'linked allocation read error', faults: [{ table: 'contract_hour_allocations', when: byColumn('adds_to_allocation_id'), result: timeout }] },
      { name: 'ledger read error', faults: [{ table: 'contract_hours_ledger', when: byColumn('allocation_id'), result: timeout }] },
      { name: 'allocation read throws', faults: [{ table: 'contract_hour_allocations', result: 'throw' }] },
      { name: 'ledger read throws', faults: [{ table: 'contract_hours_ledger', when: byColumn('allocation_id'), result: 'throw' }] },
      { name: 'allocation read returns non-array data', faults: [{ table: 'contract_hour_allocations', result: { data: null } }] },
      {
        name: 'later allocation page fails',
        tables: paginationTables,
        faults: [{ table: 'contract_hour_allocations', when: (q) => (q.range?.from ?? 0) >= 1000, result: timeout }],
      },
      {
        name: 'later ledger page fails',
        tables: paginationTables,
        faults: [{ table: 'contract_hours_ledger', when: (q) => byColumn('allocation_id')(q) && (q.range?.from ?? 0) >= 1000, result: timeout }],
      },
      {
        name: 'later ledger ID chunk fails',
        tables: paginationTables,
        faults: [{ table: 'contract_hours_ledger', when: (q) => byColumn('allocation_id')(q) && q.callIndex >= 3, result: 'throw' }],
      },
      {
        name: 'allocation page after a capped short page fails',
        clientOptions: { rangedMaxRows: 1 },
        faults: [{ table: 'contract_hour_allocations', when: (q) => (q.range?.from ?? 0) >= 1, result: timeout }],
      },
      {
        name: 'ledger page after a capped short page fails',
        clientOptions: { rangedMaxRows: 1 },
        faults: [{ table: 'contract_hours_ledger', when: (q) => byColumn('allocation_id')(q) && (q.range?.from ?? 0) >= 2, result: timeout }],
      },
      {
        name: 'ledger page after a capped short page throws',
        clientOptions: { rangedMaxRows: 2 },
        faults: [{ table: 'contract_hours_ledger', when: (q) => byColumn('allocation_id')(q) && (q.range?.from ?? 0) >= 2, result: 'throw' }],
      },
      { name: 'existing schools read error', faults: [{ table: 'schools', result: timeout }] },
      { name: 'existing clientes read error', faults: [{ table: 'clientes', result: timeout }] },
      { name: 'existing contratos read error', faults: [{ table: 'contratos', result: timeout }] },
      { name: 'existing get_bucket_summary error', faults: [{ table: 'rpc:get_bucket_summary', result: timeout }] },
      { name: 'existing sessions read error', faults: [{ table: 'consultor_sessions', result: timeout }] },
      { name: 'existing session-ledger read error', faults: [{ table: 'contract_hours_ledger', when: byColumn('session_id'), result: timeout }] },
    ];

    it.each(failCases.flatMap((c) => (['json', 'pdf'] as Kind[]).map((kind) => ({ ...c, kind }))))(
      'D5 failures: $name → $kind 500 with the existing error shape',
      async ({ faults, tables, clientOptions, kind }) => {
        const { res, client } = await call(kind, { tables: (tables ?? parentAnnexTables)(), clientOptions: { ...clientOptions, faults } });
        if (clientOptions?.rangedMaxRows !== undefined) {
          expect(aggregationReads(client.log).some((q) => (q.range?.from ?? 0) > 0)).toBe(true);
        }
        expect(res._getStatusCode()).toBe(500);
        expect(res._getJSONData()).toEqual(kind === 'json' ? JSON_500 : PDF_500);
      }
    );

    const malformed: Array<{ name: string; mutate: (t: Tables) => void }> = [
      { name: 'allocated_hours NaN', mutate: (t) => { t.contract_hour_allocations[1].allocated_hours = NaN; } },
      { name: 'allocated_hours Infinity', mutate: (t) => { t.contract_hour_allocations[0].allocated_hours = Infinity; } },
      { name: 'ledger hours -Infinity', mutate: (t) => { t.contract_hours_ledger[2].hours = -Infinity; } },
      { name: 'effective_minutes NaN', mutate: (t) => { t.contract_hours_ledger[0].effective_minutes = NaN; } },
      { name: 'allocated_hours non-numeric string', mutate: (t) => { t.contract_hour_allocations[2].allocated_hours = 'abc'; } },
      { name: 'horas_contratadas Infinity', mutate: (t) => { t.contratos[2].horas_contratadas = Infinity; } },
    ];

    it.each(malformed.flatMap((c) => (['json', 'pdf'] as Kind[]).map((kind) => ({ ...c, kind }))))(
      'D5 failures: malformed nonfinite $name → $kind 500',
      async ({ mutate, kind }) => {
        const t = parentAnnexTables();
        mutate(t);
        const { res } = await call(kind, { tables: t });
        expect(res._getStatusCode()).toBe(500);
        expect(res._getJSONData()).toEqual(kind === 'json' ? JSON_500 : PDF_500);
      }
    );

    it.each(['json', 'pdf'] as Kind[])('D5 failures: development details carry no raw ledger data or identifiers (%s)', async (kind) => {
      vi.stubEnv('NODE_ENV', 'development');
      const cases: Array<{ faults?: Fault[]; mutate?: (t: Tables) => void }> = [
        { faults: [{ table: 'contract_hours_ledger', when: byColumn('allocation_id'), result: timeout }] },
        { mutate: (t) => { t.contract_hours_ledger[0].hours = Infinity; } },
      ];
      for (const c of cases) {
        const t = parentAnnexTables();
        c.mutate?.(t);
        const { res } = await call(kind, { tables: t, clientOptions: { faults: c.faults } });
        expect(res._getStatusCode()).toBe(500);
        const raw = JSON.stringify(res._getJSONData());
        expect(Object.keys(res._getJSONData()).sort()).toEqual(['details', 'error']);
        for (const secret of ['SECRET-DETAIL', 'Infinity', PARENT_ALLOC, ANNEX_ALLOC, 'l1000000', 'service', 'key']) {
          expect(raw).not.toContain(secret);
        }
      }
    });
  });

  // ------------------------------------------------------------
  describe('D6 refusal matrix', () => {
    type Refusal = { name: string; status: number; error: string; opts: Partial<CallOptions>; schoolsRead?: boolean };
    const refusals: Refusal[] = [
      { name: '400 missing school_id', status: 400, error: 'ID de escuela inválido', opts: { query: {} } },
      { name: '400 array school_id', status: 400, error: 'ID de escuela inválido', opts: { query: { school_id: ['42', '43'] } } },
      { name: '400 non-numeric school_id', status: 400, error: 'ID de escuela inválido', opts: { query: { school_id: 'abc' } } },
      { name: '401 anonymous', status: 401, error: 'Autenticación requerida', opts: { identity: null } },
      {
        name: '403 equipo_directivo of a foreign school',
        status: 403,
        error: 'No tiene permisos para ver el reporte de esta escuela',
        opts: { identity: { id: DIRECTIVO.id, roles: [{ role_type: 'equipo_directivo', school_id: 99 }] } },
      },
      {
        name: '403 disallowed role (docente)',
        status: 403,
        error: 'Acceso denegado',
        opts: { identity: { id: DIRECTIVO.id, roles: [{ role_type: 'docente', school_id: SCHOOL_ID }] } },
      },
      {
        name: '403 disallowed role (consultor)',
        status: 403,
        error: 'Acceso denegado',
        opts: { identity: { id: DIRECTIVO.id, roles: [{ role_type: 'consultor', school_id: SCHOOL_ID }] } },
      },
      { name: '404 missing school', status: 404, error: 'Escuela no encontrada', opts: { identity: ADMIN, query: { school_id: '77' } }, schoolsRead: true },
      {
        name: '404 non-client (qa) school',
        status: 404,
        error: 'Escuela no encontrada',
        opts: { identity: ADMIN, query: { school_id: '43' } },
        schoolsRead: true,
      },
      { name: '405 non-GET', status: 405, error: 'Method not allowed', opts: { method: 'POST' } },
    ];

    it.each(refusals.flatMap((r) => (['json', 'pdf'] as Kind[]).map((kind) => ({ ...r, kind }))))(
      'D6 refusal matrix: $name ($kind) performs no aggregation',
      async ({ status, error, opts, schoolsRead, kind }) => {
        const tables = parentAnnexTables();
        tables.schools.push(school(43, 'Colegio QA Sintetico', 'qa'));
        const { res, client } = await call(kind, { tables, ...opts });
        expect(res._getStatusCode()).toBe(status);
        expect(res._getJSONData()).toEqual({ error });
        expect(aggregationReads(client.log)).toEqual([]);
        expect(refusalReads(client.log)).toEqual([]);
        expect(client.log.length).toBe(schoolsRead ? 1 : 0);
        if (status === 405) expect(res.getHeader('Allow')).toBe('GET');
      }
    );
  });

  // ------------------------------------------------------------
  describe('D7 emitted-output', () => {
    it('D7 emitted-output: JSON summary matches the oracle; per-contract fields and sessions are unchanged', async () => {
      const tables = parentAnnexTables();
      const { body } = await jsonReport(tables);
      const data = body.data;
      expect(Object.keys(data).sort()).toEqual(['programs', 'school_id', 'school_name', 'school_summary']);
      expect(Object.keys(data.school_summary).sort()).toEqual([
        'total_allocated',
        'total_available',
        'total_consumed',
        'total_contracted_hours',
        'total_reserved',
      ]);
      expect(data.school_summary).toEqual(expectedSchoolSummary(tables, SCHOOL_ID));

      // Per-contract shape: RPC buckets verbatim, contract totals summed from them.
      for (const program of data.programs) {
        for (const c of program.contracts) {
          expect(Object.keys(c).sort()).toEqual([
            'buckets', 'contrato_id', 'is_annexo', 'numero_contrato', 'total_available', 'total_consumed', 'total_contracted_hours', 'total_reserved',
          ]);
          const rpc = bucketSummarySql(tables, c.contrato_id);
          expect(c.buckets.map((b: Record<string, unknown>) => [b.hour_type_key, b.allocated, b.reserved, b.consumed, b.available, b.annex_hours])).toEqual(
            rpc.map((r) => [r.hour_type_key, r.allocated_hours, r.reserved_hours, r.consumed_hours, r.available_hours, r.annex_hours])
          );
          expect(c.total_available).toBe(rpc.reduce((s, r) => s + (r.available_hours as number), 0));
          expect(c.total_contracted_hours).toBe(tables.contratos.find((k) => k.id === c.contrato_id)!.horas_contratadas);
        }
      }
      const parent = data.programs.flatMap((p: { contracts: Array<{ contrato_id: string }> }) => p.contracts).find(
        (c: { contrato_id: string }) => c.contrato_id === PARENT_CONTRATO
      );
      expect(parent.buckets[0].sessions).toEqual([
        {
          session_id: PARENT_SESSION,
          title: 'Sesion sintetica de acompanamiento',
          date: '2026-04-15',
          consultant_name: 'Consultora Sintetica',
          hours: 2,
          status: 'consumida',
          is_over_budget: false,
          attendance: null,
        },
      ]);

      // No allocation/ledger identifiers leak into the response.
      const raw = JSON.stringify(body);
      for (const id of [...tables.contract_hour_allocations, ...tables.contract_hours_ledger].map((r) => String(r.id))) {
        expect(raw).not.toContain(id);
      }
    });

    it('D7 emitted-output: valid PDF with es-CL labels, rounded totals, contracts and sessions (real logo)', async () => {
      const { res } = await call('pdf', { tables: parentAnnexTables() });
      expect(mockReadFileSync).toHaveBeenCalledWith(expect.stringMatching(/logo-horizontal-transparent-400\.png$/));
      expect(String(res.getHeader('Content-Disposition'))).toMatch(/^attachment; filename="reporte-horas-Colegio_Sintetico_Los_Arrayanes-\d{4}-\d{2}-\d{2}\.pdf"$/);
      const { pages, all } = await pdfStrings(res);
      expect(pages).toHaveLength(1);
      expect(all).toContain(SCHOOL_NAME);
      expect(all).toContain('Reporte de Horas');
      expect(all.some((s) => /^Generado: \d{2}-\d{2}-\d{4}$/.test(s))).toBe(true);
      expect(summaryRow(all)).toEqual(['82.0', '3.0', '2.0', '75.0']);
      expect(all).toContain('Programa: Programa Sintetico Alfa');
      expect(all).toContain('Programa: Programa Sintetico Beta');
      expect(all).toContain('Contrato: SIN-2026-001');
      expect(all).toContain('Contrato: SIN-2026-001-A1 (Anexo)');
      const joined = all.join('|');
      // Parent bucket (per-contract RPC, unchanged): 60 assigned incl. +10 annex.
      expect(joined).toContain('Asesoria Tecnica|60.0|2.0|3.0|55.0|+10.0');
      expect(joined).toContain('Asesoria Tecnica|10.0|0.0|1.0|9.0|');
      expect(joined).toContain('Talleres Presenciales|20.0|0.0|0.0|20.0');
      expect(joined).toContain('Consultora Sintetica|Sesion sintetica de acompanamiento|2.00|consumida');
      expect(all.some((s) => /^P.gina 1 de 1/.test(s))).toBe(true);
    });

    it('D7 emitted-output: an unreadable logo is optional and leaves the totals intact', async () => {
      mockReadFileSync.mockImplementation(() => {
        throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
      });
      const { res } = await call('pdf', { tables: parentAnnexTables() });
      expect(mockReadFileSync).toHaveBeenCalled();
      expect(res._getStatusCode()).toBe(200);
      expect(summaryRow((await pdfStrings(res)).all)).toEqual(['82.0', '3.0', '2.0', '75.0']);
    });

    it('D7 emitted-output: a PDF generation exception stays a 500 with the existing error shape', async () => {
      const { jsPDF } = await import('jspdf');
      const spy = vi.spyOn(jsPDF.API, 'splitTextToSize').mockImplementation(() => {
        throw new Error('synthetic jsPDF failure');
      });
      const { res } = await call('pdf', { tables: parentAnnexTables() });
      expect(spy).toHaveBeenCalled();
      expect(res._getStatusCode()).toBe(500);
      expect(res._getJSONData()).toEqual(PDF_500);
      expect(res.getHeader('Content-Type')).not.toBe('application/pdf');
    });
  });
});
