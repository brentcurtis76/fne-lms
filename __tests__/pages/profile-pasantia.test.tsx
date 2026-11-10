// @vitest-environment jsdom
/**
 * MI PASANTÍA — the ACTUAL page `pages/profile/pasantia.tsx` and the data
 * module behind it (`lib/pasantias/panel/mine.ts`).
 *
 * The page's chrome and the server-only auth imports are stubbed; the data
 * module runs for real against the recording fake client. What matters here:
 * the lookup starts from the session's CONFIRMED email and nothing else, and a
 * traveller is shown their trip without RUT, passport, payments or notes.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { fakePanel, type Answer, type FakePanel, type PanelQuery } from '../lib/pasantias/panel/fake-panel-supabase';

const { mockGetServerSideUser, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockGetServerSideUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="main-layout">{children}</div>,
}));
vi.mock('../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('../../lib/api-auth', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
  getServerSideUser: mockGetServerSideUser,
  loggableError: () => ({}),
}));

import MiPasantiaPage, { getServerSideProps } from '../../pages/profile/pasantia';
import { confirmedEmail, loadMyPasantias, type MyPasantia } from '../../lib/pasantias/panel/mine';

const P1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const R1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const D1 = 'dddddddd-0000-4000-8000-000000000001';
const D2 = 'dddddddd-0000-4000-8000-000000000002';
const EMAIL = 'ana.perez@example.com';
const SECRETS = ['11111111-1', 'ZZ998877', 'nota privada sintética', 'participants/'];

function stored(overrides: { rosterCohortMatches?: boolean } = {}): FakePanel {
  const fake = fakePanel({
    query: (q: PanelQuery): Answer => {
      switch (q.table) {
        case 'pasantias_panel_contacts':
          return { data: q.eq.email === EMAIL ? [{ participant_id: P1 }] : [], error: null };
        case 'pasantias_intake_participants':
          return { data: [{ id: P1, roster_id: R1, first_names: 'Ana', last_names: 'Pérez', created_at: '2026-11-01T12:00:00Z' }], error: null };
        case 'pasantias_panel_logistics':
          return {
            data: [
              {
                participant_id: P1,
                flight_status: 'purchased',
                lodging_status: 'reserved',
                deposit_received: true,
                balance_received: false,
                salutation: 'estimada',
                notes: 'nota privada sintética',
                scl_departure_date: '2027-01-16',
                bcn_arrival_date: '2027-01-17',
                bcn_departure_date: null,
                scl_arrival_date: null,
                letter_sent_at: null,
                letter_sent_to: null,
                letter_send_error: null,
                version: 3,
                updated_at: '2026-11-02T12:00:00Z',
              },
            ],
            error: null,
          };
        case 'pasantias_panel_documents':
          return {
            data: [
              { id: D1, participant_id: P1, kind: 'invitation_letter', file_name: 'Carta Invitación - Ana Pérez.pdf', created_at: '2027-01-09T12:00:00Z' },
              { id: D2, participant_id: P1, kind: 'ticket', file_name: 'Pasaje.pdf', created_at: '2026-12-01T12:00:00Z' },
            ],
            error: null,
          };
        case 'pasantias_intake_rosters':
          return {
            data: overrides.rosterCohortMatches === false ? [] : [{ id: R1, program: 'inspira', school_name: 'Colegio Sintético Uno' }],
            error: null,
          };
        case 'pasantias_panel_roster_details':
          return { data: [{ roster_id: R1, letter_lodging_line: 'la Residencia Sintética, Barcelona.' }], error: null };
        default:
          return { data: null, error: { code: 'UNEXPECTED_TABLE' } };
      }
    },
  });
  mockCreateServiceRoleClient.mockReturnValue(fake.client);
  return fake;
}

const ctx = () => ({ req: {}, res: { setHeader: vi.fn() } }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('confirmedEmail', () => {
  it('is the lower-cased address of a confirmed account, and nothing otherwise', () => {
    expect(confirmedEmail({ email: ' Ana.Perez@Example.com ', email_confirmed_at: '2026-10-01T00:00:00Z' })).toBe(EMAIL);
    expect(confirmedEmail({ email: EMAIL, email_confirmed_at: undefined })).toBeNull();
    expect(confirmedEmail({ email: undefined, email_confirmed_at: '2026-10-01T00:00:00Z' })).toBeNull();
    expect(confirmedEmail(null)).toBeNull();
  });
});

describe('loadMyPasantias', () => {
  it('shows the trip without RUT, passport, payments or notes, and only a ticket or a letter', async () => {
    const fake = stored();
    const result = await loadMyPasantias(fake.client, EMAIL);
    expect(result).toEqual({
      ok: true,
      value: [
        {
          participantId: P1,
          fullName: 'Ana Pérez',
          schoolName: 'Colegio Sintético Uno',
          programName: 'Pasantía INSPIRA',
          programDates: 'entre el 18 y el 28 de enero de 2027',
          flightStatus: 'purchased',
          flightStatusLabel: 'Comprado',
          lodgingStatus: 'reserved',
          lodgingStatusLabel: 'Reservado',
          lodgingLine: 'la Residencia Sintética, Barcelona.',
          sclDepartureDate: '2027-01-16',
          bcnArrivalDate: '2027-01-17',
          bcnDepartureDate: null,
          sclArrivalDate: null,
          documents: [
            { id: D1, kind: 'invitation_letter', fileName: 'Carta Invitación - Ana Pérez.pdf', createdAt: '2027-01-09T12:00:00Z' },
            { id: D2, kind: 'ticket', fileName: 'Pasaje.pdf', createdAt: '2026-12-01T12:00:00Z' },
          ],
        },
      ],
    });
    const text = JSON.stringify(result);
    for (const secret of SECRETS) expect(text).not.toContain(secret);

    // The person row is read without RUT or passport at all.
    const person = fake.queries.find((q) => q.table === 'pasantias_intake_participants')!;
    expect(person.columns).toBe('id, roster_id, first_names, last_names, created_at');
    const documents = fake.queries.find((q) => q.table === 'pasantias_panel_documents')!;
    expect(documents.in).toEqual({ participant_id: [P1], kind: ['ticket', 'invitation_letter'] });
    expect(documents.is).toEqual({ removed_at: null });
    expect(documents.columns).not.toContain('storage_path');
    expect(fake.queries.find((q) => q.table === 'pasantias_intake_rosters')!.eq).toEqual({ cohort: 'enero-2027' });
    expect(fake.writes()).toHaveLength(0);
  });

  it('an email nobody registered reads the contacts table and nothing else', async () => {
    const fake = stored();
    expect(await loadMyPasantias(fake.client, 'otra.persona@example.com')).toEqual({ ok: true, value: [] });
    expect(fake.queries.map((q) => q.table)).toEqual(['pasantias_panel_contacts']);
  });

  it('a traveller of another cohort is not shown', async () => {
    const fake = stored({ rosterCohortMatches: false });
    expect(await loadMyPasantias(fake.client, EMAIL)).toEqual({ ok: true, value: [] });
  });
});

describe('getServerSideProps', () => {
  it('sends an anonymous visitor to /login, to come back here', async () => {
    mockGetServerSideUser.mockResolvedValue(null);
    expect(await getServerSideProps(ctx())).toEqual({
      redirect: { destination: '/login?next=%2Fprofile%2Fpasantia', permanent: false },
    });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('looks the signed-in account up by its own confirmed email and never caches the page', async () => {
    const fake = stored();
    mockGetServerSideUser.mockResolvedValue({ id: 'u1', email: 'Ana.Perez@Example.com', email_confirmed_at: '2026-10-01T00:00:00Z' });
    const context = ctx();
    const result = (await getServerSideProps(context)) as { props: { pasantias: MyPasantia[]; loadFailed: boolean } };
    expect(result.props.loadFailed).toBe(false);
    expect(result.props.pasantias.map((p) => p.participantId)).toEqual([P1]);
    expect(fake.queries[0].eq).toEqual({ email: EMAIL });
    expect(context.res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('an unconfirmed email sees no pasantía and no query runs', async () => {
    stored();
    mockGetServerSideUser.mockResolvedValue({ id: 'u1', email: EMAIL, email_confirmed_at: null });
    expect(await getServerSideProps(ctx())).toEqual({ props: { pasantias: [], loadFailed: false } });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('a failed read says so instead of "you have no pasantía"', async () => {
    mockCreateServiceRoleClient.mockReturnValue(fakePanel({ query: () => ({ data: null, error: { code: 'XX000' } }) }).client);
    mockGetServerSideUser.mockResolvedValue({ id: 'u1', email: EMAIL, email_confirmed_at: '2026-10-01T00:00:00Z' });
    expect(await getServerSideProps(ctx())).toEqual({ props: { pasantias: [], loadFailed: true } });
  });
});

describe('the page', () => {
  const PASANTIA: MyPasantia = {
    participantId: P1,
    fullName: 'Ana Pérez',
    schoolName: 'Colegio Sintético Uno',
    programName: 'Pasantía INSPIRA',
    programDates: 'entre el 18 y el 28 de enero de 2027',
    flightStatus: 'purchased',
    flightStatusLabel: 'Comprado',
    lodgingStatus: 'pending',
    lodgingStatusLabel: 'Pendiente',
    lodgingLine: 'la Residencia Sintética, Barcelona.',
    sclDepartureDate: '2027-01-16',
    bcnArrivalDate: '2027-01-17',
    bcnDepartureDate: null,
    sclArrivalDate: null,
    documents: [{ id: D1, kind: 'invitation_letter', fileName: 'Carta Invitación - Ana Pérez.pdf', createdAt: '2027-01-09T12:00:00Z' }],
  };

  it('shows the program, school, flight dates (or "Por confirmar"), states and lodging', () => {
    render(<MiPasantiaPage pasantias={[PASANTIA]} loadFailed={false} />);
    expect(screen.getByRole('heading', { name: 'Pasantía INSPIRA · Barcelona' })).toBeInTheDocument();
    expect(screen.getByTestId(`mi-pasantia-dates-${P1}`)).toHaveTextContent('entre el 18 y el 28 de enero de 2027');
    expect(screen.getByTestId(`mi-pasantia-school-${P1}`)).toHaveTextContent('Colegio Sintético Uno');
    expect(screen.getByTestId(`mi-pasantia-scl-departure-${P1}`)).toHaveTextContent('16 de enero de 2027');
    expect(screen.getByTestId(`mi-pasantia-bcn-arrival-${P1}`)).toHaveTextContent('17 de enero de 2027');
    expect(screen.getByTestId(`mi-pasantia-bcn-departure-${P1}`)).toHaveTextContent('Por confirmar');
    expect(screen.getByTestId(`mi-pasantia-flight-${P1}`)).toHaveTextContent('Comprado');
    expect(screen.getByTestId(`mi-pasantia-lodging-${P1}`)).toHaveTextContent('Pendiente');
    expect(screen.getByTestId(`mi-pasantia-lodging-line-${P1}`)).toHaveTextContent('Te hospedarás en la Residencia Sintética, Barcelona.');
  });

  it('downloads a document through the traveller route', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ url: 'https://storage.test/signed' }) }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MiPasantiaPage pasantias={[PASANTIA]} loadFailed={false} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId(`mi-pasantia-doc-download-${D1}`));
    });
    expect(fetchMock).toHaveBeenCalledWith(`/api/pasantias/mine/documents/${D1}`, { credentials: 'same-origin' });
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://storage.test/signed'));
  });

  it('a download that fails says so and goes nowhere', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'x' }) })));
    render(<MiPasantiaPage pasantias={[PASANTIA]} loadFailed={false} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId(`mi-pasantia-doc-download-${D1}`));
    });
    expect(screen.getByTestId(`mi-pasantia-error-${P1}`)).toHaveTextContent('No pudimos abrir el documento');
    expect(assign).not.toHaveBeenCalled();
  });

  it('explains an empty state, an empty document list and a failed load in plain words', () => {
    const { unmount } = render(<MiPasantiaPage pasantias={[]} loadFailed={false} />);
    expect(screen.getByTestId('mi-pasantia-empty')).toHaveTextContent('No encontramos una pasantía asociada a tu correo');
    unmount();
    const second = render(<MiPasantiaPage pasantias={[{ ...PASANTIA, documents: [], lodgingLine: null }]} loadFailed={false} />);
    expect(screen.getByTestId(`mi-pasantia-no-documents-${P1}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`mi-pasantia-lodging-line-${P1}`)).toBeNull();
    second.unmount();
    render(<MiPasantiaPage pasantias={[]} loadFailed />);
    expect(screen.getByTestId('mi-pasantia-load-error')).toBeInTheDocument();
    expect(screen.queryByTestId('mi-pasantia-empty')).toBeNull();
  });
});
