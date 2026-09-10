// @vitest-environment node
/**
 * Unit tests for GET /api/school-hours-report/[school_id]/pdf
 *
 * Auth and the report service are mocked; PDF generation is NOT. jsPDF and
 * jspdf-autotable run for real, and the PDF is read back deterministically: its xref table
 * is checked byte for byte, and pdf-lib parses the file strictly and yields the page text.
 * This suite used to mock jsPDF with a `doc.autoTable` method that jspdf-autotable v5 no
 * longer provides, so it stayed green while the route 500'd for every report. It then read
 * the PDF with pdf-parse, whose bundled pdf.js 1.10 reader intermittently threw
 * "bad XRef entry" on bytes whose xref table checks out.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

const ADMIN_UUID = '550e8400-e29b-41d4-a716-446655440001';
const DIRECTIVO_UUID = '550e8400-e29b-41d4-a716-446655440002';
const SCHOOL_ID = 42;
const OTHER_SCHOOL_ID = 99;

// Hoisted mocks
const { mockGetApiUser, mockCreateServiceRoleClient, mockGetUserRoles, mockGetHighestRole } =
  vi.hoisted(() => ({
    mockGetApiUser: vi.fn(),
    mockCreateServiceRoleClient: vi.fn(),
    mockGetUserRoles: vi.fn(),
    mockGetHighestRole: vi.fn(),
  }));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: vi.fn(
    (res: { status: (code: number) => { json: (data: unknown) => void } }, msg?: string, status?: number, details?: string) => {
      res.status(status || 401).json({ error: msg || 'Error', details });
    }
  ),
  sendApiResponse: vi.fn(
    (res: { status: (code: number) => { json: (data: unknown) => void } }, data: unknown, status?: number) => {
      res.status(status || 200).json({ data });
    }
  ),
  logApiRequest: vi.fn(),
  handleMethodNotAllowed: vi.fn(
    (res: { status: (code: number) => { json: (data: unknown) => void } }) => {
      res.status(405).json({ error: 'Method not allowed' });
    }
  ),
}));

vi.mock('../../../utils/roleUtils', () => ({
  getUserRoles: mockGetUserRoles,
  getHighestRole: mockGetHighestRole,
}));

// Mock the shared service
vi.mock('../../../lib/services/school-hours-report', () => ({
  fetchSchoolReportData: vi.fn(),
}));

// Keep the logo read deterministic; an unreadable logo is skipped by the route.
vi.mock('fs', () => {
  const mockFs = {
    readFileSync: vi.fn().mockReturnValue(Buffer.from('fake-logo-data')),
  };
  return { ...mockFs, default: mockFs };
});

import handler from '../../../pages/api/school-hours-report/[school_id]/pdf';
import { fetchSchoolReportData } from '../../../lib/services/school-hours-report';
const mockFetchSchoolReportData = fetchSchoolReportData as ReturnType<typeof vi.fn>;

// ============================================================
// Helpers
// ============================================================

function setupAuth(userId: string, roleType: string, schoolId: number | null = null) {
  mockGetApiUser.mockResolvedValue({ user: { id: userId }, error: null });
  mockGetUserRoles.mockResolvedValue([{ role_type: roleType, school_id: schoolId }]);
  mockGetHighestRole.mockReturnValue(roleType);
  mockCreateServiceRoleClient.mockReturnValue({});
}

function makeSchoolReport(schoolId: number, schoolName: string, programs: unknown[] = []) {
  return { school_id: schoolId, school_name: schoolName, programs };
}

type MockRes = { _getBuffer: () => Buffer; _getData: () => unknown; _getStatusCode: () => number };

/** The bytes the route passed to `res.end`, with the error body surfaced on failure. */
function pdfBytes(res: MockRes): Buffer {
  const bytes = res._getBuffer();
  if (res._getStatusCode() !== 200) {
    throw new Error(`expected a PDF, got ${res._getStatusCode()}: ${String(res._getData())}`);
  }
  return bytes;
}

const STRICT_LOAD = { throwOnInvalidObject: true, updateMetadata: false };

/** Every in-use xref entry must point at its own `N G obj`; returns the entries that do not. */
function xrefProblems(bytes: Buffer): string[] {
  const pdf = bytes.toString('latin1');
  const startxref = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(pdf)?.[1]);
  if (!pdf.startsWith('xref', startxref)) return [`startxref ${startxref} does not point at the xref table`];

  const problems: string[] = [];
  const lines = pdf.slice(startxref).split(/\r\n|\r|\n/);
  let line = 1;
  let entries = 0;
  while (/^\d+ \d+$/.test(lines[line]?.trim() ?? '')) {
    const [first, count] = lines[line++].trim().split(' ').map(Number);
    for (let num = first; num < first + count; num++, line++, entries++) {
      const [offset, gen, kind] = (lines[line] ?? '').trim().split(' ');
      if (kind === 'n' && !pdf.startsWith(`${num} ${Number(gen)} obj`, Number(offset))) {
        problems.push(`object ${num} is not at offset ${Number(offset)}`);
      }
    }
  }
  return entries === 0 ? ['xref table has no entries'] : problems;
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
          i++; // line continuation or unknown escape: the backslash is dropped
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

/** Strict pdf-lib parse; the text is every page's content-stream strings (jsPDF leaves them uncompressed). */
async function pdfText(bytes: Buffer): Promise<{ pages: number; text: string }> {
  const doc = await PDFDocument.load(bytes, STRICT_LOAD);
  const strings: string[] = [];
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray
      ? contents.asArray().map((ref) => doc.context.lookup(ref))
      : [contents];
    for (const stream of streams) {
      if (!(stream instanceof PDFRawStream)) throw new Error('page content is not a raw stream');
      strings.push(...literalStrings(Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')));
    }
  }
  return { pages: doc.getPageCount(), text: strings.join('\n') };
}

const REGULAR_NUMERO = 'CTR-2026-001';
const ANNEX_NUMERO = 'CTR-2026-001-A1';

/** A regular 50 h contract with 3 h consumed, 2 h reserved and +10 h from its annex. */
function reportWithRegularAndAnnex() {
  return makeSchoolReport(SCHOOL_ID, 'Escuela Test', [
    {
      programa_id: '550e8400-e29b-41d4-a716-446655440020',
      programa_name: 'Programa Alpha',
      contracts: [
        {
          contrato_id: '550e8400-e29b-41d4-a716-446655440010',
          numero_contrato: REGULAR_NUMERO,
          is_annexo: false,
          total_contracted_hours: 50,
          total_reserved: 2,
          total_consumed: 3,
          total_available: 45,
          buckets: [
            {
              hour_type_key: 'asesoria_tecnica_presencial',
              display_name: 'Asesoria Tecnica',
              allocated: 50,
              reserved: 2,
              consumed: 3,
              available: 45,
              is_fixed: false,
              annex_hours: 10,
              sessions: [
                {
                  session_id: '550e8400-e29b-41d4-a716-446655440030',
                  title: 'Sesion consumida',
                  date: '2026-05-04',
                  consultant_name: 'Consultora Sintetica',
                  hours: 3,
                  status: 'consumida',
                  attendance: null,
                },
                {
                  session_id: '550e8400-e29b-41d4-a716-446655440031',
                  title: 'Sesion reservada',
                  date: '2026-06-08',
                  consultant_name: 'Consultora Sintetica',
                  hours: 2,
                  status: 'reservada',
                  attendance: null,
                },
              ],
            },
          ],
        },
        {
          contrato_id: '550e8400-e29b-41d4-a716-446655440011',
          numero_contrato: ANNEX_NUMERO,
          is_annexo: true,
          total_contracted_hours: 10,
          total_reserved: 0,
          total_consumed: 0,
          total_available: 10,
          buckets: [
            {
              hour_type_key: 'asesoria_tecnica_presencial',
              display_name: 'Asesoria Tecnica',
              allocated: 10,
              reserved: 0,
              consumed: 0,
              available: 10,
              is_fixed: false,
              annex_hours: 0,
              sessions: [],
            },
          ],
        },
      ],
    },
  ]);
}

// ============================================================
// Tests
// ============================================================

describe('GET /api/school-hours-report/[school_id]/pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('No session') });

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: String(SCHOOL_ID) },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when equipo_directivo requests another school PDF', async () => {
    setupAuth(DIRECTIVO_UUID, 'equipo_directivo', SCHOOL_ID);

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: String(OTHER_SCHOOL_ID) },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 200 with application/pdf for equipo_directivo on own school', async () => {
    setupAuth(DIRECTIVO_UUID, 'equipo_directivo', SCHOOL_ID);
    mockFetchSchoolReportData.mockResolvedValue(makeSchoolReport(SCHOOL_ID, 'Escuela Test'));

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: String(SCHOOL_ID) },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader('Content-Type')).toBe('application/pdf');
    const disposition = res.getHeader('Content-Disposition') as string;
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('reporte-horas-');
    expect(disposition).toContain('.pdf');
    expect(pdfBytes(res).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('returns application/pdf for admin on any school', async () => {
    setupAuth(ADMIN_UUID, 'admin');
    mockFetchSchoolReportData.mockResolvedValue(makeSchoolReport(OTHER_SCHOOL_ID, 'Otra Escuela'));

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: String(OTHER_SCHOOL_ID) },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader('Content-Type')).toBe('application/pdf');
    expect(pdfBytes(res).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('renders contract, annex, bucket, session and total figures with the real jspdf-autotable', async () => {
    setupAuth(DIRECTIVO_UUID, 'equipo_directivo', SCHOOL_ID);
    mockFetchSchoolReportData.mockResolvedValue(reportWithRegularAndAnnex());

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: String(SCHOOL_ID) },
    });

    await handler(req as never, res as never);

    const bytes = pdfBytes(res);
    expect(res.getHeader('Content-Type')).toBe('application/pdf');
    expect(res.getHeader('Content-Length')).toBe(bytes.length);
    expect(xrefProblems(bytes)).toEqual([]);
    const { pages, text: pageText } = await pdfText(bytes);
    expect(pages).toBe(1);
    const text = pageText.replace(/\s+/g, '');

    // Grand totals row: contratadas 60, consumidas 3, reservadas 2, disponibles 55.
    expect(text).toContain('Resumen');
    expect(text).toContain('60.03.02.055.0');

    // Only the annex carries the label.
    expect(text).toContain(`Contrato:${REGULAR_NUMERO}`);
    expect(text).toContain(`Contrato:${ANNEX_NUMERO}(Anexo)`);
    expect(text).not.toContain(`Contrato:${REGULAR_NUMERO}(Anexo)`);

    // Regular bucket: asignadas 50, reservadas 2, consumidas 3, disponibles 45, +10 from the annex.
    expect(text).toContain('AsesoriaTecnica50.02.03.045.0+10.0');
    // Annex bucket: 10 assigned and available.
    expect(text).toContain('AsesoriaTecnica10.00.00.010.0');

    // Session detail rows keep hours and status.
    expect(text).toContain('ConsultoraSinteticaSesionconsumida3.00consumida');
    expect(text).toContain('ConsultoraSinteticaSesionreservada2.00reservada');
  });

  it('the PDF checks reject a misplaced xref entry and truncated bytes', async () => {
    setupAuth(ADMIN_UUID, 'admin');
    mockFetchSchoolReportData.mockResolvedValue(reportWithRegularAndAnnex());

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: String(SCHOOL_ID) },
    });

    await handler(req as never, res as never);
    const bytes = pdfBytes(res);
    expect(xrefProblems(bytes)).toEqual([]);

    // Object 1's entry one byte late: the defect pdf.js reports as "bad XRef entry".
    const pdf = bytes.toString('latin1');
    const entry = /(\n0 \d+\s*\n\d{10} 65535 f\s*\n)(\d{10}) 00000 n/.exec(pdf);
    expect(entry).not.toBeNull();
    const start = entry!.index + entry![1].length;
    const late = String(Number(entry![2]) + 1).padStart(10, '0');
    const misplaced = Buffer.from(pdf.slice(0, start) + late + pdf.slice(start + 10), 'latin1');
    expect(xrefProblems(misplaced)).toEqual([`object 1 is not at offset ${Number(late)}`]);

    await expect(PDFDocument.load(bytes.subarray(0, Math.floor(bytes.length / 2)), STRICT_LOAD)).rejects.toThrow();
  });
});
