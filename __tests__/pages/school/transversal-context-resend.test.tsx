// @vitest-environment jsdom
/**
 * pages/school/transversal-context/index.tsx — «Reenviar registros» (GC-3d).
 * Renders the real page (set up like transversal-context-replace.test.tsx).
 *
 * Proves: on a course with exactly one active teacher, an Equipo Directivo
 * and an admin see «Reenviar registros»; pressing it posts the course and its
 * CURRENT teacher to /assign-docente (which only brings the registros up to
 * date for the current teacher); the answer is shown as a toast and the
 * course list is refreshed in every case; the button is disabled while its
 * request is in flight; a read-only consultor, a course without a teacher and
 * a course with two active teachers get no such button. Synthetic data only.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildChainableQuery } from '../../api/assessment-builder/_helpers';

const { mockToastCall, mockToastError, mockToastSuccess, supabaseHolder, routerMock } = vi.hoisted(() => ({
  mockToastCall: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  supabaseHolder: { current: null as any },
  routerMock: {
    push: vi.fn(),
    replace: vi.fn(),
    pathname: '/school/transversal-context',
    query: {} as Record<string, string>,
    isReady: true,
  },
}));

vi.mock('next/router', () => ({ useRouter: () => routerMock }));
vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => supabaseHolder.current }));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign((...args: unknown[]) => mockToastCall(...args), { error: mockToastError, success: mockToastSuccess });
  return { toast, default: toast };
});
vi.mock('../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="main-layout">{children}</div>,
}));
vi.mock('../../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ title }: { title: string }) => <div data-testid="page-header"><h1>{title}</h1></div>,
}));

import TransversalContextDashboard from '../../../pages/school/transversal-context/index';

const SCHOOL_ID = 42;
const LOCKED_COURSE = '44444444-4444-4444-8444-444444444441';
const EMPTY_COURSE = '44444444-4444-4444-8444-444444444442';
const CONFLICT_COURSE = '44444444-4444-4444-8444-444444444443';
const CURRENT_DOCENTE_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_DOCENTE_ID = '22222222-2222-4222-8222-222222222222';
const ASSIGN_URL = '/api/school/transversal-context/assign-docente';

const context = {
  id: 'ctx-1', school_id: SCHOOL_ID, total_students: 120, grade_levels: ['3_basico'],
  courses_per_level: { '3_basico': 3 }, implementation_year_2026: 2, period_system: 'semestral',
  programa_inicia_completed: false, programa_inicia_hours: null,
  updated_at: '2026-03-01T00:00:00Z', created_at: '2026-03-01T00:00:00Z',
};

const active = (id: string, docenteId: string, name: string) => ({
  id, docente_id: docenteId, is_active: true, assigned_at: '2026-03-02T00:00:00Z',
  profiles: { id: docenteId, name, email: `${id}@example.test` },
});
const course = (id: string, name: string, assignments: unknown[]) => ({
  id, school_id: SCHOOL_ID, grade_level: '3_basico', course_name: name, school_course_docente_assignments: assignments,
});
const COURSES = [
  course(LOCKED_COURSE, '3° Básico A', [active('a-1', CURRENT_DOCENTE_ID, 'Docente Alfa')]),
  course(EMPTY_COURSE, '3° Básico B', []),
  course(CONFLICT_COURSE, '3° Básico C', [active('a-2', CURRENT_DOCENTE_ID, 'Docente Alfa'), active('a-3', OTHER_DOCENTE_ID, 'Docente Beta')]),
];

type FetchCall = { url: string; init?: RequestInit };
type AssignAnswer = () => Promise<Response>;

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body } as unknown as Response;
}

function installFetch(log: FetchCall[], assign: { current: AssignAnswer }) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    log.push({ url, init });
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.startsWith('/api/school/transversal-context?school_id=')) return jsonResponse({ context, courseStructure: COURSES });
    if (url.startsWith('/api/school/transversal-context/questions')) return jsonResponse({ questions: [] });
    if (url.startsWith('/api/school/transversal-context/custom-responses')) return jsonResponse({ responses: [] });
    if (url.startsWith('/api/school/completion-status')) return jsonResponse({ status: {} });
    if (url === ASSIGN_URL && method === 'POST') return assign.current();
    return jsonResponse({});
  }) as unknown as typeof fetch;
}

type RoleRow = { role_type: string; school_id: number | null };
function installSupabase(roles: RoleRow[]) {
  supabaseHolder.current = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1', email: 'user@example.test' } } } }),
      signOut: vi.fn(),
    },
    from: vi.fn((table: string) => {
      if (table === 'user_roles') return buildChainableQuery(roles);
      if (table === 'profiles') return buildChainableQuery({ avatar_url: null });
      if (table === 'schools') return buildChainableQuery({ name: 'Escuela Sintética' });
      return buildChainableQuery(null, null);
    }),
  };
}

const assignPosts = (log: FetchCall[]) => log.filter(c => c.url === ASSIGN_URL && c.init?.method === 'POST');
const contextGets = (log: FetchCall[]) => log.filter(c => c.url.startsWith('/api/school/transversal-context?school_id='));
const OK_MESSAGE = 'Registros actualizados para el docente actual.';

describe('Transversal context — «Reenviar registros» (GC-3d)', () => {
  let fetchLog: FetchCall[];
  const assign = { current: (async () => jsonResponse({ success: true, message: OK_MESSAGE })) as AssignAnswer };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchLog = [];
    assign.current = async () => jsonResponse({ success: true, message: OK_MESSAGE });
    routerMock.query = {};
    installFetch(fetchLog, assign);
    installSupabase([{ role_type: 'equipo_directivo', school_id: SCHOOL_ID }]);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    routerMock.query = {};
  });

  it('an Equipo Directivo sees it on the course with one teacher only, and it posts that course and its current teacher', async () => {
    render(<TransversalContextDashboard />);
    const button = await screen.findByTestId(`resend-registros-${LOCKED_COURSE}`);
    expect(button).toHaveTextContent('Reenviar registros');
    expect(screen.queryByTestId(`resend-registros-${EMPTY_COURSE}`)).toBeNull();
    expect(screen.queryByTestId(`resend-registros-${CONFLICT_COURSE}`)).toBeNull();
    // Same condition as «Cambiar docente».
    expect(screen.getByTestId(`open-replace-docente-${LOCKED_COURSE}`)).toBeInTheDocument();

    const before = contextGets(fetchLog).length;
    fireEvent.click(button);
    await waitFor(() => expect(assignPosts(fetchLog)).toHaveLength(1));
    expect(JSON.parse(String(assignPosts(fetchLog)[0].init?.body))).toEqual({
      course_structure_id: LOCKED_COURSE,
      docente_id: CURRENT_DOCENTE_ID,
    });
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith(OK_MESSAGE));
    await waitFor(() => expect(contextGets(fetchLog).length).toBeGreaterThan(before));
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('an admin (with the school in the query) sees it', async () => {
    installSupabase([{ role_type: 'admin', school_id: null }]);
    routerMock.query = { school_id: String(SCHOOL_ID) };
    render(<TransversalContextDashboard />);
    expect(await screen.findByTestId(`resend-registros-${LOCKED_COURSE}`)).toHaveTextContent('Reenviar registros');
    expect(screen.queryByTestId(`resend-registros-${EMPTY_COURSE}`)).toBeNull();
    expect(screen.queryByTestId(`resend-registros-${CONFLICT_COURSE}`)).toBeNull();
  });

  it('a read-only consultor sees no such button', async () => {
    installSupabase([{ role_type: 'consultor', school_id: null }]);
    routerMock.query = { school_id: String(SCHOOL_ID) };
    render(<TransversalContextDashboard />);
    await screen.findByTestId('consultor-read-only-notice');
    expect(await screen.findByTestId(`course-assignment-locked-${LOCKED_COURSE}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`resend-registros-${LOCKED_COURSE}`)).toBeNull();
    expect(screen.queryByRole('button', { name: /reenviar registros/i })).toBeNull();
  });

  it('is disabled while its request is in flight', async () => {
    let finish: (r: Response) => void = () => {};
    assign.current = () => new Promise<Response>((resolve) => { finish = resolve; });
    render(<TransversalContextDashboard />);
    const button = await screen.findByTestId(`resend-registros-${LOCKED_COURSE}`);
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    finish(jsonResponse({ success: true, message: OK_MESSAGE }));
    await waitFor(() => expect(screen.getByTestId(`resend-registros-${LOCKED_COURSE}`)).not.toBeDisabled());
  });

  it('a refusal shows the route message as an error and refreshes', async () => {
    assign.current = async () => jsonResponse({ success: false, error: 'No tiene permiso para asignar docentes.' }, 403);
    render(<TransversalContextDashboard />);
    const button = await screen.findByTestId(`resend-registros-${LOCKED_COURSE}`);
    const before = contextGets(fetchLog).length;
    fireEvent.click(button);
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('No tiene permiso para asignar docentes.', { duration: 8000 })
    );
    await waitFor(() => expect(contextGets(fetchLog).length).toBeGreaterThan(before));
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('an answer without success true and without a message uses the fallback', async () => {
    assign.current = async () => jsonResponse({}, 200);
    render(<TransversalContextDashboard />);
    fireEvent.click(await screen.findByTestId(`resend-registros-${LOCKED_COURSE}`));
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('No se pudieron reenviar los registros', { duration: 8000 })
    );
  });

  it('a failed request shows the fixed error and refreshes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    assign.current = async () => { throw new Error('network down'); };
    render(<TransversalContextDashboard />);
    const button = await screen.findByTestId(`resend-registros-${LOCKED_COURSE}`);
    const before = contextGets(fetchLog).length;
    fireEvent.click(button);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('No se pudieron reenviar los registros'));
    await waitFor(() => expect(contextGets(fetchLog).length).toBeGreaterThan(before));
  });
});
