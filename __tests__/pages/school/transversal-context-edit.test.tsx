// @vitest-environment jsdom
/**
 * pages/school/transversal-context/edit.tsx — review remediation R11.
 *
 * Renders the REAL edit page with the layout chrome, router, Supabase client
 * and toast mocked; questions and the context come from a stubbed fetch.
 *
 * Covered:
 *  - changing the implementation year shows the explicit "existing
 *    evaluations keep their frozen year" warning; restoring it hides it
 *  - the courses-per-level list is sorted without mutating React state
 *    (the grade_levels array sent to the API keeps its selection order)
 *  - a 409 courses_have_dependencies renders history counts (inactive
 *    assignments, archived instances) and the "history is preserved" note
 *  - a consultor is not admitted to the edit page; an admin with the school
 *    in the query is
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildChainableQuery } from '../../api/assessment-builder/_helpers';

const { routerMock, supabaseHolder, mockToastError, mockToastSuccess, mockToast } = vi.hoisted(() => ({
  routerMock: { push: vi.fn(), replace: vi.fn(), pathname: '/school/transversal-context/edit', query: {} as Record<string, string>, isReady: true },
  supabaseHolder: { current: null as any },
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock('next/router', () => ({ useRouter: () => routerMock }));
vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => supabaseHolder.current }));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign((...args: unknown[]) => mockToast(...args), { error: mockToastError, success: mockToastSuccess });
  return { toast, default: toast };
});
vi.mock('../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="main-layout">{children}</div>,
}));
vi.mock('../../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ title }: any) => <h1>{title}</h1>,
}));
vi.mock('../../../components/tutorials/HelpButton', () => ({ default: () => null }));

import TransversalContextEdit from '../../../pages/school/transversal-context/edit';

const SCHOOL_ID = 42;
const USER_ID = '11111111-1111-4111-8111-111111111111';

const QUESTIONS = [
  { id: 'q-students', question_key: 'total_students', question_text: 'Total de estudiantes', widget_type: 'total_students', is_active: true, display_order: 1 },
  { id: 'q-levels', question_key: 'grade_levels', question_text: 'Niveles', widget_type: 'grade_levels', is_active: true, display_order: 2 },
  { id: 'q-courses', question_key: 'courses_per_level', question_text: 'Cursos por nivel', widget_type: 'courses_per_level', is_active: true, display_order: 3 },
  { id: 'q-year', question_key: 'implementation_year', question_text: 'Año de implementación', widget_type: 'implementation_year', is_active: true, display_order: 4 },
  { id: 'q-period', question_key: 'period_system', question_text: 'Sistema de períodos', widget_type: 'period_system', is_active: true, display_order: 5 },
];

const savedContext = () => ({
  id: 'ctx-1',
  school_id: SCHOOL_ID,
  total_students: 120,
  // Deliberately NOT in grade order: the page must display sorted without reordering this array.
  grade_levels: ['3_basico', '1_basico', 'kinder'],
  courses_per_level: { '3_basico': 2, '1_basico': 1, kinder: 1 },
  implementation_year_2026: 2,
  period_system: 'semestral',
  programa_inicia_completed: false,
});

type PostReply = { status: number; body: unknown };

function installFetch(opts: { context?: unknown; post?: PostReply }) {
  const posts: any[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    const json = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body }) as unknown as Response;
    if (url.startsWith('/api/school/transversal-context/questions')) return json({ questions: QUESTIONS });
    if (url.startsWith('/api/school/transversal-context/custom-responses')) return json({ responses: [] });
    if (url.startsWith('/api/school/transversal-context') && method === 'GET') return json({ success: true, context: opts.context ?? null, courseStructure: [] });
    if (url === '/api/school/transversal-context' && method === 'POST') {
      posts.push(JSON.parse(String(init?.body)));
      const reply = opts.post ?? { status: 200, body: { success: true, context: opts.context, message: 'ok', coursesGenerated: 0, coursesDeleted: 0, warning: null } };
      return json(reply.body, reply.status);
    }
    return json({});
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { fetchMock, posts };
}

function installSupabase(roles: Array<{ role_type: string; school_id: number | null }>) {
  supabaseHolder.current = {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: USER_ID, email: 'd@example.test' } } } }), signOut: vi.fn() },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return buildChainableQuery({ avatar_url: null });
      if (table === 'user_roles') return buildChainableQuery(roles);
      if (table === 'schools') return buildChainableQuery({ name: 'Escuela Sintética' });
      return buildChainableQuery(null, null);
    }),
  };
}

const DIRECTIVO = [{ role_type: 'equipo_directivo', school_id: SCHOOL_ID }];

describe('transversal-context edit page (R11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerMock.query = {};
  });

  it('warns explicitly when the implementation year changes and hides the warning when it is restored', async () => {
    installSupabase(DIRECTIVO);
    installFetch({ context: savedContext() });
    render(<TransversalContextEdit />);

    await screen.findByText('Año de implementación');
    expect(screen.queryByTestId('context-year-change-warning')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Año 4' }));
    const warning = await screen.findByTestId('context-year-change-warning');
    expect(warning).toHaveAttribute('role', 'alert');
    expect(warning).toHaveTextContent('de 2 a 4');
    expect(warning).toHaveTextContent('conservan el año con el que fueron generadas');
    expect(warning).toHaveTextContent('no se reescriben');

    fireEvent.click(screen.getByRole('button', { name: 'Año 2' }));
    await waitFor(() => expect(screen.queryByTestId('context-year-change-warning')).toBeNull());
  });

  it('shows no year warning on a first save (no saved context yet)', async () => {
    installSupabase(DIRECTIVO);
    installFetch({ context: null });
    render(<TransversalContextEdit />);
    await screen.findByText('Año de implementación');
    fireEvent.click(screen.getByRole('button', { name: 'Año 3' }));
    expect(screen.queryByTestId('context-year-change-warning')).toBeNull();
  });

  it('displays the courses-per-level rows in grade order WITHOUT mutating the selected grade_levels array', async () => {
    installSupabase(DIRECTIVO);
    const { posts } = installFetch({ context: savedContext() });
    render(<TransversalContextEdit />);

    await screen.findByText('Cursos por nivel');
    const section = screen.getByText('Cursos por nivel').closest('div') as HTMLElement;
    const labels = within(section).getAllByText(/^(Kinder|1° Básico|3° Básico)$/).map(el => el.textContent);
    expect(labels).toEqual(['Kinder', '1° Básico', '3° Básico']);

    fireEvent.click(screen.getByTestId('context-submit'));
    await waitFor(() => expect(posts).toHaveLength(1));
    // The state array kept its original (unsorted) order: the render sorted a copy.
    expect(posts[0].grade_levels).toEqual(['3_basico', '1_basico', 'kinder']);
  });

  it('renders the history counts of blocked courses on 409 courses_have_dependencies and says history is preserved', async () => {
    installSupabase(DIRECTIVO);
    installFetch({
      context: savedContext(),
      post: {
        status: 409,
        body: {
          success: false,
          code: 'courses_have_dependencies',
          error: 'No se guardó el contexto: 3 BASICO B',
          blockedCourses: [
            { id: 'c-b', course_name: '3 BASICO B', grade_level: '3_basico', activeAssignments: 0, inactiveAssignments: 1, instances: 0, archivedInstances: 2 },
          ],
        },
      },
    });
    render(<TransversalContextEdit />);
    await screen.findByText('Cursos por nivel');

    fireEvent.click(screen.getByTestId('context-submit'));
    const alert = await screen.findByTestId('context-blocked-courses');
    expect(alert).toHaveTextContent('3 BASICO B');
    expect(alert).toHaveTextContent('0 docentes asignados (1 en el historial)');
    expect(alert).toHaveTextContent('0 evaluaciones activas (2 archivadas)');
    expect(alert).toHaveTextContent('incluido el archivado');
    expect(alert).toHaveTextContent('se conserva');
    expect(mockToastError).toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('a successful save with a year change surfaces the API warning as information, not as an error', async () => {
    installSupabase(DIRECTIVO);
    installFetch({
      context: savedContext(),
      post: { status: 200, body: { success: true, context: savedContext(), message: 'Contexto actualizado exitosamente', coursesGenerated: 0, coursesDeleted: 0, yearChanged: true, warning: 'El año de transformación cambió. Las evaluaciones ya creadas conservan el año.' } },
    });
    render(<TransversalContextEdit />);
    await screen.findByText('Año de implementación');
    fireEvent.click(screen.getByRole('button', { name: 'Año 4' }));
    fireEvent.click(screen.getByTestId('context-submit'));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Contexto actualizado exitosamente'));
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('conservan el año'), expect.objectContaining({ duration: 8000 }));
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('admits an admin with the school in the query and refuses a consultor', async () => {
    installSupabase([{ role_type: 'admin', school_id: null }]);
    routerMock.query = { school_id: String(SCHOOL_ID) };
    installFetch({ context: savedContext() });
    const { unmount } = render(<TransversalContextEdit />);
    await screen.findByText('Año de implementación');
    unmount();

    installSupabase([{ role_type: 'consultor', school_id: null }]);
    const { fetchMock } = installFetch({ context: savedContext() });
    render(<TransversalContextEdit />);
    await screen.findByText(/Acceso Denegado/i);
    expect(screen.queryByText('Año de implementación')).toBeNull();
    expect(fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/school/transversal-context?'))).toHaveLength(0);
  });

  // ── Codex round 1 (finding 6): admin authority takes precedence over equipo_directivo ─
  describe('mixed-role admin (admin + equipo_directivo)', () => {
    const OTHER_SCHOOL_ID = 77;
    const MIXED = [
      { role_type: 'equipo_directivo', school_id: OTHER_SCHOOL_ID },
      { role_type: 'admin', school_id: null },
    ];

    it('edits the school named in the query even though it is not the directivo school', async () => {
      installSupabase(MIXED);
      routerMock.query = { school_id: String(SCHOOL_ID) };
      const { fetchMock, posts } = installFetch({ context: savedContext() });
      render(<TransversalContextEdit />);

      await screen.findByText('Año de implementación');
      expect(fetchMock.mock.calls.map(([u]) => String(u)).filter(u => u.startsWith('/api/school/transversal-context?'))).toEqual([
        `/api/school/transversal-context?school_id=${SCHOOL_ID}`,
      ]);
      expect(routerMock.push).not.toHaveBeenCalledWith('/dashboard');

      // The save carries the ADMIN-selected school, not the directivo one.
      fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0].school_id).toBe(SCHOOL_ID);
      routerMock.query = {};
    });

    it('without a school_id falls back to the directivo school rather than stranding the admin', async () => {
      installSupabase(MIXED);
      routerMock.query = {};
      const { fetchMock } = installFetch({ context: { ...savedContext(), school_id: OTHER_SCHOOL_ID } });
      render(<TransversalContextEdit />);

      await screen.findByText('Año de implementación');
      expect(fetchMock.mock.calls.map(([u]) => String(u)).filter(u => u.startsWith('/api/school/transversal-context?'))).toEqual([
        `/api/school/transversal-context?school_id=${OTHER_SCHOOL_ID}`,
      ]);
    });

    it('control: a plain directivo ignores a foreign school_id and edits their own school', async () => {
      installSupabase(DIRECTIVO);
      routerMock.query = { school_id: String(OTHER_SCHOOL_ID) };
      const { fetchMock } = installFetch({ context: savedContext() });
      render(<TransversalContextEdit />);

      await screen.findByText('Año de implementación');
      expect(fetchMock.mock.calls.map(([u]) => String(u)).filter(u => u.startsWith('/api/school/transversal-context?'))).toEqual([
        `/api/school/transversal-context?school_id=${SCHOOL_ID}`,
      ]);
      routerMock.query = {};
    });
  });
});
