// @vitest-environment jsdom
/**
 * SM-03 / A14-4-F02 — both downloads export the contract actually on screen.
 *
 * Before this unit the CSV button looped every program and contract in the school and the
 * PDF button passed only `school_id`, so a school with two contracts got the same
 * whole-school file whichever contract the selector showed. These tests drive the real
 * component through the real `ReportExporter.exportToCSV`, capture the Blob it hands to
 * the browser and parse the emitted cells; only the Supabase-free boundaries the component
 * touches are stubbed (fetch, `window.open`, the anchor click, toasts and the lazily
 * imported Recharts pieces, which draw nothing assertable in jsdom — the browser journey
 * renders those for real).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import type { SchoolReportData } from '../../../lib/types/hour-tracking.types';

const { mockToast } = vi.hoisted(() => ({ mockToast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: mockToast, toast: mockToast }));

// The ring chart is `next/dynamic(..., { ssr: false })` over recharts; it renders an
// <svg> in a real browser and nothing measurable in jsdom. Export scope does not read it.
vi.mock('next/dynamic', () => ({
  default: () => function DynamicStub() {
    return null;
  },
}));

import SchoolHoursReport from '../../../components/hours/SchoolHoursReport';

// ============================================================
// Synthetic report fixtures (UUID ids, as `contratos.id` is a UUID)
// ============================================================

const SCHOOL_ID = 42;
const SCHOOL_NAME = 'Colegio Sintetico Los Arrayanes';

const PROGRAMA_A = '11111111-1111-4111-8111-111111111111';
const PROGRAMA_B = '22222222-2222-4222-8222-222222222222';
const PARENT_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const ANNEX_ID = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const SIBLING_ID = 'cccccccc-3333-4333-8333-cccccccccccc';
const NO_BUCKETS_ID = 'dddddddd-4444-4444-8444-dddddddddddd';

const PARENT_NUMERO = 'SIN-2026-001';
const ANNEX_NUMERO = 'SIN-2026-001-A1';
const SIBLING_NUMERO = 'SIN-2026-002';
const NO_BUCKETS_NUMERO = 'SIN-2026-003';

/** Titles that must never appear in an export scoped to another contract. */
const SIBLING_SESSION_TITLE = 'Taller del contrato hermano';

const CSV_HEADER =
  'Programa,Contrato,Categoría,Fecha,Título,Consultor,Horas,Estado,Sobre Presupuesto,Asistencia Esperada,Asistencia Real';

function makeReport(schoolName = SCHOOL_NAME): SchoolReportData {
  return {
    school_id: SCHOOL_ID,
    school_name: schoolName,
    school_summary: {
      total_contracted_hours: 82,
      total_allocated: 80,
      total_reserved: 2,
      total_consumed: 4.25,
      total_available: 73.75,
    },
    programs: [
      {
        programa_id: PROGRAMA_A,
        programa_name: 'Programa Sintetico Alfa',
        contracts: [
          {
            contrato_id: PARENT_ID,
            numero_contrato: PARENT_NUMERO,
            is_annexo: false,
            total_contracted_hours: 52,
            total_reserved: 2,
            total_consumed: 4.25,
            // Negative availability: the school is over its budget on this bucket.
            total_available: -1.25,
            buckets: [
              {
                hour_type_key: 'asesoria_tecnica_presencial',
                display_name: 'Asesoria Tecnica',
                allocated: 5,
                reserved: 2,
                consumed: 4.25,
                available: -1.25,
                is_fixed: false,
                annex_hours: 10,
                sessions: [
                  {
                    session_id: 's0000000-0000-4000-8000-000000000001',
                    title: 'Sesion consumida',
                    date: '2026-04-15',
                    consultant_name: 'Consultora Sintetica',
                    hours: 3,
                    status: 'consumida',
                    is_over_budget: false,
                    attendance: null,
                  },
                  {
                    session_id: 's0000000-0000-4000-8000-000000000002',
                    title: 'Sesion reservada',
                    date: '2026-06-08',
                    consultant_name: 'Consultora Sintetica',
                    hours: 2,
                    status: 'reservada',
                    is_over_budget: false,
                    attendance: null,
                  },
                  {
                    // §11 admin override: 75 effective minutes -> 1.25 h.
                    session_id: 's0000000-0000-4000-8000-000000000003',
                    title: 'Sesion penalizada con override',
                    date: '2026-05-20',
                    consultant_name: 'Consultor Sintetico',
                    hours: 1.25,
                    status: 'penalizada',
                    is_over_budget: true,
                    attendance: null,
                  },
                  {
                    // Zero waiver: effective_minutes = 0, "Sesión eximida".
                    session_id: 's0000000-0000-4000-8000-000000000004',
                    title: 'Sesion devuelta eximida',
                    date: '2026-05-25',
                    consultant_name: 'Consultora Sintetica',
                    hours: 0,
                    status: 'devuelta',
                    is_over_budget: false,
                    attendance: null,
                  },
                ],
              },
            ],
          },
          {
            contrato_id: ANNEX_ID,
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
      {
        programa_id: PROGRAMA_B,
        programa_name: 'Programa Sintetico Beta',
        contracts: [
          {
            contrato_id: SIBLING_ID,
            numero_contrato: SIBLING_NUMERO,
            is_annexo: false,
            total_contracted_hours: 20,
            total_reserved: 0,
            total_consumed: 1.5,
            total_available: 18.5,
            buckets: [
              {
                hour_type_key: 'talleres_presenciales',
                display_name: 'Talleres Presenciales',
                allocated: 20,
                reserved: 0,
                consumed: 1.5,
                available: 18.5,
                is_fixed: false,
                annex_hours: 0,
                sessions: [
                  {
                    session_id: 's0000000-0000-4000-8000-000000000005',
                    title: SIBLING_SESSION_TITLE,
                    date: '2026-07-01',
                    consultant_name: 'Tallerista Sintetica',
                    hours: 1.5,
                    status: 'consumida',
                    is_over_budget: false,
                    attendance: null,
                  },
                ],
              },
            ],
          },
          {
            contrato_id: NO_BUCKETS_ID,
            numero_contrato: NO_BUCKETS_NUMERO,
            is_annexo: false,
            total_contracted_hours: 0,
            total_reserved: 0,
            total_consumed: 0,
            total_available: 0,
            buckets: [],
          },
        ],
      },
    ],
  };
}

// ============================================================
// Harness
// ============================================================

let capturedCsv: string | null;
let capturedBlob: Blob | null;
let capturedFilename: string | null;
let openedUrls: string[];
let exportThrows: boolean;

/** Resolves once the pending export's Blob has been read. */
const flushBlob = () => new Promise((r) => setTimeout(r, 0));

// jsdom 20's Blob has no `text()`, so the emitted file is read back through FileReader.
const readBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

// jsdom 20 implements neither of these, so the blob download boundary has to exist
// before `vi.spyOn` can wrap it.
for (const name of ['createObjectURL', 'revokeObjectURL'] as const) {
  if (typeof URL[name] !== 'function') {
    Object.defineProperty(URL, name, { writable: true, configurable: true, value: () => '' });
  }
}

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  });
}

beforeEach(() => {
  capturedCsv = null;
  capturedBlob = null;
  capturedFilename = null;
  openedUrls = [];
  exportThrows = false;
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  global.fetch = vi.fn();
  vi.spyOn(window, 'open').mockImplementation((url?: string | URL) => {
    openedUrls.push(String(url));
    return null;
  });
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob) => {
    if (exportThrows) throw new Error('synthetic exporter failure');
    capturedBlob = blob;
    return 'blob:synthetic';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    capturedFilename = this.getAttribute('download');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderReport(report: SchoolReportData | null, schoolId = SCHOOL_ID) {
  mockFetchOnce({ data: report });
  render(<SchoolHoursReport schoolId={schoolId} isAdmin={false} />);
  await screen.findByRole('heading', { level: 1 });
}

async function downloadCsv(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Descargar CSV' }));
  await flushBlob();
  // Read the Blob the component actually handed to the browser. It is captured
  // synchronously above, so `capturedCsv` stays null while no CSV was emitted.
  capturedCsv = capturedBlob === null ? null : await readBlob(capturedBlob);
  return capturedCsv;
}

const csvLines = (csv: string | null) => (csv ?? '').trim().split('\n');

// ============================================================
// D1 — the selected contract, and only it
// ============================================================

describe('D1 selected-contract export scope', () => {
  it('D1 exports only the selected parent contract rows, preserving billing and session values', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    const lines = csvLines(await downloadCsv(user));
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines).toHaveLength(5); // header + the parent contract's four sessions
    expect(lines[1]).toBe(
      `Programa Sintetico Alfa,${PARENT_NUMERO},Asesoria Tecnica,2026-04-15,Sesion consumida,Consultora Sintetica,3.00,consumida,No,,`
    );
    expect(lines[2]).toBe(
      `Programa Sintetico Alfa,${PARENT_NUMERO},Asesoria Tecnica,2026-06-08,Sesion reservada,Consultora Sintetica,2.00,reservada,No,,`
    );
    // Fractional §11 override survives verbatim, with its over-budget flag.
    expect(lines[3]).toBe(
      `Programa Sintetico Alfa,${PARENT_NUMERO},Asesoria Tecnica,2026-05-20,Sesion penalizada con override,Consultor Sintetico,1.25,penalizada,Sí,,`
    );
    // Zero waiver stays 0.00 rather than being dropped or re-derived.
    expect(lines[4]).toBe(
      `Programa Sintetico Alfa,${PARENT_NUMERO},Asesoria Tecnica,2026-05-25,Sesion devuelta eximida,Consultora Sintetica,0.00,devuelta,No,,`
    );

    // No sibling contract, annex section or other-program row leaked in.
    const csv = capturedCsv ?? '';
    expect(csv).not.toContain(ANNEX_NUMERO);
    expect(csv).not.toContain(SIBLING_NUMERO);
    expect(csv).not.toContain(SIBLING_SESSION_TITLE);
    expect(csv).not.toContain('Programa Sintetico Beta');
    expect(mockToast.success).toHaveBeenCalledWith('CSV descargado correctamente');
  });

  it('D1 exports the annex contract alone once it is selected, and the PDF targets the same id', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    await user.selectOptions(screen.getByLabelText('Contrato:'), ANNEX_ID);
    expect(screen.getByRole('heading', { level: 3, name: ANNEX_NUMERO })).toBeInTheDocument();

    const lines = csvLines(await downloadCsv(user));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(`Programa Sintetico Alfa,${ANNEX_NUMERO},Asesoria Tecnica,,,,,,,,`);
    expect(capturedCsv).not.toContain('Sesion consumida');
    expect(capturedCsv).not.toContain(`,${PARENT_NUMERO},`);

    await user.click(screen.getByRole('button', { name: 'Descargar Reporte PDF' }));
    expect(openedUrls).toEqual([`/api/school-hours-report/${SCHOOL_ID}/pdf?contrato_id=${ANNEX_ID}`]);
  });

  it('D1 keeps the annex contribution inside the selected parent contract on screen', async () => {
    await renderReport(makeReport());
    // The parent's own bucket keeps its +10 h annex contribution and negative availability.
    expect(screen.getByText('+10.0 h Anexo')).toBeInTheDocument();
    expect(screen.getByText('Agotado')).toBeInTheDocument();
    expect(screen.getByText('-1.3')).toBeInTheDocument();
    // But the annex's own section is not rendered beside it.
    expect(screen.queryByRole('heading', { level: 3, name: ANNEX_NUMERO })).not.toBeInTheDocument();
  });
});

// ============================================================
// D2 — empty and absent selections
// ============================================================

describe('D2 empty and absent selections', () => {
  it('D2 keeps an identifying row with blank session cells for a contract with no buckets', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    await user.click(screen.getByRole('button', { name: 'Programa Sintetico Beta' }));
    await user.selectOptions(screen.getByLabelText('Contrato:'), NO_BUCKETS_ID);
    expect(screen.getByText('No hay categorías de horas para este contrato.')).toBeInTheDocument();

    const lines = csvLines(await downloadCsv(user));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(`Programa Sintetico Beta,${NO_BUCKETS_NUMERO},,,,,,,,,`);
    expect(capturedCsv).not.toContain(SIBLING_SESSION_TITLE);
  });

  it('D2 offers no download and a clear es-CL empty state when the school has no programs', async () => {
    await renderReport({
      school_id: SCHOOL_ID,
      school_name: SCHOOL_NAME,
      programs: [],
      school_summary: { total_contracted_hours: 0, total_allocated: 0, total_reserved: 0, total_consumed: 0, total_available: 0 },
    });

    expect(screen.getByText('Esta escuela no tiene programas activos')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar CSV' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar Reporte PDF' })).not.toBeInTheDocument();
  });

  it('D2 offers no download and says so when the active program has no contracts', async () => {
    const report = makeReport();
    report.programs[0].contracts = [];
    await renderReport(report);

    expect(screen.getByText('Este programa no tiene contratos activos')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar CSV' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar Reporte PDF' })).not.toBeInTheDocument();
  });
});

// ============================================================
// D3 — failures and late responses never widen or stale the export
// ============================================================

describe('D3 failures and late responses', () => {
  it('D3 shows the API error and offers no download after an HTTP failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Error inesperado al obtener el reporte de horas' }),
    });
    render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);

    expect(await screen.findByText('Error al cargar el reporte')).toBeInTheDocument();
    expect(screen.getByText('Error inesperado al obtener el reporte de horas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar CSV' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar Reporte PDF' })).not.toBeInTheDocument();
  });

  it('D3 shows the network error and offers no download when fetch rejects', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline'));
    render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);

    expect(await screen.findByText('Error de red al cargar el reporte.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar CSV' })).not.toBeInTheDocument();
  });

  it('D3 ignores a delayed old-school success, so no wrong-school download is possible', async () => {
    let resolveOld: (value: unknown) => void = () => {};
    const oldReport = makeReport('Escuela Antigua');
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveOld = () => resolve({ ok: true, status: 200, json: async () => ({ data: oldReport }) });
      })
    );

    const { rerender } = render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);

    const newReport = makeReport('Escuela Nueva');
    newReport.programs[0].contracts[0].numero_contrato = 'NUEVA-2026-001';
    newReport.programs[0].contracts[0].contrato_id = '99999999-9999-4999-8999-999999999999';
    mockFetchOnce({ data: newReport });
    rerender(<SchoolHoursReport schoolId={7} isAdmin={false} />);
    await screen.findByRole('heading', { level: 1, name: 'Escuela Nueva' });

    // The first school's response lands only now.
    resolveOld(undefined);
    await flushBlob();

    expect(screen.getByRole('heading', { level: 1, name: 'Escuela Nueva' })).toBeInTheDocument();
    expect(screen.queryByText('Escuela Antigua')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Descargar Reporte PDF' }));
    expect(openedUrls).toEqual(['/api/school-hours-report/7/pdf?contrato_id=99999999-9999-4999-8999-999999999999']);
    const lines = csvLines(await downloadCsv(user));
    expect(capturedCsv).toContain('NUEVA-2026-001');
    expect(capturedCsv).not.toContain(PARENT_NUMERO);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('D3 ignores a delayed old-school error, leaving the new school usable', async () => {
    let rejectOld: () => void = () => {};
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise((_resolve, reject) => {
        rejectOld = () => reject(new Error('old school offline'));
      })
    );
    const { rerender } = render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);

    mockFetchOnce({ data: makeReport('Escuela Nueva') });
    rerender(<SchoolHoursReport schoolId={7} isAdmin={false} />);
    await screen.findByRole('heading', { level: 1, name: 'Escuela Nueva' });

    rejectOld();
    await flushBlob();

    expect(screen.queryByText('Error de red al cargar el reporte.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar CSV' })).toBeInTheDocument();
  });

  it('D3 reports a CSV exporter failure and never claims success', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    exportThrows = true;
    await user.click(screen.getByRole('button', { name: 'Descargar CSV' }));
    await flushBlob();

    expect(mockToast.error).toHaveBeenCalledWith('No se pudo generar el CSV.');
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(capturedFilename).toBeNull();
  });
});

// ============================================================
// D4 — every transition keeps display, selector, CSV and PDF in agreement
// ============================================================

describe('D4 selection transitions', () => {
  it('D4 invalidates the old contract when the program changes', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    await user.selectOptions(screen.getByLabelText('Contrato:'), ANNEX_ID);
    await user.click(screen.getByRole('button', { name: 'Programa Sintetico Beta' }));

    // The new program's first contract is both shown and selected.
    expect(screen.getByRole('heading', { level: 3, name: SIBLING_NUMERO })).toBeInTheDocument();
    expect(screen.getByLabelText('Contrato:')).toHaveValue(SIBLING_ID);

    await user.click(screen.getByRole('button', { name: 'Descargar Reporte PDF' }));
    expect(openedUrls).toEqual([`/api/school-hours-report/${SCHOOL_ID}/pdf?contrato_id=${SIBLING_ID}`]);
    expect(capturedCsv).toBeNull();
    const lines = csvLines(await downloadCsv(user));
    expect(lines[1]).toContain(SIBLING_NUMERO);
    expect(capturedCsv).not.toContain(ANNEX_NUMERO);
  });

  it('D4 falls back to a contract that still exists when refreshed data removes the selection', async () => {
    const user = userEvent.setup();
    mockFetchOnce({ data: makeReport() });
    const { rerender } = render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);
    await screen.findByRole('heading', { level: 1 });

    await user.selectOptions(screen.getByLabelText('Contrato:'), ANNEX_ID);
    expect(screen.getByLabelText('Contrato:')).toHaveValue(ANNEX_ID);

    // Navigate away and back. The refreshed report for the same school no longer has the
    // annex, so the selector, the display and both exports must agree on what is left
    // instead of pointing at a contract that no longer exists.
    mockFetchOnce({ data: makeReport('Escuela Intermedia') });
    rerender(<SchoolHoursReport schoolId={7} isAdmin={false} />);
    await screen.findByRole('heading', { level: 1, name: 'Escuela Intermedia' });

    const refreshed = makeReport();
    refreshed.programs[0].contracts = [refreshed.programs[0].contracts[0]];
    mockFetchOnce({ data: refreshed });
    rerender(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);
    await screen.findByRole('heading', { level: 3, name: PARENT_NUMERO });

    // Only one contract is left in this program, so the selector is not rendered at all.
    expect(screen.queryByLabelText('Contrato:')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Descargar Reporte PDF' }));
    expect(openedUrls).toEqual([`/api/school-hours-report/${SCHOOL_ID}/pdf?contrato_id=${PARENT_ID}`]);

    const lines = csvLines(await downloadCsv(user));
    expect(lines[1]).toContain(PARENT_NUMERO);
    expect(capturedCsv).not.toContain(ANNEX_NUMERO);
  });
});

// ============================================================
// D5 — the emitted artefacts and the on-screen text
// ============================================================

describe('D5 emitted CSV and selected-contract UI text', () => {
  it('D5 keeps the legacy CSV file name and the es-CL columns', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    const csv = await downloadCsv(user);
    expect(csvLines(csv)[0]).toBe(CSV_HEADER);
    // The file name is the pre-existing school/date one: naming the contract inside it
    // was outside this unit's scope, so contract identity lives in the cells instead.
    expect(capturedFilename).toMatch(
      new RegExp('^reporte-horas-Colegio_Sintetico_Los_Arrayanes-\\d{4}-\\d{2}-\\d{2}\\.csv$')
    );
    expect(capturedFilename).not.toContain(PARENT_NUMERO);
    // No raw identifiers, paths or query strings leak into the emitted cells.
    expect(csv).not.toContain(PARENT_ID);
    expect(csv).not.toContain(PROGRAMA_A);
    expect(csv).not.toContain('/api/');
  });

  it('D5 shows the selected contract, not a school-wide total, beside the download controls', async () => {
    await renderReport(makeReport());

    const selector = screen.getByLabelText('Contrato:');
    expect(selector).toHaveValue(PARENT_ID);
    expect(screen.getByRole('heading', { level: 3, name: PARENT_NUMERO })).toBeInTheDocument();

    const summary = screen.getByText('Contratadas:').closest('div.grid') as HTMLElement;
    // 52 h contracted for this contract, not the school's 82 h.
    expect(within(summary).getByText('52.0 h')).toBeInTheDocument();
    expect(within(summary).queryByText('82.0 h')).not.toBeInTheDocument();
    expect(screen.queryByText(SIBLING_SESSION_TITLE)).not.toBeInTheDocument();
  });

  it('D5 waits for a selection before opening any PDF', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());
    await user.click(screen.getByRole('button', { name: 'Descargar Reporte PDF' }));

    await waitFor(() => expect(openedUrls).toHaveLength(1));
    expect(openedUrls[0]).toContain('contrato_id=');
    expect(openedUrls[0].endsWith('/pdf')).toBe(false);
  });
});
