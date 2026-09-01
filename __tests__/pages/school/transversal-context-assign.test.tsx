// @vitest-environment jsdom
/**
 * pages/school/transversal-context/index.tsx — docente assignment modal
 *
 * PROC-CONTAIN-01 (A-02): a blocking failure from the assign-docente API keeps
 * the modal open and shows the actionable message; warnings on success stay
 * visible and are not relabeled as complete success. Renders the real page.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildChainableQuery } from '../../api/assessment-builder/_helpers';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockRouterPush, mockToastCall, mockToastError, mockToastSuccess, supabaseHolder, routerMock } = vi.hoisted(() => {
  const mockRouterPush = vi.fn();
  return {
    mockRouterPush,
    mockToastCall: vi.fn(),
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn(),
    supabaseHolder: { current: null as any },
    // One stable object, like Next's real router: the page's auth effect depends on it.
    routerMock: {
      push: mockRouterPush,
      replace: vi.fn(),
      pathname: '/school/transversal-context',
      query: {},
      isReady: true,
    },
  };
});

vi.mock('next/router', () => ({
  useRouter: () => routerMock,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => supabaseHolder.current,
}));

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(
    (...args: unknown[]) => mockToastCall(...args),
    { error: mockToastError, success: mockToastSuccess }
  );
  return { toast, default: toast };
});

vi.mock('../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="main-layout">{children}</div>,
}));

vi.mock('../../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  ),
}));

// Import the page AFTER mocks are registered.
import TransversalContextDashboard from '../../../pages/school/transversal-context/index';

// ---------------------------------------------------------------------------
// Fixtures (synthetic)
// ---------------------------------------------------------------------------
const SCHOOL_ID = 42;
const COURSE_ID = 'cs-0001';
const DOCENTE_ID = 'doc-0001';

const context = {
  id: 'ctx-1',
  school_id: SCHOOL_ID,
  total_students: 120,
  grade_levels: ['3_basico'],
  courses_per_level: { '3_basico': 1 },
  implementation_year_2026: 2,
  period_system: 'semestral',
  programa_inicia_completed: false,
  programa_inicia_hours: null,
  updated_at: '2026-03-01T00:00:00Z',
  created_at: '2026-03-01T00:00:00Z',
};

const course = {
  id: COURSE_ID,
  school_id: SCHOOL_ID,
  grade_level: '3_basico',
  course_name: '3° Básico A',
  school_course_docente_assignments: [] as unknown[],
};

type FetchCall = { url: string; init?: RequestInit };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body } as unknown as Response;
}

interface AssignScenario {
  status: number;
  body: Record<string, unknown>;
}

function installFetch(log: FetchCall[], assign: { current: AssignScenario }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    log.push({ url, init });
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.startsWith('/api/school/transversal-context?school_id=')) {
      return jsonResponse({ context, courseStructure: [course] });
    }
    if (url.startsWith('/api/school/transversal-context/questions')) return jsonResponse({ questions: [] });
    if (url.startsWith('/api/school/transversal-context/custom-responses')) return jsonResponse({ responses: [] });
    if (url.startsWith('/api/school/completion-status')) return jsonResponse({ status: {} });
    if (url.startsWith('/api/school/transversal-context/docentes')) {
      return jsonResponse({
        docentes: [{ id: DOCENTE_ID, name: 'Docente Uno', email: 'docente.uno@example.test', roles: ['docente'] }],
      });
    }
    if (url === '/api/school/transversal-context/assign-docente' && method === 'POST') {
      return jsonResponse(assign.current.body, assign.current.status);
    }
    return jsonResponse({});
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function installSupabase() {
  supabaseHolder.current = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'directivo-1', email: 'directivo@example.test' } } },
      }),
      signOut: vi.fn(),
    },
    from: vi.fn((table: string) => {
      if (table === 'user_roles') return buildChainableQuery([{ role_type: 'equipo_directivo', school_id: SCHOOL_ID }]);
      if (table === 'profiles') return buildChainableQuery({ avatar_url: null });
      if (table === 'schools') return buildChainableQuery({ name: 'Escuela Sintética' });
      return buildChainableQuery(null, null);
    }),
  };
}

/** Opens the modal for the fixture course, selects the docente and submits. */
async function openSelectAndSubmit() {
  fireEvent.click(await screen.findByTestId(`open-assign-docente-${COURSE_ID}`));
  const select = await screen.findByTestId('assign-docente-select');
  fireEvent.change(select, { target: { value: DOCENTE_ID } });
  const submit = screen.getByTestId('assign-docente-submit');
  await waitFor(() => expect(submit).not.toBeDisabled());
  fireEvent.click(submit);
}

const assignPosts = (log: FetchCall[]) =>
  log.filter(c => c.url === '/api/school/transversal-context/assign-docente' && c.init?.method === 'POST');

const contextGets = (log: FetchCall[]) =>
  log.filter(c => c.url.startsWith('/api/school/transversal-context?school_id='));

describe('Transversal context — docente assignment modal (PROC-CONTAIN-01 A-02)', () => {
  let fetchLog: FetchCall[];
  const assign = { current: { status: 200, body: {} } as AssignScenario };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchLog = [];
    installFetch(fetchLog, assign);
    installSupabase();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('keeps the modal open and shows the actionable message on a 422 preflight failure', async () => {
    const message =
      'No hay evaluaciones publicadas y vigentes para el nivel "3° Básico" (grade_id 7). Publique un template para este nivel antes de asignar docentes.';
    assign.current = {
      status: 422,
      body: {
        success: false,
        code: 'no_eligible_templates',
        error: message,
        message,
        grade: { id: 7, name: '3° Básico', level: '3_basico' },
        assignment: { created: false, reactivated: false, alreadyActive: false, mutated: false },
        assessments: { created: 0, attached: 0, alreadyExisting: 0, skipped: 0, warnings: [], errors: [message] },
        warnings: [],
      },
    };

    render(<TransversalContextDashboard />);
    await openSelectAndSubmit();

    const errorBox = await screen.findByTestId('assign-docente-error');
    expect(errorBox).toHaveTextContent('No se pudo completar la asignación');
    expect(errorBox).toHaveTextContent('3° Básico');
    expect(errorBox).toHaveTextContent('Publique un template para este nivel');

    // Modal is still open, with the docente still selected for a retry
    expect(screen.getByText('Asignar Docente')).toBeInTheDocument();
    expect(screen.getByTestId('assign-docente-select')).toHaveValue(DOCENTE_ID);
    expect(assignPosts(fetchLog)).toHaveLength(1);
    expect(mockToastError).toHaveBeenCalledWith(message, expect.objectContaining({ duration: 8000 }));
    expect(mockToastSuccess).not.toHaveBeenCalled();
    // No success banner
    expect(screen.queryByTestId('assign-docente-warnings')).toBeNull();
  });

  it('keeps the modal open on a 207 partial failure and refreshes the course list', async () => {
    const message =
      'Docente asignado al curso, pero no se pudo confirmar ninguna evaluación: Template Lectura: Instance created but assignee failed: permission denied';
    assign.current = {
      status: 207,
      body: {
        success: false,
        code: 'assessments_not_confirmed',
        error: message,
        message,
        assignment: { created: true, reactivated: false, alreadyActive: false, mutated: true },
        assessments: { created: 0, attached: 0, alreadyExisting: 0, skipped: 0, warnings: [], errors: ['Template Lectura: Instance created but assignee failed: permission denied'] },
        warnings: [],
      },
    };

    render(<TransversalContextDashboard />);
    const initialContextLoads = (await screen.findByTestId(`open-assign-docente-${COURSE_ID}`), contextGets(fetchLog).length);
    await openSelectAndSubmit();

    const errorBox = await screen.findByTestId('assign-docente-error');
    expect(errorBox).toHaveTextContent('no se pudo confirmar ninguna evaluación');
    expect(screen.getByText('Asignar Docente')).toBeInTheDocument();
    // The assignment row was written, so the list is refreshed to stay truthful
    await waitFor(() => expect(contextGets(fetchLog).length).toBeGreaterThan(initialContextLoads));
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('closes the modal on success but keeps warnings visible without relabeling them as success', async () => {
    const warning =
      'No se encontró plan de migración para el nivel "3° Básico" (grade_id 7) en el año 2. Se usará GT por defecto.';
    const message = 'Docente asignado correctamente. Evaluaciones: 1 creada(s), 0 vinculada(s), 0 ya existente(s).';
    assign.current = {
      status: 200,
      body: {
        success: true,
        message,
        assignment: { created: true, reactivated: false, alreadyActive: false, mutated: true },
        assessments: { created: 1, attached: 0, alreadyExisting: 0, skipped: 0, warnings: [warning], errors: [] },
        warnings: [warning],
        warning,
      },
    };

    render(<TransversalContextDashboard />);
    await openSelectAndSubmit();

    const banner = await screen.findByTestId('assign-docente-warnings');
    expect(banner).toHaveTextContent('Docente asignado con advertencias');
    expect(banner).toHaveTextContent('3° Básico A');
    expect(within(banner).getByText(warning)).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByText('Asignar Docente')).toBeNull());
    expect(screen.queryByTestId('assign-docente-error')).toBeNull();
    // Not reported as complete success
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockToastCall).toHaveBeenCalledWith(
      expect.stringContaining('Hay advertencias que revisar'),
      expect.objectContaining({ icon: '⚠️' })
    );
    expect(mockToastError).not.toHaveBeenCalled();

    // The banner stays until dismissed
    fireEvent.click(screen.getByTestId('assign-docente-warnings-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('assign-docente-warnings')).toBeNull());
  });

  it('reports a clean success with the truthful counts and closes the modal', async () => {
    const message = 'Docente asignado correctamente. Evaluaciones: 2 creada(s), 0 vinculada(s), 1 ya existente(s).';
    assign.current = {
      status: 200,
      body: {
        success: true,
        message,
        assignment: { created: true, reactivated: false, alreadyActive: false, mutated: true },
        assessments: { created: 2, attached: 0, alreadyExisting: 1, skipped: 0, warnings: [], errors: [] },
        warnings: [],
      },
    };

    render(<TransversalContextDashboard />);
    await openSelectAndSubmit();

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith(message));
    await waitFor(() => expect(screen.queryByText('Asignar Docente')).toBeNull());
    expect(screen.queryByTestId('assign-docente-warnings')).toBeNull();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('keeps the modal open when the request itself fails', async () => {
    const failing = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/school/transversal-context/assign-docente' && (init?.method ?? 'GET') === 'POST') {
        throw new Error('Network down');
      }
      return (installFetchDelegate as any)(input, init);
    });
    const installFetchDelegate = globalThis.fetch;
    globalThis.fetch = failing as unknown as typeof fetch;

    render(<TransversalContextDashboard />);
    await openSelectAndSubmit();

    const errorBox = await screen.findByTestId('assign-docente-error');
    expect(errorBox).toHaveTextContent('Network down');
    expect(screen.getByText('Asignar Docente')).toBeInTheDocument();
    expect(mockToastError).toHaveBeenCalledWith('Network down');
  });
});
