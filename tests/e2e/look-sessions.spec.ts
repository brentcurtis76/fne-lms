import { test, expect, type Browser, type BrowserContext, type Page, type Request, type Response } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Redesign 6S, release SB — the new view of the three session screens (the consultant's list «Mis
 * Sesiones», one session, and the admin's form «Programar Sesión»), in a real browser against the running
 * app and the real database policies, signed in through the real login page (the manner of
 * `look-panel.spec.ts`).
 *
 * 1. Switch off: a QA tester who has not chosen «Diseño nuevo», and an admin who is not a tester, get
 *    today's three screens (none of the new view's test ids on the page).
 * 2. The list, switched on: the two tabs carry counts equal to the data; a row opens its session by
 *    Enter; «Exportar Calendario» has the same address as in today's view for the same account.
 * 3. One session, switched on: opened from the new list (so the account's look is already known; the
 *    page does not wait for the look, and a profile arriving after the session would leave today's body,
 *    which is not tested here), the new view is attached once and today's body never, and stays so; the
 *    Zoom suggestions request and GET /api/sessions/:id are each sent once; the finalize card's button is
 *    disabled at «En Progreso»; «Cancelar» in the material's delete pop-up
 *    deletes nothing; a consultor of the school who does not facilitate gets the read-mode band (also
 *    opened from the new list, its other tab).
 * 4. The form, switched on: an empty press lists every failed check and sends nothing; Enter in the title
 *    opens the confirmation, Enter in «Descripción» does not; a school change empties the community, the
 *    consultants and the contract and offers the other school's community; the lead moves among three
 *    consultants; with only «Tipo de Hora» chosen and the server's refusal faked, its message shows under
 *    the two selects beside the toast, and no drafts notice; with the approval answer faked to 500 the
 *    error toast and the drafts notice show; with a real approval the page lands where today's flow lands.
 * 5. At 320 px none of the three screens scrolls sideways (the session page opened from the new list).
 *
 * Synthetic *@qa.local.test users, two schools each with a community, three consultants of the first
 * school and a few sessions of several statuses, on a local database only. Each school, community,
 * session and account is written down in `made` only once its insertion has succeeded, and afterAll
 * deletes only by those records (the sessions the form creates are found again under this run's own
 * schools, and what their approval writes by their ids). A school id is only chosen at random: when its
 * insertion collides with an existing school, the run fails and deletes nothing it did not create.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const RUN = randomBytes(4).toString('hex');
const PASSWORD = `Sesiones-${randomBytes(12).toString('base64url')}!a1`;
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];
const LOOK_PAGE = '/configuracion/apariencia';
const LIST_PAGE = '/consultor/sessions';
const FORM_PAGE = '/admin/sessions/create';
const SEED = parseInt(RUN.slice(0, 4), 16) % 100_000;
const SCHOOL_A = 9_700_000 + SEED;
const SCHOOL_B = 9_800_000 + SEED;
const SCHOOL_A_NAME = `Colegio Sintetico Sesiones A ${RUN}`;
const SCHOOL_B_NAME = `Colegio Sintetico Sesiones B ${RUN}`;
const COMMUNITY_A_NAME = `Comunidad Sintetica Sesiones A ${RUN}`;
const COMMUNITY_B_NAME = `Comunidad Sintetica Sesiones B ${RUN}`;
const MATERIAL_NAME = `Pauta_sintetica_${RUN}.pdf`;
const FORM_TITLE = `Sesion Sintetica Programada ${RUN}`;
// The server's words when only one of hour type and contract is chosen (lib/services/hour-tracking.ts).
const PAIR_REFUSAL = 'El contrato y el tipo de hora deben configurarse juntos.';
// One synthetic hour type, answered by a faked GET /api/hour-types (the run's data has no contract).
const HOUR_TYPE = { id: `ht-sintetico-${RUN}`, key: `sintetico_${RUN}`, display_name: `Tipo Sintetico ${RUN}`, modality: 'presencial', sort_order: 1 };

type Account = { id: string; email: string; first: string; last: string };
const account = (slug: string, first: string, last: string): Account => ({
  id: '',
  email: `look-sessions-${slug}-${RUN}@qa.local.test`,
  first,
  last,
});
// Three consultants of school A (QA testers): the first facilitates the sessions, the second facilitates
// only one (and reads the others), the third is only offered by the form.
const lead = account('c1', 'Consultora', 'Sintetica Uno');
const reader = account('c2', 'Consultor', 'Sintetico Dos');
const third = account('c3', 'Consultora', 'Sintetica Tres');
// An admin who is a QA tester (the form), and one who is not (today's screens only).
const admin = account('admin', 'Admin', 'Sintetico Sesiones');
const plainAdmin = account('admin-plain', 'Admin', 'Sintetico Sin Prueba');
const ACCOUNTS = [lead, reader, third, admin, plainAdmin];

const SESSIONS = {
  programada: { title: `Sesion Sintetica Programada Lista ${RUN}`, status: 'programada', date: '2030-04-02' },
  enProgreso: { title: `Sesion Sintetica En Progreso ${RUN}`, status: 'en_progreso', date: '2026-01-14' },
  pendienteInforme: { title: `Sesion Sintetica Pendiente Informe ${RUN}`, status: 'pendiente_informe', date: '2026-01-13' },
  completada: { title: `Sesion Sintetica Completada ${RUN}`, status: 'completada', date: '2026-01-12' },
  // Facilitated by the second consultant only: «Otras Sesiones en Mis Colegios» for the first.
  otra: { title: `Sesion Sintetica De Otro Consultor ${RUN}`, status: 'programada', date: '2030-04-16' },
} as const;
type SessionKey = keyof typeof SESSIONS;

const ids = {
  communityA: '',
  communityB: '',
  sessions: {} as Partial<Record<SessionKey, string>>,
  material: '',
  // The sessions the form creates through the page (found again by school in afterAll too).
  created: [] as string[],
};
// What this run has created, written down only after each insertion succeeded: afterAll deletes by
// these records and never by an id that was only chosen (the accounts: `person.id`, set on creation).
const made = {
  schools: [] as number[],
  communities: [] as string[],
};
let service: SupabaseClient;

/** Every test id the new view of the three screens draws (none of them exists in today's views). */
const NEW_VIEW = [
  '[data-testid="sessions-list-nuevo"]',
  '[data-testid="session-detail-nuevo"]',
  '[data-testid="session-finalize-card"]',
  '[data-testid="session-finalize-dialog"]',
  '[data-testid="session-material-delete"]',
  '[data-testid^="session-create-nuevo"]',
].join(', ');

function must<T>(label: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

/** One deletion of the cleanup: its label (the table) and the request. */
type Removal = [label: string, run: () => PromiseLike<{ error: { message: string } | null }>];

/**
 * Runs every deletion, even after one fails, and answers the failures («table: message»). A request
 * that throws counts as a failure too. Deleting what was never inserted removes nothing and is no
 * failure, so the same list cleans up after a seeding that stopped halfway.
 */
async function removeAll(removals: Removal[]): Promise<string[]> {
  const failures: string[] = [];
  for (const [label, run] of removals) {
    try {
      const { error } = await run();
      if (error) failures.push(`${label}: ${error.message}`);
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return failures;
}

async function createAccount(person: Account, role: string, extra: Record<string, unknown>, tester: boolean) {
  const created = await service.auth.admin.createUser({ email: person.email, password: PASSWORD, email_confirm: true });
  if (created.error) throw new Error(`createUser: ${created.error.message}`);
  person.id = created.data.user.id;
  must('profile', await service.from('profiles').upsert(
    {
      id: person.id,
      email: person.email,
      name: `${person.first} ${person.last}`,
      first_name: person.first,
      last_name: person.last,
      must_change_password: false,
      approval_status: 'approved',
      can_run_qa_tests: tester,
      learning_preferences: {},
    },
    { onConflict: 'id' }
  ));
  must('roles', await service.from('user_roles').insert({ user_id: person.id, role_type: role, is_active: true, ...extra }));
}

/** The deletions of one account (none when it was never created). */
function accountRemovals(person: { id: string }): Removal[] {
  if (!person.id) return [];
  return [
    ['user_notifications', () => service.from('user_notifications').delete().eq('user_id', person.id)],
    ['user_notification_category_prefs', () => service.from('user_notification_category_prefs').delete().eq('user_id', person.id)],
    ['user_roles', () => service.from('user_roles').delete().eq('user_id', person.id)],
    ['profiles', () => service.from('profiles').delete().eq('id', person.id)],
    ['auth.users', () => service.auth.admin.deleteUser(person.id)],
  ];
}

async function insertSession(key: SessionKey, facilitator: Account) {
  const spec = SESSIONS[key];
  const row = must('session', await service.from('consultor_sessions').insert({
    school_id: SCHOOL_A,
    growth_community_id: ids.communityA,
    title: spec.title,
    description: 'Descripción sintética de la sesión',
    objectives: 'Objetivos sintéticos de la sesión',
    session_date: spec.date,
    start_time: '10:00:00',
    end_time: '11:30:00',
    modality: 'presencial',
    location: 'Sala Sintetica',
    status: spec.status,
    created_by: admin.id,
    is_active: true,
  }).select('id').single()) as { id: string };
  ids.sessions[key] = row.id;
  must('facilitator', await service.from('session_facilitators').insert({
    session_id: row.id,
    user_id: facilitator.id,
    facilitator_role: 'consultor_externo',
    is_lead: true,
  }));
}

/** A browser context, closed whatever happens inside. */
async function withContext(context: BrowserContext, body: () => Promise<void>) {
  try {
    await body();
  } finally {
    await context.close();
  }
}

async function signedIn(browser: Browser, person: { email: string }, viewport = { width: 1366, height: 768 }) {
  const context = await browser.newContext({ viewport, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  try {
    await page.goto('/login');
    await page.getByPlaceholder('tu@email.com').fill(person.email);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 60_000 });
  } catch (error) {
    await context.close();
    throw error;
  }
  return { context, page, problems };
}

const lookOf = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-look'));

async function chooseLook(page: Page, label: RegExp) {
  await page.goto(LOOK_PAGE);
  await expect(page.getByRole('heading', { name: 'Apariencia' })).toBeVisible({ timeout: 60_000 });
  await page.getByLabel(label).check();
  await page.getByTestId('look-save').click();
  await expect(page.getByTestId('look-saved')).toBeVisible();
}
const NUEVO = /Diseño nuevo \(en construcción\)/;
const ACTUAL = /Diseño actual/;

const sessionPage = (key: SessionKey) => `/consultor/sessions/${ids.sessions[key]}`;
const pathOf = (request: Request) => new URL(request.url()).pathname;
const isCreate = (request: Request) => request.method() === 'POST' && pathOf(request) === '/api/sessions';
const isCreateAnswer = (response: Response) => isCreate(response.request());

/** The sessions of school A as the consultant's list counts them: facilitated by him, or not. */
async function tabCounts(consultant: Account) {
  const rows = must('sessions', await service
    .from('consultor_sessions')
    .select('id, session_facilitators(user_id)')
    .eq('school_id', SCHOOL_A)
    .eq('is_active', true)) as Array<{ id: string; session_facilitators: Array<{ user_id: string }> }>;
  const mine = rows.filter((row) => row.session_facilitators.some((f) => f.user_id === consultant.id)).length;
  return { mine, others: rows.length - mine };
}

/** No sideways scroll: the page is no wider than the screen. */
async function noSidewaysScroll(page: Page) {
  const widths = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return { scroll: root.scrollWidth, client: root.clientWidth };
  });
  expect(widths.scroll, `scrollWidth ${widths.scroll} > clientWidth ${widths.client}`).toBeLessThanOrEqual(widths.client);
}

/** Today's list, once its body is drawn: no part of the new view. */
async function todaysList(page: Page) {
  await page.goto(LIST_PAGE);
  await expect(page.getByRole('heading', { name: 'Otras Sesiones en Mis Colegios' })).toBeVisible({ timeout: 60_000 });
  expect(await lookOf(page)).toBeNull();
  await expect(page.locator(NEW_VIEW)).toHaveCount(0);
}

/** Today's session page, once its body is drawn (its title in today's heading): no part of the new view. */
async function todaysSession(page: Page, key: SessionKey) {
  await page.goto(sessionPage(key));
  await expect(page.locator('h1', { hasText: SESSIONS[key].title })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Detalles' })).toBeVisible();
  expect(await lookOf(page)).toBeNull();
  await expect(page.locator(NEW_VIEW)).toHaveCount(0);
}

/**
 * One session opened from the new list once that list is drawn (so the account's look is known before
 * the session page draws its body), by a click inside the app; `tab` names the list's tab to open first.
 */
async function openFromTheNewList(page: Page, key: SessionKey, tab: RegExp) {
  await page.goto(LIST_PAGE);
  await expect.poll(() => lookOf(page), { timeout: 60_000 }).toBe('nuevo');
  await expect(page.getByTestId('sessions-list-nuevo')).toBeVisible({ timeout: 60_000 });
  const other = page.getByRole('tab', { name: tab });
  await other.click();
  await expect(other).toHaveAttribute('aria-selected', 'true');
  const row = page.getByRole('link', { name: `Ver detalles de ${SESSIONS[key].title}` });
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.click();
  await expect(page).toHaveURL(new RegExp(`${sessionPage(key)}$`), { timeout: 60_000 });
}

/** Today's form, once its fields are drawn: no part of the new view. */
async function todaysForm(page: Page) {
  await page.goto(FORM_PAGE);
  await expect(page.getByRole('heading', { name: 'Programar Sesión' })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('select[name="school_id"]')).toBeVisible({ timeout: 60_000 });
  expect(await lookOf(page)).toBeNull();
  await expect(page.locator(NEW_VIEW)).toHaveCount(0);
}

/** The new form, drawn. */
async function newForm(page: Page) {
  await page.goto(FORM_PAGE);
  await expect(page.getByTestId('session-create-nuevo-form')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#create-session-school option', { hasText: SCHOOL_A_NAME })).toHaveCount(1, { timeout: 60_000 });
}

/** The form's consultant rows and its selector. */
const consultantRows = (page: Page) => page.locator('#create-session-consultants li');
const consultantRow = (page: Page, person: Account) => consultantRows(page).filter({ hasText: person.email });
async function addConsultant(page: Page, person: Account) {
  await page.locator('#create-session-consultants select').selectOption({ label: `${person.first} ${person.last} (${person.email})` });
  await expect(consultantRow(page, person)).toHaveCount(1, { timeout: 60_000 });
}
async function chooseSchool(page: Page, name: string, community: string | null) {
  await page.locator('#create-session-school').selectOption({ label: name });
  if (community) {
    // The option itself, not only the field: the school's communities arrive after the field is enabled.
    await expect(page.locator('#create-session-community')).toBeEnabled({ timeout: 60_000 });
    await expect(page.locator('#create-session-community option', { hasText: community })).toHaveCount(1, { timeout: 60_000 });
    await page.locator('#create-session-community').selectOption({ label: community });
  }
}

/** The occurrence reference the notification audit keeps for a session's «session_created» (lib/notificationService.ts). */
const createdRef = (sessionId: string) =>
  `occ-${createHash('sha256').update(JSON.stringify(['session_created', `record:${sessionId.toLowerCase()}`]), 'utf8').digest('hex')}`;

test.describe.configure({ mode: 'serial', timeout: 300_000 });

test.describe('the new view of the three session screens (redesign 6S, release SB)', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase URL and service key are required');
    const target = new URL(SUPABASE_URL);
    if (!LOCAL_HOSTS.includes(target.hostname.replace(/^\[|\]$/g, ''))) throw new Error('look-sessions refuses a non-local database');
    if (!process.env.CI && ['54321', '54322'].includes(target.port)) throw new Error('look-sessions refuses the shared default stack');
    service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // A school is recorded only once its insertion succeeded: a colliding id throws here, unrecorded.
    must('school A', await service.from('schools').insert({ id: SCHOOL_A, name: SCHOOL_A_NAME, tenant_kind: 'client' }));
    made.schools.push(SCHOOL_A);
    must('school B', await service.from('schools').insert({ id: SCHOOL_B, name: SCHOOL_B_NAME, tenant_kind: 'client' }));
    made.schools.push(SCHOOL_B);
    const communityA = must(
      'community A',
      await service.from('growth_communities').insert({ name: COMMUNITY_A_NAME, school_id: SCHOOL_A }).select('id').single()
    ) as { id: string };
    ids.communityA = communityA.id;
    made.communities.push(communityA.id);
    const communityB = must(
      'community B',
      await service.from('growth_communities').insert({ name: COMMUNITY_B_NAME, school_id: SCHOOL_B }).select('id').single()
    ) as { id: string };
    ids.communityB = communityB.id;
    made.communities.push(communityB.id);

    // The consultants hold a consultor role of school A only: their list is school A's sessions.
    await createAccount(lead, 'consultor', { school_id: SCHOOL_A }, true);
    await createAccount(reader, 'consultor', { school_id: SCHOOL_A }, true);
    await createAccount(third, 'consultor', { school_id: SCHOOL_A }, true);
    await createAccount(admin, 'admin', {}, true);
    await createAccount(plainAdmin, 'admin', {}, false);

    await insertSession('programada', lead);
    await insertSession('enProgreso', lead);
    await insertSession('pendienteInforme', lead);
    await insertSession('completada', lead);
    await insertSession('otra', reader);

    // A material of the session in progress, uploaded by its facilitator: the bin is offered to him. No
    // file is stored; the row alone is what the tab lists.
    const sessionId = ids.sessions.enProgreso!;
    const material = must('material', await service.from('session_materials').insert({
      session_id: sessionId,
      uploaded_by: lead.id,
      file_name: MATERIAL_NAME,
      file_url: `storage://session-materials/sessions/${sessionId}/${MATERIAL_NAME}`,
      storage_path: `sessions/${sessionId}/${MATERIAL_NAME}`,
      file_type: 'application/pdf',
      file_size: 48_000,
      visibility: 'all_participants',
    }).select('id').single()) as { id: string };
    ids.material = material.id;
  });

  test.afterAll(async () => {
    if (!service) return;
    // Only what this run created: the schools it inserted (none when the first insertion collided).
    const ourSchools = [...made.schools];
    // Every session of this run's own schools, the seeded ones and those the form created.
    const found = ourSchools.length
      ? await service.from('consultor_sessions').select('id').in('school_id', ourSchools)
      : { data: [] as Array<{ id: string }>, error: null };
    const sessionIds = Array.from(new Set([
      ...Object.values(ids.sessions).filter((id): id is string => Boolean(id)),
      ...ids.created,
      ...((found.data ?? []) as Array<{ id: string }>).map((row) => row.id),
    ]));
    const userIds = ACCOUNTS.map((person) => person.id).filter(Boolean);
    // The mail queue of this run's people (the approval may queue a «session_created» mail), children first.
    const outbox = userIds.length
      ? ((await service.from('notification_email_outbox').select('id').in('user_id', userIds)).data ?? []) as Array<{ id: string }>
      : [];
    const outboxIds = outbox.map((row) => row.id);
    const bySession = (table: string): Removal => [table, () => service.from(table).delete().in('session_id', sessionIds)];

    const failures = await removeAll([
      ...(found.error ? ([['consultor_sessions (read)', async () => ({ error: found.error })]] as Removal[]) : []),
      ...(outboxIds.length
        ? ([
            ['notification_email_outbox_source', () => service.from('notification_email_outbox_source').delete().in('outbox_id', outboxIds)],
            ['notification_email_outbox_address', () => service.from('notification_email_outbox_address').delete().in('outbox_id', outboxIds)],
            ['notification_email_outbox', () => service.from('notification_email_outbox').delete().in('id', outboxIds)],
          ] as Removal[])
        : []),
      ...(sessionIds.length
        ? ([
            ['notification_events', () => service.from('notification_events').delete().in('event_data->>occurrence_ref', sessionIds.map(createdRef))],
            bySession('session_notifications'),
            bySession('session_activity_log'),
            bySession('session_materials'),
            bySession('session_reports'),
            bySession('session_edit_requests'),
            bySession('session_attendees'),
            bySession('session_facilitators'),
            ['consultor_sessions', () => service.from('consultor_sessions').delete().in('id', sessionIds)],
          ] as Removal[])
        : []),
      ...(ourSchools.length
        ? ([['consultor_sessions (by school)', () => service.from('consultor_sessions').delete().in('school_id', ourSchools)]] as Removal[])
        : []),
      ...ACCOUNTS.flatMap(accountRemovals),
      ...(made.communities.length
        ? ([['growth_communities', () => service.from('growth_communities').delete().in('id', made.communities)]] as Removal[])
        : []),
      ...(ourSchools.length ? ([['schools', () => service.from('schools').delete().in('id', ourSchools)]] as Removal[]) : []),
    ]);
    if (failures.length > 0) throw new Error(`look-sessions: the cleanup failed:\n${failures.join('\n')}`);
  });

  test('switch off: a tester who has not chosen the new design and a non-tester get today\'s three screens', async ({ browser }) => {
    // A consultant who is a tester, the look not chosen: today's list and session page.
    {
      const { context, page, problems } = await signedIn(browser, lead);
      await withContext(context, async () => {
        await todaysList(page);
        await todaysSession(page, 'enProgreso');
        expect(problems).toEqual([]);
      });
    }
    // An admin who is a tester, the look not chosen: today's form.
    {
      const { context, page, problems } = await signedIn(browser, admin);
      await withContext(context, async () => {
        await todaysForm(page);
        expect(problems).toEqual([]);
      });
    }
    // An admin who is not a tester: today's three screens.
    {
      const { context, page, problems } = await signedIn(browser, plainAdmin);
      await withContext(context, async () => {
        await todaysList(page);
        await todaysSession(page, 'enProgreso');
        await todaysForm(page);
        expect(problems).toEqual([]);
      });
    }
  });

  test('the list, switched on: tab counts equal the data, Enter opens a row, «Exportar Calendario» keeps today\'s address', async ({ browser }) => {
    const { context, page, problems } = await signedIn(browser, lead);
    await withContext(context, async () => {
      // Today's address of the export link, for this account.
      await todaysList(page);
      const exportToday = page.getByRole('link', { name: /Exportar Calendario/ });
      await expect(exportToday).toBeVisible({ timeout: 60_000 });
      const todaysHref = await exportToday.getAttribute('href');
      expect(todaysHref).toBeTruthy();

      await chooseLook(page, NUEVO);
      await page.goto(LIST_PAGE);
      await expect.poll(() => lookOf(page), { timeout: 60_000 }).toBe('nuevo');
      const list = page.getByTestId('sessions-list-nuevo');
      await expect(list).toBeVisible({ timeout: 60_000 });

      // The two tabs and their counts, against the database.
      const { mine, others } = await tabCounts(lead);
      expect(mine).toBe(4);
      expect(others).toBe(1);
      const mineTab = page.getByRole('tab', { name: new RegExp(`^Mis Sesiones\\s*${mine}$`) });
      const othersTab = page.getByRole('tab', { name: new RegExp(`^Otras Sesiones en Mis Colegios\\s*${others}$`) });
      await expect(mineTab).toBeVisible({ timeout: 60_000 });
      await expect(othersTab).toBeVisible();
      await expect(mineTab).toHaveAttribute('aria-selected', 'true');
      const rows = page.getByRole('tabpanel').getByRole('link', { name: /^Ver detalles de / });
      await expect(rows).toHaveCount(mine);
      await othersTab.click();
      await expect(othersTab).toHaveAttribute('aria-selected', 'true');
      await expect(rows).toHaveCount(others);
      await expect(page.getByRole('link', { name: `Ver detalles de ${SESSIONS.otra.title}` })).toBeVisible();
      await mineTab.click();
      await expect(rows).toHaveCount(mine);

      // The export link: the same address as today's view.
      const exportNew = list.getByRole('link', { name: /Exportar Calendario/ });
      await expect(exportNew).toBeVisible();
      expect(await exportNew.getAttribute('href')).toBe(todaysHref);

      // Enter on a row opens its session.
      const row = page.getByRole('link', { name: `Ver detalles de ${SESSIONS.programada.title}` });
      await row.focus();
      await expect(row).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`${sessionPage('programada')}$`), { timeout: 60_000 });
      await expect(page.getByTestId('session-detail-nuevo')).toBeVisible({ timeout: 60_000 });

      await chooseLook(page, ACTUAL);
      expect(problems).toEqual([]);
    });
  });

  test('one session, switched on: opened from the new list, drawn once, one request each, the finalize card, the delete pop-up, read mode', async ({ browser }) => {
    const title = SESSIONS.enProgreso.title;
    const sessionId = ids.sessions.enProgreso!;
    const { context, page, problems } = await signedIn(browser, lead);
    await withContext(context, async () => {
      await chooseLook(page, NUEVO);

      // The new list first: once it is drawn the account's look is known, so the session page opened
      // from it (inside the app, no new load) draws its body in the new view from the start.
      await page.goto(LIST_PAGE);
      await expect.poll(() => lookOf(page), { timeout: 60_000 }).toBe('nuevo');
      await expect(page.getByTestId('sessions-list-nuevo')).toBeVisible({ timeout: 60_000 });
      const row = page.getByRole('link', { name: `Ver detalles de ${title}` });
      await expect(row).toBeVisible({ timeout: 60_000 });

      // From here on the page records each new-view body it ever attaches, and whether today's body
      // (today's heading, the session's title outside the new view) ever attached.
      await page.evaluate((sessionTitle: string) => {
        const seen = new WeakSet<Element>();
        const state = { nuevo: 0, classic: false };
        (window as unknown as { __lookSessions: typeof state }).__lookSessions = state;
        const scan = () => {
          document.querySelectorAll('[data-testid="session-detail-nuevo"]').forEach((element) => {
            if (!seen.has(element)) {
              seen.add(element);
              state.nuevo += 1;
            }
          });
          document.querySelectorAll('h1').forEach((heading) => {
            if (!heading.closest('[data-testid="session-detail-nuevo"]') && (heading.textContent ?? '').trim() === sessionTitle) {
              state.classic = true;
            }
          });
        };
        new MutationObserver(scan).observe(document, { childList: true, subtree: true, characterData: true });
      }, title);
      const drawnSoFar = () =>
        page.evaluate(() => (window as unknown as { __lookSessions?: { nuevo: number; classic: boolean } }).__lookSessions ?? null);

      // The requests of this opening only.
      const detailGets: string[] = [];
      const suggestionGets: string[] = [];
      const materialDeletes: string[] = [];
      page.on('request', (request) => {
        const path = pathOf(request);
        if (request.method() === 'GET' && path === `/api/sessions/${sessionId}`) detailGets.push(request.url());
        if (path === `/api/sessions/${sessionId}/attendance-suggestions`) suggestionGets.push(request.url());
        if (request.method() === 'DELETE' && path.startsWith(`/api/sessions/${sessionId}/materials`)) materialDeletes.push(request.url());
      });
      const suggestionsAnswered = page.waitForResponse((response) => pathOf(response.request()) === `/api/sessions/${sessionId}/attendance-suggestions`, { timeout: 60_000 });
      await row.click();
      await expect(page).toHaveURL(new RegExp(`${sessionPage('enProgreso')}$`), { timeout: 60_000 });
      await expect(page.getByTestId('session-detail-nuevo')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('session-detail-nuevo').getByRole('heading', { name: title, level: 1 })).toBeVisible();
      await suggestionsAnswered;
      expect(detailGets).toHaveLength(1);
      expect(suggestionGets).toHaveLength(1);
      // Opened inside the app: the recorder set on the list is still there (a new load would have lost it).
      expect(await drawnSoFar()).toEqual({ nuevo: 1, classic: false });

      // The finalize card at «En Progreso»: its button disabled.
      const card = page.getByTestId('session-finalize-card');
      await expect(card).toBeVisible();
      await expect(card.getByRole('button', { name: 'Finalizar Sesión' })).toBeDisabled();

      // «Materiales»: the bin asks; «Cancelar» deletes nothing.
      await page.getByRole('tab', { name: 'Materiales' }).click();
      await expect(page.getByText(MATERIAL_NAME)).toBeVisible({ timeout: 60_000 });
      await page.getByRole('button', { name: `Eliminar ${MATERIAL_NAME}` }).click();
      const ask = page.getByTestId('session-material-delete');
      await expect(ask).toBeVisible();
      await expect(ask).toContainText(`¿Está seguro que desea eliminar "${MATERIAL_NAME}"?`);
      await page.getByTestId('session-material-delete-cancel').click();
      await expect(ask).toBeHidden();
      await expect(page.getByText(MATERIAL_NAME)).toBeVisible();
      expect(materialDeletes).toEqual([]);
      const kept = must('material', await service.from('session_materials').select('id').eq('id', ids.material)) as Array<{ id: string }>;
      expect(kept).toHaveLength(1);
      // The view is still the one attached when the session opened, and nothing was asked twice.
      expect(await drawnSoFar()).toEqual({ nuevo: 1, classic: false });
      expect(detailGets).toHaveLength(1);
      expect(suggestionGets).toHaveLength(1);

      await chooseLook(page, ACTUAL);
      expect(problems).toEqual([]);
    });

    // A consultor of the school who does not facilitate this session: read mode, no finalize card. Opened
    // from the settled new list (its «Otras Sesiones en Mis Colegios» tab), not by loading the page anew:
    // a profile arriving after the session would leave today's body, the accepted cost.
    const second = await signedIn(browser, reader);
    await withContext(second.context, async () => {
      const readerPage = second.page;
      await chooseLook(readerPage, NUEVO);
      await openFromTheNewList(readerPage, 'enProgreso', /^Otras Sesiones en Mis Colegios/);
      const view = readerPage.getByTestId('session-detail-nuevo');
      await expect(view).toBeVisible({ timeout: 60_000 });
      await expect(view.getByText('Está viendo esta sesión en modo lectura. No está asignado como facilitador.')).toBeVisible();
      await expect(readerPage.getByTestId('session-finalize-card')).toHaveCount(0);
      await expect(readerPage.getByRole('tab', { name: 'Detalles' })).toBeVisible();
      await expect(readerPage.getByRole('tab', { name: 'Planificación' })).toHaveCount(0);
      await readerPage.getByRole('tab', { name: 'Materiales' }).click();
      await expect(readerPage.getByText(MATERIAL_NAME)).toBeVisible({ timeout: 60_000 });
      await expect(readerPage.getByRole('button', { name: `Eliminar ${MATERIAL_NAME}` })).toHaveCount(0);
      await chooseLook(readerPage, ACTUAL);
      expect(second.problems).toEqual([]);
    });
  });

  test('the form, switched on: the checks, Enter, the school change, the lead, a failed and a real approval', async ({ browser }) => {
    const { context, page, problems } = await signedIn(browser, admin);
    await withContext(context, async () => {
      await chooseLook(page, NUEVO);
      // One synthetic hour type, so «Tipo de Hora» can be chosen without a contract in the data.
      await page.route('**/api/hour-types', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { hour_types: [HOUR_TYPE] } }) })
      );
      const creates: string[] = [];
      page.on('request', (request) => {
        if (isCreate(request)) creates.push(request.url());
      });
      await newForm(page);
      await expect.poll(() => lookOf(page), { timeout: 60_000 }).toBe('nuevo');
      const form = page.getByTestId('session-create-nuevo-form');
      const schedule = form.getByRole('button', { name: 'Programar sesión', exact: true });
      const confirm = page.getByTestId('session-create-nuevo-confirm');

      // An empty press: the box with every failed check, today's words; no request.
      await schedule.click();
      const checks = page.getByTestId('session-create-nuevo-checks');
      await expect(checks).toBeVisible();
      await expect(checks).toContainText('Revise lo siguiente antes de continuar:');
      for (const message of [
        'Debe seleccionar un colegio',
        'Debe seleccionar una comunidad de crecimiento',
        'Debe ingresar un título',
        'Debe seleccionar una fecha',
        'Debe ingresar una ubicación para modalidad presencial o híbrida',
        'Debe asignar al menos un facilitador a la sesión',
        'Debe haber exactamente un facilitador principal',
      ]) {
        await expect(checks.getByRole('link', { name: message, exact: true })).toBeVisible();
      }
      await expect(confirm).toBeHidden();
      expect(creates).toEqual([]);

      // School A, its community, three consultants: the first added is the lead; the lead moves.
      await chooseSchool(page, SCHOOL_A_NAME, COMMUNITY_A_NAME);
      await addConsultant(page, lead);
      await addConsultant(page, reader);
      await addConsultant(page, third);
      await expect(consultantRows(page)).toHaveCount(3);
      const leadRadio = (person: Account) => consultantRow(page, person).getByRole('radio', { name: 'Consultor principal' });
      await expect(leadRadio(lead)).toBeChecked();
      await expect(leadRadio(reader)).not.toBeChecked();
      await expect(leadRadio(third)).not.toBeChecked();
      await leadRadio(third).check();
      await expect(leadRadio(third)).toBeChecked();
      await expect(leadRadio(lead)).not.toBeChecked();
      await expect(leadRadio(reader)).not.toBeChecked();
      await leadRadio(reader).check();
      await expect(leadRadio(reader)).toBeChecked();
      await expect(leadRadio(third)).not.toBeChecked();
      await expect(leadRadio(lead)).not.toBeChecked();

      // Another school: the community, the consultants and the contract are emptied, and the other
      // school's community is offered (not the first school's).
      await chooseSchool(page, SCHOOL_B_NAME, null);
      const community = page.locator('#create-session-community');
      await expect(community).toHaveValue('');
      await expect(community.locator('option', { hasText: COMMUNITY_B_NAME })).toHaveCount(1, { timeout: 60_000 });
      await expect(community.locator('option', { hasText: COMMUNITY_A_NAME })).toHaveCount(0);
      await expect(consultantRows(page)).toHaveCount(0);
      const contract = page.locator('#contrato-select');
      if ((await contract.count()) > 0) await expect(contract).toHaveValue('');
      // The first school again: «Seleccione una comunidad».
      await chooseSchool(page, SCHOOL_A_NAME, null);
      await expect(community).toHaveValue('');
      await expect(community.locator('option:checked')).toHaveText('Seleccione una comunidad');
      await expect(community.locator('option', { hasText: COMMUNITY_A_NAME })).toHaveCount(1, { timeout: 60_000 });

      // The whole form, one consultant (the lead).
      await community.selectOption({ label: COMMUNITY_A_NAME });
      await addConsultant(page, lead);
      await expect(leadRadio(lead)).toBeChecked();
      const titleField = page.locator('#create-session-title');
      await titleField.fill(FORM_TITLE);
      await page.locator('#create-session-date').fill('2030-03-12');
      await page.locator('#create-session-location').fill('Sala Sintetica');

      // Enter in the title: the confirmation; «Cancelar» keeps the form.
      await titleField.press('Enter');
      await expect(confirm).toBeVisible();
      await expect(confirm).toContainText('¿Está seguro de que desea programar esta sesión?');
      await page.getByTestId('session-create-nuevo-confirm-cancel').click();
      await expect(confirm).toBeHidden();
      await expect(titleField).toHaveValue(FORM_TITLE);
      expect(creates).toEqual([]);

      // Enter in «Descripción»: a new line, no confirmation.
      const description = form.getByLabel('Descripción', { exact: true });
      await description.fill('Linea sintetica');
      await description.press('Enter');
      await expect(description).toHaveValue('Linea sintetica\n');
      await expect(confirm).toBeHidden();
      await expect(checks).toBeHidden();
      expect(creates).toEqual([]);

      // Only «Tipo de Hora» chosen, the server's refusal faked (no session is created): today's toast
      // AND its message under the two selects, both marked; no drafts notice. Clearing the type takes it away.
      const hourType = page.locator('#hour-type-select');
      await hourType.selectOption({ label: HOUR_TYPE.display_name });
      await page.route('**/api/sessions', (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: PAIR_REFUSAL }) })
          : route.continue()
      );
      await schedule.click();
      await expect(confirm).toBeVisible();
      await page.getByTestId('session-create-nuevo-confirm-confirm').click();
      const pairRefusal = page.getByTestId('session-create-nuevo-pair-refusal');
      await expect(pairRefusal).toHaveText(PAIR_REFUSAL, { timeout: 60_000 });
      // The toast says it too (the same words outside the message under the selects).
      await expect(
        page.getByText(PAIR_REFUSAL, { exact: true }).and(page.locator(':not([data-testid="session-create-nuevo-pair-refusal"])'))
      ).toBeVisible();
      await expect(hourType).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#contrato-select')).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByTestId('session-create-nuevo-drafts-left')).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`${FORM_PAGE}$`));
      await page.unroute('**/api/sessions');
      expect(creates).toHaveLength(1);
      await hourType.selectOption('');
      await expect(pairRefusal).toHaveCount(0);
      await expect(hourType).not.toHaveAttribute('aria-invalid', 'true');

      // Confirmed, the approval answer faked to 500: today's error toast and the drafts notice (the
      // creation was answered ok and read, and the approval was refused).
      await page.route('**/api/sessions/*/approve', (route) =>
        route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
      );
      const firstCreate = page.waitForResponse(isCreateAnswer, { timeout: 60_000 });
      await schedule.click();
      await expect(confirm).toBeVisible();
      await page.getByTestId('session-create-nuevo-confirm-confirm').click();
      const draftAnswer = await firstCreate;
      expect(draftAnswer.status()).toBeLessThan(300);
      const draftBody = (await draftAnswer.json()) as { data: { session?: { id: string }; sessions?: Array<{ id: string }> } };
      const draftId = draftBody.data.session?.id ?? draftBody.data.sessions?.[0]?.id ?? '';
      expect(draftId).not.toBe('');
      ids.created.push(draftId);
      await expect(page.getByText('Error al aprobar sesión')).toBeVisible({ timeout: 60_000 });
      const draftsLeft = page.getByTestId('session-create-nuevo-drafts-left');
      await expect(draftsLeft).toBeVisible();
      await expect(draftsLeft).toHaveText(
        'La sesión quedó guardada como borrador. Revise la lista de sesiones antes de volver a programar, para no crearla dos veces.'
      );
      await expect(page).toHaveURL(new RegExp(`${FORM_PAGE}$`));
      const draft = must('draft', await service.from('consultor_sessions').select('status').eq('id', draftId).single()) as { status: string };
      expect(draft.status).toBe('borrador');
      await page.unroute('**/api/sessions/*/approve');

      // Confirmed with the real approval: where today's flow lands, the session «programada».
      const secondCreate = page.waitForResponse(isCreateAnswer, { timeout: 60_000 });
      await schedule.click();
      await expect(confirm).toBeVisible();
      await page.getByTestId('session-create-nuevo-confirm-confirm').click();
      const createdAnswer = await secondCreate;
      const createdBody = (await createdAnswer.json()) as { data: { session?: { id: string }; sessions?: Array<{ id: string }> } };
      const createdId = createdBody.data.session?.id ?? createdBody.data.sessions?.[0]?.id ?? '';
      expect(createdId).not.toBe('');
      ids.created.push(createdId);
      await expect(page).toHaveURL(new RegExp(`/admin/sessions/${createdId}$`), { timeout: 60_000 });
      const scheduled = must('scheduled', await service.from('consultor_sessions').select('status, title').eq('id', createdId).single()) as { status: string; title: string };
      expect(scheduled).toEqual({ status: 'programada', title: FORM_TITLE });
      // The faked refusal, the draft left by the faked approval, and the real one.
      expect(creates).toHaveLength(3);

      await chooseLook(page, ACTUAL);
      expect(problems).toEqual([]);
    });
  });

  test('320 px, switched on: no sideways scroll on the list, the session page and the form', async ({ browser }) => {
    const narrow = { width: 320, height: 720 };
    const consultant = await signedIn(browser, lead, narrow);
    await withContext(consultant.context, async () => {
      const page = consultant.page;
      await chooseLook(page, NUEVO);
      await page.goto(LIST_PAGE);
      await expect.poll(() => lookOf(page), { timeout: 60_000 }).toBe('nuevo');
      await expect(page.getByTestId('sessions-list-nuevo')).toBeVisible({ timeout: 60_000 });
      const row = page.getByRole('link', { name: `Ver detalles de ${SESSIONS.enProgreso.title}` });
      await expect(row).toBeVisible({ timeout: 60_000 });
      await noSidewaysScroll(page);

      // Opened from the settled list, not by loading the page anew (the accepted late-profile cost).
      await row.click();
      await expect(page).toHaveURL(new RegExp(`${sessionPage('enProgreso')}$`), { timeout: 60_000 });
      await expect(page.getByTestId('session-detail-nuevo')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('session-finalize-card')).toBeVisible();
      await noSidewaysScroll(page);

      await chooseLook(page, ACTUAL);
      expect(consultant.problems).toEqual([]);
    });

    const administrator = await signedIn(browser, admin, narrow);
    await withContext(administrator.context, async () => {
      const page = administrator.page;
      await chooseLook(page, NUEVO);
      await newForm(page);
      await chooseSchool(page, SCHOOL_A_NAME, COMMUNITY_A_NAME);
      await addConsultant(page, lead);
      await noSidewaysScroll(page);
      await chooseLook(page, ACTUAL);
      expect(administrator.problems).toEqual([]);
    });
  });
});
