import { randomUUID } from 'node:crypto';

import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import { createClient } from '@supabase/supabase-js';

import {
  E2E_USERS,
  FORCED_PASSWORD_FIXTURE_KEY,
  apiContextFor,
  ensureStorageState,
  storageStatePath,
  type E2eFixtureUser,
} from './helpers/auth';
import { calculateVerificationDigit } from '../../utils/rutValidation';

/**
 * PASANT-PARTICIPANT-INTAKE [I01, I05–I09] — the school roster link, unmocked.
 *
 * **There is deliberately no `page.route()` in this file.** Every request goes to
 * the real handlers against the real (ephemeral, seeded) local database, so the
 * RPC lock, the unique constraints and PostgREST are what answer — including
 * the `Promise.all` races, which are the only real-concurrency proof this unit
 * has (pgTAP is single-session; FIRST N3).
 *
 * ## Client identity (PM decision)
 *
 * The coordinator routes share one rate-limit bucket of 60 requests a minute per
 * client IP, and every request here comes from one machine. Each describe block
 * therefore presents its own synthetic `X-Forwarded-For` (TEST-NET-2,
 * 198.51.100.0/24, never routable) to stand for a distinct client. The product
 * limit is unchanged and unbypassed; one describe proves the 429 still happens.
 *
 * ## Data
 *
 * Synthetic only (Ley 21.719). Every roster is created fresh with a unique
 * school name, so local runs that are not reset never collide, and every RUT is
 * a random synthetic body with its computed check digit.
 *
 * Requires the seeded local Supabase stack — see .github/workflows/ci.yml gate 4.
 */

test.setTimeout(120_000);

const NOMINA = '/pasantias/nomina';
const INTAKE_API = '/api/pasantias/participants';
const ADMIN_API = '/api/admin/pasantia-participants';
const ADMIN_PAGE = '/admin/pasantia-participants';
const UNAVAILABLE = 'Enlace incompleto o no disponible — contacta a FNE';

type Program = 'inspira' | 'mirada-profunda';

/** One synthetic client identity per describe block (see header). */
const CLIENT = {
  journey: '198.51.100.11',
  lifecycle: '198.51.100.12',
  isolation: '198.51.100.13',
  races: '198.51.100.14',
  leaks: '198.51.100.15',
  keyboard1366: '198.51.100.16',
  keyboard390: '198.51.100.17',
  timezones: '198.51.100.18',
  rateLimit: '198.51.100.19',
  protocol: '198.51.100.20',
} as const;

function uniqueSchool(label: string): string {
  return `E2E Colegio ${label} ${randomUUID().slice(0, 8)}`;
}

/** A random synthetic RUT body (10.000.000–29.999.999) with its check digit. */
function syntheticRut(): string {
  const body = String(10_000_000 + Math.floor(Math.random() * 20_000_000));
  return `${body}-${calculateVerificationDigit(body)}`;
}

function participantBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    firstNames: 'Valentina',
    lastNames: 'Sintética',
    rut: syntheticRut(),
    passportNumber: null,
    flightsFunding: 'sep',
    lodgingFunding: 'colegio',
    arrivalDate: null,
    departureDate: null,
    focus: null,
    dietaryRestrictions: [],
    dietaryOther: null,
    ...overrides,
  };
}

interface CreatedRoster {
  id: string;
  token: string;
  schoolName: string;
}

async function createRoster(admin: APIRequestContext, program: Program, label: string): Promise<CreatedRoster> {
  const schoolName = uniqueSchool(label);
  const response = await admin.post(ADMIN_API, { data: { schoolName, program, validDays: 30 } });
  expect(response.status(), 'admin roster create').toBe(201);
  const body = (await response.json()) as { roster: { id: string }; token: string };
  expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return { id: body.roster.id, token: body.token, schoolName };
}

async function coordinatorApi(baseURL: string, ip: string): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': ip } });
}

const auth = (token: string) => ({ Authorization: `Intake ${token}` });

async function createParticipant(api: APIRequestContext, token: string, overrides: Record<string, unknown> = {}) {
  return api.post(INTAKE_API, {
    headers: auth(token),
    data: { ...participantBody(overrides), clientRequestId: randomUUID(), acknowledged: true },
  });
}

async function listParticipants(api: APIRequestContext, token: string) {
  const response = await api.get(INTAKE_API, { headers: auth(token) });
  expect(response.status()).toBe(200);
  return (await response.json()) as {
    roster: { status: string; version: number; schoolName: string; lastSubmittedAt: string | null };
    participants: { id: string; version: number; rut: string; lastNames: string }[];
  };
}

async function anonymousContext(browser: Browser, ip: string, extra: Parameters<Browser['newContext']>[0] = {}) {
  return browser.newContext({
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { 'X-Forwarded-For': ip },
    ...extra,
  });
}

async function openNomina(page: Page, token: string, schoolName: string) {
  await page.goto(`${NOMINA}#k=${token}`);
  await expect(page.getByTestId('intake-school')).toHaveText(schoolName, { timeout: 30_000 });
}

interface Ficha {
  firstNames: string;
  lastNames: string;
  rut: string;
  flights: 'sep' | 'colegio';
  lodging: 'sep' | 'colegio';
  arrival?: string;
  departure?: string;
  focus?: string;
  dietary?: string[];
  other?: string;
}

async function fillFicha(page: Page, ficha: Ficha) {
  await page.getByTestId('intake-first-names').fill(ficha.firstNames);
  await page.getByTestId('intake-last-names').fill(ficha.lastNames);
  await page.getByTestId('intake-rut').fill(ficha.rut);
  await page.getByTestId('intake-flights-funding').selectOption(ficha.flights);
  await page.getByTestId('intake-lodging-funding').selectOption(ficha.lodging);
  if (ficha.arrival) await page.getByTestId('intake-arrival-date').selectOption(ficha.arrival);
  if (ficha.departure) await page.getByTestId('intake-departure-date').selectOption(ficha.departure);
  if (ficha.focus) await page.getByTestId('intake-focus').selectOption(ficha.focus);
  for (const code of ficha.dietary ?? []) await page.getByTestId(`intake-dietary-${code}`).check();
  if (ficha.other !== undefined) await page.getByTestId('intake-dietary-other').fill(ficha.other);
}

async function tickAcknowledgement(page: Page) {
  const ack = page.getByTestId('intake-ack');
  if (!(await ack.isChecked())) await ack.check();
}

/* ---------------------------------------------------------------- bearer helper */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const LOCAL_SUPABASE_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/**
 * A GENUINE access token for a synthetic fixture, as `pasantias-flow.spec.ts`
 * obtains one (copied, because `tests/e2e/helpers/**` is out of this unit's
 * scope): a password sign-in against the LOCAL auth server only.
 */
async function genuineAccessToken(user: E2eFixtureUser): Promise<string> {
  expect(SUPABASE_URL, 'bearer proofs need NEXT_PUBLIC_SUPABASE_URL (local stack)').not.toBe('');
  expect(SUPABASE_ANON_KEY, 'bearer proofs need NEXT_PUBLIC_SUPABASE_ANON_KEY (local stack)').not.toBe('');
  expect(
    LOCAL_SUPABASE_HOSTS.has(new URL(SUPABASE_URL).hostname),
    'fixture credentials are only ever sent to a local Supabase host'
  ).toBe(true);
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error || !data.session) throw new Error(`fixture password sign-in failed: ${error?.message ?? 'no session'}`);
  return data.session.access_token;
}

/* ================================================================ main journey */

test.describe('Nómina — the whole journey through the UI', () => {
  test.use({ storageState: storageStatePath('admin') });
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await ensureStorageState(browser, 'admin');
  });

  test('admin creates a link; the coordinator saves, edits, reloads, sends, reopens and sends again', async ({
    page,
    browser,
  }) => {
    // --- Admin: create the link in the UI and read it from the one-time panel.
    const schoolName = uniqueSchool('Journey');
    await page.goto(ADMIN_PAGE);
    await expect(page.getByRole('heading', { name: 'Nóminas de pasantes' }).first()).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('intake-admin-school').fill(schoolName);
    await page.getByTestId('intake-admin-program').selectOption('inspira');
    await expect(page.getByTestId('intake-admin-valid-days')).toHaveValue('90');
    await page.getByTestId('intake-admin-create').click();
    const panel = page.getByTestId('intake-admin-link-panel');
    await expect(panel).toContainText('No se volverá a mostrar');
    const link = await page.getByTestId('intake-admin-link-url').inputValue();
    expect(link).toMatch(/\/pasantias\/nomina#k=[A-Za-z0-9_-]{43}$/);

    // --- Coordinator: an anonymous browser opens it.
    const context = await anonymousContext(browser, CLIENT.journey);
    try {
      const coordinator = await context.newPage();
      await coordinator.goto(link);
      await expect(coordinator.getByTestId('intake-school')).toHaveText(schoolName, { timeout: 30_000 });
      await expect(coordinator.getByTestId('intake-roster-status')).toHaveAttribute('data-status', 'open');
      // An empty roster opens the ficha straight away, with nothing pre-filled.
      await expect(coordinator.getByTestId('intake-flights-funding')).toHaveValue('');
      await expect(coordinator.getByTestId('intake-departure-date')).toHaveValue('');

      const first: Ficha = {
        firstNames: 'Valentina',
        lastNames: 'Sintética Uno',
        rut: syntheticRut(),
        flights: 'sep',
        lodging: 'colegio',
        arrival: '2027-01-17',
        departure: '2027-01-29',
        focus: 'primer_ciclo',
        dietary: ['vegetariano'],
      };
      await tickAcknowledgement(coordinator);
      await fillFicha(coordinator, first);
      await expect(coordinator.getByTestId('intake-save-state')).toHaveAttribute('data-state', 'unsaved');
      await coordinator.getByTestId('intake-save').click();
      await expect(coordinator.getByTestId('intake-live')).toContainText('guardada');
      await expect(coordinator.getByTestId('intake-save-state')).toHaveAttribute('data-state', 'saved');
      await expect(coordinator.getByTestId('intake-count')).toHaveText('(1/60)');

      // Second person.
      await coordinator.getByTestId('intake-add').click();
      await fillFicha(coordinator, {
        firstNames: 'Tomás',
        lastNames: 'Sintético Dos',
        rut: syntheticRut(),
        flights: 'colegio',
        lodging: 'colegio',
      });
      await coordinator.getByTestId('intake-save').click();
      await expect(coordinator.getByTestId('intake-count')).toHaveText('(2/60)');
      const list = coordinator.getByTestId('intake-list');
      await expect(list).toContainText('Valentina Sintética Uno');
      await expect(list).toContainText('Tomás Sintético Dos');
      // INSPIRA's own end date (2027-01-28) + 1, labelled with its weekday.
      await expect(list).toContainText('viernes 29 de enero de 2027');

      // Edit the first.
      await list.locator('li', { hasText: 'Sintética Uno' }).getByRole('button', { name: /Editar/ }).click();
      await expect(coordinator.getByTestId('intake-last-names')).toHaveValue('Sintética Uno');
      await coordinator.getByTestId('intake-last-names').fill('Sintética Editada');
      await coordinator.getByTestId('intake-save').click();
      await expect(list).toContainText('Valentina Sintética Editada');

      // Reload: data persists and the fragment is kept.
      await coordinator.reload();
      await expect(coordinator).toHaveURL(/\/pasantias\/nomina#k=[A-Za-z0-9_-]{43}$/);
      await expect(coordinator.getByTestId('intake-count')).toHaveText('(2/60)', { timeout: 30_000 });
      await expect(coordinator.getByTestId('intake-list')).toContainText('Valentina Sintética Editada');

      // Send.
      await coordinator.getByTestId('intake-finalize').click();
      await expect(coordinator.getByTestId('intake-roster-status')).toHaveAttribute('data-status', 'submitted');
      await expect(coordinator.getByTestId('intake-roster-status')).toContainText('No se envían correos');
      await expect(coordinator.getByTestId('intake-finalize')).toBeDisabled();

      // Edit after sending: the roster reopens, visibly.
      await coordinator
        .getByTestId('intake-list')
        .locator('li', { hasText: 'Sintético Dos' })
        .getByRole('button', { name: /Editar/ })
        .click();
      await tickAcknowledgement(coordinator);
      await coordinator.getByTestId('intake-dietary-otra').check();
      await coordinator.getByTestId('intake-dietary-other').fill('Sin mariscos');
      await coordinator.getByTestId('intake-save').click();
      await expect(coordinator.getByTestId('intake-roster-status')).toHaveAttribute('data-status', 'reopened');
      await expect(coordinator.getByTestId('intake-roster-status')).toContainText(
        'La nómina volvió a edición; envíala nuevamente'
      );

      // Send again.
      await coordinator.getByTestId('intake-finalize').click();
      await expect(coordinator.getByTestId('intake-roster-status')).toHaveAttribute('data-status', 'submitted');
    } finally {
      await context.close();
    }

    // --- Admin reads what was stored: available to FNE, nothing mailed.
    const listResponse = await page.request.get(ADMIN_API);
    expect(listResponse.status()).toBe(200);
    const listing = (await listResponse.json()) as { rosters: { id: string; schoolName: string; status: string; participantCount: number; lastSubmittedAt: string | null }[] };
    const roster = listing.rosters.find((r) => r.schoolName === schoolName);
    expect(roster, 'the roster is listed for FNE').toBeTruthy();
    expect(roster?.status).toBe('submitted');
    expect(roster?.participantCount).toBe(2);
    expect(roster?.lastSubmittedAt).not.toBeNull();
    expect(JSON.stringify(listing)).not.toMatch(/token_hash|[0-9a-f]{64}/);

    const detail = await page.request.get(`${ADMIN_API}/${roster?.id}`);
    const stored = (await detail.json()) as {
      participants: { lastNames: string; arrivalDate: string | null; departureDate: string | null; focus: string | null; dietaryRestrictions: string[]; dietaryOther: string | null; flightsFunding: string }[];
    };
    const valentina = stored.participants.find((p) => p.lastNames === 'Sintética Editada');
    expect(valentina).toMatchObject({
      arrivalDate: '2027-01-17',
      departureDate: '2027-01-29',
      focus: 'primer_ciclo',
      dietaryRestrictions: ['vegetariano'],
      flightsFunding: 'sep',
    });
    const tomas = stored.participants.find((p) => p.lastNames === 'Sintético Dos');
    expect(tomas).toMatchObject({ dietaryRestrictions: ['otra'], dietaryOther: 'Sin mariscos', arrivalDate: null, focus: null });

    // The admin page shows it as sent and its detail.
    await page.goto(ADMIN_PAGE);
    const row = page.locator(`[data-school="${schoolName}"]`);
    await expect(row).toContainText('Enviada', { timeout: 30_000 });
    await row.getByRole('button', { name: 'Ver detalle' }).click();
    await expect(page.getByTestId('intake-admin-detail')).toContainText('Sintética Editada');
  });
});

/* ================================================================ link lifecycle */

test.describe('Nómina — revoke and rotate', () => {
  let admin: APIRequestContext;
  test.beforeAll(async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    admin = await apiContextFor(browser, 'admin', baseURL!);
  });
  test.afterAll(async () => {
    await admin?.dispose();
  });

  test('after a rotate the old link fails and the new one works; after a revoke the page says "no disponible"', async ({
    browser,
    baseURL,
  }) => {
    const roster = await createRoster(admin, 'mirada-profunda', 'Lifecycle');
    const api = await coordinatorApi(baseURL!, CLIENT.lifecycle);
    try {
      expect((await api.get(INTAKE_API, { headers: auth(roster.token) })).status()).toBe(200);
      expect((await createParticipant(api, roster.token)).status()).toBe(201);

      // Send it first, so rotate and revoke have a status, version and both
      // submission timestamps they must leave alone (NB4).
      const beforeSend = await listParticipants(api, roster.token);
      const sent = await api.post(`${INTAKE_API}/finalize`, {
        headers: auth(roster.token),
        data: { expectedRosterVersion: beforeSend.roster.version },
      });
      expect(sent.status()).toBe(200);
      type RosterState = { status: string; version: number; submittedAt: string | null; lastSubmittedAt: string | null };
      const pick = (r: RosterState) => ({
        status: r.status,
        version: r.version,
        submittedAt: r.submittedAt,
        lastSubmittedAt: r.lastSubmittedAt,
      });
      const baseline = pick(
        ((await (await admin.get(`${ADMIN_API}/${roster.id}`)).json()) as { roster: RosterState }).roster
      );
      expect(baseline.status).toBe('submitted');
      expect(baseline.submittedAt).not.toBeNull();

      const rotated = await admin.patch(`${ADMIN_API}/${roster.id}`, { data: { action: 'rotate', validDays: 30 } });
      expect(rotated.status()).toBe(200);
      const rotatedBody = (await rotated.json()) as { token: string; roster: RosterState };
      const newToken = rotatedBody.token;
      expect(newToken).not.toBe(roster.token);
      expect(pick(rotatedBody.roster), 'rotate leaves status, version and timestamps').toEqual(baseline);

      const old = await api.get(INTAKE_API, { headers: auth(roster.token) });
      expect(old.status()).toBe(401);
      expect(await old.json()).toEqual({ code: 'LINK_UNAVAILABLE', error: `${UNAVAILABLE}.` });
      const fresh = await listParticipants(api, newToken);
      expect(fresh.participants).toHaveLength(1); // data survives a rotate

      const revoked = await admin.patch(`${ADMIN_API}/${roster.id}`, { data: { action: 'revoke' } });
      expect(revoked.status()).toBe(200);
      const revokedBody = (await revoked.json()) as { roster: RosterState & { revokedAt: string | null } };
      expect(revokedBody).not.toHaveProperty('token');
      expect(revokedBody.roster.revokedAt).not.toBeNull();
      expect(pick(revokedBody.roster), 'revoke leaves status, version and timestamps').toEqual(baseline);
      // Read back from the database, not only the PATCH answer.
      const afterRevoke = ((await (await admin.get(`${ADMIN_API}/${roster.id}`)).json()) as { roster: RosterState }).roster;
      expect(pick(afterRevoke)).toEqual(baseline);

      // Every write path is refused after the revoke, through the RPC lock.
      expect((await api.get(INTAKE_API, { headers: auth(newToken) })).status()).toBe(401);
      expect((await createParticipant(api, newToken)).status()).toBe(401);
      const finalize = await api.post(`${INTAKE_API}/finalize`, {
        headers: auth(newToken),
        data: { expectedRosterVersion: fresh.roster.version },
      });
      expect(finalize.status()).toBe(401);

      const context = await anonymousContext(browser, CLIENT.lifecycle);
      try {
        const page = await context.newPage();
        await page.goto(`${NOMINA}#k=${newToken}`);
        await expect(page.getByTestId('intake-state-unavailable')).toContainText(UNAVAILABLE, { timeout: 30_000 });
        await expect(page.getByText(roster.schoolName)).toHaveCount(0);
      } finally {
        await context.close();
      }
    } finally {
      await api.dispose();
    }
  });
});

/* ================================================================ isolation */

test.describe('Nómina — one roster per token', () => {
  let admin: APIRequestContext;
  test.beforeAll(async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    admin = await apiContextFor(browser, 'admin', baseURL!);
  });
  test.afterAll(async () => {
    await admin?.dispose();
  });

  test('token A can neither read nor update a participant of roster B', async ({ baseURL }) => {
    const a = await createRoster(admin, 'inspira', 'Isolation A');
    const b = await createRoster(admin, 'inspira', 'Isolation B');
    const api = await coordinatorApi(baseURL!, CLIENT.isolation);
    try {
      const created = await createParticipant(api, b.token, { lastNames: 'De Bé' });
      expect(created.status()).toBe(201);
      const victim = ((await created.json()) as { participant: { id: string; version: number } }).participant;

      const listA = await listParticipants(api, a.token);
      expect(listA.roster.schoolName).toBe(a.schoolName);
      expect(listA.participants.map((p) => p.id)).not.toContain(victim.id);

      const attack = await api.put(`${INTAKE_API}/${victim.id}`, {
        headers: auth(a.token),
        data: { ...participantBody({ lastNames: 'Intruso' }), expectedVersion: victim.version, acknowledged: true },
      });
      expect(attack.status()).toBe(404);
      expect(((await attack.json()) as { code: string }).code).toBe('NOT_FOUND');

      // A body naming another roster is refused outright.
      const smuggled = await api.post(INTAKE_API, {
        headers: auth(a.token),
        data: { ...participantBody(), clientRequestId: randomUUID(), acknowledged: true, rosterId: b.id },
      });
      expect(smuggled.status()).toBe(422);

      const listB = await listParticipants(api, b.token);
      const untouched = listB.participants.find((p) => p.id === victim.id);
      expect(untouched?.lastNames).toBe('De Bé');
      expect(untouched?.version).toBe(victim.version);
    } finally {
      await api.dispose();
    }
  });
});

/* ================================================================ real races */

test.describe('Nómina — real concurrency against the roster lock', () => {
  let admin: APIRequestContext;
  test.beforeAll(async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    admin = await apiContextFor(browser, 'admin', baseURL!);
  });
  test.afterAll(async () => {
    await admin?.dispose();
  });

  test('two creates with the same RUT: exactly one 201 and one 409', async ({ baseURL }) => {
    const roster = await createRoster(admin, 'inspira', 'Race RUT');
    const api = await coordinatorApi(baseURL!, CLIENT.races);
    try {
      const rut = syntheticRut();
      const responses = await Promise.all([
        createParticipant(api, roster.token, { rut, lastNames: 'Carrera Uno' }),
        createParticipant(api, roster.token, { rut, lastNames: 'Carrera Dos' }),
      ]);
      expect(responses.map((r) => r.status()).sort()).toEqual([201, 409]);
      const loser = responses.find((r) => r.status() === 409) as APIResponse;
      expect(((await loser.json()) as { code: string }).code).toBe('DUPLICATE_RUT');
      const list = await listParticipants(api, roster.token);
      expect(list.participants.filter((p) => p.rut === rut)).toHaveLength(1);
    } finally {
      await api.dispose();
    }
  });

  test('two updates with the same expected version: exactly one 200 and one 409 STALE', async ({ baseURL }) => {
    const roster = await createRoster(admin, 'inspira', 'Race Version');
    const api = await coordinatorApi(baseURL!, CLIENT.races);
    try {
      const rut = syntheticRut();
      const created = await createParticipant(api, roster.token, { rut });
      const participant = ((await created.json()) as { participant: { id: string; version: number } }).participant;
      const put = (lastNames: string) =>
        api.put(`${INTAKE_API}/${participant.id}`, {
          headers: auth(roster.token),
          data: { ...participantBody({ rut, lastNames }), expectedVersion: participant.version, acknowledged: true },
        });
      const responses = await Promise.all([put('Gana Uno'), put('Gana Dos')]);
      expect(responses.map((r) => r.status()).sort()).toEqual([200, 409]);
      const stale = (await (responses.find((r) => r.status() === 409) as APIResponse).json()) as {
        code: string;
        current: { version: number; lastNames: string };
      };
      expect(stale.code).toBe('STALE');
      expect(stale.current.version).toBe(participant.version + 1);
      expect(['Gana Uno', 'Gana Dos']).toContain(stale.current.lastNames);
    } finally {
      await api.dispose();
    }
  });

  test('the same clientRequestId twice at once stores one row: one 201, one 200 replay', async ({ baseURL }) => {
    const roster = await createRoster(admin, 'inspira', 'Race Replay');
    const api = await coordinatorApi(baseURL!, CLIENT.races);
    try {
      const clientRequestId = randomUUID();
      const data = { ...participantBody(), clientRequestId, acknowledged: true };
      const responses = await Promise.all([
        api.post(INTAKE_API, { headers: auth(roster.token), data }),
        api.post(INTAKE_API, { headers: auth(roster.token), data }),
      ]);
      expect(responses.map((r) => r.status()).sort()).toEqual([200, 201]);
      const ids = await Promise.all(responses.map(async (r) => ((await r.json()) as { participant: { id: string } }).participant.id));
      expect(ids[0]).toBe(ids[1]);
      expect((await listParticipants(api, roster.token)).participants).toHaveLength(1);
    } finally {
      await api.dispose();
    }
  });

  test('a double-click on save creates one row', async ({ browser, baseURL }) => {
    const roster = await createRoster(admin, 'inspira', 'Race Click');
    const context = await anonymousContext(browser, CLIENT.races);
    const api = await coordinatorApi(baseURL!, CLIENT.races);
    try {
      const page = await context.newPage();
      await openNomina(page, roster.token, roster.schoolName);
      await tickAcknowledgement(page);
      const rut = syntheticRut();
      await fillFicha(page, { firstNames: 'Doble', lastNames: 'Clic', rut, flights: 'sep', lodging: 'sep' });
      await page.getByTestId('intake-save').dblclick();
      await expect(page.getByTestId('intake-count')).toHaveText('(1/60)');
      const list = await listParticipants(api, roster.token);
      expect(list.participants).toHaveLength(1);
      expect(list.participants[0].rut).toBe(rut);
    } finally {
      await api.dispose();
      await context.close();
    }
  });
});

/* ================================================================ roles */

test.describe('Nómina — admin surfaces are for the global admin only', () => {
  test('docente is denied the page and the API', async ({ browser, baseURL }) => {
    const docente = await apiContextFor(browser, 'docente', baseURL!);
    const context = await browser.newContext({ storageState: await ensureStorageState(browser, 'docente') });
    try {
      expect((await docente.get(ADMIN_API)).status()).toBe(403);
      expect(
        (await docente.post(ADMIN_API, { data: { schoolName: uniqueSchool('Docente'), program: 'inspira', validDays: 30 } })).status()
      ).toBe(403);
      const page = await context.newPage();
      await page.goto(ADMIN_PAGE);
      await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'Nóminas de pasantes' })).toHaveCount(0);
    } finally {
      await docente.dispose();
      await context.close();
    }
  });

  test('anonymous is sent to login and refused by the API', async ({ browser, baseURL }) => {
    const anon = await playwrightRequest.newContext({ baseURL });
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      expect((await anon.get(ADMIN_API)).status()).toBe(401);
      const page = await context.newPage();
      await page.goto(ADMIN_PAGE);
      await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 30_000 });
    } finally {
      await anon.dispose();
      await context.close();
    }
  });

  test('the forced-password admin is held: API by cookie and by genuine Bearer, page redirected', async ({
    browser,
    baseURL,
  }) => {
    const cookie = await apiContextFor(browser, FORCED_PASSWORD_FIXTURE_KEY, baseURL!);
    const bearer = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${await genuineAccessToken(E2E_USERS[FORCED_PASSWORD_FIXTURE_KEY])}` },
    });
    const adminBearer = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${await genuineAccessToken(E2E_USERS.admin)}` },
    });
    const context = await browser.newContext({ storageState: await ensureStorageState(browser, FORCED_PASSWORD_FIXTURE_KEY) });
    try {
      // Control: Bearer works for an unflagged admin, so the refusals below are the gate.
      expect((await adminBearer.get(ADMIN_API)).status()).toBe(200);
      for (const [label, client] of [
        ['cookie', cookie],
        ['bearer', bearer],
      ] as const) {
        for (const response of [
          await client.get(ADMIN_API),
          await client.post(ADMIN_API, { data: { schoolName: uniqueSchool('Forced'), program: 'inspira', validDays: 30 } }),
        ]) {
          expect(response.status(), label).toBe(403);
          const body = (await response.json()) as Record<string, unknown>;
          expect(body.code, label).toBe('PASSWORD_CHANGE_REQUIRED');
          expect(body, label).not.toHaveProperty('token');
          expect(body, label).not.toHaveProperty('rosters');
        }
      }
      const page = await context.newPage();
      await page.goto(ADMIN_PAGE);
      await expect(page).toHaveURL(/\/change-password/, { timeout: 30_000 });
    } finally {
      await cookie.dispose();
      await bearer.dispose();
      await adminBearer.dispose();
      await context.close();
    }
  });

  test('no role reaches the intake tables or functions through PostgREST', async () => {
    expect(SUPABASE_URL).not.toBe('');
    expect(LOCAL_SUPABASE_HOSTS.has(new URL(SUPABASE_URL).hostname)).toBe(true);
    const adminToken = await genuineAccessToken(E2E_USERS.admin);
    const rest = await playwrightRequest.newContext();
    try {
      for (const [label, bearer] of [
        ['anon', SUPABASE_ANON_KEY],
        ['admin', adminToken],
      ] as const) {
        const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' };
        for (const table of ['pasantias_intake_rosters', 'pasantias_intake_participants']) {
          const read = await rest.get(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, { headers });
          expect([401, 403], `${label} select ${table}`).toContain(read.status());
        }
        const rpc = await rest.post(`${SUPABASE_URL}/rest/v1/rpc/pasantias_intake_finalize`, {
          headers,
          data: { p_token_hash: '0'.repeat(64), p_expected_roster_version: 1 },
        });
        expect([401, 403, 404], `${label} rpc`).toContain(rpc.status());
      }
    } finally {
      await rest.dispose();
    }
  });
});

/* ================================================================ leaks */

test.describe('Nómina — no token or PII leaves the origin', () => {
  let admin: APIRequestContext;
  test.beforeAll(async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    admin = await apiContextFor(browser, 'admin', baseURL!);
  });
  test.afterAll(async () => {
    await admin?.dispose();
  });

  test('a plain GET carries no school and the no-store / noindex headers', async ({ baseURL }) => {
    const roster = await createRoster(admin, 'inspira', 'Leak HTML');
    const plain = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': CLIENT.leaks } });
    try {
      const response = await plain.get(NOMINA);
      expect(response.status()).toBe(200);
      const headers = response.headers();
      expect(headers['cache-control']).toContain('no-store');
      expect(headers['cache-control']).toContain('private');
      expect(headers['x-robots-tag']).toBe('noindex, nofollow');
      const html = await response.text();
      expect(html).not.toContain(roster.schoolName);
      expect(html).toContain('name="referrer" content="no-referrer"');
      expect(html).toContain('name="robots" content="noindex, nofollow"');
    } finally {
      await plain.dispose();
    }
  });

  test('watching every request: the token stays in the fragment and on our own API', async ({ browser, baseURL }) => {
    const roster = await createRoster(admin, 'inspira', 'Leak Watch');
    const origin = new URL(baseURL!).origin;
    const context = await anonymousContext(browser, CLIENT.leaks);
    const seen: { url: string; headers: Record<string, string>; offsite: boolean }[] = [];
    context.on('request', (request) => {
      void request
        .allHeaders()
        .catch(() => request.headers())
        .then((headers) => {
          seen.push({ url: request.url(), headers, offsite: new URL(request.url()).origin !== origin });
        });
    });
    try {
      const page = await context.newPage();
      await openNomina(page, roster.token, roster.schoolName);
      await tickAcknowledgement(page);
      await fillFicha(page, { firstNames: 'Fuga', lastNames: 'Ninguna', rut: syntheticRut(), flights: 'sep', lodging: 'sep' });
      await page.getByTestId('intake-save').click();
      await expect(page.getByTestId('intake-count')).toHaveText('(1/60)');
      await page.reload();
      await expect(page.getByTestId('intake-count')).toHaveText('(1/60)', { timeout: 30_000 });
      await expect.poll(() => seen.length).toBeGreaterThan(3);

      for (const entry of seen) {
        const withoutFragment = new URL(entry.url);
        withoutFragment.hash = '';
        expect(withoutFragment.toString(), `URL outside the fragment: ${withoutFragment.origin}`).not.toContain(roster.token);
        const referer = entry.headers['referer'] ?? '';
        expect(referer, 'Referer').not.toContain(roster.token);
        if (entry.offsite) {
          expect(JSON.stringify(entry.headers), `off-site headers to ${withoutFragment.origin}`).not.toContain(roster.token);
          expect(entry.url).not.toContain('Fuga');
        }
      }
      // The token did travel where it must: our API, in the Intake header.
      const apiCalls = seen.filter((e) => !e.offsite && new URL(e.url).pathname.startsWith(INTAKE_API));
      expect(apiCalls.length).toBeGreaterThan(0);
      for (const call of apiCalls) expect(call.headers['authorization']).toBe(`Intake ${roster.token}`);
    } finally {
      await context.close();
    }
  });
});

/* ================================================================ keyboard */

async function keyboardOnlyAdd(page: Page, rut: string) {
  // Validation first: Enter in the first field submits the empty ficha.
  const firstNames = page.getByTestId('intake-first-names');
  await firstNames.focus();
  await page.keyboard.press('Enter');
  await expect(firstNames).toBeFocused();
  await expect(firstNames).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('intake-live')).toContainText('Revisa los 5 campos marcados.');

  // The acknowledgement, by keyboard.
  await page.getByTestId('intake-ack').focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('intake-ack')).toBeChecked();

  await firstNames.focus();
  await page.keyboard.type('Teclado');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('intake-last-names')).toBeFocused();
  await page.keyboard.type('Sin Ratón');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('intake-rut')).toBeFocused();
  await page.keyboard.type(rut);
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('intake-passport')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('intake-flights-funding')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('intake-flights-funding')).toHaveValue('sep');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('intake-lodging-funding')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('intake-lodging-funding')).toHaveValue('colegio');

  // Through the optional fields to the save button.
  const stops = [
    'intake-arrival-date',
    'intake-departure-date',
    'intake-focus',
    'intake-dietary-vegetariano',
    'intake-dietary-vegano',
    'intake-dietary-sin_gluten',
    'intake-dietary-sin_lactosa',
    'intake-dietary-otra',
    'intake-cancel',
    'intake-save',
  ];
  for (const stop of stops) {
    await page.keyboard.press('Tab');
    await expect(page.getByTestId(stop)).toBeFocused();
  }
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('intake-count')).toHaveText('(1/60)');
  await expect(page.getByTestId('intake-list')).toContainText('Teclado Sin Ratón');
}

for (const [label, viewport, ip] of [
  ['1366 px', { width: 1366, height: 900 }, CLIENT.keyboard1366],
  ['390 px', { width: 390, height: 844 }, CLIENT.keyboard390],
] as const) {
  test.describe(`Nómina — keyboard only at ${label}`, () => {
    let admin: APIRequestContext;
    test.beforeAll(async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      admin = await apiContextFor(browser, 'admin', baseURL!);
    });
    test.afterAll(async () => {
      await admin?.dispose();
    });

    test('add a person with validation and focus, no mouse', async ({ browser }) => {
      const roster = await createRoster(admin, 'mirada-profunda', `Keyboard ${label}`);
      const context = await anonymousContext(browser, ip, { viewport });
      try {
        const page = await context.newPage();
        await openNomina(page, roster.token, roster.schoolName);
        await keyboardOnlyAdd(page, syntheticRut());
      } finally {
        await context.close();
      }
    });
  });
}

/* ================================================================ time zones */

test.describe('Nómina — identical date labels in every time zone', () => {
  let admin: APIRequestContext;
  test.beforeAll(async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    admin = await apiContextFor(browser, 'admin', baseURL!);
  });
  test.afterAll(async () => {
    await admin?.dispose();
  });

  test('America/Santiago and Pacific/Kiritimati show the same options', async ({ browser }) => {
    const inspira = await createRoster(admin, 'inspira', 'TZ');
    const labels: string[][] = [];
    for (const timezoneId of ['America/Santiago', 'Pacific/Kiritimati']) {
      const context: BrowserContext = await anonymousContext(browser, CLIENT.timezones, { timezoneId });
      try {
        const page = await context.newPage();
        await openNomina(page, inspira.token, inspira.schoolName);
        const arrival = await page.getByTestId('intake-arrival-date').locator('option').allTextContents();
        const departure = await page.getByTestId('intake-departure-date').locator('option').allTextContents();
        labels.push([...arrival, ...departure]);
      } finally {
        await context.close();
      }
    }
    expect(labels[1]).toEqual(labels[0]);
    expect(labels[0]).toEqual([
      'Sin indicar',
      'domingo 17 de enero de 2027 · un día antes del inicio',
      'lunes 11 de enero de 2027 · una semana antes del inicio',
      'Sin indicar',
      'viernes 29 de enero de 2027 · el día después del cierre',
      'jueves 4 de febrero de 2027 · una semana después del cierre',
      'jueves 11 de febrero de 2027 · dos semanas después del cierre',
    ]);
  });
});

/* ================================================================ protocol */

test.describe('Nómina — protocol limits on the real server', () => {
  let admin: APIRequestContext;
  test.beforeAll(async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    admin = await apiContextFor(browser, 'admin', baseURL!);
  });
  test.afterAll(async () => {
    await admin?.dispose();
  });

  test('a body over 8 kB is refused and every response is no-store', async ({ baseURL }) => {
    const roster = await createRoster(admin, 'inspira', 'Protocol');
    const api = await coordinatorApi(baseURL!, CLIENT.protocol);
    try {
      const big = await api.post(INTAKE_API, {
        headers: auth(roster.token),
        data: { ...participantBody({ dietaryOther: 'x'.repeat(9000) }), clientRequestId: randomUUID(), acknowledged: true },
      });
      expect(big.status()).toBe(413);
      const ok = await api.get(INTAKE_API, { headers: auth(roster.token) });
      expect(ok.headers()['cache-control']).toBe('no-store');
      const bad = await api.get(INTAKE_API, { headers: { Authorization: `Bearer ${roster.token}` } });
      expect(bad.status()).toBe(401);
      expect(bad.headers()['cache-control']).toBe('no-store');
      expect((await listParticipants(api, roster.token)).participants).toHaveLength(0);
    } finally {
      await api.dispose();
    }
  });
});

/* ================================================================ rate limit */

test.describe('Nómina — the product rate limit still holds', () => {
  test('the 61st coordinator request in a minute from one client is 429; another client is unaffected', async ({
    baseURL,
  }) => {
    const limited = await coordinatorApi(baseURL!, CLIENT.rateLimit);
    const other = await coordinatorApi(baseURL!, '198.51.100.21');
    try {
      // Malformed links: refused without a database call, but still counted.
      const statuses: number[] = [];
      for (let i = 0; i < 61; i += 1) {
        statuses.push((await limited.get(INTAKE_API, { headers: { Authorization: 'Intake short' } })).status());
      }
      expect(statuses.slice(0, 60).every((status) => status === 401)).toBe(true);
      expect(statuses[60]).toBe(429);
      expect((await other.get(INTAKE_API, { headers: { Authorization: 'Intake short' } })).status()).toBe(401);
    } finally {
      await limited.dispose();
      await other.dispose();
    }
  });
});
