// @vitest-environment jsdom
/**
 * "Generar reunión Zoom" in the session scheduler (Z2-2b, plan §8).
 *
 * The real page is rendered, not a mirror of it: the claim under test is that
 * the form the admin actually uses can express managed intent, that it stops
 * demanding a link the platform is about to create, and — the part worth the
 * setup cost — that BOTH request builders carry the flag. `create.tsx` posts to
 * `/api/sessions` from two independent places (draft and schedule), each
 * spreading its own object literal, so a flag added to one of them would leave
 * a form that silently creates unmanaged sessions down the other path.
 *
 * Synthetic schools, consultants and ids only.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockPush, mockGetUserPrimaryRole } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockGetUserPrimaryRole: vi.fn(),
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ push: mockPush, query: {}, asPath: '/admin/sessions/create' }),
}));

vi.mock('../../../../utils/roleUtils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getUserPrimaryRole: mockGetUserPrimaryRole };
});

vi.mock('../../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: () => null,
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const SCHOOL = { id: 7, name: 'Colegio Sintético' };
const COMMUNITY = { id: 'c0111111-1111-4111-8111-111111111111', name: 'CC Sintética', school_id: 7 };
const CONSULTANT = {
  id: 'u-consultor-0001',
  first_name: 'Ana',
  last_name: 'Sintética',
  email: 'ana@example.test',
};

/** Chainable Supabase stub: every builder resolves the table's canned rows. */
function buildSupabase() {
  const rows: Record<string, unknown[]> = {
    schools: [SCHOOL],
    growth_communities: [COMMUNITY],
    contratos: [],
  };

  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'u-admin-0001' }, access_token: 'synthetic-token' } },
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    from: vi.fn((table: string) => {
      const resolved = { data: rows[table] ?? [], error: null };
      const handler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolved);
          }
          return () => new Proxy({}, handler);
        },
      };
      return new Proxy({}, handler);
    }),
  };
}

let supabase = buildSupabase();

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => supabase,
}));

import SessionCreatePage from '../../../../pages/admin/sessions/create';

const mockFetch = vi.fn();

/** The API calls the page makes on mount, plus the create POST. */
function routeFetch(url: string) {
  if (url.startsWith('/api/admin/consultants')) {
    return Promise.resolve({
      ok: true,
      json: async () => ({ data: { consultants: [CONSULTANT] } }),
    });
  }
  if (url.startsWith('/api/hour-types')) {
    return Promise.resolve({ ok: true, json: async () => ({ data: { hour_types: [] } }) });
  }
  return Promise.resolve({
    ok: true,
    json: async () => ({ data: { session: { id: 's-created-0001' } } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase = buildSupabase();
  mockGetUserPrimaryRole.mockResolvedValue('admin');
  mockFetch.mockImplementation((url: string) => routeFetch(url));
  vi.stubGlobal('fetch', mockFetch);
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
  process.env.NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS = 'true';
});

afterEach(() => {
  // Assigning undefined would leave the string "undefined" behind for the next
  // suite in this process (vitest runs threads:false).
  delete process.env.NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS;
  vi.unstubAllGlobals();
});

async function renderForm() {
  render(<SessionCreatePage />);
  await screen.findByText('* Campos obligatorios');
  // The mount effects (auth, schools, hour types) settle after the first paint;
  // flushing them here keeps their setState out of the assertions below.
  await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/hour-types', expect.anything()));
}

function selectModality(mod: 'presencial' | 'online' | 'hibrida') {
  const radio = document.querySelector(`input[name="modality"][value="${mod}"]`);
  fireEvent.click(radio as Element);
}

/** Fill everything `validateForm` insists on for an online session. */
async function fillValidOnlineForm() {
  fireEvent.change(document.querySelector('select[name="school_id"]') as Element, {
    target: { value: String(SCHOOL.id) },
  });
  await waitFor(() => expect(screen.getByText(COMMUNITY.name)).toBeInTheDocument());

  fireEvent.change(document.querySelector('select[name="growth_community_id"]') as Element, {
    target: { value: COMMUNITY.id },
  });
  fireEvent.change(document.querySelector('input[name="title"]') as Element, {
    target: { value: 'Sesión sintética' },
  });
  fireEvent.change(document.querySelector('input[name="session_date"]') as Element, {
    target: { value: '2026-12-01' },
  });

  const consultantSelect = screen.getByText('Agregar consultor...').closest('select');
  fireEvent.change(consultantSelect as Element, { target: { value: CONSULTANT.id } });
  await screen.findByText(`${CONSULTANT.first_name} ${CONSULTANT.last_name}`);

  selectModality('online');
}

/** The body of the single POST to /api/sessions. */
function createdPayload() {
  const call = mockFetch.mock.calls.find(([url]) => url === '/api/sessions');
  expect(call, 'no POST to /api/sessions').toBeTruthy();
  return JSON.parse(call![1].body);
}

describe('scheduler — the "Generar reunión Zoom" box', () => {
  it('is absent for presencial', async () => {
    await renderForm();
    selectModality('presencial');
    expect(screen.queryByTestId('session-zoom-managed')).toBeNull();
  });

  it('appears for online and for híbrida, unchecked', async () => {
    await renderForm();

    selectModality('online');
    expect(screen.getByTestId('session-zoom-managed')).not.toBeChecked();

    selectModality('hibrida');
    expect(screen.getByTestId('session-zoom-managed')).not.toBeChecked();
  });

  it('stays hidden while the client flag is off', async () => {
    delete process.env.NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS;
    await renderForm();

    selectModality('online');
    expect(screen.queryByTestId('session-zoom-managed')).toBeNull();
    // ...and the manual link field is still the only way to set a meeting.
    expect(document.querySelector('input[name="meeting_link"]')).toBeTruthy();
  });

  it('hides the manual link field once it is checked, and explains why', async () => {
    await renderForm();
    selectModality('online');

    expect(document.querySelector('input[name="meeting_link"]')).toBeTruthy();

    fireEvent.click(screen.getByTestId('session-zoom-managed'));

    expect(document.querySelector('input[name="meeting_link"]')).toBeNull();
    expect(screen.getByTestId('session-zoom-managed-help')).toHaveTextContent(
      'GENERA crea la reunión y su enlace cuando se apruebe la sesión.'
    );
  });
});

describe('scheduler — managed intent reaches the API', () => {
  it('submits with no link at all, from the draft builder', async () => {
    await renderForm();
    await fillValidOnlineForm();
    fireEvent.click(screen.getByTestId('session-zoom-managed'));

    fireEvent.click(screen.getByText('Guardar borrador'));

    await waitFor(() =>
      expect(mockFetch.mock.calls.some(([url]) => url === '/api/sessions')).toBe(true)
    );
    const payload = createdPayload();
    expect(payload.is_zoom_managed).toBe(true);
    expect(payload.meeting_link).toBeNull();
    expect(payload.modality).toBe('online');
  });

  it('submits with no link at all, from the schedule builder', async () => {
    await renderForm();
    await fillValidOnlineForm();
    fireEvent.click(screen.getByTestId('session-zoom-managed'));

    fireEvent.click(screen.getByText('Programar sesión'));

    await waitFor(() =>
      expect(mockFetch.mock.calls.some(([url]) => url === '/api/sessions')).toBe(true)
    );
    const payload = createdPayload();
    expect(payload.is_zoom_managed).toBe(true);
    expect(payload.meeting_link).toBeNull();
  });

  it('sends the flag as false from the draft builder when the box is untouched', async () => {
    await renderForm();
    await fillValidOnlineForm();
    fireEvent.change(document.querySelector('input[name="meeting_link"]') as Element, {
      target: { value: 'https://meet.example.test/abc-def' },
    });

    fireEvent.click(screen.getByText('Guardar borrador'));

    await waitFor(() =>
      expect(mockFetch.mock.calls.some(([url]) => url === '/api/sessions')).toBe(true)
    );
    expect(createdPayload().is_zoom_managed).toBe(false);
  });

  it('sends the flag as false from the schedule builder when the box is untouched', async () => {
    await renderForm();
    await fillValidOnlineForm();
    fireEvent.change(document.querySelector('input[name="meeting_link"]') as Element, {
      target: { value: 'https://meet.example.test/abc-def' },
    });

    fireEvent.click(screen.getByText('Programar sesión'));

    await waitFor(() =>
      expect(mockFetch.mock.calls.some(([url]) => url === '/api/sessions')).toBe(true)
    );
    expect(createdPayload().is_zoom_managed).toBe(false);
  });
});

describe('scheduler — switching back to presencial', () => {
  it('clears a checked box so it cannot submit from behind the hidden field', async () => {
    await renderForm();
    await fillValidOnlineForm();
    fireEvent.click(screen.getByTestId('session-zoom-managed'));
    expect(screen.getByTestId('session-zoom-managed')).toBeChecked();

    selectModality('presencial');
    expect(screen.queryByTestId('session-zoom-managed')).toBeNull();

    // location is required for presencial
    fireEvent.change(document.querySelector('input[name="location"]') as Element, {
      target: { value: 'Sala sintética' },
    });
    fireEvent.click(screen.getByText('Guardar borrador'));

    await waitFor(() =>
      expect(mockFetch.mock.calls.some(([url]) => url === '/api/sessions')).toBe(true)
    );
    expect(createdPayload().is_zoom_managed).toBe(false);

    // ...and going back to online leaves it unchecked rather than restoring it.
    selectModality('online');
    expect(screen.getByTestId('session-zoom-managed')).not.toBeChecked();
  });
});
