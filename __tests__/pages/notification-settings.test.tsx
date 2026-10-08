// @vitest-environment jsdom
import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';

// Next.js pages use the automatic JSX runtime; vitest's transform here is classic.
(globalThis as any).React = React;
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GetServerSidePropsContext } from 'next';
import {
  buildPreferencesView,
  mergeRows,
  parsePreferencesUpdate,
  selectsUnavailableDigest,
  type CategoryRow,
  type LegacyRow,
} from '../../lib/notifications/preferences-api';

/**
 * N4-02 — `/configuracion/notificaciones` and the `/configuracion` redirect.
 *
 * getServerSideProps runs with the real lib/api-auth (only the auth-helpers
 * client and the service-role client are fakes), so identity comes from the
 * auth server and the forced-password rule is the real one. The page runs for
 * real against a fake of the N4-01 route that answers with the real
 * `buildPreferencesView`, body parser and digest rule. Synthetic ids only.
 */

const OWNER = '44444444-4444-4444-8444-444444444444';
const OTHER = '55555555-5555-4555-8555-555555555555';
const SCHOOL = 7;
const COMMUNITY = '66666666-6666-4666-8666-666666666666';

const { auth, db, sessionContext } = vi.hoisted(() => ({
  auth: { session: null as null | { access_token: string; user: { id: string } }, verified: null as null | { id: string } },
  db: {
    roles: [] as Array<Record<string, unknown>>,
    profile: { must_change_password: false, can_run_qa_tests: false } as Record<string, unknown>,
    profileError: false,
    rolesError: false,
    reads: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  },
  sessionContext: { isLoading: false, session: null as null | { user: { id: string } }, error: null },
}));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: auth.session }, error: null }),
      getUser: async () => (auth.verified ? { data: { user: auth.verified }, error: null } : { data: { user: null }, error: { message: 'invalid token' } }),
    },
  }),
}));

function serviceChain(table: string) {
  const read = { table, filters: [] as Array<[string, unknown]> };
  db.reads.push(read);
  const answer = () => {
    if (table === 'profiles') return db.profileError ? { data: null, error: { message: 'down' } } : { data: db.profile, error: null };
    if (table === 'user_roles') return db.rolesError ? { data: null, error: { message: 'down' } } : { data: db.roles, error: null };
    return { data: null, error: { message: `unexpected table ${table}` } };
  };
  const chain: any = {
    select: () => chain,
    eq: (column: string, value: unknown) => (read.filters.push([column, value]), chain),
    maybeSingle: async () => answer(),
    then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) => Promise.resolve(answer()).then(resolve, reject),
  };
  return chain;
}

vi.mock('../../lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-auth')>()),
  createServiceRoleClient: () => ({ from: serviceChain }),
}));

vi.mock('@supabase/auth-helpers-react', () => ({ useSessionContext: () => sessionContext }));
vi.mock('../../components/layout/MainLayout', () => ({
  default: ({ children, pageTitle }: { children: React.ReactNode; pageTitle: string }) => (
    <div>
      <h1>{pageTitle}</h1>
      {children}
    </div>
  ),
}));

import Page, { getServerSideProps } from '../../pages/configuracion/notificaciones';
import { getServerSideProps as indexProps } from '../../pages/configuracion';

type Props = { ownerId: string; categories: Array<{ category: string; events: Array<{ event_type: string; label: string }> }> | null };

const context = () =>
  ({ req: { headers: {} }, res: {}, query: {}, resolvedUrl: '/configuracion/notificaciones' }) as unknown as GetServerSidePropsContext;

function signedIn(id = OWNER) {
  auth.session = { access_token: 'token', user: { id } };
  auth.verified = { id };
}

async function propsFor(roles: Array<Record<string, unknown>>, tester = false): Promise<Props> {
  signedIn();
  db.roles = roles.map((role) => ({ school_id: null, community_id: null, ...role }));
  db.profile = { must_change_password: false, can_run_qa_tests: tester };
  const result = await getServerSideProps(context());
  if (!('props' in result)) throw new Error(`expected props, got ${JSON.stringify(result)}`);
  return (await result.props) as Props;
}

const categoriesOf = (props: Props) => props.categories?.map((c) => c.category);
const eventsOf = (props: Props, category: string) => props.categories?.find((c) => c.category === category)?.events.map((e) => e.event_type) ?? [];
const BASE = ['courses', 'assignments', 'advisory', 'system'];

beforeEach(() => {
  auth.session = null;
  auth.verified = null;
  db.roles = [];
  db.profile = { must_change_password: false, can_run_qa_tests: false };
  db.profileError = false;
  db.rolesError = false;
  db.reads = [];
  sessionContext.isLoading = false;
  sessionContext.session = { user: { id: OWNER } };
});

describe('D1 — redirect and the auth gates before any data', () => {
  it('/configuracion redirects to the notification settings', async () => {
    expect(await indexProps(context())).toEqual({ redirect: { destination: '/configuracion/notificaciones', permanent: false } });
  });

  it('no session: login with the destination, nothing read', async () => {
    expect(await getServerSideProps(context())).toEqual({
      redirect: { destination: '/login?next=%2Fconfiguracion%2Fnotificaciones', permanent: false },
    });
    expect(db.reads).toEqual([]);
  });

  it('a session the auth server rejects (revoked or forged) is signed out, nothing read', async () => {
    auth.session = { access_token: 'revoked', user: { id: OWNER } };
    const result = await getServerSideProps(context());
    expect(result).toEqual({ redirect: { destination: '/login?next=%2Fconfiguracion%2Fnotificaciones', permanent: false } });
    expect(db.reads).toEqual([]);
  });

  it('the verified user is the owner, whatever user the cookie names', async () => {
    auth.session = { access_token: 'token', user: { id: OTHER } };
    auth.verified = { id: OWNER };
    db.roles = [{ role_type: 'docente', school_id: null, community_id: null }];
    const result = await getServerSideProps(context());
    expect('props' in result && (await result.props).ownerId).toBe(OWNER);
    expect(db.reads.map((r) => [r.table, r.filters[0]])).toEqual([
      ['profiles', ['id', OWNER]],
      ['user_roles', ['user_id', OWNER]],
      ['profiles', ['id', OWNER]],
    ]);
  });

  it('a user who must change their password is sent there before any role read', async () => {
    signedIn();
    db.profile = { must_change_password: true };
    expect(await getServerSideProps(context())).toEqual({ redirect: { destination: '/change-password', permanent: false } });
    expect(db.reads.map((r) => r.table)).toEqual(['profiles']);
  });

  it('an unreadable password state fails closed to the retry panel', async () => {
    signedIn();
    db.profileError = true;
    expect(await getServerSideProps(context())).toEqual({
      redirect: { destination: '/change-password?estado=no-verificado', permanent: false },
    });
    expect(db.reads.map((r) => r.table)).toEqual(['profiles']);
  });
});

describe('D2 — applicable categories follow active roles and their school/community scope', () => {
  it.each([
    ['docente, no scope', [{ role_type: 'docente' }], BASE],
    ['docente in a community', [{ role_type: 'docente', school_id: SCHOOL, community_id: COMMUNITY }], ['courses', 'assignments', 'community', 'sessions', 'advisory', 'system']],
    ['admin', [{ role_type: 'admin' }], ['courses', 'assignments', 'community', 'sessions', 'advisory', 'licitaciones', 'qa_support', 'system']],
    ['consultor of a school', [{ role_type: 'consultor', school_id: SCHOOL }], ['courses', 'assignments', 'community', 'sessions', 'advisory', 'system']],
    ['global consultor', [{ role_type: 'consultor' }], ['courses', 'assignments', 'sessions', 'advisory', 'system']],
    ['equipo_directivo of a school', [{ role_type: 'equipo_directivo', school_id: SCHOOL }], BASE],
    ['lider_generacion', [{ role_type: 'lider_generacion', school_id: SCHOOL, generation_id: 'g' }], BASE],
    ['lider_comunidad', [{ role_type: 'lider_comunidad', school_id: SCHOOL, community_id: COMMUNITY }], ['courses', 'assignments', 'community', 'sessions', 'advisory', 'system']],
    ['supervisor_de_red', [{ role_type: 'supervisor_de_red' }], BASE],
    ['community_manager', [{ role_type: 'community_manager' }], BASE],
    ['encargado_licitacion of a school', [{ role_type: 'encargado_licitacion', school_id: SCHOOL }], ['courses', 'assignments', 'advisory', 'licitaciones', 'system']],
    ['encargado_licitacion without a school', [{ role_type: 'encargado_licitacion' }], BASE],
    ['docente in a community + encargado', [{ role_type: 'docente', community_id: COMMUNITY }, { role_type: 'encargado_licitacion', school_id: SCHOOL }], ['courses', 'assignments', 'community', 'sessions', 'advisory', 'licitaciones', 'system']],
    ['no active role', [], []],
  ])('%s', async (_name, roles, expected) => {
    expect(categoriesOf(await propsFor(roles))).toEqual(expected);
  });

  it('only active roles are read', async () => {
    await propsFor([{ role_type: 'docente' }]);
    expect(db.reads.find((r) => r.table === 'user_roles')?.filters).toEqual([['user_id', OWNER], ['is_active', true]]);
  });

  it('events are filtered inside a category; an unwired audience never appears', async () => {
    const member = await propsFor([{ role_type: 'docente', community_id: COMMUNITY }]);
    expect(eventsOf(member, 'sessions')).toEqual(['session_created', 'session_rescheduled', 'session_cancelled', 'session_reminder_24h', 'session_reminder_1h']);
    expect(eventsOf(member, 'assignments')).toEqual(['assignment_created', 'assignment_feedback', 'assignment_due_soon', 'group_invitation', 'quiz_reviewed']);
    const consultor = await propsFor([{ role_type: 'consultor', school_id: SCHOOL }]);
    expect(eventsOf(consultor, 'sessions')).toContain('session_edit_request_approved');
    expect(eventsOf(consultor, 'sessions')).not.toContain('session_edit_request_submitted');
    const encargado = await propsFor([{ role_type: 'encargado_licitacion', school_id: SCHOOL }]);
    expect(eventsOf(encargado, 'licitaciones')).not.toContain('licitacion_contrato_generado');
    const admin = await propsFor([{ role_type: 'admin' }]);
    expect(eventsOf(admin, 'courses')).not.toContain('learning_path_assigned');
    expect(admin.categories?.find((c) => c.category === 'sessions')?.events.find((e) => e.event_type === 'session_cancelled')?.label).toBe('Sesión cancelada');
  });

  it.each([
    ['admin', [{ role_type: 'admin' }], true, true],
    ['consultor of a school', [{ role_type: 'consultor', school_id: SCHOOL }], true, true],
    ['equipo_directivo of a school', [{ role_type: 'equipo_directivo', school_id: SCHOOL }], true, false],
    ['docente', [{ role_type: 'docente', school_id: SCHOOL }], false, false],
  ])('reviewer events: %s', async (_name, roles, quizReviewer, groupConsultant) => {
    const events = eventsOf(await propsFor(roles), 'assignments');
    expect(events.includes('quiz_review_pending')).toBe(quizReviewer);
    expect(events.includes('group_assignment_submitted')).toBe(groupConsultant);
  });

  it('the QA tester flag adds only the scenario event', async () => {
    expect(eventsOf(await propsFor([{ role_type: 'docente' }], true), 'qa_support')).toEqual(['qa_scenario_assigned']);
  });

  it('an unreadable role list gives no categories (the page shows a read error)', async () => {
    signedIn();
    db.rolesError = true;
    const result = await getServerSideProps(context());
    expect('props' in result && (await result.props)).toEqual({ ownerId: OWNER, categories: null });
  });
});

// ---------------------------------------------------------------------------
// The page against a fake of the N4-01 route built on its real logic.
// ---------------------------------------------------------------------------

const api = {
  rows: [] as CategoryRow[],
  legacy: [] as LegacyRow[],
  digest: false,
  address: 'unavailable' as 'suppressed' | 'clear' | 'unavailable',
  puts: [] as unknown[],
  /** One-shot overrides: a status with a body, a pending promise, or a thrown error. */
  next: [] as Array<{ status: number; body: unknown } | Promise<Response> | 'throw'>,
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const view = () => buildPreferencesView({ categoryRows: api.rows, legacyRows: api.legacy, digestAvailable: api.digest, addressSuppression: api.address });

async function fakeRoute(url: string, init?: RequestInit): Promise<Response> {
  expect(url).toBe('/api/user/notification-preferences');
  const override = api.next.shift();
  if (override === 'throw') throw new TypeError('Failed to fetch');
  if (override instanceof Promise) return override;
  if (override) return json(override.status, override.body);
  if (!init?.method || init.method === 'GET') return json(200, view());
  const body = JSON.parse(String(init.body));
  api.puts.push(body);
  const parsed = parsePreferencesUpdate(body);
  if ('code' in parsed) return json(400, { error: 'Solicitud inválida', code: parsed.code });
  if (selectsUnavailableDigest(parsed.choices, api.rows, api.digest)) return json(400, { error: 'Resumen no disponible', code: 'digest_unavailable' });
  api.rows = mergeRows(api.rows, parsed.choices);
  return json(200, view());
}

const ev = (event_type: string, label: string) => ({ event_type, label });
const MEMBER = [
  { category: 'assignments', events: [ev('assignment_created', 'Nueva tarea asignada'), ev('assignment_feedback', 'Has recibido retroalimentación')] },
  { category: 'sessions', events: [ev('session_created', 'Nueva sesión agendada'), ev('session_cancelled', 'Sesión cancelada')] },
  { category: 'system', events: [ev('system_update', 'Actualización del sistema')] },
];

function renderPage(categories: Props['categories'] = MEMBER) {
  return render(<Page ownerId={OWNER} categories={categories as any} />);
}

const modeSelect = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;
const optionsOf = (label: string) => Array.from(modeSelect(label).options).map((o) => [o.value, o.disabled]);
const loaded = () => screen.findByTestId('ns-category-sessions');

describe('D2/D3/D4 — the page', () => {
  beforeEach(() => {
    Object.assign(api, { rows: [], legacy: [], digest: false, address: 'unavailable', puts: [], next: [] });
    vi.stubGlobal('fetch', vi.fn(fakeRoute));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('D2: hidden categories stay hidden; mandatory, legacy and address notices are shown', async () => {
    api.legacy = [{ notification_type: 'assignment_created', email_enabled: false }];
    api.rows = [{ category: 'licitaciones', email_mode: 'off' }];
    renderPage();
    await loaded();
    expect(screen.queryByTestId('ns-category-licitaciones')).toBeNull();
    expect(screen.queryByTestId('ns-category-courses')).toBeNull();
    expect(within(screen.getByTestId('ns-mandatory')).getByText('Sesión cancelada')).toBeInTheDocument();
    expect(screen.getByTestId('ns-event-session_cancelled')).toHaveTextContent('Se envía siempre');
    expect(screen.getByTestId('ns-event-assignment_created')).toHaveTextContent('No se envía');
    expect(screen.getByTestId('ns-legacy-assignment_created')).toBeInTheDocument();
    expect(screen.getByTestId('ns-event-assignment_feedback')).toHaveTextContent('Se envía de inmediato');
    expect(screen.getByTestId('ns-address-unavailable')).toHaveTextContent('No pudimos comprobar');
  });

  it.each([
    ['suppressed', 'tu dirección rechazó mensajes'],
    ['clear', 'con normalidad'],
  ] as const)('D2: address %s has its own notice', async (state, text) => {
    api.address = state;
    renderPage();
    expect(await screen.findByTestId(`ns-address-${state}`)).toHaveTextContent(text);
  });

  it('D2: no mandatory list when its category does not apply; no categories is an empty state', async () => {
    const { unmount } = renderPage([MEMBER[0]]);
    await screen.findByTestId('ns-category-assignments');
    expect(screen.queryByTestId('ns-mandatory')).toBeNull();
    unmount();
    renderPage([]);
    expect(await screen.findByTestId('ns-empty')).toHaveTextContent('no tiene avisos');
  });

  it('D3: off and immediate save only the changed categories and survive a reload; mandatory is unaffected', async () => {
    const user = userEvent.setup();
    api.rows = [{ category: 'licitaciones', email_mode: 'off' }];
    const { unmount } = renderPage();
    await loaded();
    expect(screen.getByTestId('ns-save')).toBeDisabled();
    await user.selectOptions(modeSelect('Sesiones de consultoría'), 'off');
    await user.selectOptions(modeSelect('Tareas y evaluaciones'), 'immediate');
    expect(screen.getByTestId('ns-unsaved')).toBeInTheDocument();
    await user.click(screen.getByTestId('ns-save'));
    expect(await screen.findByTestId('ns-saved')).toHaveTextContent('Tus preferencias se guardaron.');
    expect(api.puts).toEqual([{ categories: [{ category: 'assignments', email_mode: 'immediate' }, { category: 'sessions', email_mode: 'off' }] }]);
    expect(api.rows).toContainEqual({ category: 'licitaciones', email_mode: 'off' });
    unmount();

    renderPage();
    await loaded();
    expect(modeSelect('Sesiones de consultoría').value).toBe('off');
    expect(modeSelect('Tareas y evaluaciones').value).toBe('immediate');
    expect(screen.getByTestId('ns-event-session_created')).toHaveTextContent('No se envía');
    expect(screen.getByTestId('ns-event-session_cancelled')).toHaveTextContent('Se envía siempre');
    expect(screen.getByTestId('ns-save')).toBeDisabled();
  });

  it('D3: Predeterminado re-applies the legacy switch-off', async () => {
    const user = userEvent.setup();
    api.legacy = [{ notification_type: 'assignment_created', email_enabled: false }];
    api.rows = [{ category: 'assignments', email_mode: 'immediate' }];
    renderPage();
    await loaded();
    expect(screen.getByTestId('ns-event-assignment_created')).toHaveTextContent('Se envía de inmediato');
    expect(screen.queryByTestId('ns-legacy-assignment_created')).toBeNull();
    await user.selectOptions(modeSelect('Tareas y evaluaciones'), 'default');
    await user.click(screen.getByTestId('ns-save'));
    await screen.findByTestId('ns-saved');
    expect(api.puts).toEqual([{ categories: [{ category: 'assignments', email_mode: 'default' }] }]);
    expect(screen.getByTestId('ns-event-assignment_created')).toHaveTextContent('No se envía');
    expect(screen.getByTestId('ns-legacy-assignment_created')).toBeInTheDocument();
  });

  it('D3: flag off — Resumen diario is never offered; a stored digest is shown, kept and explained', async () => {
    const user = userEvent.setup();
    api.rows = [{ category: 'system', email_mode: 'digest' }];
    renderPage();
    await loaded();
    expect(optionsOf('Sesiones de consultoría')).toEqual([['default', false], ['immediate', false], ['off', false]]);
    expect(optionsOf('Sistema')).toEqual([['default', false], ['immediate', false], ['digest', true], ['off', false]]);
    expect(modeSelect('Sistema').value).toBe('digest');
    expect(modeSelect('Sistema').selectedOptions[0]).toHaveTextContent('Opción anterior (se envía de inmediato)');
    const optionTexts = screen.getAllByRole('combobox').flatMap((select) => Array.from((select as HTMLSelectElement).options).map((o) => o.text));
    expect(optionTexts.filter((text) => /resumen diario/i.test(text))).toEqual([]);
    expect(screen.getByTestId('ns-stored-digest-system')).toHaveTextContent('se envían de inmediato');
    expect(screen.getByTestId('ns-digest-note')).toHaveTextContent('todavía no está disponible');
    await user.selectOptions(modeSelect('Sesiones de consultoría'), 'off');
    await user.click(screen.getByTestId('ns-save'));
    await screen.findByTestId('ns-saved');
    expect(api.puts).toEqual([{ categories: [{ category: 'sessions', email_mode: 'off' }] }]);
    expect(api.rows).toContainEqual({ category: 'system', email_mode: 'digest' });
  });

  it('D3: flag off — an explicit change replaces a stored digest, which then cannot be picked again', async () => {
    const user = userEvent.setup();
    api.rows = [{ category: 'system', email_mode: 'digest' }];
    renderPage();
    await loaded();
    await user.selectOptions(modeSelect('Sistema'), 'immediate');
    await user.click(screen.getByTestId('ns-save'));
    await screen.findByTestId('ns-saved');
    expect(api.puts).toEqual([{ categories: [{ category: 'system', email_mode: 'immediate' }] }]);
    expect(api.rows).toEqual([{ category: 'system', email_mode: 'immediate' }]);
    expect(optionsOf('Sistema')).toEqual([['default', false], ['immediate', false], ['off', false]]);
    expect(screen.queryByTestId('ns-stored-digest-system')).toBeNull();
  });

  it('D3: flag on — Resumen diario is offered and saved, with no promised hour', async () => {
    const user = userEvent.setup();
    api.digest = true;
    renderPage();
    await loaded();
    expect(optionsOf('Sesiones de consultoría')).toEqual([['default', false], ['immediate', false], ['digest', false], ['off', false]]);
    expect(screen.getByTestId('ns-digest-note')).toHaveTextContent('Por ahora no puedes elegir la hora de envío.');
    await user.selectOptions(modeSelect('Sesiones de consultoría'), 'digest');
    await user.click(screen.getByTestId('ns-save'));
    await screen.findByTestId('ns-saved');
    expect(api.rows).toEqual([{ category: 'sessions', email_mode: 'digest' }]);
    expect(screen.getByTestId('ns-event-session_created')).toHaveTextContent('Va en el resumen diario');
  });

  it('D4: loading, then a read error with a working retry', async () => {
    const user = userEvent.setup();
    let release!: (response: Response) => void;
    api.next = [new Promise<Response>((resolve) => (release = resolve))];
    renderPage();
    expect(screen.getByTestId('ns-loading')).toHaveTextContent('Cargando tus preferencias');
    await act(async () => release(json(500, { error: 'x', code: 'read_failed' })));
    expect(await screen.findByTestId('ns-error')).toHaveTextContent('No pudimos cargar tus preferencias.');
    api.next = ['throw'];
    await user.click(screen.getByTestId('ns-retry'));
    expect(await screen.findByTestId('ns-error')).toBeInTheDocument();
    await user.click(screen.getByTestId('ns-retry'));
    await loaded();
    expect(screen.queryByTestId('ns-error')).toBeNull();
  });

  it('D4: no categories from the server is a read error whose retry reloads the page', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    renderPage(null);
    expect(screen.getByTestId('ns-error')).toBeInTheDocument();
    await user.click(screen.getByTestId('ns-retry'));
    expect(reload).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('D4: a refused or failed save shows the reason, keeps the choice, never claims success', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.selectOptions(modeSelect('Sistema'), 'off');
    api.next = [{ status: 500, body: { error: 'No se pudieron guardar las preferencias', code: 'write_failed' } }];
    await user.click(screen.getByTestId('ns-save'));
    expect(await screen.findByTestId('ns-save-error')).toHaveTextContent('No se pudieron guardar las preferencias');
    api.next = ['throw'];
    await user.click(screen.getByTestId('ns-save'));
    expect(await screen.findByTestId('ns-save-error')).toHaveTextContent('Intenta nuevamente');
    expect(screen.queryByTestId('ns-saved')).toBeNull();
    expect(modeSelect('Sistema').value).toBe('off');
    expect(screen.getByTestId('ns-save')).toBeEnabled();
    expect(api.rows).toEqual([]);
  });

  it('D4: save is disabled while it runs; a double click sends one request', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.selectOptions(modeSelect('Sistema'), 'immediate');
    let release!: (response: Response) => void;
    api.next = [new Promise<Response>((resolve) => (release = resolve))];
    await user.dblClick(screen.getByTestId('ns-save'));
    expect(screen.getByTestId('ns-save')).toBeDisabled();
    expect(screen.getByTestId('ns-save')).toHaveTextContent('Guardando…');
    expect(modeSelect('Sistema')).toBeDisabled();
    expect((fetch as any).mock.calls.filter(([, init]: [string, RequestInit?]) => init?.method === 'PUT')).toHaveLength(1);
    api.rows = [{ category: 'system', email_mode: 'immediate' }];
    await act(async () => release(json(200, view())));
    expect(await screen.findByTestId('ns-saved')).toBeInTheDocument();
  });

  it('D4: an expired session sends the user to log in again', async () => {
    api.next = [{ status: 401, body: { error: 'No autorizado' } }];
    renderPage();
    const panel = await screen.findByTestId('ns-expired');
    expect(within(panel).getByRole('link', { name: 'Inicia sesión nuevamente' })).toHaveAttribute('href', '/login?next=%2Fconfiguracion%2Fnotificaciones');
  });

  it('D4: a delayed answer after the session changed is dropped, never shown', async () => {
    let release!: (response: Response) => void;
    api.next = [new Promise<Response>((resolve) => (release = resolve))];
    const { rerender } = renderPage();
    sessionContext.session = { user: { id: OTHER } };
    rerender(<Page ownerId={OWNER} categories={MEMBER as any} />);
    expect(await screen.findByTestId('ns-session-changed')).toHaveTextContent('Tu sesión cambió');
    await act(async () => release(json(200, view())));
    expect(screen.queryByTestId('ns-category-sessions')).toBeNull();
    expect(screen.getByTestId('ns-session-changed')).toBeInTheDocument();
  });

  it('D4: signing out elsewhere during a save shows no success and drops the settings', async () => {
    const user = userEvent.setup();
    const { rerender } = renderPage();
    await loaded();
    await user.selectOptions(modeSelect('Sistema'), 'off');
    let release!: (response: Response) => void;
    api.next = [new Promise<Response>((resolve) => (release = resolve))];
    await user.click(screen.getByTestId('ns-save'));
    sessionContext.session = null;
    rerender(<Page ownerId={OWNER} categories={MEMBER as any} />);
    await act(async () => release(json(200, view())));
    expect(screen.getByTestId('ns-session-changed')).toBeInTheDocument();
    expect(screen.queryByTestId('ns-saved')).toBeNull();
    expect(screen.queryByTestId('ns-category-system')).toBeNull();
  });

  it('D4: labelled controls work from the keyboard', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const select = modeSelect('Sistema');
    select.focus();
    await user.selectOptions(select, 'off');
    expect(screen.getByTestId('ns-save')).toBeEnabled();
    screen.getByTestId('ns-save').focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(api.rows).toEqual([{ category: 'system', email_mode: 'off' }]));
    expect(await screen.findByTestId('ns-saved')).toBeInTheDocument();
    for (const label of ['Tareas y evaluaciones', 'Sesiones de consultoría', 'Sistema']) {
      expect(modeSelect(label).id).toBe(modeSelect(label).getAttribute('data-testid'));
    }
  });
});
