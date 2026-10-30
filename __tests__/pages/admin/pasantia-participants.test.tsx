// @vitest-environment jsdom
/**
 * PASANT-PARTICIPANT-INTAKE (FIRST §5, §8) — the ACTUAL admin page,
 * `pages/admin/pasantia-participants.tsx`, with only its chrome and the
 * server-only auth imports stubbed (as `__tests__/pages/admin/pasantia-leads.test.tsx`).
 *
 * The guard: anonymous → /login, non-admin → /dashboard, admin → empty props.
 * The page: the link is shown once, built from the origin and the fragment, and
 * gone from the document once dismissed; a duplicate school offers the existing
 * roster; revoke goes through a confirm dialog.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const { mockGetServerSideUser, mockIsGlobalAdmin, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockGetServerSideUser: vi.fn(),
  mockIsGlobalAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(() => ({})),
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

import PasantiaParticipantsAdminPage, { getServerSideProps } from '../../../pages/admin/pasantia-participants';

const ROSTER = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  cohort: 'enero-2027',
  schoolName: 'Colegio Sintético Tres',
  program: 'inspira',
  programName: 'Pasantía INSPIRA',
  status: 'open',
  version: 1,
  submittedAt: null,
  lastSubmittedAt: null,
  expiresAt: '2099-01-01T00:00:00.000Z',
  revokedAt: null,
  createdAt: '2026-10-27T10:00:00.000Z',
  updatedAt: '2026-10-27T10:00:00.000Z',
  participantCount: 0,
  // F01: not saved by the school yet.
  schoolFunding: null as null | { flightsFunding: string; lodgingFunding: string; version: number },
};
const TOKEN = 'Ad' + 'm1n2T3o4k5'.repeat(4) + '_-y';

type Reply = { status: number; body: unknown };
let replies: Reply[] = [];
const fetchMock = vi.fn();

beforeEach(() => {
  replies = [];
  fetchMock.mockReset();
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

describe('getServerSideProps', () => {
  const ctx = { req: {}, res: {} } as any;

  it('sends an anonymous visitor to /login', async () => {
    mockGetServerSideUser.mockResolvedValue(null);
    expect(await getServerSideProps(ctx)).toEqual({ redirect: { destination: '/login', permanent: false } });
  });

  it('sends a signed-in non-admin to /dashboard', async () => {
    mockGetServerSideUser.mockResolvedValue({ id: 'docente-id' });
    mockIsGlobalAdmin.mockResolvedValue(false);
    expect(await getServerSideProps(ctx)).toEqual({ redirect: { destination: '/dashboard', permanent: false } });
  });

  it('renders for a global admin with empty props', async () => {
    mockGetServerSideUser.mockResolvedValue({ id: 'admin-id' });
    mockIsGlobalAdmin.mockResolvedValue(true);
    expect(await getServerSideProps(ctx)).toEqual({ props: {} });
  });
});

describe('the page', () => {
  async function open(rosters: unknown[] = []) {
    replies.push({ status: 200, body: { rosters, total: rosters.length } });
    render(<PasantiaParticipantsAdminPage />);
    await waitFor(() => expect(screen.getByTestId('intake-admin-total')).toHaveTextContent(`(${rosters.length})`));
  }

  it('creates a roster and shows the link once, then forgets it', async () => {
    await open();
    expect(screen.getByTestId('intake-admin-valid-days')).toHaveValue('90');
    fireEvent.change(screen.getByTestId('intake-admin-school'), { target: { value: 'Colegio Sintético Tres' } });
    fireEvent.change(screen.getByTestId('intake-admin-program'), { target: { value: 'inspira' } });
    replies.push({ status: 201, body: { roster: ROSTER, token: TOKEN } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-admin-create'));
    });

    const url = (await screen.findByTestId('intake-admin-link-url')) as HTMLInputElement;
    expect(url.value).toBe(`${window.location.origin}/pasantias/nomina#k=${TOKEN}`);
    expect(screen.getByTestId('intake-admin-link-panel')).toHaveTextContent('No se volverá a mostrar');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({
      schoolName: 'Colegio Sintético Tres',
      program: 'inspira',
      validDays: 90,
    });
    expect(screen.getByTestId(`intake-admin-roster-${ROSTER.id}`)).toHaveTextContent('Abierta');

    fireEvent.click(screen.getByTestId('intake-admin-link-dismiss'));
    expect(screen.queryByTestId('intake-admin-link-panel')).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(TOKEN);
  });

  it('validates the form before posting', async () => {
    await open();
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-admin-create'));
    });
    expect(screen.getByText('Ingresa el nombre del colegio (entre 2 y 160 caracteres).')).toBeInTheDocument();
    expect(screen.getByText('Elige un programa.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a duplicate school and program offers the existing roster', async () => {
    await open();
    fireEvent.change(screen.getByTestId('intake-admin-school'), { target: { value: 'Colegio Sintético Tres' } });
    fireEvent.change(screen.getByTestId('intake-admin-program'), { target: { value: 'inspira' } });
    replies.push({ status: 409, body: { code: 'ROSTER_EXISTS', error: 'Ya existe una nómina para ese colegio y programa.', rosterId: ROSTER.id } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-admin-create'));
    });
    expect(await screen.findByTestId('intake-admin-create-error')).toHaveTextContent('Ya existe una nómina');
    replies.push({ status: 200, body: { roster: ROSTER, participants: [] } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-admin-create-existing'));
    });
    expect(await screen.findByTestId('intake-admin-detail')).toHaveTextContent('Colegio Sintético Tres');
    expect(fetchMock.mock.calls[2][0]).toBe(`/api/admin/pasantia-participants/${ROSTER.id}`);
  });

  it('labels a reopened roster and a revoked link', async () => {
    await open([
      { ...ROSTER, lastSubmittedAt: '2026-10-26T10:00:00.000Z', revokedAt: '2026-10-27T09:00:00.000Z' },
    ]);
    expect(screen.getByTestId(`intake-admin-status-${ROSTER.id}`)).toHaveTextContent('Reabierta tras envío');
    expect(screen.getByTestId(`intake-admin-link-state-${ROSTER.id}`)).toHaveTextContent('Revocado');
    expect(screen.getByTestId(`intake-admin-revoke-${ROSTER.id}`)).toBeDisabled();
  });

  it('revoke goes through the confirm dialog and sends only the action', async () => {
    await open([ROSTER]);
    fireEvent.click(screen.getByTestId(`intake-admin-revoke-${ROSTER.id}`));
    expect(await screen.findByTestId('intake-admin-confirm')).toHaveTextContent('Revocar el enlace');
    replies.push({ status: 200, body: { roster: { ...ROSTER, revokedAt: '2026-10-27T12:00:00.000Z' } } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-admin-confirm-ok'));
    });
    await waitFor(() =>
      expect(screen.getByTestId(`intake-admin-link-state-${ROSTER.id}`)).toHaveTextContent('Revocado')
    );
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(`/api/admin/pasantia-participants/${ROSTER.id}`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ action: 'revoke' });
  });

  // F01: admins read the school-level funding per roster; never guessed.
  it('shows each roster’s school funding, or "Datos del colegio pendientes"', async () => {
    const saved = {
      ...ROSTER,
      id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      schoolFunding: { flightsFunding: 'sep', lodgingFunding: 'colegio', version: 2 },
    };
    await open([ROSTER, saved]);
    expect(screen.getByTestId(`intake-admin-funding-${ROSTER.id}`)).toHaveTextContent('Datos del colegio pendientes');
    expect(screen.getByTestId(`intake-admin-funding-${saved.id}`)).toHaveTextContent(
      'Pasajes: Costo SEP · Estadía: Costo Colegio'
    );
    replies.push({
      status: 200,
      body: { roster: saved, participants: [{ id: 'p1', version: 1, firstNames: 'Ana', lastNames: 'Sintetica', rut: '12345678-5', passportNumber: null, arrivalDate: null, departureDate: null, focus: 'todos', dietaryRestrictions: [], dietaryOther: null, updatedAt: '', createdAt: '', acknowledgedAt: '', noticeVersion: 'v' }] },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`intake-admin-view-${saved.id}`));
    });
    const detail = await screen.findByTestId('intake-admin-detail');
    expect(screen.getByTestId('intake-admin-detail-school')).toHaveTextContent('Pasajes: Costo SEP · Estadía: Costo Colegio');
    // The participant table no longer has per-person funding columns; Todos shows as such (F04).
    expect(detail).not.toHaveTextContent('Alojamiento');
    expect(screen.getByTestId('intake-admin-participant-p1')).toHaveTextContent('Todos');
  });

  // F02: no star; the required create fields say «Obligatorio» and carry aria-required.
  it('marks required create fields with neutral «Obligatorio» and aria-required, no star', async () => {
    await open();
    expect(document.body.textContent).not.toContain('★');
    expect(screen.getByTestId('intake-admin-school')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByTestId('intake-admin-program')).toHaveAttribute('aria-required', 'true');
    expect(screen.getAllByTestId('intake-required-mark').map((m) => m.textContent)).toEqual(['Obligatorio', 'Obligatorio']);
  });
});
