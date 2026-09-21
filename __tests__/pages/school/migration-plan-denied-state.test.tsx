// @vitest-environment jsdom
/**
 * pages/school/migration-plan/index.tsx — PROC-11 denied-state render guard.
 *
 * Renders the REAL migration-plan page with the layout chrome, router, Supabase
 * client, toast and recharts (jsdom has no layout) mocked; the plan, completion
 * status and school list come from a stubbed fetch.
 *
 * Covered:
 *  - a pure unassigned consultor whose plan GET is denied (403) sees the
 *    existing error state only: no matrix, no GT/GI cell control, no
 *    saved-state copy, no "Guardar Plan" (D1)
 *  - the same holds when the plan GET throws instead of answering (D1)
 *  - a pure assigned consultor with a successful plan response still reads the
 *    plan and has no usable write action on the loaded state (D2)
 *  - an assigned consultor who toggles a cell and presses "Guardar Plan" hits
 *    the route's consultor write refusal (403 with its access-denied copy): the
 *    error is surfaced and no saved state, success toast or successful write
 *    result occurs (D2)
 *  - admin and equipo_directivo keep the editable surface and the save control,
 *    which becomes usable after a cell toggle (D3)
 *  - an admin whose first school fails to load recovers in the same mount when
 *    the route moves to an authorized school (D3)
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildChainableQuery } from '../../api/assessment-builder/_helpers';

const { routerHolder, mockPush, supabaseHolder, mockToastError, mockToastSuccess, mockToast } = vi.hoisted(() => ({
  routerHolder: { current: null as any },
  mockPush: vi.fn(),
  supabaseHolder: { current: null as any },
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock('next/router', () => ({ useRouter: () => routerHolder.current }));
vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => supabaseHolder.current }));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign((...args: unknown[]) => mockToast(...args), { error: mockToastError, success: mockToastSuccess });
  return { toast, default: toast };
});
vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { ResponsiveContainer: Box, PieChart: Box, Pie: Box, Cell: Box };
});
vi.mock('../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="main-layout">{children}</div>,
}));
vi.mock('../../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ title }: any) => <h1>{title}</h1>,
}));
vi.mock('../../../components/school/ChangeHistorySection', () => ({ default: () => null }));
vi.mock('../../../components/school/CompletionStatusBadge', () => ({ default: () => null }));

import MigrationPlanPage from '../../../pages/school/migration-plan/index';

const SCHOOL_ID = 42;
const OTHER_SCHOOL_ID = 43;
const USER_ID = '22222222-2222-4222-8222-222222222222';

const GRADES = [
  { id: 1, name: 'Medio Menor', sort_order: 1, is_always_gt: true },
  { id: 7, name: 'Tercero Básico', sort_order: 7, is_always_gt: false },
];

type PlanReply = { status: number; body: unknown } | { throws: true };

/** A fresh router object per call: Next gives a new identity when the query changes. */
function setRouter(query: Record<string, string>) {
  routerHolder.current = { push: mockPush, replace: vi.fn(), pathname: '/school/migration-plan', query, isReady: true };
}

function installFetch(plan: PlanReply | ((schoolId: number) => PlanReply), putReply?: { status: number; body: unknown }) {
  const planFor = typeof plan === 'function' ? plan : () => plan;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const json = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body }) as unknown as Response;
    if (url.startsWith('/api/school/migration-plan')) {
      if (init?.method === 'PUT') {
        const reply = putReply ?? { status: 200, body: { entries: [] } };
        return json(reply.body, reply.status);
      }
      const reply = planFor(Number(new URLSearchParams(url.split('?')[1] ?? '').get('school_id')));
      if ('throws' in reply) throw new TypeError('Failed to fetch');
      return json(reply.body, reply.status);
    }
    if (url.startsWith('/api/school/completion-status')) return json({ status: {} });
    if (url.startsWith('/api/school/transversal-context/schools')) return json({ schools: [] });
    return json({});
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const OK_PLAN = { status: 200, body: { grades: GRADES, entries: [], transformation_year: 2 } } as const;

function installSupabase(roles: Array<{ role_type: string; school_id: number | null }>) {
  supabaseHolder.current = {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: USER_ID, email: 'u@example.test' } } } }), signOut: vi.fn() },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return buildChainableQuery({ avatar_url: null });
      if (table === 'user_roles') return buildChainableQuery(roles);
      if (table === 'schools') return buildChainableQuery({ name: 'Escuela Sintética' });
      return buildChainableQuery(null, null);
    }),
  };
}

/** Every element of the plan surface the denied state must not render. */
function expectPlanSurfaceAbsent() {
  expect(screen.queryByText('Matriz de Migración')).toBeNull();
  expect(screen.queryByRole('button', { name: 'GT' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'GI' })).toBeNull();
  expect(screen.queryByText('Todos los cambios guardados')).toBeNull();
  expect(screen.queryByText('Tienes cambios sin guardar')).toBeNull();
  expect(screen.queryByRole('button', { name: /Guardar Plan/ })).toBeNull();
}

const PURE_CONSULTOR = [{ role_type: 'consultor', school_id: null }];
const ASSIGNED_CONSULTOR = [{ role_type: 'consultor', school_id: SCHOOL_ID }];
const ADMIN = [{ role_type: 'admin', school_id: null }];
const DIRECTIVO = [{ role_type: 'equipo_directivo', school_id: SCHOOL_ID }];

describe('migration-plan page denied state (PROC-11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRouter({ school_id: String(SCHOOL_ID) });
  });

  it('D1: renders only the error state when the plan GET is denied for a pure unassigned consultor', async () => {
    installSupabase(PURE_CONSULTOR);
    installFetch({ status: 403, body: { error: 'No tienes acceso a esta escuela' } });

    render(<MigrationPlanPage />);

    expect(await screen.findByText('Acceso Denegado')).toBeInTheDocument();
    expectPlanSurfaceAbsent();
    expect(mockToastError).toHaveBeenCalledWith('No tienes acceso a esta escuela');
  });

  it('D1: renders only the error state when the plan GET throws', async () => {
    installSupabase(PURE_CONSULTOR);
    installFetch({ throws: true });

    render(<MigrationPlanPage />);

    expect(await screen.findByText('Acceso Denegado')).toBeInTheDocument();
    expectPlanSurfaceAbsent();
  });

  it('D2: an assigned consultor still reads the plan and gets no usable write action', async () => {
    installSupabase(ASSIGNED_CONSULTOR);
    installFetch(OK_PLAN);

    render(<MigrationPlanPage />);

    expect(await screen.findByText('Matriz de Migración')).toBeInTheDocument();
    expect(screen.getByText('Tercero Básico')).toBeInTheDocument();
    expect(screen.queryByText('Acceso Denegado')).toBeNull();
    expect(screen.getByRole('button', { name: /Guardar Plan/ })).toBeDisabled();
  });

  it('D2: an assigned consultor who toggles a cell and saves gets the server refusal and no saved state', async () => {
    installSupabase(ASSIGNED_CONSULTOR);
    const fetchMock = installFetch(OK_PLAN, {
      status: 403,
      body: { error: 'Solo directivos y administradores pueden acceder al plan de migración' },
    });

    render(<MigrationPlanPage />);

    expect(await screen.findByText('Matriz de Migración')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: /Guardar Plan/ });
    expect(save).toBeDisabled();

    fireEvent.click(screen.getAllByRole('button', { name: 'GI' })[0]);
    await waitFor(() => expect(save).toBeEnabled());

    fireEvent.click(save);

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Solo directivos y administradores pueden acceder al plan de migración'),
    );
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
    expect(screen.queryByText('Todos los cambios guardados')).toBeNull();
    expect(screen.getByText('Tienes cambios sin guardar')).toBeInTheDocument();
    const puts = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PUT');
    expect(puts).toHaveLength(1);
  });

  it('D3: an admin keeps the editable plan surface and the save control', async () => {
    installSupabase(ADMIN);
    installFetch(OK_PLAN);

    render(<MigrationPlanPage />);

    expect(await screen.findByText('Matriz de Migración')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: /Guardar Plan/ });
    expect(save).toBeDisabled();

    fireEvent.click(screen.getAllByRole('button', { name: 'GI' })[0]);

    await waitFor(() => expect(save).toBeEnabled());
    expect(screen.getByText('Tienes cambios sin guardar')).toBeInTheDocument();
  });

  it('D3: equipo_directivo keeps the editable plan surface and the save control', async () => {
    installSupabase(DIRECTIVO);
    installFetch(OK_PLAN);
    setRouter({});

    render(<MigrationPlanPage />);

    expect(await screen.findByText('Matriz de Migración')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: /Guardar Plan/ });
    expect(save).toBeDisabled();

    fireEvent.click(screen.getAllByRole('button', { name: 'GI' })[0]);

    await waitFor(() => expect(save).toBeEnabled());
  });

  it('D3: an admin on a failed school recovers in the same mount when the route moves to an authorized school', async () => {
    installSupabase(ADMIN);
    installFetch((id) =>
      id === SCHOOL_ID ? { status: 500, body: { error: 'Error al cargar el plan de migración' } } : OK_PLAN,
    );

    const { rerender } = render(<MigrationPlanPage />);

    expect(await screen.findByText('Acceso Denegado')).toBeInTheDocument();
    expectPlanSurfaceAbsent();

    // Same mount, new route: Next hands the page a new router with the new query.
    setRouter({ school_id: String(OTHER_SCHOOL_ID) });
    rerender(<MigrationPlanPage />);

    expect(await screen.findByText('Matriz de Migración')).toBeInTheDocument();
    expect(screen.queryByText('Acceso Denegado')).toBeNull();
    expect(screen.getByText('Tercero Básico')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar Plan/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'GI' }).length).toBeGreaterThan(0);
  });
});
