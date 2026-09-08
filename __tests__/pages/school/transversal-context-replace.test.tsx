// @vitest-environment jsdom
/**
 * pages/school/transversal-context/index.tsx — docente REPLACEMENT modal
 * (PR 2 item 2, safe docente replacement). Renders the real page.
 *
 * Proves: the "Cambiar docente" control on a locked card opens a modal that
 * names the current docente, explains in es-CL that replacement is only
 * possible while the evaluation has not started and that answers are never
 * transferred, and excludes the current docente from the candidates; submit
 * posts { course_structure_id, docente_id } to /replace-docente; a 409
 * evaluation_started keeps the modal open with the explanation inline and
 * does not refresh; a stale 409 (no_active_assignment) keeps the modal open
 * and refreshes; success closes the modal, refreshes the course list and
 * shows the success notice; a consultor never sees the control.
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
    routerMock: {
      push: mockRouterPush,
      replace: vi.fn(),
      pathname: '/school/transversal-context',
      query: {} as Record<string, string>,
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

import TransversalContextDashboard from '../../../pages/school/transversal-context/index';

// ---------------------------------------------------------------------------
// Fixtures (synthetic)
// ---------------------------------------------------------------------------
const SCHOOL_ID = 42;
const COURSE_ID = '44444444-4444-4444-8444-444444444444';
const NEW_DOCENTE_ID = '22222222-2222-4222-8222-222222222222';
const CURRENT_DOCENTE_ID = '33333333-3333-4333-8333-333333333333';
const CURRENT_DOCENTE_NAME = 'Docente Alfa';
const NEW_DOCENTE_NAME = 'Docente Nuevo';
const REPLACE_URL = '/api/school/transversal-context/replace-docente';

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

const CURRENT_ACTIVE = [activeAssignment('a-cur', CURRENT_DOCENTE_ID, CURRENT_DOCENTE_NAME)];
const NEW_ACTIVE = [activeAssignment('a-new', NEW_DOCENTE_ID, NEW_DOCENTE_NAME)];

type FetchCall = { url: string; init?: RequestInit };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body } as unknown as Response;
}

interface ReplaceScenario {
  status: number;
  body: Record<string, unknown>;
  afterPost?: () => void;
}

const courses = { current: [courseWith(CURRENT_ACTIVE)] as unknown[] };

function installFetch(log: FetchCall[], replace: { current: ReplaceScenario }) {
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
      // The docentes endpoint lists EVERY docente of the school, including the current one.
      return jsonResponse({
        docentes: [
          { id: CURRENT_DOCENTE_ID, name: CURRENT_DOCENTE_NAME, email: 'alfa@example.test', roles: ['docente'] },
          { id: NEW_DOCENTE_ID, name: NEW_DOCENTE_NAME, email: 'nuevo@example.test', roles: ['docente'] },
        ],
      });
    }
    if (url === REPLACE_URL && method === 'POST') {
      replace.current.afterPost?.();
      return jsonResponse(replace.current.body, replace.current.status);
    }
    return jsonResponse({});
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

type RoleRow = { role_type: string; school_id: number | null };
const DIRECTIVO_ROLES: RoleRow[] = [{ role_type: 'equipo_directivo', school_id: SCHOOL_ID }];

function installSupabase(roles: RoleRow[] = DIRECTIVO_ROLES) {
  supabaseHolder.current = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'directivo-1', email: 'directivo@example.test' } } },
      }),
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

async function openReplaceModal() {
  fireEvent.click(await screen.findByTestId(`open-replace-docente-${COURSE_ID}`));
  return screen.findByTestId('replace-docente-select');
}

async function openSelectAndSubmit() {
  const select = await openReplaceModal();
  fireEvent.change(select, { target: { value: NEW_DOCENTE_ID } });
  const submit = screen.getByTestId('replace-docente-submit');
  await waitFor(() => expect(submit).not.toBeDisabled());
  fireEvent.click(submit);
}

const replacePosts = (log: FetchCall[]) => log.filter(c => c.url === REPLACE_URL && c.init?.method === 'POST');
const contextGets = (log: FetchCall[]) => log.filter(c => c.url.startsWith('/api/school/transversal-context?school_id='));
const NOTHING_REPLACED = { previousDocenteId: null, newDocenteId: null, instancesReattached: 0 };

function refusal(code: string, message: string, status: number, extra: Record<string, unknown> = {}): ReplaceScenario {
  return { status, body: { success: false, code, error: message, message, replacement: NOTHING_REPLACED, ...extra } };
}

const EVALUATION_STARTED_MESSAGE =
  'La evaluación de este curso ya comenzó o registra respuestas, por lo que no es posible cambiar el docente desde aquí. ' +
  'Se requiere una resolución administrativa; las respuestas del docente anterior nunca se transfieren.';
const NO_ACTIVE_MESSAGE = 'Este curso no tiene un docente activo asignado; use "Asignar" en lugar de cambiar el docente.';
const SUCCESS_MESSAGE =
  'Docente cambiado correctamente. 2 evaluación(es) pendiente(s) reasignada(s) al nuevo docente; ninguna respuesta fue transferida.';

describe('Transversal context — docente replacement modal (PR 2 item 2)', () => {
  let fetchLog: FetchCall[];
  const replace = { current: { status: 200, body: {} } as ReplaceScenario };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchLog = [];
    courses.current = [courseWith(CURRENT_ACTIVE)];
    replace.current = { status: 200, body: {} };
    routerMock.query = {};
    installFetch(fetchLog, replace);
    installSupabase();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    routerMock.query = {};
  });

  it('opens from the locked card, names the current docente, explains the rule and excludes the current docente from the candidates', async () => {
    render(<TransversalContextDashboard />);
    const select = await openReplaceModal();

    expect(screen.getByRole('heading', { name: 'Cambiar Docente' })).toBeInTheDocument();
    expect(screen.getByTestId('replace-docente-current')).toHaveTextContent(`Docente actual: ${CURRENT_DOCENTE_NAME}`);
    expect(screen.getByText(/mientras la evaluación del curso no haya comenzado/i)).toBeInTheDocument();
    expect(screen.getByText(/las respuestas nunca se transfieren/i)).toBeInTheDocument();

    const options = within(select).getAllByRole('option').map(o => (o as HTMLOptionElement).value);
    expect(options).toEqual(['', NEW_DOCENTE_ID]);
    expect(within(select).queryByText(CURRENT_DOCENTE_NAME)).toBeNull();

    expect(screen.getByTestId('replace-docente-submit')).toBeDisabled();
    expect(screen.getByTestId('replace-docente-cancel')).toBeInTheDocument();
    expect(replacePosts(fetchLog)).toHaveLength(0);
  });

  it('cancel closes the modal without posting', async () => {
    render(<TransversalContextDashboard />);
    await openReplaceModal();
    fireEvent.click(screen.getByTestId('replace-docente-cancel'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Cambiar Docente' })).toBeNull());
    expect(replacePosts(fetchLog)).toHaveLength(0);
  });

  it('posts { course_structure_id, docente_id } to /replace-docente', async () => {
    replace.current = {
      status: 200,
      body: {
        success: true,
        code: 'docente_replaced',
        message: SUCCESS_MESSAGE,
        replacement: { previousDocenteId: CURRENT_DOCENTE_ID, newDocenteId: NEW_DOCENTE_ID, instancesReattached: 2 },
      },
      afterPost: () => { courses.current = [courseWith(NEW_ACTIVE)]; },
    };

    render(<TransversalContextDashboard />);
    await openSelectAndSubmit();

    await waitFor(() => expect(replacePosts(fetchLog)).toHaveLength(1));
    const post = replacePosts(fetchLog)[0];
    expect(post.init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(post.init?.body))).toEqual({
      course_structure_id: COURSE_ID,
      docente_id: NEW_DOCENTE_ID,
    });
  });

  it('409 evaluation_started: shows the explanation inline, keeps the modal open and does not refresh', async () => {
    replace.current = refusal('evaluation_started', EVALUATION_STARTED_MESSAGE, 409, {
      counts: { instancesStarted: 1, instancesWithResponses: 0 },
    });

    render(<TransversalContextDashboard />);
    const initialContextLoads = (await screen.findByTestId(`open-replace-docente-${COURSE_ID}`), contextGets(fetchLog).length);
    await openSelectAndSubmit();

    const errorBox = await screen.findByTestId('replace-docente-error');
    expect(errorBox).toHaveAttribute('role', 'alert');
    expect(errorBox).toHaveTextContent('La evaluación ya comenzó');
    expect(errorBox).toHaveTextContent('ya comenzó o registra respuestas');
    expect(errorBox).toHaveTextContent('nunca se transfieren');
    expect(screen.getByRole('heading', { name: 'Cambiar Docente' })).toBeInTheDocument(); // modal still open
    expect(mockToastError).toHaveBeenCalledWith(EVALUATION_STARTED_MESSAGE, expect.objectContaining({ duration: 8000 }));
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(screen.queryByTestId('replace-docente-success')).toBeNull();
    expect(replacePosts(fetchLog)).toHaveLength(1);
    expect(contextGets(fetchLog).length).toBe(initialContextLoads);
    // The course stays as it was: still locked on the current docente
    expect(screen.getByTestId('course-active-assignment-a-cur')).toHaveTextContent(CURRENT_DOCENTE_NAME);
  });

  it('stale 409 no_active_assignment: keeps the modal open with the message and refreshes the course list', async () => {
    replace.current = {
      ...refusal('no_active_assignment', NO_ACTIVE_MESSAGE, 409),
      afterPost: () => { courses.current = [courseWith([])]; },
    };

    render(<TransversalContextDashboard />);
    const initialContextLoads = (await screen.findByTestId(`open-replace-docente-${COURSE_ID}`), contextGets(fetchLog).length);
    await openSelectAndSubmit();

    const errorBox = await screen.findByTestId('replace-docente-error');
    expect(errorBox).toHaveTextContent('No se pudo cambiar el docente');
    expect(errorBox).toHaveTextContent('no tiene un docente activo');
    expect(screen.getByRole('heading', { name: 'Cambiar Docente' })).toBeInTheDocument();
    await waitFor(() => expect(contextGets(fetchLog).length).toBeGreaterThan(initialContextLoads));
    // The refreshed list offers "Asignar" again and no replacement control
    await waitFor(() => expect(screen.getByTestId(`open-assign-docente-${COURSE_ID}`)).toBeInTheDocument());
    expect(screen.queryByTestId(`open-replace-docente-${COURSE_ID}`)).toBeNull();
  });

  it('422 docente_not_eligible_for_school keeps the modal open and does not refresh', async () => {
    const message = 'La persona seleccionada no está habilitada como docente activo en esta escuela.';
    replace.current = refusal('docente_not_eligible_for_school', message, 422);

    render(<TransversalContextDashboard />);
    const initialContextLoads = (await screen.findByTestId(`open-replace-docente-${COURSE_ID}`), contextGets(fetchLog).length);
    await openSelectAndSubmit();

    const errorBox = await screen.findByTestId('replace-docente-error');
    expect(errorBox).toHaveTextContent('no está habilitada');
    expect(screen.getByRole('heading', { name: 'Cambiar Docente' })).toBeInTheDocument();
    expect(contextGets(fetchLog).length).toBe(initialContextLoads);
  });

  it('success: closes the modal, refreshes the course list and shows the success notice', async () => {
    replace.current = {
      status: 200,
      body: {
        success: true,
        code: 'docente_replaced',
        message: SUCCESS_MESSAGE,
        replacement: { previousDocenteId: CURRENT_DOCENTE_ID, newDocenteId: NEW_DOCENTE_ID, instancesReattached: 2 },
      },
      afterPost: () => { courses.current = [courseWith(NEW_ACTIVE)]; },
    };

    render(<TransversalContextDashboard />);
    const initialContextLoads = (await screen.findByTestId(`open-replace-docente-${COURSE_ID}`), contextGets(fetchLog).length);
    await openSelectAndSubmit();

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Cambiar Docente' })).toBeNull());
    expect(mockToastSuccess).toHaveBeenCalledWith(SUCCESS_MESSAGE);
    expect(mockToastError).not.toHaveBeenCalled();

    const notice = await screen.findByTestId('replace-docente-success');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveTextContent('Docente cambiado: 3° Básico A');
    expect(notice).toHaveTextContent('ninguna respuesta fue transferida');

    await waitFor(() => expect(contextGets(fetchLog).length).toBeGreaterThan(initialContextLoads));
    await waitFor(() => expect(screen.getByTestId('course-active-assignment-a-new')).toHaveTextContent(NEW_DOCENTE_NAME));
    expect(screen.queryByTestId('course-active-assignment-a-cur')).toBeNull();
    // The refreshed card is locked on the new docente and can be changed again
    expect(screen.getByTestId(`course-assignment-locked-${COURSE_ID}`)).toBeInTheDocument();
    expect(screen.getByTestId(`open-replace-docente-${COURSE_ID}`)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('replace-docente-success-dismiss'));
    expect(screen.queryByTestId('replace-docente-success')).toBeNull();
  });

  it('keeps the modal open when the request itself fails', async () => {
    render(<TransversalContextDashboard />);
    await openReplaceModal();
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new Error('Network down');
    });
    fireEvent.change(screen.getByTestId('replace-docente-select'), { target: { value: NEW_DOCENTE_ID } });
    fireEvent.click(screen.getByTestId('replace-docente-submit'));

    const errorBox = await screen.findByTestId('replace-docente-error');
    expect(errorBox).toHaveTextContent('Network down');
    expect(screen.getByRole('heading', { name: 'Cambiar Docente' })).toBeInTheDocument();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('admin (with the school in the query) gets the control; a consultor never does', async () => {
    installSupabase([{ role_type: 'admin', school_id: null }]);
    routerMock.query = { school_id: String(SCHOOL_ID) };
    const { unmount } = render(<TransversalContextDashboard />);
    expect(await screen.findByTestId(`open-replace-docente-${COURSE_ID}`)).toHaveTextContent('Cambiar docente');
    unmount();

    installSupabase([{ role_type: 'consultor', school_id: null }]);
    render(<TransversalContextDashboard />);
    // R5/R11: the consultor surface is denied pending the product decision — no card, no control.
    await screen.findByTestId('consultor-access-pending');
    expect(screen.queryByTestId(`course-assignment-locked-${COURSE_ID}`)).toBeNull();
    expect(screen.queryByTestId(`open-replace-docente-${COURSE_ID}`)).toBeNull();
    expect(screen.queryByRole('button', { name: /cambiar docente/i })).toBeNull();
  });
});
