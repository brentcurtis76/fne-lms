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
 * though nothing was written; no unassign control exists anywhere.
 *
 * PR 2 item 2: the ONLY replacement path is the deliberate "Cambiar docente"
 * control on a locked (exactly-one-active) card, offered to admin and
 * equipo_directivo; it is never auto-opened by a refusal, never offered on a
 * zero-active or multiple-active card, and never offered to a consultor. The
 * modal itself is covered in transversal-context-replace.test.tsx.
 *
 * PROC-CONSULTOR-C1 (D4): a PURE consultor now READS this page — the all-school
 * picker, then a strictly read-only view of the core Contexto of any school —
 * and the page offers no edit / assign / replace / save control and issues no
 * custom-response, completion-status or change-history request on their behalf.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildChainableQuery } from '../../api/assessment-builder/_helpers';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockRouterPush, mockToastCall, mockToastError, mockToastSuccess, supabaseHolder, routerMock, routerHolder } = vi.hoisted(() => {
  const mockRouterPush = vi.fn();
  // One stable object, like Next's real router between navigations: the page's
  // auth effect depends on it and must not re-run on every local state change.
  const routerMock = {
    push: mockRouterPush,
    replace: vi.fn(),
    pathname: '/school/transversal-context',
    query: {} as Record<string, string>,
    isReady: true,
  };
  return {
    mockRouterPush,
    mockToastCall: vi.fn(),
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn(),
    supabaseHolder: { current: null as any },
    routerMock,
    // Next's `makePublicRouterInstance` hands out a NEW instance per navigation
    // (next/dist/client/index.js), which is what re-runs the auth effect on a
    // school switch. D5 swaps this holder to reproduce that faithfully.
    routerHolder: { current: routerMock },
  };
});

vi.mock('next/router', () => ({
  useRouter: () => routerHolder.current,
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
/** The directivo school of the mixed-role admin fixture: never the one being viewed. */
const OTHER_SCHOOL_ID = 77;
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
/** When true, the context GET answers as an unconfigured school. */
const emptyContext = { current: false };

function installFetch(log: FetchCall[], assign: { current: AssignScenario }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    log.push({ url, init });
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.startsWith('/api/school/transversal-context?school_id=')) {
      return jsonResponse({
        context: emptyContext.current ? null : context,
        courseStructure: courses.current,
      });
    }
    if (url.startsWith('/api/school/transversal-context/schools')) {
      return jsonResponse({ schools: [{ id: SCHOOL_ID, name: 'Escuela Sintética' }, { id: OTHER_SCHOOL_ID, name: 'Escuela Vecina' }] });
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

/** No unassign control exists on this page, and no replacement modal is open. */
function expectNoUnassignControl() {
  expect(screen.queryByText(/reemplazar/i)).toBeNull();
  expect(screen.queryByTitle('Desasignar')).toBeNull();
  expect(screen.queryByText('Desasignar')).toBeNull();
  expect(screen.queryByRole('button', { name: /desasignar/i })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Cambiar Docente' })).toBeNull();
  expect(screen.queryByTestId('replace-docente-select')).toBeNull();
}

/** The deliberate replacement control is absent (zero- or multiple-active cards, read-only viewers). */
function expectNoReplaceControl() {
  expect(screen.queryByTestId(`open-replace-docente-${COURSE_ID}`)).toBeNull();
  expect(screen.queryByRole('button', { name: /cambiar docente/i })).toBeNull();
}

describe('Transversal context — docente assignment (PROC-CONTAIN-01 A-02 · PROC-COURSE-OWNER-01 C-01)', () => {
  let fetchLog: FetchCall[];
  const assign = { current: { status: 200, body: {} } as AssignScenario };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchLog = [];
    courses.current = [courseWith([])];
    emptyContext.current = false;
    assign.current = { status: 200, body: {} };
    installFetch(fetchLog, assign);
    installSupabase();
    routerMock.query = {};
    routerHolder.current = routerMock;
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
      expectNoUnassignControl();
      expectNoReplaceControl();
    });

    it('exactly one active assignment: no "Asignar", no "Desasignar", the assignment stays visible, the locked note and the deliberate "Cambiar docente" control are shown', async () => {
      courses.current = [courseWith(ONE_ACTIVE)];
      render(<TransversalContextDashboard />);

      const note = await screen.findByTestId(`course-assignment-locked-${COURSE_ID}`);
      expect(note).toHaveTextContent('ya tiene un docente asignado');
      expect(note).toHaveTextContent('resolución administrativa controlada');

      expect(screen.queryByTestId(`open-assign-docente-${COURSE_ID}`)).toBeNull();
      expect(screen.queryByText('Asignar')).toBeNull();
      expect(screen.getByTestId('course-active-assignment-a-cur')).toHaveTextContent(CURRENT_DOCENTE_NAME);
      expect(screen.queryByTestId(`course-assignment-integrity-warning-${COURSE_ID}`)).toBeNull();
      // The only control on a locked card is the deliberate replacement (modal stays closed until clicked)
      const card = screen.getByTestId(`course-card-${COURSE_ID}`);
      expect(within(card).getByTestId(`open-replace-docente-${COURSE_ID}`)).toHaveTextContent('Cambiar docente');
      expect(within(card).queryAllByRole('button')).toHaveLength(1);
      expectNoUnassignControl();
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
      expectNoUnassignControl();
      expectNoReplaceControl();
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

  // ── C-01: explicit viewer-role coverage (final assurance pass) ─
  type ViewerRole = { roles: RoleRow[]; query: Record<string, string>; offersAssign: boolean; offersReplace: boolean };
  const VIEWER_ROLES: Array<[string, ViewerRole]> = [
    ['directivo', { roles: DIRECTIVO_ROLES, query: {}, offersAssign: true, offersReplace: true }],
    // Admin reaches the page through the school picker (school in the query) and — review
    // remediation R11 — keeps the full initial-assign / edit / replace capability.
    ['admin', { roles: [{ role_type: 'admin', school_id: null }], query: { school_id: String(SCHOOL_ID) }, offersAssign: true, offersReplace: true }],
    // Codex round 1 (finding 6): a MIXED-ROLE admin (admin + equipo_directivo of
    // another school) is an admin first — the explicit school_id is honoured on
    // a school that is NOT their directivo school, with the full capability.
    ['mixed-role admin on another school', {
      roles: [{ role_type: 'admin', school_id: null }, { role_type: 'equipo_directivo', school_id: OTHER_SCHOOL_ID }],
      query: { school_id: String(SCHOOL_ID) },
      offersAssign: true,
      offersReplace: true,
    }],
  ];

  describe.each(VIEWER_ROLES)('viewer role: %s (C-01)', (_label, viewer) => {
    beforeEach(() => {
      installSupabase(viewer.roles);
      routerMock.query = viewer.query;
    });

    afterEach(() => {
      routerMock.query = {};
    });

    /** No assignment, unassignment, resolution or replacement control anywhere on the course card or page. */
    function expectNoAssignmentControls() {
      expect(screen.queryByTestId(`open-assign-docente-${COURSE_ID}`)).toBeNull();
      expect(screen.queryByText('Asignar')).toBeNull();
      expect(within(screen.getByTestId(`course-card-${COURSE_ID}`)).queryAllByRole('button')).toHaveLength(0);
      expectNoUnassignControl();
      expectNoReplaceControl();
    }

    it('zero active: the assign control is offered to the directivo and to the admin', async () => {
      render(<TransversalContextDashboard />);

      const card = await screen.findByTestId(`course-card-${COURSE_ID}`);
      if (viewer.offersAssign) {
        expect(within(card).getByTestId(`open-assign-docente-${COURSE_ID}`)).toHaveTextContent('Asignar');
        expect(within(card).queryAllByRole('button')).toHaveLength(1);
      } else {
        expectNoAssignmentControls();
      }
      expect(screen.queryByTestId(`course-assignment-locked-${COURSE_ID}`)).toBeNull();
      expect(screen.queryByTestId(`course-assignment-integrity-warning-${COURSE_ID}`)).toBeNull();
      expectNoUnassignControl();
      expectNoReplaceControl();
    });

    it('one active: locked note visible, assignment displayed, no assignment or unassignment control; "Cambiar docente" only for admin / directivo', async () => {
      courses.current = [courseWith(ONE_ACTIVE)];
      render(<TransversalContextDashboard />);

      const note = await screen.findByTestId(`course-assignment-locked-${COURSE_ID}`);
      expect(note).toHaveTextContent('ya tiene un docente asignado');
      expect(note).toHaveTextContent('resolución administrativa controlada');
      expect(screen.getByTestId('course-active-assignment-a-cur')).toHaveTextContent(CURRENT_DOCENTE_NAME);
      expect(screen.queryByTestId(`course-assignment-integrity-warning-${COURSE_ID}`)).toBeNull();
      if (viewer.offersReplace) {
        const card = screen.getByTestId(`course-card-${COURSE_ID}`);
        expect(within(card).getByTestId(`open-replace-docente-${COURSE_ID}`)).toHaveTextContent('Cambiar docente');
        expect(within(card).queryAllByRole('button')).toHaveLength(1);
        expect(screen.queryByTestId(`open-assign-docente-${COURSE_ID}`)).toBeNull();
        expectNoUnassignControl();
      } else {
        expectNoAssignmentControls();
      }
    });

    it('multiple active: integrity alert visible, every row displayed identically, no resolution control', async () => {
      courses.current = [courseWith(TWO_ACTIVE)];
      render(<TransversalContextDashboard />);

      const warning = await screen.findByTestId(`course-assignment-integrity-warning-${COURSE_ID}`);
      expect(warning).toHaveAttribute('role', 'alert');
      expect(warning).toHaveTextContent('Estado de asignación inválido');
      expect(warning).toHaveTextContent('resolución administrativa controlada');
      expect(warning).not.toHaveTextContent(CURRENT_DOCENTE_NAME);
      expect(warning).not.toHaveTextContent(SECOND_DOCENTE_NAME);

      const first = screen.getByTestId('course-active-assignment-a-cur');
      const second = screen.getByTestId('course-active-assignment-a-second');
      expect(first).toHaveTextContent(CURRENT_DOCENTE_NAME);
      expect(second).toHaveTextContent(SECOND_DOCENTE_NAME);
      expect(first.className).toBe(second.className);
      expect(first.children).toHaveLength(second.children.length);
      expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      expect(screen.queryByTestId(`course-assignment-locked-${COURSE_ID}`)).toBeNull();
      expectNoAssignmentControls();
    });
  });

  // ── Codex round 1 (finding 6): admin authority takes precedence over equipo_directivo ─
  describe('mixed-role admin (admin + equipo_directivo)', () => {
    const MIXED: RoleRow[] = [
      { role_type: 'equipo_directivo', school_id: OTHER_SCHOOL_ID },
      { role_type: 'admin', school_id: null },
    ];

    afterEach(() => {
      routerMock.query = {};
    });

    it('honours an explicit school_id for a school that is NOT the directivo school, and is never redirected', async () => {
      installSupabase(MIXED);
      routerMock.query = { school_id: String(SCHOOL_ID) };
      render(<TransversalContextDashboard />);

      await screen.findByTestId(`course-card-${COURSE_ID}`);
      expect(mockRouterPush).not.toHaveBeenCalledWith('/dashboard');
      expect(contextGets(fetchLog).map(c => c.url)).toEqual([`/api/school/transversal-context?school_id=${SCHOOL_ID}`]);
      // Admin chrome: the global "back to school selection" control and the admin copy.
      expect(screen.getByRole('button', { name: /volver a selección de escuelas/i })).toBeInTheDocument();
      // Full capability: initial assign on a zero-active course + the edit link carrying the school.
      expect(screen.getByTestId(`open-assign-docente-${COURSE_ID}`)).toHaveTextContent('Asignar');
      expect(screen.getAllByRole('link', { name: /editar|completar/i })[0]).toHaveAttribute('href', expect.stringContaining(`school_id=${SCHOOL_ID}`));
    });

    it('keeps the deliberate "Cambiar docente" control on a locked course of another school', async () => {
      installSupabase(MIXED);
      routerMock.query = { school_id: String(SCHOOL_ID) };
      courses.current = [courseWith(ONE_ACTIVE)];
      render(<TransversalContextDashboard />);

      const card = await screen.findByTestId(`course-card-${COURSE_ID}`);
      expect(within(card).getByTestId(`open-replace-docente-${COURSE_ID}`)).toHaveTextContent('Cambiar docente');
    });

    it('without a school_id shows the GLOBAL selector instead of silently landing on the directivo school', async () => {
      installSupabase(MIXED);
      routerMock.query = {};
      render(<TransversalContextDashboard />);

      await screen.findByRole('heading', { name: 'Selecciona una escuela' });
      expect(contextGets(fetchLog)).toHaveLength(0);
      expect(fetchLog.some(c => c.url === '/api/school/transversal-context/schools')).toBe(true);
      expect(mockRouterPush).not.toHaveBeenCalledWith('/dashboard');
    });

    it('control: a plain directivo with a foreign school_id is redirected to the dashboard and fetches nothing', async () => {
      installSupabase(DIRECTIVO_ROLES);
      routerMock.query = { school_id: String(OTHER_SCHOOL_ID) };
      render(<TransversalContextDashboard />);

      await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/dashboard'));
      expect(contextGets(fetchLog)).toHaveLength(0);
    });
  });

  // ── PROC-CONSULTOR-C1 (D4): pure consultor = read-only across every school ──
  describe('viewer role: pure consultor (read-only, all schools)', () => {
    const CONSULTOR_ROLES: RoleRow[] = [{ role_type: 'consultor', school_id: null }];
    /** Requests this page must NEVER make for a read-only viewer. */
    const restricted = () => fetchLog.filter(c =>
      c.url.startsWith('/api/school/transversal-context/custom-responses') ||
      c.url.startsWith('/api/school/completion-status') ||
      c.url.startsWith('/api/school/change-history') ||
      c.url.startsWith('/api/school/transversal-context/docentes') ||
      c.url.startsWith('/api/school/transversal-context/assign-docente') ||
      c.url.startsWith('/api/school/transversal-context/replace-docente')
    );

    beforeEach(() => {
      installSupabase(CONSULTOR_ROLES);
    });
    afterEach(() => {
      routerMock.query = {};
    });

    it('reads the selected school: read-only notice, the course card, and no write control or restricted request', async () => {
      courses.current = [courseWith(ONE_ACTIVE)];
      routerMock.query = { school_id: String(SCHOOL_ID) };
      render(<TransversalContextDashboard />);

      const notice = await screen.findByTestId('consultor-read-only-notice');
      expect(notice).toHaveTextContent('Vista de solo lectura');
      expect(notice).toHaveTextContent('no puede editarlo ni asignar o cambiar docentes');

      // The core Contexto of the requested school IS read …
      expect(contextGets(fetchLog).map(c => c.url)).toEqual([
        `/api/school/transversal-context?school_id=${SCHOOL_ID}`,
      ]);
      expect(screen.getByTestId(`course-card-${COURSE_ID}`)).toBeInTheDocument();
      expect(screen.getByTestId('course-active-assignment-a-cur')).toHaveTextContent(CURRENT_DOCENTE_NAME);

      // … and nothing else is requested or offered.
      expect(restricted()).toHaveLength(0);
      expect(screen.queryByTestId(`open-assign-docente-${COURSE_ID}`)).toBeNull();
      expect(screen.queryByTestId(`open-replace-docente-${COURSE_ID}`)).toBeNull();
      expect(screen.queryByRole('link', { name: /editar|completar/i })).toBeNull();
      expectNoUnassignControl();
      expectNoReplaceControl();
    });

    it('is offered no "Asignar" even on a course with zero active assignments', async () => {
      courses.current = [courseWith([])];
      routerMock.query = { school_id: String(SCHOOL_ID) };
      render(<TransversalContextDashboard />);

      await screen.findByTestId('consultor-read-only-notice');
      expect(screen.getByTestId(`course-card-${COURSE_ID}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`open-assign-docente-${COURSE_ID}`)).toBeNull();
      expect(screen.queryByText('Asignar')).toBeNull();
      expect(restricted()).toHaveLength(0);
    });

    it('without a school_id gets the all-school picker and reads no school', async () => {
      routerMock.query = {};
      render(<TransversalContextDashboard />);

      const hint = await screen.findByTestId('school-picker-hint');
      expect(hint).toHaveTextContent('Como consultor');
      expect(hint).toHaveTextContent('solo lectura');
      expect(await screen.findByRole('option', { name: 'Escuela Vecina' })).toBeInTheDocument();
      expect(fetchLog.filter(c => c.url.startsWith('/api/school/transversal-context/schools'))).toHaveLength(1);
      expect(contextGets(fetchLog)).toHaveLength(0);
      expect(restricted()).toHaveLength(0);
    });

    it('on an unconfigured school shows the es-CL empty state without any "completar" control', async () => {
      emptyContext.current = true;
      courses.current = [];
      routerMock.query = { school_id: String(OTHER_SCHOOL_ID) };
      render(<TransversalContextDashboard />);

      await screen.findByTestId('consultor-read-only-notice');
      expect(await screen.findByText('Escuela sin configurar')).toBeInTheDocument();
      expect(screen.getByText(/No hay contexto que consultar por ahora/)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /completar cuestionario/i })).toBeNull();
      expect(screen.queryByRole('link', { name: /editar|completar/i })).toBeNull();
      expect(restricted()).toHaveLength(0);
    });
  });

  // ── R0-F1 (D1): consultor + equipo_directivo — the capability belongs to the
  // SELECTED school, not to the user. Own school writable, every other school
  // read-only, no selection = the all-school picker. Both role orders. ───────
  describe('mixed consultor + equipo_directivo (D1)', () => {
    const ROLE_ORDERS: Array<[string, RoleRow[]]> = [
      ['consultor row first', [
        { role_type: 'consultor', school_id: null },
        { role_type: 'equipo_directivo', school_id: SCHOOL_ID },
      ]],
      ['directivo row first', [
        { role_type: 'equipo_directivo', school_id: SCHOOL_ID },
        { role_type: 'consultor', school_id: null },
      ]],
    ];

    const restrictedGets = () => fetchLog.filter(c =>
      c.url.startsWith('/api/school/transversal-context/custom-responses') ||
      c.url.startsWith('/api/school/completion-status')
    );

    afterEach(() => {
      routerMock.query = {};
    });

    describe.each(ROLE_ORDERS)('role order: %s', (_label, roles) => {
      it('keeps the WRITE capability on their own directivo school', async () => {
        installSupabase(roles);
        routerMock.query = { school_id: String(SCHOOL_ID) };
        render(<TransversalContextDashboard />);

        expect(await screen.findByTestId(`open-assign-docente-${COURSE_ID}`)).toHaveTextContent('Asignar');
        expect(screen.queryByTestId('consultor-read-only-notice')).toBeNull();
        expect(mockRouterPush).not.toHaveBeenCalledWith('/dashboard');
        expect(screen.getAllByRole('link', { name: /editar|completar/i })[0])
          .toHaveAttribute('href', expect.stringContaining(`school_id=${SCHOOL_ID}`));
        // The restricted surfaces of the school they direct are theirs to read.
        await waitFor(() => expect(restrictedGets()).toHaveLength(2));
        // …and the consultor role still gives them the way back to the picker.
        expect(screen.getByRole('button', { name: /volver a selección de escuelas/i })).toBeInTheDocument();
      });

      it('reads a FOREIGN school read-only instead of being redirected away', async () => {
        installSupabase(roles);
        routerMock.query = { school_id: String(OTHER_SCHOOL_ID) };
        render(<TransversalContextDashboard />);

        const notice = await screen.findByTestId('consultor-read-only-notice');
        expect(notice).toHaveTextContent('Vista de solo lectura');
        expect(mockRouterPush).not.toHaveBeenCalledWith('/dashboard');
        expect(contextGets(fetchLog).map(c => c.url)).toEqual([
          `/api/school/transversal-context?school_id=${OTHER_SCHOOL_ID}`,
        ]);
        expect(screen.getByTestId(`course-card-${COURSE_ID}`)).toBeInTheDocument();
        expect(screen.queryByTestId(`open-assign-docente-${COURSE_ID}`)).toBeNull();
        expect(screen.queryByRole('link', { name: /editar|completar/i })).toBeNull();
        expect(restrictedGets()).toHaveLength(0);
      });

      it('without a school_id gets the all-school picker, not their own school', async () => {
        installSupabase(roles);
        routerMock.query = {};
        render(<TransversalContextDashboard />);

        await screen.findByRole('heading', { name: 'Selecciona una escuela' });
        expect(await screen.findByRole('option', { name: 'Escuela Vecina' })).toBeInTheDocument();
        expect(contextGets(fetchLog)).toHaveLength(0);
        expect(mockRouterPush).not.toHaveBeenCalledWith('/dashboard');
      });
    });

    it('control: admin + equipo_directivo of another school still writes the school in the query', async () => {
      installSupabase([
        { role_type: 'admin', school_id: null },
        { role_type: 'equipo_directivo', school_id: OTHER_SCHOOL_ID },
      ]);
      routerMock.query = { school_id: String(SCHOOL_ID) };
      render(<TransversalContextDashboard />);

      expect(await screen.findByTestId(`open-assign-docente-${COURSE_ID}`)).toHaveTextContent('Asignar');
      expect(screen.queryByTestId('consultor-read-only-notice')).toBeNull();
      await waitFor(() => expect(restrictedGets()).toHaveLength(2));
    });

    it('control: admin + consultor keeps the admin write capability on any school', async () => {
      installSupabase([
        { role_type: 'consultor', school_id: null },
        { role_type: 'admin', school_id: null },
      ]);
      routerMock.query = { school_id: String(OTHER_SCHOOL_ID) };
      render(<TransversalContextDashboard />);

      expect(await screen.findByTestId(`open-assign-docente-${COURSE_ID}`)).toHaveTextContent('Asignar');
      expect(screen.queryByTestId('consultor-read-only-notice')).toBeNull();
    });

    it('control: a pure directivo with a foreign school_id is still redirected', async () => {
      installSupabase(DIRECTIVO_ROLES);
      routerMock.query = { school_id: String(OTHER_SCHOOL_ID) };
      render(<TransversalContextDashboard />);

      await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/dashboard'));
      expect(contextGets(fetchLog)).toHaveLength(0);
    });
  });

  // ── D4: denied actors fail closed on the page itself ──────────────────────
  describe('denied actors and failed role lookups (D4)', () => {
    /** Every request the page could make that would leak school or context data. */
    const leakingGets = () => fetchLog.filter(c =>
      c.url.startsWith('/api/school/transversal-context?school_id=') ||
      c.url.startsWith('/api/school/transversal-context/schools') ||
      c.url.startsWith('/api/school/transversal-context/custom-responses') ||
      c.url.startsWith('/api/school/completion-status') ||
      c.url.startsWith('/api/school/transversal-context/docentes')
    );

    it('a docente is denied, and is offered no school inventory and no context', async () => {
      installSupabase([{ role_type: 'docente', school_id: SCHOOL_ID }]);
      routerMock.query = { school_id: String(SCHOOL_ID) };
      render(<TransversalContextDashboard />);

      expect(await screen.findByTestId('access-denied')).toHaveTextContent('Acceso Denegado');
      expect(screen.queryByRole('heading', { name: 'Selecciona una escuela' })).toBeNull();
      expect(leakingGets()).toHaveLength(0);
    });

    it('a user whose only consultor row is INACTIVE is denied (the row never reaches the page)', async () => {
      // The page reads `user_roles` with `.eq('is_active', true)`, so an
      // inactive consultor arrives as an empty role set, not as a consultor.
      installSupabase([]);
      routerMock.query = { school_id: String(OTHER_SCHOOL_ID) };
      render(<TransversalContextDashboard />);

      expect(await screen.findByTestId('access-denied')).toBeInTheDocument();
      expect(leakingGets()).toHaveLength(0);
    });

    it('a failed role lookup is denied rather than treated as no restriction', async () => {
      installSupabase();
      supabaseHolder.current.from = vi.fn((table: string) => {
        if (table === 'user_roles') return buildChainableQuery(null, { code: 'XX000', message: 'role lookup failed' });
        if (table === 'profiles') return buildChainableQuery({ avatar_url: null });
        if (table === 'schools') return buildChainableQuery({ name: 'Escuela Sintética' });
        return buildChainableQuery(null, null);
      });
      routerMock.query = { school_id: String(SCHOOL_ID) };
      render(<TransversalContextDashboard />);

      expect(await screen.findByTestId('access-denied')).toBeInTheDocument();
      expect(leakingGets()).toHaveLength(0);
    });

    it('an anonymous visitor is sent to /login and reads nothing', async () => {
      installSupabase();
      supabaseHolder.current.auth.getSession = vi.fn().mockResolvedValue({ data: { session: null } });
      routerMock.query = { school_id: String(SCHOOL_ID) };
      render(<TransversalContextDashboard />);

      await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/login'));
      expect(screen.queryByTestId('access-denied')).toBeNull();
      expect(screen.queryByTestId(`course-card-${COURSE_ID}`)).toBeNull();
      expect(leakingGets()).toHaveLength(0);
    });

    it('a malformed school_id in the query gives an admin the picker, never a coerced school', async () => {
      installSupabase([{ role_type: 'admin', school_id: null }]);
      routerMock.query = { school_id: '12abc' };
      render(<TransversalContextDashboard />);

      await screen.findByRole('heading', { name: 'Selecciona una escuela' });
      expect(contextGets(fetchLog)).toHaveLength(0);
      expect(screen.queryByTestId(`course-card-${COURSE_ID}`)).toBeNull();
    });
  });

  // ── D5: rapid school switch with a delayed prior-school response ──────────
  //
  // The mixed consultor + directivo is the sharpest case: their OWN school is
  // writable and a FOREIGN one is read-only, so a prior-school response that
  // lands late would not merely show the wrong data — it would put the write
  // affordances of one school on top of another.
  describe('rapid school switch and delayed prior response (D5)', () => {
    const MIXED_ROLES: RoleRow[] = [
      { role_type: 'consultor', school_id: null },
      { role_type: 'equipo_directivo', school_id: SCHOOL_ID },
    ];

    /** A chainable Supabase query whose result arrives only when `settle()` is called. */
    function deferredQuery(data: unknown) {
      let settle!: () => void;
      const ready = new Promise<void>(resolve => { settle = resolve; });
      const handler: ProxyHandler<Record<string, unknown>> = {
        get(_target, prop) {
          if (prop === 'then') {
            return (resolve: (value: unknown) => void) =>
              ready.then(() => resolve({ data, error: null, count: null }));
          }
          return vi.fn(() => new Proxy({}, handler));
        },
      };
      return { query: new Proxy({}, handler), settle: () => settle() };
    }

    /** Next's per-navigation router instance: a new object carrying the new query. */
    function navigateTo(query: Record<string, string>) {
      routerHolder.current = { ...routerMock, query };
    }

    it('a delayed prior-school role read cannot restore the write controls of the school left behind', async () => {
      const ownSchoolRoles = deferredQuery(MIXED_ROLES);
      let roleReads = 0;
      supabaseHolder.current = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: { user: { id: 'mixed-1', email: 'mixed@example.test' } } },
          }),
          signOut: vi.fn(),
        },
        from: vi.fn((table: string) => {
          if (table === 'user_roles') {
            roleReads += 1;
            // Only the FIRST read — the one for their own, writable school — is delayed.
            return roleReads === 1 ? ownSchoolRoles.query : buildChainableQuery(MIXED_ROLES);
          }
          if (table === 'profiles') return buildChainableQuery({ avatar_url: null });
          if (table === 'schools') return buildChainableQuery({ name: 'Escuela Sintética' });
          return buildChainableQuery(null, null);
        }),
      };

      navigateTo({ school_id: String(SCHOOL_ID) });
      const { rerender } = render(<TransversalContextDashboard />);
      await waitFor(() => expect(roleReads).toBe(1));

      // The consultor switches to a foreign school before their own school answered.
      navigateTo({ school_id: String(OTHER_SCHOOL_ID) });
      rerender(<TransversalContextDashboard />);
      expect(await screen.findByTestId('consultor-read-only-notice')).toBeInTheDocument();

      // …and only now does the own-school read come back.
      ownSchoolRoles.settle();
      await waitFor(() => expect(roleReads).toBe(2));

      expect(screen.getByTestId('consultor-read-only-notice')).toBeInTheDocument();
      expect(screen.queryByTestId(`open-assign-docente-${COURSE_ID}`)).toBeNull();
      expect(screen.queryByRole('link', { name: /editar|completar/i })).toBeNull();
      // The restricted surfaces of the abandoned school were never requested.
      expect(fetchLog.filter(c =>
        c.url.startsWith('/api/school/transversal-context/custom-responses') ||
        c.url.startsWith('/api/school/completion-status')
      )).toHaveLength(0);
      // The only context read that reached the screen is the current school's.
      expect(contextGets(fetchLog).map(c => c.url)).toEqual([
        `/api/school/transversal-context?school_id=${OTHER_SCHOOL_ID}`,
      ]);
    });

    it('a delayed prior-school context response cannot replace the current school\'s course list', async () => {
      const PRIOR_COURSE_ID = '66666666-6666-4666-8666-666666666666';
      const priorCourse = { ...courseWith([]), id: PRIOR_COURSE_ID, course_name: 'Curso De La Escuela Anterior' };
      let releasePrior!: () => void;
      const priorReleased = new Promise<void>(resolve => { releasePrior = resolve; });

      const baseFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === `/api/school/transversal-context?school_id=${SCHOOL_ID}`) {
          fetchLog.push({ url, init });
          await priorReleased;
          return jsonResponse({ context, courseStructure: [priorCourse] });
        }
        return (baseFetch as typeof fetch)(input, init);
      }) as unknown as typeof fetch;

      installSupabase([{ role_type: 'admin', school_id: null }]);
      navigateTo({ school_id: String(SCHOOL_ID) });
      const { rerender } = render(<TransversalContextDashboard />);
      await waitFor(() => expect(
        fetchLog.some(c => c.url === `/api/school/transversal-context?school_id=${SCHOOL_ID}`)
      ).toBe(true));

      navigateTo({ school_id: String(OTHER_SCHOOL_ID) });
      rerender(<TransversalContextDashboard />);
      expect(await screen.findByTestId(`course-card-${COURSE_ID}`)).toBeInTheDocument();

      releasePrior();
      await waitFor(() => expect(
        contextGets(fetchLog).some(c => c.url.endsWith(String(OTHER_SCHOOL_ID)))
      ).toBe(true));

      expect(screen.queryByTestId(`course-card-${PRIOR_COURSE_ID}`)).toBeNull();
      expect(screen.queryByText('Curso De La Escuela Anterior')).toBeNull();
      expect(screen.getByTestId(`course-card-${COURSE_ID}`)).toBeInTheDocument();
      globalThis.fetch = baseFetch;
    });

    it('the previous school is never painted under the new school\'s URL', async () => {
      // Also found by the browser journey: `router.push` changes the URL one
      // paint before the auth effect resolves the new selection, so the page
      // must not keep showing the previous school while the two disagree.
      installSupabase([{ role_type: 'admin', school_id: null }]);
      navigateTo({ school_id: String(SCHOOL_ID) });
      const { rerender } = render(<TransversalContextDashboard />);
      expect(await screen.findByTestId(`open-assign-docente-${COURSE_ID}`)).toHaveTextContent('Asignar');

      // The instant the URL names the other school, before anything resolves.
      navigateTo({ school_id: String(OTHER_SCHOOL_ID) });
      rerender(<TransversalContextDashboard />);
      expect(screen.queryByTestId(`open-assign-docente-${COURSE_ID}`)).toBeNull();
      expect(screen.queryByTestId(`course-card-${COURSE_ID}`)).toBeNull();

      // …and it resolves to the school actually named. Re-queried on every poll:
      // the card is re-rendered as the new school's data arrives, which detaches
      // any node captured once.
      await waitFor(() => expect(screen.queryByTestId(`open-assign-docente-${COURSE_ID}`)).not.toBeNull());
      await waitFor(() => expect(contextGets(fetchLog).map(c => c.url)).toEqual([
        `/api/school/transversal-context?school_id=${SCHOOL_ID}`,
        `/api/school/transversal-context?school_id=${OTHER_SCHOOL_ID}`,
      ]));
    });

    it('navigating back to the picker does not leave the previous school\'s write controls on screen', async () => {
      // Found by the browser journey: only the "Volver a Selección de Escuelas"
      // button cleared the selected school, so the browser Back button rendered
      // the previous school — write controls and all — under the picker's URL.
      installSupabase([{ role_type: 'admin', school_id: null }]);
      navigateTo({ school_id: String(SCHOOL_ID) });
      const { rerender } = render(<TransversalContextDashboard />);
      expect(await screen.findByTestId(`open-assign-docente-${COURSE_ID}`)).toHaveTextContent('Asignar');

      navigateTo({});
      rerender(<TransversalContextDashboard />);

      await screen.findByRole('heading', { name: 'Selecciona una escuela' });
      expect(screen.queryByTestId(`open-assign-docente-${COURSE_ID}`)).toBeNull();
      expect(screen.queryByTestId(`course-card-${COURSE_ID}`)).toBeNull();
      expect(screen.queryByRole('link', { name: /editar|completar/i })).toBeNull();
    });

    it('an assignment modal opened on the previous school is closed by the switch and its late roster is dropped', async () => {
      let releaseDocentes!: () => void;
      const docentesReleased = new Promise<void>(resolve => { releaseDocentes = resolve; });

      const baseFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.startsWith('/api/school/transversal-context/docentes')) {
          fetchLog.push({ url, init });
          await docentesReleased;
          return jsonResponse({
            docentes: [{ id: DOCENTE_ID, name: 'Docente Uno', email: 'docente.uno@example.test', roles: ['docente'] }],
          });
        }
        return (baseFetch as typeof fetch)(input, init);
      }) as unknown as typeof fetch;

      installSupabase(MIXED_ROLES);
      navigateTo({ school_id: String(SCHOOL_ID) });
      const { rerender } = render(<TransversalContextDashboard />);
      fireEvent.click(await screen.findByTestId(`open-assign-docente-${COURSE_ID}`));
      expect(await screen.findByRole('heading', { name: 'Asignar Docente' })).toBeInTheDocument();

      navigateTo({ school_id: String(OTHER_SCHOOL_ID) });
      rerender(<TransversalContextDashboard />);
      expect(await screen.findByTestId('consultor-read-only-notice')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Asignar Docente' })).toBeNull();

      releaseDocentes();
      await waitFor(() => expect(screen.getByTestId('consultor-read-only-notice')).toBeInTheDocument());

      // The late roster reopens nothing and offers no write path on the foreign school.
      expect(screen.queryByRole('heading', { name: 'Asignar Docente' })).toBeNull();
      expect(screen.queryByTestId('assign-docente-select')).toBeNull();
      expect(screen.queryByTestId(`open-assign-docente-${COURSE_ID}`)).toBeNull();
      expect(assignPosts(fetchLog)).toHaveLength(0);
      globalThis.fetch = baseFetch;
    });
  });

  // ── D5: an admin still gets every write control on the same card ──────────
  describe('control: admin on the same school keeps the write controls', () => {
    it('offers "Asignar" and requests the restricted surfaces a consultor never sees', async () => {
      installSupabase([{ role_type: 'admin', school_id: null }]);
      routerMock.query = { school_id: String(SCHOOL_ID) };
      render(<TransversalContextDashboard />);

      expect(await screen.findByTestId(`open-assign-docente-${COURSE_ID}`)).toHaveTextContent('Asignar');
      expect(screen.queryByTestId('consultor-read-only-notice')).toBeNull();
      await waitFor(() => expect(
        fetchLog.filter(c => c.url.startsWith('/api/school/transversal-context/custom-responses'))
      ).toHaveLength(1));
      expect(fetchLog.filter(c => c.url.startsWith('/api/school/completion-status'))).toHaveLength(1);
      routerMock.query = {};
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
      // The message stays visible after the refresh; the replacement modal is NOT auto-opened —
      // the refreshed locked card merely offers the deliberate "Cambiar docente" control
      expect(screen.getByTestId('assign-docente-error')).toHaveTextContent('ya tiene un docente activo asignado');
      expectNoUnassignControl();
      expect(screen.getByTestId(`open-replace-docente-${COURSE_ID}`)).toBeInTheDocument();
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
      expectNoUnassignControl();
      expectNoReplaceControl();
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
      expectNoUnassignControl();
      expectNoReplaceControl();
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
