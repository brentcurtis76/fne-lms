// @vitest-environment jsdom
/**
 * pages/school/transversal-context/index.tsx — docente assignment modal
 *
 * PROC-CONTAIN-01 (A-02): a blocking failure from the assign-docente API keeps
 * the modal open and shows the actionable message; warnings on success stay
 * visible and are not relabeled as complete success. Renders the real page.
 *
 * PROC-COURSE-OWNER-01 (C-01): the page offers "Asignar" only for a course with
 * zero active assignments; exactly one active assignment is locked (no Asignar,
 * no Desasignar, an es-CL note); more than one active assignment renders an
 * integrity warning and every assignment without singling one out; a stale 409
 * keeps the modal open with the message and refreshes the course list even
 * though nothing was written; no replacement workflow is offered anywhere.
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
const COURSE_ID = '44444444-4444-4444-8444-444444444444';
const DOCENTE_ID = '22222222-2222-4222-8222-222222222222';
const CURRENT_DOCENTE_ID = '33333333-3333-4333-8333-333333333333';
const SECOND_DOCENTE_ID = '55555555-5555-4555-8555-555555555555';
const CURRENT_DOCENTE_NAME = 'Docente Alfa';
const SECOND_DOCENTE_NAME = 'Docente Beta';

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

const activeAssignment = (id: string, docenteId: string, name: string) => ({
  id,
  docente_id: docenteId,
  is_active: true,
  assigned_at: '2026-03-02T00:00:00Z',
  profiles: { id: docenteId, name, email: `${id}@example.test` },
});

const courseWith = (assignments: unknown[]) => ({
  id: COURSE_ID,
  school_id: SCHOOL_ID,
  grade_level: '3_basico',
  course_name: '3° Básico A',
  school_course_docente_assignments: assignments,
});

const ONE_ACTIVE = [activeAssignment('a-cur', CURRENT_DOCENTE_ID, CURRENT_DOCENTE_NAME)];
const TWO_ACTIVE = [
  activeAssignment('a-cur', CURRENT_DOCENTE_ID, CURRENT_DOCENTE_NAME),
  activeAssignment('a-second', SECOND_DOCENTE_ID, SECOND_DOCENTE_NAME),
];

type FetchCall = { url: string; init?: RequestInit };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body } as unknown as Response;
}

interface AssignScenario {
  status: number;
  body: Record<string, unknown>;
  /** Runs when the POST is answered — lets a test change the server-side course state before the refresh. */
  afterPost?: () => void;
}

/** Mutable server-side state: what the context GET returns. */
const courses = { current: [courseWith([])] as unknown[] };

function installFetch(log: FetchCall[], assign: { current: AssignScenario }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    log.push({ url, init });
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.startsWith('/api/school/transversal-context?school_id=')) {
      return jsonResponse({ context, courseStructure: courses.current });
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
      assign.current.afterPost?.();
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

const NOTHING_MUTATED = { created: false, reactivated: false, alreadyActive: false, mutated: false };

function refusal(code: string, message: string, status: number) {
  return { status, body: { success: false, code, error: message, message, assignment: NOTHING_MUTATED } };
}

const ALREADY_ASSIGNED_MESSAGE =
  'Este curso ya tiene un docente activo asignado. El reemplazo de docente requiere un proceso controlado; no es posible asignar otro docente desde aquí.';
const INVARIANT_MESSAGE =
  'Este curso registra más de una asignación activa de docente, lo que no es válido. Se requiere una resolución administrativa controlada antes de poder asignar o cambiar el docente de este curso.';

/** No replacement workflow exists on this page, in any state. */
function expectNoReplacementFlow() {
  expect(screen.queryByText(/cambiar docente/i)).toBeNull();
  expect(screen.queryByText(/reemplazar/i)).toBeNull();
  expect(screen.queryByTitle('Desasignar')).toBeNull();
  expect(screen.queryByText('Desasignar')).toBeNull();
  expect(screen.queryByRole('button', { name: /desasignar/i })).toBeNull();
}

describe('Transversal context — docente assignment (PROC-CONTAIN-01 A-02 · PROC-COURSE-OWNER-01 C-01)', () => {
  let fetchLog: FetchCall[];
  const assign = { current: { status: 200, body: {} } as AssignScenario };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchLog = [];
    courses.current = [courseWith([])];
    assign.current = { status: 200, body: {} };
    installFetch(fetchLog, assign);
    installSupabase();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── C-01: per-course classification ─────────────────────────
  describe('course card by number of ACTIVE assignments (C-01)', () => {
    it('offers "Asignar" only for a course with zero active assignments', async () => {
      render(<TransversalContextDashboard />);

      const button = await screen.findByTestId(`open-assign-docente-${COURSE_ID}`);
      expect(button).toHaveTextContent('Asignar');
      expect(screen.queryByTestId(`course-assignment-locked-${COURSE_ID}`)).toBeNull();
      expect(screen.queryByTestId(`course-assignment-integrity-warning-${COURSE_ID}`)).toBeNull();
      expectNoReplacementFlow();
    });

    it('exactly one active assignment: no "Asignar", no "Desasignar", the assignment stays visible and the locked note is shown', async () => {
      courses.current = [courseWith(ONE_ACTIVE)];
      render(<TransversalContextDashboard />);

      const note = await screen.findByTestId(`course-assignment-locked-${COURSE_ID}`);
      expect(note).toHaveTextContent('ya tiene un docente asignado');
      expect(note).toHaveTextContent('resolución administrativa controlada');

      expect(screen.queryByTestId(`open-assign-docente-${COURSE_ID}`)).toBeNull();
      expect(screen.queryByText('Asignar')).toBeNull();
      expect(screen.getByTestId('course-active-assignment-a-cur')).toHaveTextContent(CURRENT_DOCENTE_NAME);
      expect(screen.queryByTestId(`course-assignment-integrity-warning-${COURSE_ID}`)).toBeNull();
      expectNoReplacementFlow();
    });

    it('more than one active assignment: integrity warning, every assignment visible, no controls', async () => {
      courses.current = [courseWith(TWO_ACTIVE)];
      render(<TransversalContextDashboard />);

      const warning = await screen.findByTestId(`course-assignment-integrity-warning-${COURSE_ID}`);
      expect(warning).toHaveAttribute('role', 'alert');
      expect(warning).toHaveTextContent('Estado de asignación inválido');
      expect(warning).toHaveTextContent('2 docentes activos');
      expect(warning).toHaveTextContent('resolución administrativa controlada');

      expect(screen.getByTestId('course-active-assignment-a-cur')).toHaveTextContent(CURRENT_DOCENTE_NAME);
      expect(screen.getByTestId('course-active-assignment-a-second')).toHaveTextContent(SECOND_DOCENTE_NAME);
      expect(screen.queryByTestId(`open-assign-docente-${COURSE_ID}`)).toBeNull();
      expect(screen.queryByText('Asignar')).toBeNull();
      expect(screen.queryByTestId(`course-assignment-locked-${COURSE_ID}`)).toBeNull();
      expect(within(screen.getByTestId(`course-card-${COURSE_ID}`)).queryAllByRole('button')).toHaveLength(0);
      expectNoReplacementFlow();
    });

    it('the multiple-active display does not select or imply a correct docente', async () => {
      courses.current = [courseWith(TWO_ACTIVE)];
      render(<TransversalContextDashboard />);

      const warning = await screen.findByTestId(`course-assignment-integrity-warning-${COURSE_ID}`);
      // The warning names neither docente
      expect(warning).not.toHaveTextContent(CURRENT_DOCENTE_NAME);
      expect(warning).not.toHaveTextContent(SECOND_DOCENTE_NAME);
      expect(warning).not.toHaveTextContent(CURRENT_DOCENTE_ID);
      expect(warning).not.toHaveTextContent(SECOND_DOCENTE_ID);

      // Both rows render identically: same markup, no marker of preference, in the order returned
      const first = screen.getByTestId('course-active-assignment-a-cur');
      const second = screen.getByTestId('course-active-assignment-a-second');
      expect(first.className).toBe(second.className);
      expect(first.children).toHaveLength(second.children.length);
      expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const card = screen.getByTestId(`course-card-${COURSE_ID}`);
      expect(within(card).queryByText(/principal|titular|correcto|vigente|elegid/i)).toBeNull();
    });
  });

  // ── C-01: stale 409 ─────────────────────────────────────────
  describe('stale 409 from the API (C-01)', () => {
    it('course_already_assigned keeps the modal open with the message and refreshes the course list although nothing was written', async () => {
      assign.current = {
        ...refusal('course_already_assigned', ALREADY_ASSIGNED_MESSAGE, 409),
        // The server already had an active docente the page did not know about
        afterPost: () => { courses.current = [courseWith(ONE_ACTIVE)]; },
      };

      render(<TransversalContextDashboard />);
      const initialContextLoads = (await screen.findByTestId(`open-assign-docente-${COURSE_ID}`), contextGets(fetchLog).length);
      await openSelectAndSubmit();

      const errorBox = await screen.findByTestId('assign-docente-error');
      expect(errorBox).toHaveTextContent('No se pudo completar la asignación');
      expect(errorBox).toHaveTextContent('ya tiene un docente activo asignado');
      expect(errorBox).toHaveTextContent('proceso controlado');
      expect(screen.getByText('Asignar Docente')).toBeInTheDocument(); // modal still open
      expect(mockToastError).toHaveBeenCalledWith(ALREADY_ASSIGNED_MESSAGE, expect.objectContaining({ duration: 8000 }));
      expect(mockToastSuccess).not.toHaveBeenCalled();
      expect(assignPosts(fetchLog)).toHaveLength(1);

      // Refreshed despite assignment.mutated === false …
      expect((assign.current.body as any).assignment.mutated).toBe(false);
      await waitFor(() => expect(contextGets(fetchLog).length).toBeGreaterThan(initialContextLoads));
      // … and the refreshed state locks the course: the stale "Asignar" is gone
      await waitFor(() => expect(screen.getByTestId(`course-assignment-locked-${COURSE_ID}`)).toBeInTheDocument());
      expect(screen.queryByTestId(`open-assign-docente-${COURSE_ID}`)).toBeNull();
      expect(screen.getByTestId('course-active-assignment-a-cur')).toHaveTextContent(CURRENT_DOCENTE_NAME);
      // The message stays visible after the refresh; no replacement flow is opened or suggested
      expect(screen.getByTestId('assign-docente-error')).toHaveTextContent('ya tiene un docente activo asignado');
      expectNoReplacementFlow();
    });

    it('assignment_invariant_violation keeps the modal open with the message and the refreshed list shows the integrity warning', async () => {
      assign.current = {
        ...refusal('assignment_invariant_violation', INVARIANT_MESSAGE, 409),
        afterPost: () => { courses.current = [courseWith(TWO_ACTIVE)]; },
      };

      render(<TransversalContextDashboard />);
      const initialContextLoads = (await screen.findByTestId(`open-assign-docente-${COURSE_ID}`), contextGets(fetchLog).length);
      await openSelectAndSubmit();

      const errorBox = await screen.findByTestId('assign-docente-error');
      expect(errorBox).toHaveTextContent('más de una asignación activa');
      expect(errorBox).toHaveTextContent('resolución administrativa controlada');
      expect(screen.getByText('Asignar Docente')).toBeInTheDocument();
      expect(mockToastError).toHaveBeenCalledWith(INVARIANT_MESSAGE, expect.objectContaining({ duration: 8000 }));

      await waitFor(() => expect(contextGets(fetchLog).length).toBeGreaterThan(initialContextLoads));
      await waitFor(() =>
        expect(screen.getByTestId(`course-assignment-integrity-warning-${COURSE_ID}`)).toBeInTheDocument()
      );
      expect(screen.queryByTestId(`open-assign-docente-${COURSE_ID}`)).toBeNull();
      expect(screen.getByTestId('course-active-assignment-a-cur')).toBeInTheDocument();
      expect(screen.getByTestId('course-active-assignment-a-second')).toBeInTheDocument();
      expect(screen.getByTestId('assign-docente-error')).toHaveTextContent('más de una asignación activa');
      expectNoReplacementFlow();
    });

    it('a 422 docente_not_eligible_for_school keeps the modal open and does NOT refresh (nothing changed server-side)', async () => {
      const message = 'La persona seleccionada no está habilitada como docente activo en esta escuela.';
      assign.current = refusal('docente_not_eligible_for_school', message, 422);

      render(<TransversalContextDashboard />);
      const initialContextLoads = (await screen.findByTestId(`open-assign-docente-${COURSE_ID}`), contextGets(fetchLog).length);
      await openSelectAndSubmit();

      const errorBox = await screen.findByTestId('assign-docente-error');
      expect(errorBox).toHaveTextContent('no está habilitada como docente activo');
      expect(screen.getByText('Asignar Docente')).toBeInTheDocument();
      expect(contextGets(fetchLog).length).toBe(initialContextLoads);
      expect(screen.getByTestId(`open-assign-docente-${COURSE_ID}`)).toBeInTheDocument();
      expectNoReplacementFlow();
    });
  });

  // ── A-02 (unchanged behavior) ────────────────────────────────
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
        assignment: NOTHING_MUTATED,
        assessments: { created: 0, attached: 0, alreadyExisting: 0, skipped: 0, warnings: [], errors: [message] },
        warnings: [],
      },
    };

    render(<TransversalContextDashboard />);
    const initialContextLoads = (await screen.findByTestId(`open-assign-docente-${COURSE_ID}`), contextGets(fetchLog).length);
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
    // No success banner, and no refresh (nothing was written and the state was not stale)
    expect(screen.queryByTestId('assign-docente-warnings')).toBeNull();
    expect(contextGets(fetchLog).length).toBe(initialContextLoads);
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
