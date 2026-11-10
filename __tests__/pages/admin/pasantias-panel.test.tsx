// @vitest-environment jsdom
/**
 * PASANTÍAS PANEL — the ACTUAL admin page, `pages/admin/pasantias-panel.tsx`,
 * with only its chrome, the CSV download and the server-only auth imports
 * stubbed (as `__tests__/pages/admin/pasantia-participants.test.tsx`).
 *
 * The guard: anonymous → /login, non-admin → /dashboard, admin → empty props.
 * The page: one table for every school, summary tiles, filters, a quick edit
 * that sends the whole tracking state with its version, a stale answer that
 * shows what is stored, bulk edit, CSV of the filtered rows, and the detail
 * panel (correction, tracking, letter gating, documents, history).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

const { mockGetServerSideUser, mockIsGlobalAdmin, mockCreateServiceRoleClient, mockExportToCSV } = vi.hoisted(() => ({
  mockGetServerSideUser: vi.fn(),
  mockIsGlobalAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(() => ({})),
  mockExportToCSV: vi.fn(),
}));

vi.mock('../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="main-layout">{children}</div>,
}));
vi.mock('../../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ children, title }: { children?: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));
vi.mock('../../../lib/api-auth', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
  getServerSideUser: mockGetServerSideUser,
}));
vi.mock('../../../utils/roleUtils', () => ({ isGlobalAdmin: mockIsGlobalAdmin }));
vi.mock('../../../lib/exportUtils', () => ({ ReportExporter: { exportToCSV: mockExportToCSV } }));

import PasantiasPanelPage, { getServerSideProps } from '../../../pages/admin/pasantias-panel';

const R1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const R2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const P1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const P2 = 'bbbbbbbb-0000-4000-8000-000000000002';
const P3 = 'bbbbbbbb-0000-4000-8000-000000000003';

const ROSTERS = [
  {
    id: R1,
    schoolName: 'Colegio Sintético Uno',
    program: 'inspira',
    programName: 'Pasantía INSPIRA',
    status: 'submitted',
    lastSubmittedAt: '2026-11-01T12:00:00.000Z',
    schoolFunding: { flightsFunding: 'sep', lodgingFunding: 'colegio', version: 1 },
    details: { letterSchoolLine: null, letterLodgingLine: null, version: null },
  },
  {
    id: R2,
    schoolName: 'Liceo Sintético Dos',
    program: 'mirada-profunda',
    programName: 'INSPIRA Mirada Profunda',
    status: 'open',
    lastSubmittedAt: null,
    schoolFunding: null,
    details: { letterSchoolLine: null, letterLodgingLine: null, version: null },
  },
];

function logistics(overrides: Record<string, unknown> = {}) {
  return {
    flightStatus: 'pending',
    lodgingStatus: 'pending',
    depositReceived: false,
    balanceReceived: false,
    salutation: null,
    notes: null,
    sclDepartureDate: null,
    bcnArrivalDate: null,
    bcnDepartureDate: null,
    sclArrivalDate: null,
    letterSentAt: null,
    letterSentTo: null,
    letterSendError: null,
    version: null,
    updatedAt: null,
    ...overrides,
  };
}

function row(id: string, rosterId: string, firstNames: string, lastNames: string, rut: string, l = logistics()) {
  return {
    rosterId,
    participant: {
      id,
      version: 1,
      firstNames,
      lastNames,
      rut,
      passportNumber: null,
      arrivalDate: null,
      departureDate: null,
      focus: null,
      dietaryRestrictions: [],
      dietaryOther: null,
      email: id === P1 ? 'ana.perez@example.com' : null,
      updatedAt: '2026-11-01T12:00:00.000Z',
      createdAt: '2026-11-01T12:00:00.000Z',
      acknowledgedAt: '2026-11-01T12:00:00.000Z',
      noticeVersion: 'v',
    },
    logistics: l,
    documentCount: 0,
    hasLetter: false,
    hasAccount: id === P1,
  };
}

const ROWS = [
  row(P1, R1, 'Ana', 'Pérez', '11111111-1', logistics({ flightStatus: 'purchased', depositReceived: true, notes: 'Nota', version: 2 })),
  row(P2, R1, 'Benjamín', 'Soto', '22222222-2'),
  row(P3, R2, 'Carla', 'Ibáñez', '33333333-3', logistics({ flightStatus: 'paid', lodgingStatus: 'paid', version: 1 })),
];

const PANEL = { rosters: ROSTERS, rows: ROWS, letterAssets: { logo: false, signature: false } };

type Reply = { status: number; body: unknown };
let replies: Reply[] = [];
const fetchMock = vi.fn();

beforeEach(() => {
  replies = [];
  vi.clearAllMocks();
  fetchMock.mockImplementation(() => {
    const next = replies.shift();
    if (!next) return Promise.reject(new Error('unexpected fetch'));
    return Promise.resolve({
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: () => Promise.resolve(next.body),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
const sentBody = () => JSON.parse(String(lastCall()[1].body));

async function open(panel: unknown = PANEL) {
  replies.push({ status: 200, body: panel });
  render(<PasantiasPanelPage />);
  await waitFor(() => expect(screen.getByTestId('panel-count')).not.toHaveTextContent('Cargando'));
}

describe('getServerSideProps', () => {
  const ctx = { req: {}, res: {} } as any;

  it('sends an anonymous visitor to /login', async () => {
    mockGetServerSideUser.mockResolvedValue(null);
    expect(await getServerSideProps(ctx)).toEqual({ redirect: { destination: '/login', permanent: false } });
    expect(mockIsGlobalAdmin).not.toHaveBeenCalled();
  });

  it('sends a signed-in non-admin to /dashboard', async () => {
    mockGetServerSideUser.mockResolvedValue({ id: 'docente-id' });
    mockIsGlobalAdmin.mockResolvedValue(false);
    expect(await getServerSideProps(ctx)).toEqual({ redirect: { destination: '/dashboard', permanent: false } });
  });

  it('renders for a global admin with empty props (no data in the page HTML)', async () => {
    mockGetServerSideUser.mockResolvedValue({ id: 'admin-id' });
    mockIsGlobalAdmin.mockResolvedValue(true);
    expect(await getServerSideProps(ctx)).toEqual({ props: {} });
  });
});

describe('the panel', () => {
  it('shows every traveller from every school in one table, with the summary', async () => {
    await open();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/pasantias-panel');
    expect(screen.getByTestId('panel-count')).toHaveTextContent('Mostrando 3 de 3 personas');
    const table = screen.getByTestId('panel-table');
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(screen.getByTestId(`panel-row-${P1}`)).toHaveTextContent('Ana Pérez');
    expect(screen.getByTestId(`panel-row-${P1}`)).toHaveTextContent('11.111.111-1');
    expect(screen.getByTestId(`panel-row-${P1}`)).toHaveTextContent('Colegio Sintético Uno');
    expect(screen.getByTestId(`panel-funding-${P1}`)).toHaveTextContent('Pasajes: Costo SEP · Estadía: Costo Colegio');
    expect(screen.getByTestId(`panel-funding-${P3}`)).toHaveTextContent('Costos sin definir por el colegio');
    expect(screen.getByTestId(`panel-flight-${P1}`)).toHaveValue('purchased');
    expect(screen.getByTestId(`panel-deposit-${P1}`)).toBeChecked();
    expect(screen.getByTestId(`panel-flight-${P2}`)).toHaveValue('pending');

    expect(screen.getByTestId('panel-tile-travellers-value')).toHaveTextContent('3');
    expect(screen.getByTestId('panel-tile-travellers')).toHaveTextContent('2 colegios');
    expect(screen.getByTestId('panel-tile-flight-value')).toHaveTextContent('1');
    expect(screen.getByTestId('panel-tile-flight')).toHaveTextContent('2 comprados');
    expect(screen.getByTestId('panel-tile-lodging-value')).toHaveTextContent('1');
    expect(screen.getByTestId('panel-tile-deposit-value')).toHaveTextContent('1');
    expect(screen.getByTestId('panel-tile-balance-value')).toHaveTextContent('0');
    expect(screen.getByTestId('panel-letter-images-state')).toHaveTextContent('faltan imágenes');
  });

  it('shows each person\'s email, account and four flight dates, and flags whose letter cannot send itself', async () => {
    const rows = [
      { ...ROWS[0], logistics: logistics({ sclDepartureDate: '2027-01-16', bcnArrivalDate: '2027-01-17', version: 2 }) },
      ROWS[1],
      { ...ROWS[2], logistics: logistics({ letterSentAt: '2027-01-09T12:00:00Z', letterSentTo: 'carla@example.com', version: 1 }) },
    ];
    replies.push({ status: 200, body: { ...PANEL, rows } });
    render(<PasantiasPanelPage />);
    await screen.findByTestId(`panel-row-${P1}`);
    expect(screen.getByTestId(`panel-email-${P1}`)).toHaveTextContent('ana.perez@example.com');
    expect(screen.getByTestId(`panel-account-${P1}`)).toHaveTextContent('Con cuenta en GENERA');
    expect(screen.getByTestId(`panel-email-${P2}`)).toHaveTextContent('Sin correo');
    expect(screen.queryByTestId(`panel-account-${P2}`)).toBeNull();
    const dates = screen.getByTestId(`panel-flight-dates-${P1}`);
    expect(dates).toHaveTextContent('Salida de SCL16-01-2027');
    expect(dates).toHaveTextContent('Llegada a BCN17-01-2027');
    expect(dates).toHaveTextContent('Salida de BCN—');
    expect(dates).toHaveTextContent('Llegada a SCL—');
    // Nothing is ready (no images, no greeting): flagged, with the reason on hover.
    const flag = screen.getByTestId(`panel-letter-send-${P1}`);
    expect(flag).toHaveAttribute('data-state', 'blocked');
    expect(flag).toHaveTextContent('Carta: falta información');
    expect(flag.getAttribute('title')).toContain('el logo de la carta');
    expect(screen.getByTestId(`panel-letter-send-${P3}`)).toHaveTextContent('Carta enviada 09-01-2027');
  });

  it('says so when nobody is registered yet, and when the list cannot be loaded', async () => {
    await open({ rosters: [], rows: [], letterAssets: { logo: true, signature: true } });
    expect(screen.getByTestId('panel-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-table')).not.toBeInTheDocument();
    expect(screen.getByTestId('panel-export')).toBeDisabled();

    replies.push({ status: 500, body: { error: 'Error al cargar el panel' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('panel-refresh'));
    });
    expect(await screen.findByTestId('panel-error')).toHaveTextContent('Error al cargar el panel');
  });

  it('filters by search, school and status, and clears', async () => {
    await open();
    fireEvent.change(screen.getByTestId('panel-filter-search'), { target: { value: 'ibanez' } });
    expect(screen.getByTestId('panel-count')).toHaveTextContent('Mostrando 1 de 3');
    expect(screen.queryByTestId(`panel-row-${P1}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`panel-row-${P3}`)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('panel-filter-clear'));
    fireEvent.change(screen.getByTestId('panel-filter-roster'), { target: { value: R1 } });
    fireEvent.change(screen.getByTestId('panel-filter-flight'), { target: { value: 'pending' } });
    expect(screen.getByTestId('panel-count')).toHaveTextContent('Mostrando 1 de 3');
    expect(screen.getByTestId(`panel-row-${P2}`)).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('panel-filter-flight'), { target: { value: 'paid' } });
    expect(screen.getByTestId('panel-no-match')).toBeInTheDocument();
    // The tiles always describe the whole cohort, not the filter.
    expect(screen.getByTestId('panel-tile-travellers-value')).toHaveTextContent('3');
  });

  it('a quick edit sends the whole tracking state with its stored version and shows the answer', async () => {
    await open();
    const saved = { ...ROWS[0], logistics: logistics({ flightStatus: 'paid', depositReceived: true, notes: 'Nota', version: 3 }) };
    replies.push({ status: 200, body: { row: saved, roster: ROSTERS[0] } });
    await act(async () => {
      fireEvent.change(screen.getByTestId(`panel-flight-${P1}`), { target: { value: 'paid' } });
    });
    expect(lastCall()[0]).toBe(`/api/admin/pasantias-panel/participants/${P1}`);
    expect(lastCall()[1].method).toBe('PATCH');
    expect(sentBody()).toEqual({
      flightStatus: 'paid',
      lodgingStatus: 'pending',
      depositReceived: true,
      balanceReceived: false,
      salutation: null,
      notes: 'Nota',
      // The four flight dates travel with every save, so a quick edit never clears them.
      sclDepartureDate: null,
      bcnArrivalDate: null,
      bcnDepartureDate: null,
      sclArrivalDate: null,
      expectedVersion: 2,
    });
    await waitFor(() => expect(screen.getByTestId(`panel-flight-${P1}`)).toHaveValue('paid'));
    expect(screen.getByTestId('panel-tile-flight-value')).toHaveTextContent('2');
    expect(screen.queryByTestId('panel-message')).not.toBeInTheDocument();
  });

  it('a first edit for someone with nothing saved expects no row', async () => {
    await open();
    replies.push({ status: 200, body: { row: { ...ROWS[1], logistics: logistics({ balanceReceived: true, version: 1 }) } } });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`panel-balance-${P2}`));
    });
    expect(sentBody()).toMatchObject({ balanceReceived: true, expectedVersion: null });
    await waitFor(() => expect(screen.getByTestId(`panel-balance-${P2}`)).toBeChecked());
  });

  it('a stale answer shows what is stored and says the change was not applied', async () => {
    await open();
    const current = { ...ROWS[0], logistics: logistics({ flightStatus: 'pending', lodgingStatus: 'reserved', version: 5 }) };
    replies.push({ status: 409, body: { code: 'STALE', error: 'x', row: current, roster: ROSTERS[0] } });
    await act(async () => {
      fireEvent.change(screen.getByTestId(`panel-flight-${P1}`), { target: { value: 'paid' } });
    });
    await waitFor(() => expect(screen.getByTestId('panel-message')).toHaveAttribute('data-tone', 'error'));
    expect(screen.getByTestId('panel-message')).toHaveTextContent('Ana Pérez');
    expect(screen.getByTestId(`panel-flight-${P1}`)).toHaveValue('pending');
    expect(screen.getByTestId(`panel-lodging-${P1}`)).toHaveValue('reserved');
  });

  it('a failed save leaves the stored value on screen', async () => {
    await open();
    replies.push({ status: 500, body: { error: 'No pudimos guardar el seguimiento. Inténtalo de nuevo.' } });
    await act(async () => {
      fireEvent.change(screen.getByTestId(`panel-lodging-${P2}`), { target: { value: 'paid' } });
    });
    await waitFor(() => expect(screen.getByTestId('panel-message')).toHaveTextContent('No pudimos guardar'));
    expect(screen.getByTestId(`panel-lodging-${P2}`)).toHaveValue('pending');
  });

  it('bulk edit sends only the selected, visible people and reloads', async () => {
    await open();
    expect(screen.queryByTestId('panel-bulk')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('panel-filter-roster'), { target: { value: R1 } });
    fireEvent.click(screen.getByTestId('panel-select-all'));
    expect(screen.getByTestId('panel-bulk-count')).toHaveTextContent('2 personas seleccionadas');
    expect(screen.getByTestId('panel-bulk-apply')).toBeDisabled();
    fireEvent.change(screen.getByTestId('panel-bulk-choice'), { target: { value: 'depositReceived:true' } });

    replies.push({ status: 200, body: { changed: 1 } });
    replies.push({ status: 200, body: PANEL });
    await act(async () => {
      fireEvent.click(screen.getByTestId('panel-bulk-apply'));
    });
    const bulkCall = fetchMock.mock.calls[1];
    expect(bulkCall[0]).toBe('/api/admin/pasantias-panel/bulk');
    expect(JSON.parse(String(bulkCall[1].body))).toEqual({
      participantIds: [P1, P2],
      field: 'depositReceived',
      value: true,
    });
    await waitFor(() => expect(screen.getByTestId('panel-message')).toHaveTextContent('1 de 2 personas cambiaron'));
    expect(fetchMock.mock.calls[2][0]).toBe('/api/admin/pasantias-panel');
    expect(screen.queryByTestId('panel-bulk')).not.toBeInTheDocument();
  });

  it('exports the filtered rows through the shared CSV exporter', async () => {
    await open();
    fireEvent.change(screen.getByTestId('panel-filter-program'), { target: { value: 'mirada-profunda' } });
    fireEvent.click(screen.getByTestId('panel-export'));
    expect(mockExportToCSV).toHaveBeenCalledTimes(1);
    const exported = mockExportToCSV.mock.calls[0][0];
    expect(exported.headers).toContain('Carta de invitación');
    expect(exported.data).toHaveLength(1);
    expect(exported.data[0]).toMatchObject({ Colegio: 'Liceo Sintético Dos', Nombres: 'Carla', Pasaje: 'Pagado' });
    expect(exported.filename).toMatch(/^pasantias-enero-2027-\d{4}-\d{2}-\d{2}$/);
  });
});

describe('the detail panel', () => {
  const DETAIL = {
    row: ROWS[0],
    roster: ROSTERS[0],
    documents: [
      {
        id: 'dddddddd-0000-4000-8000-000000000001',
        kind: 'ticket',
        description: 'Ida',
        fileName: 'pasaje.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        createdAt: '2026-11-03T10:00:00.000Z',
      },
    ],
    activity: [
      { id: 'a1', action: 'logistics_updated', actorName: 'Admin Sintético', createdAt: '2026-11-03T10:00:00.000Z', lines: ['Pasaje: Pendiente → Comprado'] },
    ],
  };

  async function openDrawer(detail: unknown = DETAIL) {
    await open();
    replies.push({ status: 200, body: detail });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`panel-open-${P1}`));
    });
    await screen.findByTestId('panel-section-tracking');
  }

  it('shows the school data, tracking, documents and history of one person', async () => {
    await openDrawer();
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/admin/pasantias-panel/participants/${P1}`);
    expect(screen.getByTestId('panel-drawer-title')).toHaveTextContent('Ana Pérez');
    expect(screen.getByTestId('panel-data-rut')).toHaveTextContent('11.111.111-1');
    expect(screen.getByTestId('panel-data-passport')).toHaveTextContent('Sin indicar');
    expect(screen.getByTestId('panel-data-roster-status')).toHaveTextContent('Enviada');
    expect(screen.getByTestId('panel-tracking-flight')).toHaveValue('purchased');
    expect(screen.getByTestId('panel-tracking-notes')).toHaveValue('Nota');
    expect(screen.getByTestId('panel-tracking-save')).toBeDisabled();
    expect(screen.getByTestId('panel-doc-list')).toHaveTextContent('Pasaje aéreo · Ida');
    expect(screen.getByTestId('panel-doc-list')).toHaveTextContent('pasaje.pdf · 2 KB');
    expect(screen.getByTestId('panel-activity-list')).toHaveTextContent('Admin Sintético');
    expect(screen.getByTestId('panel-activity-list')).toHaveTextContent('Pasaje: Pendiente → Comprado');
  });

  it('will not generate a letter until everything it prints exists, and names what is missing', async () => {
    await openDrawer();
    expect(screen.getByTestId('panel-letter-generate')).toBeDisabled();
    const missing = screen.getByTestId('panel-letter-missing');
    expect(missing).toHaveTextContent('el tratamiento (Estimado/Estimada)');
    expect(missing).toHaveTextContent('el colegio como aparece en la carta');
    expect(missing).toHaveTextContent('el alojamiento como aparece en la carta');
    expect(missing).toHaveTextContent('el logo de la carta');
    expect(missing).toHaveTextContent('la firma de la carta');
  });

  it('saves the tracking form with the greeting and notes', async () => {
    await openDrawer();
    fireEvent.change(screen.getByTestId('panel-tracking-salutation'), { target: { value: 'estimada' } });
    fireEvent.change(screen.getByTestId('panel-tracking-notes'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('panel-tracking-sclDepartureDate'), { target: { value: '2027-01-16' } });
    expect(screen.getByTestId('panel-tracking-save')).toBeEnabled();
    const saved = { ...DETAIL, row: { ...ROWS[0], logistics: logistics({ flightStatus: 'purchased', depositReceived: true, salutation: 'estimada', version: 3 }) } };
    replies.push({ status: 200, body: { row: saved.row, roster: ROSTERS[0] } });
    replies.push({ status: 200, body: saved });
    await act(async () => {
      fireEvent.click(screen.getByTestId('panel-tracking-save'));
    });
    const patch = fetchMock.mock.calls[2];
    expect(patch[1].method).toBe('PATCH');
    expect(JSON.parse(String(patch[1].body))).toEqual({
      flightStatus: 'purchased',
      lodgingStatus: 'pending',
      depositReceived: true,
      balanceReceived: false,
      salutation: 'estimada',
      notes: null,
      sclDepartureDate: '2027-01-16',
      bcnArrivalDate: null,
      bcnDepartureDate: null,
      sclArrivalDate: null,
      expectedVersion: 2,
    });
    await waitFor(() => expect(screen.getByTestId('panel-tracking-msg')).toHaveTextContent('Seguimiento guardado'));
    expect(screen.getByTestId('panel-tracking-save')).toBeDisabled();
  });

  it('corrects the school data with the school form rules and the participant version', async () => {
    await openDrawer();
    fireEvent.click(screen.getByTestId('panel-data-edit'));
    const lastNames = screen.getByTestId('intake-last-names');
    fireEvent.change(lastNames, { target: { value: '' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    // Invalid locally: nothing is sent.
    expect(screen.getByTestId('intake-error-lastNames')).toHaveTextContent('Ingresa los apellidos.');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.change(lastNames, { target: { value: 'Pérez Corregida' } });
    const corrected = { ...DETAIL, row: { ...ROWS[0], participant: { ...ROWS[0].participant, lastNames: 'Pérez Corregida', version: 2 } } };
    replies.push({ status: 200, body: { row: corrected.row, roster: ROSTERS[0] } });
    replies.push({ status: 200, body: corrected });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    const put = fetchMock.mock.calls[2];
    expect(put[1].method).toBe('PUT');
    expect(JSON.parse(String(put[1].body))).toEqual({
      firstNames: 'Ana',
      lastNames: 'Pérez Corregida',
      rut: '11.111.111-1',
      passportNumber: null,
      arrivalDate: null,
      departureDate: null,
      focus: null,
      dietaryRestrictions: [],
      dietaryOther: null,
      // Sent back as stored, so a correction of another field never wipes it.
      email: 'ana.perez@example.com',
      expectedVersion: 1,
    });
    await waitFor(() => expect(screen.getByTestId('panel-data-msg')).toHaveTextContent('Datos corregidos'));
    expect(screen.getByTestId('panel-drawer-title')).toHaveTextContent('Ana Pérez Corregida');
    // The table behind the panel shows the corrected name too.
    expect(screen.getByTestId(`panel-row-${P1}`)).toHaveTextContent('Ana Pérez Corregida');
  });

  it('shows the email, whether the person has a GENERA account, and why the letter will not send itself yet', async () => {
    await openDrawer();
    expect(screen.getByTestId('panel-data-email')).toHaveTextContent('ana.perez@example.com');
    expect(screen.getByTestId('panel-data-account')).toHaveAttribute('data-account', 'yes');
    const state = screen.getByTestId('panel-letter-send-state');
    expect(state).toHaveAttribute('data-state', 'blocked');
    expect(state).toHaveTextContent('la fecha de salida de SCL');
    expect(screen.getByTestId('panel-letter-send')).toBeDisabled();
  });

  const READY = {
    ...DETAIL,
    row: {
      ...ROWS[0],
      logistics: logistics({ flightStatus: 'purchased', salutation: 'estimada', sclDepartureDate: '2027-01-16', version: 2 }),
    },
    roster: { ...ROSTERS[0], details: { letterSchoolLine: 'del Colegio Sintético Uno', letterLodgingLine: 'la Residencia Sintética', version: 1 } },
  };

  it('once everything exists it says when the letter goes out, and "send now" posts and reports where it went', async () => {
    replies.push({ status: 200, body: { ...PANEL, letterAssets: { logo: true, signature: true } } });
    render(<PasantiasPanelPage />);
    await screen.findByTestId(`panel-row-${P1}`);
    replies.push({ status: 200, body: READY });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`panel-open-${P1}`));
    });
    await screen.findByTestId('panel-section-tracking');
    const state = screen.getByTestId('panel-letter-send-state');
    expect(['scheduled', 'late']).toContain(state.getAttribute('data-state'));
    expect(screen.getByTestId('panel-letter-send')).toBeEnabled();

    const sent = { ...READY, row: { ...READY.row, logistics: { ...READY.row.logistics, letterSentAt: '2027-01-09T12:00:00Z', letterSentTo: 'ana.perez@example.com' } } };
    replies.push({ status: 200, body: { sent: true, to: 'ana.perez@example.com', stored: true } });
    replies.push({ status: 200, body: sent });
    await act(async () => {
      fireEvent.click(screen.getByTestId('panel-letter-send'));
    });
    const post = fetchMock.mock.calls[2];
    expect(post[0]).toBe(`/api/admin/pasantias-panel/participants/${P1}/send-letter`);
    expect(post[1].method).toBe('POST');
    await waitFor(() => expect(screen.getByTestId('panel-letter-msg')).toHaveTextContent('Carta enviada a ana.perez@example.com'));
    expect(screen.getByTestId('panel-letter-send-state')).toHaveAttribute('data-state', 'sent');
    expect(screen.getByTestId('panel-letter-send')).toHaveTextContent('Enviar de nuevo ahora');
  });

  it('a failed send shows the plain reason and what the last attempt said', async () => {
    replies.push({ status: 200, body: { ...PANEL, letterAssets: { logo: true, signature: true } } });
    render(<PasantiasPanelPage />);
    await screen.findByTestId(`panel-row-${P1}`);
    replies.push({ status: 200, body: READY });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`panel-open-${P1}`));
    });
    await screen.findByTestId('panel-section-tracking');
    const failed = { ...READY, row: { ...READY.row, logistics: { ...READY.row.logistics, letterSendError: 'email_not_configured' } } };
    replies.push({ status: 502, body: { code: 'SEND_FAILED', error: 'No se envió la carta: el envío de correos no está configurado.' } });
    replies.push({ status: 200, body: failed });
    await act(async () => {
      fireEvent.click(screen.getByTestId('panel-letter-send'));
    });
    await waitFor(() => expect(screen.getByTestId('panel-letter-msg')).toHaveTextContent('el envío de correos no está configurado'));
    expect(screen.getByTestId('panel-letter-send-error')).toHaveTextContent('el envío de correos no está configurado');
  });

  it('removing a document asks first', async () => {
    await openDrawer();
    const docId = DETAIL.documents[0].id;
    fireEvent.click(screen.getByTestId(`panel-doc-remove-${docId}`));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    replies.push({ status: 200, body: { removed: true } });
    replies.push({ status: 200, body: { ...DETAIL, documents: [] } });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`panel-doc-remove-confirm-${docId}`));
    });
    expect(fetchMock.mock.calls[2][0]).toBe(`/api/admin/pasantias-panel/documents/${docId}`);
    expect(fetchMock.mock.calls[2][1].method).toBe('DELETE');
    await waitFor(() => expect(screen.getByTestId('panel-doc-empty')).toBeInTheDocument());
  });

  it('refuses an upload with no file before sending anything', async () => {
    await openDrawer();
    await act(async () => {
      fireEvent.click(screen.getByTestId('panel-doc-upload'));
    });
    expect(screen.getByTestId('panel-doc-file-error')).toHaveTextContent('Elige un archivo para subir.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
