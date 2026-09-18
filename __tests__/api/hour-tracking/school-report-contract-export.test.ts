// @vitest-environment node
/**
 * SM-03 / A14-4-F02 — GET /api/school-hours-report/[school_id]/pdf?contrato_id=…
 *
 * Only the Supabase boundary is synthetic: the in-memory fixture client from
 * `__tests__/fixtures/school-report-totals` stands in for PostgREST, and everything above
 * it runs for real — `fetchSchoolReportData`, the route, jsPDF and jspdf-autotable. The
 * emitted bytes are parsed back with pdf-lib and asserted on positively (the selected
 * contract's own figures) and negatively (no sibling contract, annex or program leaks in).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import {
  allocation,
  baseTables,
  cliente,
  contrato,
  createFixtureClient,
  ledger,
  pgError,
  session,
  SYNTHETIC_USER,
  type ClientOptions,
  type Tables,
  CLIENTE_ID,
  HT_ASESORIA,
  HT_TALLER,
  PROGRAMA_A,
  PROGRAMA_B,
  SCHOOL_ID,
  SCHOOL_NAME,
} from '../../fixtures/school-report-totals';

const ADMIN_UUID = '550e8400-e29b-41d4-a716-446655440001';
const DIRECTIVO_UUID = '550e8400-e29b-41d4-a716-446655440002';
const OTHER_SCHOOL_ID = 99;

// `contratos.id` is a UUID column; the selected-contract query is validated as one.
const PARENT_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const ANNEX_ID = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const SIBLING_ID = 'cccccccc-3333-4333-8333-cccccccccccc';
const NO_BUCKETS_ID = 'dddddddd-4444-4444-8444-dddddddddddd';
const ABSENT_ID = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';

const PARENT_NUMERO = 'SIN-2026-001';
const ANNEX_NUMERO = 'SIN-2026-001-A1';
const SIBLING_NUMERO = 'SIN-2026-002';
const NO_BUCKETS_NUMERO = 'SIN-2026-003';
const SIBLING_SESSION_TITLE = 'Taller del contrato hermano';

const { mockGetApiUser, mockCreateServiceRoleClient, mockGetUserRoles, mockGetHighestRole, mockReadFileSync } =
  vi.hoisted(() => ({
    mockGetApiUser: vi.fn(),
    mockCreateServiceRoleClient: vi.fn(),
    mockGetUserRoles: vi.fn(),
    mockGetHighestRole: vi.fn(),
    mockReadFileSync: vi.fn(),
  }));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: vi.fn(
    (res: { status: (code: number) => { json: (data: unknown) => void } }, msg?: string, status?: number, details?: string) => {
      res.status(status || 401).json({ error: msg || 'Error', details });
    }
  ),
  logApiRequest: vi.fn(),
  handleMethodNotAllowed: vi.fn((res: { status: (code: number) => { json: (data: unknown) => void } }) => {
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

vi.mock('../../../utils/roleUtils', () => ({
  getUserRoles: mockGetUserRoles,
  getHighestRole: mockGetHighestRole,
}));

vi.mock('fs', () => {
  const mockFs = { readFileSync: mockReadFileSync };
  return { ...mockFs, default: mockFs };
});

import handler from '../../../pages/api/school-hours-report/[school_id]/pdf';

// ============================================================
// Synthetic school: parent + linked annex in one program, a sibling and an
// allocation-less contract in another.
// ============================================================

const PARENT_ALLOC = 'a0000000-0000-4000-8000-000000000001';
const ANNEX_ALLOC = 'a0000000-0000-4000-8000-000000000002';
const SIBLING_ALLOC = 'a0000000-0000-4000-8000-000000000003';
const SESSION_CONSUMED = '50000000-0000-4000-8000-000000000001';
const SESSION_OVERRIDE = '50000000-0000-4000-8000-000000000003';
const SESSION_WAIVED = '50000000-0000-4000-8000-000000000004';
const SESSION_SIBLING = '50000000-0000-4000-8000-000000000005';

function schoolTables(): Tables {
  const t = baseTables();
  t.contratos.push(
    contrato({ id: PARENT_ID, numero: PARENT_NUMERO, cliente_id: CLIENTE_ID, programa_id: PROGRAMA_A, horas: 52 }),
    contrato({
      id: ANNEX_ID,
      numero: ANNEX_NUMERO,
      cliente_id: CLIENTE_ID,
      programa_id: PROGRAMA_A,
      horas: 10,
      is_anexo: true,
      parent_contrato_id: PARENT_ID,
    }),
    contrato({ id: SIBLING_ID, numero: SIBLING_NUMERO, cliente_id: CLIENTE_ID, programa_id: PROGRAMA_B, horas: 20 }),
    contrato({ id: NO_BUCKETS_ID, numero: NO_BUCKETS_NUMERO, cliente_id: CLIENTE_ID, programa_id: PROGRAMA_B, horas: 7 })
  );
  // Deliberately small allocations so the parent bucket ends up over budget.
  t.contract_hour_allocations.push(
    allocation({ id: PARENT_ALLOC, contrato_id: PARENT_ID, hour_type_id: HT_ASESORIA, hours: 3 }),
    allocation({ id: ANNEX_ALLOC, contrato_id: ANNEX_ID, hour_type_id: HT_ASESORIA, hours: 1, adds_to: PARENT_ALLOC }),
    allocation({ id: SIBLING_ALLOC, contrato_id: SIBLING_ID, hour_type_id: HT_TALLER, hours: 20 })
  );
  t.contract_hours_ledger.push(
    ledger({ id: 'l0000000-0000-4000-8000-000000000001', allocation_id: PARENT_ALLOC, status: 'consumida', hours: 3, session_id: SESSION_CONSUMED }),
    ledger({ id: 'l0000000-0000-4000-8000-000000000002', allocation_id: PARENT_ALLOC, status: 'reservada', hours: 2 }),
    // §11 override: 90 effective minutes bills 1.5 h, not the recorded 2 h.
    ledger({ id: 'l0000000-0000-4000-8000-000000000003', allocation_id: PARENT_ALLOC, status: 'penalizada', hours: 2, effective_minutes: 90, session_id: SESSION_OVERRIDE }),
    // Zero waiver ("Sesión eximida"): 0 effective minutes bills nothing, not the recorded 4 h.
    ledger({ id: 'l0000000-0000-4000-8000-000000000004', allocation_id: PARENT_ALLOC, status: 'consumida', hours: 4, effective_minutes: 0, session_id: SESSION_WAIVED }),
    ledger({ id: 'l0000000-0000-4000-8000-000000000005', allocation_id: SIBLING_ALLOC, status: 'consumida', hours: 1.5, session_id: SESSION_SIBLING })
  );
  t.consultor_sessions.push(
    session({ id: SESSION_CONSUMED, contrato_id: PARENT_ID, hour_type_key: 'asesoria_tecnica_presencial', scheduled_minutes: 180, title: 'Sesion consumida', date: '2026-04-15' }),
    session({ id: SESSION_OVERRIDE, contrato_id: PARENT_ID, hour_type_key: 'asesoria_tecnica_presencial', scheduled_minutes: 120, title: 'Sesion penalizada', date: '2026-05-20' }),
    session({ id: SESSION_WAIVED, contrato_id: PARENT_ID, hour_type_key: 'asesoria_tecnica_presencial', scheduled_minutes: 240, title: 'Sesion eximida', date: '2026-05-25' }),
    session({ id: SESSION_SIBLING, contrato_id: SIBLING_ID, hour_type_key: 'talleres_presenciales', scheduled_minutes: 90, title: SIBLING_SESSION_TITLE, date: '2026-07-01' })
  );
  t.profiles.push({ id: SYNTHETIC_USER, first_name: 'Consultora', last_name: 'Sintetica' });
  t.session_facilitators.push(
    { id: 'f0000000-0000-4000-8000-000000000001', session_id: SESSION_CONSUMED, user_id: SYNTHETIC_USER },
    { id: 'f0000000-0000-4000-8000-000000000002', session_id: SESSION_OVERRIDE, user_id: SYNTHETIC_USER },
    { id: 'f0000000-0000-4000-8000-000000000003', session_id: SESSION_WAIVED, user_id: SYNTHETIC_USER },
    { id: 'f0000000-0000-4000-8000-000000000004', session_id: SESSION_SIBLING, user_id: SYNTHETIC_USER }
  );
  return t;
}

/** A second school whose contract id is a valid UUID absent from school 42's report. */
const OTHER_SCHOOL_CONTRATO = 'ffffffff-6666-4666-8666-ffffffffffff';
const OTHER_CLIENTE = 'c0000000-0000-4000-8000-0000000000ff';

function withOtherSchool(t: Tables): Tables {
  t.schools.push({ id: OTHER_SCHOOL_ID, name: 'Otro Colegio Sintetico', has_generations: false, cliente_id: null, logo_url: null, tenant_kind: 'client' });
  t.clientes.push(cliente(OTHER_CLIENTE, OTHER_SCHOOL_ID));
  t.contratos.push(contrato({ id: OTHER_SCHOOL_CONTRATO, numero: 'OTRA-2026-001', cliente_id: OTHER_CLIENTE, programa_id: PROGRAMA_B, horas: 15 }));
  return t;
}

// ============================================================
// Harness
// ============================================================

function setupAuth(userId: string, roleType: string, schoolId: number | null = null) {
  mockGetApiUser.mockResolvedValue({ user: { id: userId }, error: null });
  mockGetUserRoles.mockResolvedValue([{ role_type: roleType, school_id: schoolId }]);
  mockGetHighestRole.mockReturnValue(roleType);
}

function useTables(tables: Tables, options: ClientOptions = {}) {
  mockCreateServiceRoleClient.mockReturnValue(createFixtureClient(tables, options));
}

type MockRes = {
  _getBuffer: () => Buffer;
  _getData: () => unknown;
  _getStatusCode: () => number;
  getHeader: (name: string) => unknown;
};

async function callPdf(query: Record<string, string | string[]>, method = 'GET') {
  const { req, res } = createMocks({ method, query });
  await handler(req as never, res as never);
  return res as unknown as MockRes;
}

/** node-mocks-http hands back the serialized body; these routes always answer JSON on failure. */
function body(res: MockRes): unknown {
  return JSON.parse(String(res._getData()));
}

function pdfBytes(res: MockRes): Buffer {
  if (res._getStatusCode() !== 200) {
    throw new Error(`expected a PDF, got ${res._getStatusCode()}: ${JSON.stringify(res._getData())}`);
  }
  return res._getBuffer();
}

const PDF_ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };

/** Literal `( … )` strings in drawing order, escapes resolved (ISO 32000-1 §7.3.4.2). */
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

/** Strict pdf-lib parse; the text is every page's drawn strings, whitespace removed. */
async function pdfText(bytes: Buffer): Promise<string> {
  const doc = await PDFDocument.load(bytes, { throwOnInvalidObject: true, updateMetadata: false });
  const strings: string[] = [];
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents];
    for (const stream of streams) {
      if (!(stream instanceof PDFRawStream)) throw new Error('page content is not a raw stream');
      strings.push(...literalStrings(Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')));
    }
  }
  return strings.join('\n').replace(/\s+/g, '');
}

async function selectedPdfText(contratoId: string) {
  const res = await callPdf({ school_id: String(SCHOOL_ID), contrato_id: contratoId });
  return { res, text: await pdfText(pdfBytes(res)) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockReadFileSync.mockReturnValue(Buffer.from('fake-logo-data'));
  setupAuth(DIRECTIVO_UUID, 'equipo_directivo', SCHOOL_ID);
  useTables(schoolTables());
});

// ============================================================
// D1 — the selected contract, and only it
// ============================================================

describe('D1 selected-contract PDF scope', () => {
  it('D1 renders the selected parent contract with its own totals and no sibling data', async () => {
    const { res, text } = await selectedPdfText(PARENT_ID);

    expect(res.getHeader('Content-Type')).toBe('application/pdf');
    // Legacy file name: school and date only, unchanged by the contract scope.
    expect(String(res.getHeader('Content-Disposition'))).toContain(`reporte-horas-${SCHOOL_NAME.replace(/\s/g, '_')}-`);
    expect(String(res.getHeader('Content-Disposition'))).not.toContain(PARENT_NUMERO);

    // The summary is this contract's, labelled as such: 52 contracted, 4.5 consumed
    // (3 + the 90-minute override's 1.5 + the waived 0), 2 reserved, -2.5 available.
    expect(text).toContain(`ResumendelContrato${PARENT_NUMERO}`);
    expect(text).not.toContain('ResumenGeneral');
    expect(text).toContain('52.04.52.0-2.5');

    // Bucket row: 4 h allocated (3 own + 1 from the annex), +1.0 annex contribution.
    expect(text).toContain('AsesoriaTecnica4.02.04.5-2.5+1.0');

    // Session rows keep the ledger's billable figures verbatim.
    expect(text).toContain('Sesionconsumida3.00consumida');
    expect(text).toContain('Sesionpenalizada1.50penalizada');
    expect(text).toContain('Sesioneximida0.00consumida');

    // Nothing from the annex, the sibling contract or the other program.
    expect(text).toContain(`Contrato:${PARENT_NUMERO}`);
    expect(text).not.toContain(ANNEX_NUMERO);
    expect(text).not.toContain(SIBLING_NUMERO);
    expect(text).not.toContain(NO_BUCKETS_NUMERO);
    expect(text).not.toContain('Tallerdelcontratohermano');
    expect(text).not.toContain('ProgramaSinteticoBeta');
  });

  it('D1 renders the annex contract alone, with its own allocation and no parent sessions', async () => {
    const { text } = await selectedPdfText(ANNEX_ID);

    expect(text).toContain(`ResumendelContrato${ANNEX_NUMERO}`);
    expect(text).toContain(`Contrato:${ANNEX_NUMERO}(Anexo)`);
    expect(text).toContain('10.00.00.01.0'); // 10 contracted, nothing used, 1 h allocated
    expect(text).toContain('AsesoriaTecnica1.00.00.01.0');
    expect(text).not.toContain('Sesionconsumida');
    expect(text).not.toContain('Sesioneximida');
    expect(text).not.toContain(SIBLING_NUMERO);
  });

  it('D1 renders the sibling contract in the other program without touching program Alfa', async () => {
    const { text } = await selectedPdfText(SIBLING_ID);

    expect(text).toContain(`ResumendelContrato${SIBLING_NUMERO}`);
    expect(text).toContain('Programa:ProgramaSinteticoBeta');
    expect(text).toContain('TalleresPresenciales20.00.01.518.5');
    expect(text).toContain('Tallerdelcontratohermano1.50consumida');
    expect(text).not.toContain('ProgramaSinteticoAlfa');
    expect(text).not.toContain(PARENT_NUMERO);
  });
});

// ============================================================
// D2 — empty selections, malformed ids and the legacy request
// ============================================================

describe('D2 empty, malformed and absent selections', () => {
  it('D2 renders a contract with no allocations as its identity and summary, with no bucket table', async () => {
    const { text } = await selectedPdfText(NO_BUCKETS_ID);

    expect(text).toContain(`ResumendelContrato${NO_BUCKETS_NUMERO}`);
    expect(text).toContain(`Contrato:${NO_BUCKETS_NUMERO}`);
    expect(text).toContain('7.00.00.00.0');
    expect(text).not.toContain('Categoria');
    expect(text).not.toContain(SIBLING_NUMERO);
  });

  it.each([
    ['malformed', 'no-es-un-uuid'],
    ['empty', ''],
    ['almost a UUID', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaa'],
  ])('D2 refuses a %s contract id with 400 and no PDF', async (_label, value) => {
    const res = await callPdf({ school_id: String(SCHOOL_ID), contrato_id: value });

    expect(res._getStatusCode()).toBe(400);
    expect(body(res)).toEqual(expect.objectContaining({ error: 'ID de contrato inválido' }));
    expect(res.getHeader('Content-Type')).not.toBe('application/pdf');
  });

  it('D2 refuses a repeated contract id parameter with 400 rather than picking one', async () => {
    const res = await callPdf({ school_id: String(SCHOOL_ID), contrato_id: [PARENT_ID, SIBLING_ID] });

    expect(res._getStatusCode()).toBe(400);
    expect(body(res)).toEqual(expect.objectContaining({ error: 'ID de contrato inválido' }));
  });

  it('D2 answers a well-formed but absent contract id with 404 and no fallback report', async () => {
    const res = await callPdf({ school_id: String(SCHOOL_ID), contrato_id: ABSENT_ID });

    expect(res._getStatusCode()).toBe(404);
    expect(body(res)).toEqual(expect.objectContaining({ error: 'Contrato no encontrado en el reporte de esta escuela' }));
    expect(res.getHeader('Content-Type')).not.toBe('application/pdf');
  });

  it("D2 answers another school's contract id with 404, never that contract's data", async () => {
    useTables(withOtherSchool(schoolTables()));
    const res = await callPdf({ school_id: String(SCHOOL_ID), contrato_id: OTHER_SCHOOL_CONTRATO });

    expect(res._getStatusCode()).toBe(404);
    expect(JSON.stringify(res._getData())).not.toContain('OTRA-2026-001');
  });

  it('D2 keeps the whole-school report when the contract id is omitted', async () => {
    const res = await callPdf({ school_id: String(SCHOOL_ID) });
    const text = await pdfText(pdfBytes(res));

    expect(text).toContain('ResumenGeneral');
    expect(text).not.toContain('ResumendelContrato');
    // Every contract and both programs are still present, as before this unit.
    for (const numero of [PARENT_NUMERO, ANNEX_NUMERO, SIBLING_NUMERO, NO_BUCKETS_NUMERO]) {
      expect(text).toContain(`Contrato:${numero}`);
    }
    expect(text).toContain('Programa:ProgramaSinteticoAlfa');
    expect(text).toContain('Programa:ProgramaSinteticoBeta');
    // School-wide totals count each allocation and ledger row once: 89 h contracted,
    // 24 h allocated, 6 h consumed across both programs, 2 h reserved, 16 h available.
    expect(text).toContain('89.06.02.016.0');
    expect(String(res.getHeader('Content-Disposition'))).not.toContain(PARENT_NUMERO);
  });
});

// ============================================================
// D3 — failures never widen the export
// ============================================================

describe('D3 failures', () => {
  it('D3 answers a failing bucket summary with 500 and no PDF, selected contract or not', async () => {
    useTables(schoolTables(), {
      faults: [{ table: 'rpc:get_bucket_summary', result: { error: pgError('XX000', 'synthetic storage failure') } }],
    });

    const res = await callPdf({ school_id: String(SCHOOL_ID), contrato_id: PARENT_ID });
    expect(res._getStatusCode()).toBe(500);
    expect(body(res)).toEqual(expect.objectContaining({ error: 'Error al generar el PDF' }));
    expect(res.getHeader('Content-Type')).not.toBe('application/pdf');
  });

  it('D3 still returns 200 for the selected contract when the optional logo is missing', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    const { res, text } = await selectedPdfText(PARENT_ID);
    expect(res._getStatusCode()).toBe(200);
    expect(text).toContain(`ResumendelContrato${PARENT_NUMERO}`);
  });
});

// ============================================================
// D4 — existing refusals, with a contract selected
// ============================================================

describe('D4 refusals with a selected contract', () => {
  it('D4 refuses an anonymous request with 401 before looking at the contract', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('No session') });

    const res = await callPdf({ school_id: String(SCHOOL_ID), contrato_id: 'no-es-un-uuid' });
    expect(res._getStatusCode()).toBe(401);
  });

  it('D4 decides school authorization before contract membership', async () => {
    setupAuth(DIRECTIVO_UUID, 'equipo_directivo', SCHOOL_ID);

    // A contract this user may see, but asked for under a school they may not.
    const res = await callPdf({ school_id: String(OTHER_SCHOOL_ID), contrato_id: PARENT_ID });
    expect(res._getStatusCode()).toBe(403);
    expect(body(res)).toEqual(
      expect.objectContaining({ error: 'No tiene permisos para ver el reporte de esta escuela' })
    );
  });

  it('D4 refuses a role without report access with 403', async () => {
    setupAuth(ADMIN_UUID, 'docente');

    const res = await callPdf({ school_id: String(SCHOOL_ID), contrato_id: PARENT_ID });
    expect(res._getStatusCode()).toBe(403);
  });

  it('D4 refuses a malformed school id with 400 even when the contract id is valid', async () => {
    const res = await callPdf({ school_id: 'abc', contrato_id: PARENT_ID });
    expect(res._getStatusCode()).toBe(400);
    expect(body(res)).toEqual(expect.objectContaining({ error: 'ID de escuela inválido' }));
  });

  it('D4 answers a missing school with 404 for the school, not the contract', async () => {
    setupAuth(ADMIN_UUID, 'admin');

    const res = await callPdf({ school_id: '4242', contrato_id: PARENT_ID });
    expect(res._getStatusCode()).toBe(404);
    expect(body(res)).toEqual(expect.objectContaining({ error: 'Escuela no encontrada' }));
  });

  it('D4 refuses a non-GET method with 405', async () => {
    const res = await callPdf({ school_id: String(SCHOOL_ID), contrato_id: PARENT_ID }, 'POST');
    expect(res._getStatusCode()).toBe(405);
  });

  it('D4 lets an admin download any school’s selected contract', async () => {
    setupAuth(ADMIN_UUID, 'admin');

    const { res, text } = await selectedPdfText(SIBLING_ID);
    expect(res._getStatusCode()).toBe(200);
    expect(text).toContain(`ResumendelContrato${SIBLING_NUMERO}`);
  });
});

// ============================================================
// D5 — what the emitted PDF actually says
// ============================================================

describe('D5 emitted PDF identity', () => {
  it('D5 names the school, program and contract and leaks no raw identifiers or paths', async () => {
    const { res, text } = await selectedPdfText(PARENT_ID);

    expect(text).toContain(SCHOOL_NAME.replace(/\s/g, ''));
    expect(text).toContain('ReportedeHoras');
    expect(text).toContain('Programa:ProgramaSinteticoAlfa');
    expect(text).toContain(`Contrato:${PARENT_NUMERO}`);

    expect(text).not.toContain(PARENT_ID.replace(/-/g, ''));
    expect(text).not.toContain(PROGRAMA_A.replace(/-/g, ''));
    expect(text).not.toContain('/api/');
    expect(text).not.toContain('contrato_id');

    const disposition = String(res.getHeader('Content-Disposition'));
    expect(disposition).toMatch(/attachment; filename="reporte-horas-.+\.pdf"/);
    expect(disposition).not.toContain(PARENT_ID);
  });
});
