/**
 * W-B4a-01 — the workspace Sesiones card opens the narrow, read-only
 * /community/workspace/sessions/[id] page, whose detail comes from the real
 * GET /api/sessions/[id]. No request is mocked or routed.
 *
 * This spec owns its fixtures and leaves the shared CI roster untouched: one
 * school, two communities, three personas (an active director and an active
 * non-director member of community A, a member of unrelated community B) and
 * two sessions in community A (one programada, one borrador). Every row has a
 * fixed id and is upserted, so a re-run converges on the same rows; nothing is
 * deleted here.
 *
 * It is a local, unit-owned spec (not in the CI mandatory list): its writes go
 * to one pinned private stack and nowhere else — see FIXTURE_TARGET.
 *
 * Synthetic data only (reserved .test domain, invented names).
 */
import { execFileSync } from 'node:child_process';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loginViaUi, type E2eFixtureUser } from './helpers/auth';

const SCHOOL = { id: 937001, name: 'Colegio Sintético SM37' };
const COMMUNITY_A = { id: 'a3700000-0000-4000-8000-00000000c0a1', name: 'Comunidad Sintética SM37 A' };
const COMMUNITY_B = { id: 'a3700000-0000-4000-8000-00000000c0b1', name: 'Comunidad Sintética SM37 B' };
const WORKSPACES = [
  { id: 'a3700000-0000-4000-8000-00000000d0a1', community_id: COMMUNITY_A.id, name: 'Espacio Sintético SM37 A' },
  { id: 'a3700000-0000-4000-8000-00000000d0b1', community_id: COMMUNITY_B.id, name: 'Espacio Sintético SM37 B' },
];

const PASSWORD = 'Sm37-Sintetica-Local-2026!';

interface Persona extends E2eFixtureUser {
  id: string;
  roleId: string;
  communityId: string;
}

const DIRECTORA: Persona = {
  id: 'a3700000-0000-4000-8000-0000000000d1',
  roleId: 'a3700000-0000-4000-8000-0000000001d1',
  email: 'sm37-directora@qa.local.test',
  password: PASSWORD,
  firstName: 'Directora',
  lastName: 'Sintética SM37',
  role: 'equipo_directivo',
  communityId: COMMUNITY_A.id,
};
const DOCENTE: Persona = {
  id: 'a3700000-0000-4000-8000-0000000000e1',
  roleId: 'a3700000-0000-4000-8000-0000000001e1',
  email: 'sm37-docente@qa.local.test',
  password: PASSWORD,
  firstName: 'Docente',
  lastName: 'Sintético SM37',
  role: 'docente',
  communityId: COMMUNITY_A.id,
};
const AJENO: Persona = {
  id: 'a3700000-0000-4000-8000-0000000000f1',
  roleId: 'a3700000-0000-4000-8000-0000000001f1',
  email: 'sm37-ajeno@qa.local.test',
  password: PASSWORD,
  firstName: 'Docente Ajeno',
  lastName: 'Sintético SM37',
  role: 'docente',
  communityId: COMMUNITY_B.id,
};

/** Must never reach the browser: the API strips it and the page never reads it. */
const RAW_MEETING_LINK = 'https://meet.example.invalid/sm37-sintetica?pwd=NoMostrar';

const SESSION = {
  id: 'a3700000-0000-4000-8000-00000000a501',
  title: 'Sesión Sintética SM37 Convivencia',
  session_date: '2026-12-03',
  start_time: '09:00:00',
  end_time: '10:30:00',
  modality: 'online',
  status: 'programada',
  meeting_link: RAW_MEETING_LINK,
};
const DRAFT = {
  id: 'a3700000-0000-4000-8000-00000000a502',
  title: 'Borrador Sintético SM37',
  session_date: '2026-12-10',
  start_time: '15:00:00',
  end_time: '16:00:00',
  modality: 'presencial',
  status: 'borrador',
  meeting_link: null,
};

const DETAIL_PATH = (id: string) => `/community/workspace/sessions/${id}`;

/**
 * The only database this spec may write to: the private stack exclusively
 * owned by unit SM-37 (Supabase project sm37-session-r0), API on
 * 127.0.0.1:54721 and Postgres on 127.0.0.1:54722, both published on loopback
 * only. Pinned here rather than read from the environment, so no override can
 * point the writes at the default (54321) or auth (54421) stacks, another
 * local stack or a hosted project.
 */
const FIXTURE_TARGET = {
  project: 'sm37-session-r0',
  apiUrl: 'http://127.0.0.1:54721',
  db: { host: '127.0.0.1', port: '54722' },
  published: [
    { service: 'kong', port: '8000/tcp', hostPort: '54721' },
    { service: 'db', port: '5432/tcp', hostPort: '54722' },
  ],
} as const;

type TargetEnv = Record<string, string | undefined>;

interface DockerContainer {
  State?: { Running?: boolean };
  Config?: { Labels?: Record<string, string> | null };
  NetworkSettings?: { Ports?: Record<string, { HostIp: string; HostPort: string }[] | null> | null };
}

type InspectContainer = (name: string) => DockerContainer | null;

function dockerInspect(name: string): DockerContainer | null {
  try {
    const out = execFileSync('docker', ['inspect', name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return (JSON.parse(out) as DockerContainer[])[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Throws unless the environment AND the running containers are exactly
 * FIXTURE_TARGET: the app's Supabase URL and DB URL point at the pinned
 * ports, and each published container is running, labelled with the pinned
 * project and published on 127.0.0.1 only.
 */
function assertFixtureTarget(env: TargetEnv, inspect: InspectContainer): void {
  const refuse = (why: string): never => {
    throw new Error(`refusing to write fixtures: ${why}`);
  };
  if ((env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '') !== FIXTURE_TARGET.apiUrl) {
    refuse(`NEXT_PUBLIC_SUPABASE_URL is not ${FIXTURE_TARGET.apiUrl}`);
  }
  let db: URL | null = null;
  try {
    db = new URL(env.SUPABASE_DB_URL ?? '');
  } catch {
    refuse('SUPABASE_DB_URL is missing or invalid');
  }
  if (db!.hostname !== FIXTURE_TARGET.db.host || db!.port !== FIXTURE_TARGET.db.port) {
    refuse(`SUPABASE_DB_URL is not ${FIXTURE_TARGET.db.host}:${FIXTURE_TARGET.db.port}`);
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) refuse('SUPABASE_SERVICE_ROLE_KEY is required');

  for (const { service, port, hostPort } of FIXTURE_TARGET.published) {
    const name = `supabase_${service}_${FIXTURE_TARGET.project}`;
    const container = inspect(name);
    if (!container?.State?.Running) refuse(`${name} is not running`);
    if (container!.Config?.Labels?.['com.supabase.cli.project'] !== FIXTURE_TARGET.project) {
      refuse(`${name} does not belong to project ${FIXTURE_TARGET.project}`);
    }
    const published = Object.entries(container!.NetworkSettings?.Ports ?? {}).filter(([, bindings]) => bindings?.length);
    const loopbackOnly =
      published.length === 1 &&
      published[0][0] === port &&
      published[0][1]!.length === 1 &&
      published[0][1]![0].HostIp === '127.0.0.1' &&
      published[0][1]![0].HostPort === hostPort;
    if (!loopbackOnly) refuse(`${name} is not published on 127.0.0.1:${hostPort} only`);
  }
}

const liveTargetCheck = () => assertFixtureTarget(process.env, dockerInspect);

function serviceClient(
  env: TargetEnv = process.env,
  inspect: InspectContainer = dockerInspect,
  connect: typeof createClient = createClient
): SupabaseClient {
  assertFixtureTarget(env, inspect);
  return connect(FIXTURE_TARGET.apiUrl, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Every request re-checks the target first, so a stack swapped mid-seed is never written to. */
async function must<T extends { error: { message: string } | null }>(
  label: string,
  op: () => PromiseLike<T>,
  check: () => void = liveTargetCheck
): Promise<T> {
  check();
  const result = await op();
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result;
}

async function ensurePersona(db: SupabaseClient, p: Persona) {
  liveTargetCheck();
  const { data } = await db.auth.admin.getUserById(p.id);
  if (data?.user) {
    await must(`auth update ${p.email}`, () => db.auth.admin.updateUserById(p.id, { password: p.password, email_confirm: true }));
  } else {
    await must(`auth create ${p.email}`, () => db.auth.admin.createUser({ id: p.id, email: p.email, password: p.password, email_confirm: true }));
  }
  await must(
    `profile ${p.email}`,
    () => db.from('profiles').upsert(
      {
        id: p.id,
        email: p.email,
        name: `${p.firstName} ${p.lastName}`,
        first_name: p.firstName,
        last_name: p.lastName,
        must_change_password: false,
        approval_status: 'approved',
        school_id: SCHOOL.id,
      },
      { onConflict: 'id' }
    )
  );
}

/**
 * Order is load-bearing: role rows go in BEFORE the sessions, so the
 * attendee-sync trigger on user_roles finds no programada session to enrol
 * anyone in and the fixture set stays exactly the rows listed above.
 */
async function seedFixtures() {
  const db = serviceClient();
  await must('school', () => db.from('schools').upsert({ id: SCHOOL.id, name: SCHOOL.name, has_generations: false }, { onConflict: 'id' }));
  for (const c of [COMMUNITY_A, COMMUNITY_B]) {
    await must(`community ${c.id}`, () => db.from('growth_communities').upsert({ id: c.id, name: c.name, school_id: SCHOOL.id }, { onConflict: 'id' }));
  }
  await must('workspaces', () => db.from('community_workspaces').upsert(WORKSPACES.map((w) => ({ ...w, is_active: true })), { onConflict: 'id' }));
  for (const p of [DIRECTORA, DOCENTE, AJENO]) await ensurePersona(db, p);
  await must(
    'roles',
    () => db.from('user_roles').upsert(
      [DIRECTORA, DOCENTE, AJENO].map((p) => ({
        id: p.roleId,
        user_id: p.id,
        role_type: p.role,
        school_id: SCHOOL.id,
        community_id: p.communityId,
        is_active: true,
      })),
      { onConflict: 'id' }
    )
  );
  await must(
    'sessions',
    () => db.from('consultor_sessions').upsert(
      [SESSION, DRAFT].map((s) => ({
        ...s,
        school_id: SCHOOL.id,
        growth_community_id: COMMUNITY_A.id,
        created_by: DIRECTORA.id,
        is_active: true,
      })),
      { onConflict: 'id' }
    )
  );
}

async function evidence(page: Page, name: string) {
  const dir = process.env.UI_EVIDENCE_DIR;
  await page.screenshot({
    path: dir ? `${dir}/${name}.png` : test.info().outputPath(`${name}.png`),
    fullPage: true,
    // The layout's mobile drawer slides closed after mount; capture the settled page.
    animations: 'disabled',
  });
}

async function signedInPage(browser: Browser, persona: Persona, viewport = { width: 1366, height: 768 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await loginViaUi(page, persona);
  return page;
}

async function openSessionsTab(page: Page) {
  await page.goto('/community/workspace');
  await page.getByRole('navigation', { name: 'Tabs' }).getByRole('button', { name: 'Sesiones' }).click();
  await expect(page).toHaveURL(/section=sessions/);
  const card = page.getByRole('button', { name: `Ver detalles de ${SESSION.title}` });
  await expect(card).toBeVisible();
  return card;
}

async function expectBasicDetail(page: Page) {
  const detail = page.getByTestId('workspace-session-detail');
  await expect(detail.getByRole('heading', { name: SESSION.title })).toBeVisible();
  await expect(detail).toContainText('jueves 03 de diciembre 2026');
  await expect(detail).toContainText('09:00 - 10:30');
  await expect(detail).toContainText('En línea');
  await expect(detail).toContainText('Programada');
  await expect(detail).toContainText(SCHOOL.name);
  await expect(detail).toContainText(COMMUNITY_A.name);
  await expect(page.getByTestId('workspace-session-detail-join')).toHaveAttribute('href', `/meet/session/${SESSION.id}`);
  const html = await page.content();
  expect(html).not.toContain('meet.example.invalid');
  expect(html).not.toContain('@qa.local.test');
}

test.describe.configure({ mode: 'serial' });

test.describe('fixture target guard — writes reach only the pinned SM-37 stack', () => {
  const KEY = 'synthetic-stub-key';
  const PINNED_ENV = {
    NEXT_PUBLIC_SUPABASE_URL: FIXTURE_TARGET.apiUrl,
    SUPABASE_DB_URL: 'postgresql://postgres:synthetic@127.0.0.1:54722/postgres',
    SUPABASE_SERVICE_ROLE_KEY: KEY,
  };
  const container = (port: string, hostPort: string, overrides: Partial<{ project: string; hostIp: string; running: boolean }> = {}) => ({
    State: { Running: overrides.running ?? true },
    Config: { Labels: { 'com.supabase.cli.project': overrides.project ?? FIXTURE_TARGET.project } },
    NetworkSettings: { Ports: { [port]: [{ HostIp: overrides.hostIp ?? '127.0.0.1', HostPort: hostPort }], '8001/tcp': null } },
  });
  const pinnedStack: InspectContainer = (name) =>
    name === `supabase_kong_${FIXTURE_TARGET.project}` ? container('8000/tcp', '54721')
      : name === `supabase_db_${FIXTURE_TARGET.project}` ? container('5432/tcp', '54722')
        : null;

  const refusals: [string, TargetEnv, InspectContainer][] = [
    ['default stack API 54321', { ...PINNED_ENV, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' }, pinnedStack],
    ['auth stack API 54421', { ...PINNED_ENV, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54421' }, pinnedStack],
    ['another loopback name for the API', { ...PINNED_ENV, NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54721' }, pinnedStack],
    ['hosted project', { ...PINNED_ENV, NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co' }, pinnedStack],
    ['missing API URL', { ...PINNED_ENV, NEXT_PUBLIC_SUPABASE_URL: undefined }, pinnedStack],
    ['default stack DB 54322', { ...PINNED_ENV, SUPABASE_DB_URL: 'postgresql://postgres:synthetic@127.0.0.1:54322/postgres' }, pinnedStack],
    ['auth stack DB 54422', { ...PINNED_ENV, SUPABASE_DB_URL: 'postgresql://postgres:synthetic@127.0.0.1:54422/postgres' }, pinnedStack],
    ['missing DB URL', { ...PINNED_ENV, SUPABASE_DB_URL: undefined }, pinnedStack],
    ['pinned ports served by another project', PINNED_ENV, (n) => (pinnedStack(n) ? { ...pinnedStack(n)!, Config: { Labels: { 'com.supabase.cli.project': 'other-stack' } } } : null)],
    ['pinned stack published on all interfaces', PINNED_ENV, (n) => (n.includes('_db_') ? container('5432/tcp', '54722', { hostIp: '0.0.0.0' }) : pinnedStack(n))],
    ['pinned stack stopped', PINNED_ENV, (n) => (n.includes('_kong_') ? container('8000/tcp', '54721', { running: false }) : pinnedStack(n))],
    ['pinned stack absent', PINNED_ENV, () => null],
  ];

  for (const [label, env, inspect] of refusals) {
    test(`refuses before creating a client: ${label}`, () => {
      let connected = 0;
      const connect = (() => {
        connected += 1;
        return {} as SupabaseClient;
      }) as unknown as typeof createClient;
      expect(() => serviceClient(env, inspect, connect)).toThrow(/^refusing to write fixtures/);
      expect(connected).toBe(0);
    });
  }

  test('connects to the pinned API only when env and containers are exactly the pinned stack', () => {
    const calls: unknown[][] = [];
    const connect = ((...args: unknown[]) => {
      calls.push(args);
      return {} as SupabaseClient;
    }) as unknown as typeof createClient;
    serviceClient(PINNED_ENV, pinnedStack, connect);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(FIXTURE_TARGET.apiUrl);
  });

  test('re-checks the target before every write and does not send one once it changes', async () => {
    let stack = pinnedStack;
    let sent = 0;
    const write = async () => {
      sent += 1;
      return { error: null };
    };
    const check = () => assertFixtureTarget(PINNED_ENV, stack);

    await must('first write', write, check);
    stack = (n) => (n.includes('_kong_') ? container('8000/tcp', '54721', { project: 'other-stack' }) : pinnedStack(n));
    await expect(must('second write', write, check)).rejects.toThrow(/^refusing to write fixtures/);
    expect(sent).toBe(1);
  });
});

test.describe('workspace session detail — W-B4a-01', () => {
  test.beforeAll(async () => {
    await seedFixtures();
  });

  for (const viewport of [
    { label: 'desktop', width: 1366, height: 768 },
    { label: 'mobile', width: 390, height: 844 },
  ]) {
    test(`director opens a session card from the workspace (${viewport.label} ${viewport.width}x${viewport.height})`, async ({ browser }) => {
      const page = await signedInPage(browser, DIRECTORA, viewport);
      const card = await openSessionsTab(page);
      await evidence(page, `${viewport.label}-01-sesiones-tab`);

      // The page asks GET /api/sessions/[id] on the server; the browser only
      // receives the page's serialized props, which must carry no raw link.
      const propsResponse = page.waitForResponse((r) => {
        const { pathname } = new URL(r.url());
        return pathname.startsWith('/_next/data/') && pathname.endsWith(`${DETAIL_PATH(SESSION.id)}.json`);
      });
      await card.click();
      expect((await propsResponse).status()).toBe(200);
      const serializedProps = await (await propsResponse).text();
      expect(serializedProps).toContain(SESSION.title);
      expect(serializedProps).not.toContain('meet.example.invalid');
      expect(serializedProps).not.toContain('@qa.local.test');

      await expect(page).toHaveURL(new RegExp(`${DETAIL_PATH(SESSION.id)}$`));
      await expectBasicDetail(page);
      await evidence(page, `${viewport.label}-02-detalle`);

      await page.reload();
      await expect(page).toHaveURL(new RegExp(`${DETAIL_PATH(SESSION.id)}$`));
      await expectBasicDetail(page);

      // Back returns to the workspace, never to /dashboard. The workspace page
      // records its tab with history.replaceState, which Next's popstate does
      // not see, so the tab it reopens is not guaranteed to be Sesiones.
      await page.goBack();
      await expect(page).toHaveURL(/\/community\/workspace(\?section=sessions)?$/);
      await page.getByRole('navigation', { name: 'Tabs' }).getByRole('button', { name: 'Sesiones' }).click();
      await expect(page.getByRole('button', { name: `Ver detalles de ${SESSION.title}` })).toBeVisible();

      await page.goForward();
      await expect(page).toHaveURL(new RegExp(`${DETAIL_PATH(SESSION.id)}$`));
      await page.getByTestId('workspace-session-back').click();
      await expect(page).toHaveURL(/\/community\/workspace\?section=sessions$/);
      await expect(page.getByRole('button', { name: `Ver detalles de ${SESSION.title}` })).toBeVisible();
      await page.context().close();
    });
  }

  test('keyboard: Enter and Space on the card open the detail; Enter on the join control goes to /meet only', async ({ browser }) => {
    const page = await signedInPage(browser, DIRECTORA);

    for (const key of ['Enter', ' '] as const) {
      const card = await openSessionsTab(page);
      await card.focus();
      await page.keyboard.press(key === ' ' ? 'Space' : key);
      await expect(page).toHaveURL(new RegExp(`${DETAIL_PATH(SESSION.id)}$`));
      await expectBasicDetail(page);
    }

    const card = await openSessionsTab(page);
    const join = card.getByTestId('workspace-session-join');
    await expect(join).toHaveAttribute('href', `/meet/session/${SESSION.id}`);
    await join.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/meet/session/${SESSION.id}$`));
    await page.context().close();
  });

  test('an active non-director member of the community sees the same detail', async ({ browser }) => {
    const page = await signedInPage(browser, DOCENTE);
    const card = await openSessionsTab(page);
    await card.click();
    await expect(page).toHaveURL(new RegExp(`${DETAIL_PATH(SESSION.id)}$`));
    await expectBasicDetail(page);
    await evidence(page, 'docente-detalle');
    await page.context().close();
  });

  test('a member of an unrelated community gets the same answer as a missing or malformed id', async ({ browser }) => {
    const page = await signedInPage(browser, AJENO);

    await page.goto(DETAIL_PATH(SESSION.id));
    await expect(page.getByRole('heading', { name: 'Sesión no disponible' })).toBeVisible();
    await expect(page.getByText(SESSION.title)).toHaveCount(0);
    await evidence(page, 'ajeno-no-disponible');
    const unavailable = page.getByTestId('workspace-session-unavailable');
    const deniedHtml = await unavailable.innerHTML();

    await page.goto(DETAIL_PATH('a3700000-0000-4000-8000-00000000ffff'));
    await expect(unavailable).toBeVisible();
    expect(await unavailable.innerHTML()).toBe(deniedHtml);

    await page.goto(DETAIL_PATH('no-es-un-uuid'));
    await expect(unavailable).toBeVisible();
    expect(await unavailable.innerHTML()).toBe(deniedHtml);
    await page.context().close();
  });

  test('an anonymous visitor is sent to login and sees no detail', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto(DETAIL_PATH(SESSION.id));
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByText(SESSION.title)).toHaveCount(0);
    await context.close();
  });

  test('a draft is hidden from the Sesiones list but its direct link still shows read-only detail (existing API behaviour)', async ({ browser }) => {
    const page = await signedInPage(browser, DIRECTORA);
    await openSessionsTab(page);
    await expect(page.getByRole('button', { name: `Ver detalles de ${SESSION.title}` })).toBeVisible();
    await expect(page.getByText(DRAFT.title)).toHaveCount(0);

    await page.goto(DETAIL_PATH(DRAFT.id));
    const detail = page.getByTestId('workspace-session-detail');
    await expect(detail.getByRole('heading', { name: DRAFT.title })).toBeVisible();
    await expect(detail).toContainText('Borrador');
    await expect(detail.getByRole('button')).toHaveCount(0);
    await expect(page.getByTestId('workspace-session-detail-join')).toHaveCount(0);
    await evidence(page, 'borrador-enlace-directo');
    await page.context().close();
  });
});
