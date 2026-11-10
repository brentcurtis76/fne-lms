import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';

import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
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
 * PASANTÍAS PANEL — FNE's logistics panel over the January 2027 intake, unmocked.
 *
 * **There is deliberately no `page.route()` in this file.** Every request goes
 * to the real handlers against the real (ephemeral, seeded) local database and
 * the real local Storage, so the SQL functions, the table grants, the private
 * bucket and the signed URLs are what answer.
 *
 * Data is synthetic only (Ley 21.719). Every school and surname is unique to
 * the run, so local runs that are not rebuilt never collide; the letter images
 * are a generated 2×2 PNG, never a real logo or signature.
 *
 * Requires the seeded local Supabase stack — see .github/workflows/ci.yml gate 4.
 */

test.setTimeout(180_000);

const PANEL_PAGE = '/admin/pasantias-panel';
const PANEL_API = '/api/admin/pasantias-panel';
const ROSTER_API = '/api/admin/pasantia-participants';
const INTAKE_API = '/api/pasantias/participants';
const CLIENT_IP = '198.51.100.41';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const LOCAL_SUPABASE_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

const RUN = randomUUID().slice(0, 8);

function syntheticRut(): string {
  const body = String(10_000_000 + Math.floor(Math.random() * 20_000_000));
  return `${body}-${calculateVerificationDigit(body)}`;
}

/** A valid 2×2 white PNG, generated so no image fixture lives in the repo. */
function tinyPng(): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.from([0, 255, 255, 255, 255, 255, 255]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat([row, row]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const TICKET_PDF = Buffer.from(
  `%PDF-1.4\n% synthetic ticket ${RUN}\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`,
  'latin1'
);

interface Roster {
  id: string;
  token: string;
  schoolName: string;
}

interface Person {
  id: string;
  firstNames: string;
  lastNames: string;
  rut: string;
  email: string;
}

const intakeAuth = (token: string) => ({ Authorization: `Intake ${token}` });

async function createRoster(
  admin: APIRequestContext,
  coordinator: APIRequestContext,
  program: 'inspira' | 'mirada-profunda',
  label: string
): Promise<Roster> {
  const schoolName = `E2E Panel ${label} ${RUN}`;
  const created = await admin.post(ROSTER_API, { data: { schoolName, program, validDays: 30 } });
  expect(created.status(), 'roster create').toBe(201);
  const body = (await created.json()) as { roster: { id: string }; token: string };
  const funded = await coordinator.put(`${INTAKE_API}/school`, {
    headers: intakeAuth(body.token),
    data: { flightsFunding: 'sep', lodgingFunding: 'colegio', expectedFundingVersion: null },
  });
  expect(funded.status(), 'school funding').toBe(200);
  return { id: body.roster.id, token: body.token, schoolName };
}

async function addPerson(
  coordinator: APIRequestContext,
  roster: Roster,
  firstNames: string,
  tag: string,
  email = `${firstNames.toLowerCase()}.${tag.toLowerCase()}.${RUN}@example.com`
): Promise<Person> {
  const lastNames = `Panel${tag} ${RUN.replace(/[0-9]/g, 'x')}`;
  const rut = syntheticRut();
  const response = await coordinator.post(INTAKE_API, {
    headers: intakeAuth(roster.token),
    data: {
      firstNames,
      lastNames,
      rut,
      passportNumber: null,
      arrivalDate: null,
      departureDate: null,
      focus: null,
      dietaryRestrictions: [],
      dietaryOther: null,
      email,
      clientRequestId: randomUUID(),
      acknowledged: true,
    },
  });
  expect(response.status(), 'participant create').toBe(201);
  const body = (await response.json()) as { participant: { id: string } };
  return { id: body.participant.id, firstNames, lastNames, rut, email };
}

async function finalize(coordinator: APIRequestContext, roster: Roster) {
  const list = await coordinator.get(INTAKE_API, { headers: intakeAuth(roster.token) });
  const { roster: current } = (await list.json()) as { roster: { version: number } };
  const sent = await coordinator.post(`${INTAKE_API}/finalize`, {
    headers: intakeAuth(roster.token),
    data: { expectedRosterVersion: current.version },
  });
  expect(sent.status(), 'finalize').toBe(200);
}

async function coordinatorView(coordinator: APIRequestContext, roster: Roster) {
  const response = await coordinator.get(INTAKE_API, { headers: intakeAuth(roster.token) });
  expect(response.status()).toBe(200);
  return (await response.json()) as {
    roster: { status: string; version: number; lodgingLocked?: boolean; schoolFunding: { version: number } | null };
    participants: { id: string; lastNames: string; version: number; email: string | null; datesLocked?: boolean }[];
  };
}

async function genuineAccessToken(user: E2eFixtureUser): Promise<string> {
  expect(SUPABASE_URL, 'needs NEXT_PUBLIC_SUPABASE_URL (local stack)').not.toBe('');
  expect(
    LOCAL_SUPABASE_HOSTS.has(new URL(SUPABASE_URL).hostname),
    'fixture credentials are only ever sent to a local Supabase host'
  ).toBe(true);
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error || !data.session) throw new Error(`fixture password sign-in failed: ${error?.message ?? 'no session'}`);
  return data.session.access_token;
}

async function openPanel(page: Page) {
  await page.goto(PANEL_PAGE);
  await expect(page.getByRole('heading', { name: 'Panel de pasantías' }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('panel-count')).toContainText('Mostrando', { timeout: 30_000 });
}

/** Opens one person's detail panel and waits until it has loaded. */
async function openPerson(page: Page, person: Person) {
  await page.getByTestId(`panel-open-${person.id}`).click();
  await expect(page.getByTestId('panel-section-tracking')).toBeVisible({ timeout: 30_000 });
}

/* ================================================================ the journey */

test.describe('Panel de pasantías — the admin journey through the UI', () => {
  // One story told in order on shared people; each worker builds its own schools.
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: storageStatePath('admin') });

  let admin: APIRequestContext;
  let coordinator: APIRequestContext;
  let schoolA: Roster;
  let schoolB: Roster;
  let ana: Person;
  let bruno: Person;
  let carla: Person;

  test.beforeAll(async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    await ensureStorageState(browser, 'admin');
    admin = await apiContextFor(browser, 'admin', baseURL!);
    coordinator = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': CLIENT_IP } });
    schoolA = await createRoster(admin, coordinator, 'inspira', 'Uno');
    schoolB = await createRoster(admin, coordinator, 'mirada-profunda', 'Dos');
    ana = await addPerson(coordinator, schoolA, 'Ana', 'Alfa');
    bruno = await addPerson(coordinator, schoolA, 'Bruno', 'Beta');
    // Carla's email is the docente fixture account's: she is the traveller who has a GENERA account.
    carla = await addPerson(coordinator, schoolB, 'Carla', 'Gama', E2E_USERS.docente.email.toLowerCase());
    // School A has SENT its list: the correction below must not reopen it.
    await finalize(coordinator, schoolA);
  });

  test.afterAll(async () => {
    await admin?.dispose();
    await coordinator?.dispose();
  });

  test('one table for every school; quick edits and bulk edits persist', async ({ page }) => {
    await openPanel(page);

    // Both schools' people are in the same table, with what each school sent.
    for (const person of [ana, bruno, carla]) {
      await expect(page.getByTestId(`panel-row-${person.id}`)).toContainText(`${person.firstNames} ${person.lastNames}`);
    }
    await expect(page.getByTestId(`panel-row-${ana.id}`)).toContainText(schoolA.schoolName);
    await expect(page.getByTestId(`panel-row-${carla.id}`)).toContainText(schoolB.schoolName);
    await expect(page.getByTestId(`panel-funding-${ana.id}`)).toHaveText('Pasajes: Costo SEP · Estadía: Costo Colegio');
    await expect(page.getByTestId(`panel-flight-${ana.id}`)).toHaveValue('pending');
    await expect(page.getByTestId('panel-summary')).toBeVisible();
    // The email each school entered, and who already has a GENERA account.
    await expect(page.getByTestId(`panel-email-${ana.id}`)).toHaveText(ana.email);
    await expect(page.getByTestId(`panel-account-${ana.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`panel-account-${carla.id}`)).toHaveText('Con cuenta en GENERA');
    // Nobody's letter can send itself yet: no flight date, no greeting, no letter data.
    await expect(page.getByTestId(`panel-letter-send-${ana.id}`)).toHaveAttribute('data-state', 'blocked');

    // Search narrows to this run's three people.
    await page.getByTestId('panel-filter-search').fill(RUN.replace(/[0-9]/g, 'x'));
    await expect(page.getByTestId('panel-table').locator('tbody tr')).toHaveCount(3);

    // Quick edit: airfare paid for Ana.
    const saved = page.waitForResponse((r) => r.url().includes(`/participants/${ana.id}`) && r.request().method() === 'PATCH');
    await page.getByTestId(`panel-flight-${ana.id}`).selectOption('paid');
    expect((await saved).status()).toBe(200);
    await expect(page.getByTestId(`panel-flight-${ana.id}`)).toHaveValue('paid');

    // Filter by school A, then bulk: deposit received for everyone shown.
    await page.getByTestId('panel-filter-search').fill('');
    await page.getByTestId('panel-filter-roster').selectOption(schoolA.id);
    await expect(page.getByTestId('panel-table').locator('tbody tr')).toHaveCount(2);
    await page.getByTestId('panel-select-all').check();
    await expect(page.getByTestId('panel-bulk-count')).toHaveText('2 personas seleccionadas');
    await page.getByTestId('panel-bulk-choice').selectOption('depositReceived:true');
    await page.getByTestId('panel-bulk-apply').click();
    await expect(page.getByTestId('panel-message')).toContainText('2 de 2 personas cambiaron');
    await expect(page.getByTestId(`panel-deposit-${ana.id}`)).toBeChecked();
    await expect(page.getByTestId(`panel-deposit-${bruno.id}`)).toBeChecked();

    // Lodging filter + a status nobody has → the empty state, not a stale table.
    await page.getByTestId('panel-filter-lodging').selectOption('paid');
    await expect(page.getByTestId('panel-no-match')).toBeVisible();

    // Everything survives a reload: it is in the database, not in the page.
    await openPanel(page);
    await expect(page.getByTestId(`panel-flight-${ana.id}`)).toHaveValue('paid');
    await expect(page.getByTestId(`panel-deposit-${ana.id}`)).toBeChecked();
    await expect(page.getByTestId(`panel-deposit-${bruno.id}`)).toBeChecked();
    await expect(page.getByTestId(`panel-deposit-${carla.id}`)).not.toBeChecked();
    await expect(page.getByTestId(`panel-flight-${carla.id}`)).toHaveValue('pending');
  });

  test('once the airfare is bought the school can no longer change that person\'s dates or the lodging answer', async ({
    browser,
    baseURL,
  }) => {
    // Ana's airfare was marked paid in the test above; Bruno's was not.
    const view = await coordinatorView(coordinator, schoolA);
    const anaRow = view.participants.find((p) => p.id === ana.id)!;
    const brunoRow = view.participants.find((p) => p.id === bruno.id)!;
    expect(anaRow.datesLocked).toBe(true);
    expect(brunoRow.datesLocked).toBe(false);
    expect(view.roster.lodgingLocked).toBe(true);

    const person = (target: Person, arrivalDate: string | null) => ({
      firstNames: target.firstNames,
      lastNames: target.lastNames,
      rut: target.rut,
      passportNumber: null,
      arrivalDate,
      departureDate: null,
      focus: null,
      dietaryRestrictions: [],
      dietaryOther: null,
      email: target.email,
      acknowledged: true,
    });
    const refused = await coordinator.put(`${INTAKE_API}/${ana.id}`, {
      headers: intakeAuth(schoolA.token),
      data: { ...person(ana, '2027-01-17'), expectedVersion: anaRow.version },
    });
    expect(refused.status()).toBe(422);
    const refusal = (await refused.json()) as { code: string; fields: Record<string, string> };
    expect(refusal.code).toBe('VALIDATION');
    expect(refusal.fields.arrivalDate).toContain('ya fue comprado');

    const lodging = await coordinator.put(`${INTAKE_API}/school`, {
      headers: intakeAuth(schoolA.token),
      data: { flightsFunding: 'sep', lodgingFunding: 'sep', expectedFundingVersion: view.roster.schoolFunding!.version },
    });
    expect(lodging.status()).toBe(422);
    expect(((await lodging.json()) as { fields: Record<string, string> }).fields.lodgingFunding).toContain('pasajes comprados');

    // Nothing changed, and the list is still "sent".
    const after = await coordinatorView(coordinator, schoolA);
    expect(after.roster.status).toBe('submitted');
    expect(after.roster.version).toBe(view.roster.version);
    expect(after.participants.find((p) => p.id === ana.id)!.version).toBe(anaRow.version);

    // The school's own page shows the dates and the lodging answer greyed out, and says why.
    const context = await browser.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': CLIENT_IP } });
    try {
      const school = await context.newPage();
      await school.goto(`/pasantias/nomina#k=${schoolA.token}`);
      await expect(school.getByTestId('intake-school')).toHaveText(schoolA.schoolName, { timeout: 30_000 });
      await expect(school.getByTestId('intake-school-lodging')).toBeDisabled();
      await expect(school.getByTestId('intake-school-lodging-locked')).toContainText('pasajes comprados');
      await expect(school.getByTestId('intake-school-flights')).toBeEnabled();
      await school.getByTestId(`intake-edit-${ana.id}`).click();
      await expect(school.getByTestId('intake-dates-locked')).toContainText('ya fue comprado');
      await expect(school.getByTestId('intake-arrival-date')).toBeDisabled();
      await expect(school.getByTestId('intake-departure-date')).toBeDisabled();
      await expect(school.getByTestId('intake-email')).toHaveValue(ana.email);
      await expect(school.getByTestId('intake-email')).toBeEnabled();
    } finally {
      await context.close();
    }
  });

  test('correcting school data keeps the roster sent, is logged, and reaches the school', async ({ page }) => {
    await openPanel(page);
    await openPerson(page, bruno);
    await expect(page.getByTestId('panel-data-roster-status')).toHaveAttribute('data-status', 'submitted');

    await page.getByTestId('panel-data-edit').click();
    const corrected = `${bruno.lastNames} Corregido`;
    await page.getByTestId('intake-last-names').fill(corrected);
    await page.getByTestId('intake-passport').fill('ab 123456');
    await page.getByTestId('intake-focus').selectOption('todos');
    await page.getByTestId('intake-save').click();

    await expect(page.getByTestId('panel-data-msg')).toContainText('Datos corregidos');
    await expect(page.getByTestId('panel-drawer-title')).toHaveText(`Bruno ${corrected}`);
    await expect(page.getByTestId('panel-data-passport')).toHaveText('AB123456');
    await expect(page.getByTestId('panel-data-roster-status')).toHaveAttribute('data-status', 'submitted');
    const history = page.getByTestId('panel-activity-list');
    await expect(history).toContainText(`Apellidos: «${bruno.lastNames}» → «${corrected}»`);
    await expect(history).toContainText('Pasaporte: sin indicar → «AB123456»');
    await expect(history).toContainText('Foco: Sin indicar → Todos');
    await expect(history).toContainText(`${E2E_USERS.admin.firstName} ${E2E_USERS.admin.lastName}`);

    // The school sees the correction through its own link, and its list is still "sent".
    const school = await coordinatorView(coordinator, schoolA);
    expect(school.roster.status).toBe('submitted');
    expect(school.participants.find((p) => p.id === bruno.id)?.lastNames).toBe(corrected);

    // A duplicate RUT inside the same school is refused under the field.
    await page.getByTestId('panel-data-edit').click();
    await page.getByTestId('intake-rut').fill(ana.rut);
    await page.getByTestId('intake-save').click();
    await expect(page.getByTestId('intake-error-rut')).toHaveText('Este RUT ya está en la nómina.');
  });

  test('a letter needs all its parts; it is generated as a PDF and saved; documents upload, download and remove', async ({
    page,
  }) => {
    await openPanel(page);

    // Letter images (generated, synthetic) go into the private bucket once.
    await page.getByTestId('panel-letter-images').evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
    });
    for (const kind of ['logo', 'signature'] as const) {
      await page.getByTestId(`panel-letter-image-${kind}`).setInputFiles({ name: `${kind}.png`, mimeType: 'image/png', buffer: tinyPng() });
      const uploaded = page.waitForResponse((r) => r.url().includes('/letter-assets') && r.request().method() === 'POST');
      await page.getByTestId(`panel-letter-image-upload-${kind}`).click();
      expect((await uploaded).status()).toBe(201);
      await expect(page.getByTestId(`panel-letter-image-state-${kind}`)).toHaveText('(subida)');
    }

    await openPerson(page, carla);

    // Nothing is guessed: the letter is blocked and says what is missing.
    await expect(page.getByTestId('panel-letter-generate')).toBeDisabled();
    await expect(page.getByTestId('panel-letter-missing')).toContainText('el tratamiento (Estimado/Estimada)');
    await expect(page.getByTestId('panel-letter-missing')).toContainText('el colegio como aparece en la carta');
    await expect(page.getByTestId('panel-letter-missing')).not.toContainText('la firma de la carta');

    // Tracking: greeting, the real flight dates + notes.
    await expect(page.getByTestId('panel-data-email')).toContainText(carla.email);
    await expect(page.getByTestId('panel-data-account')).toHaveAttribute('data-account', 'yes');
    await expect(page.getByTestId('panel-letter-send-state')).toContainText('la fecha de salida de SCL');
    await expect(page.getByTestId('panel-letter-send')).toBeDisabled();
    await page.getByTestId('panel-tracking-sclDepartureDate').fill('2027-01-16');
    await page.getByTestId('panel-tracking-bcnArrivalDate').fill('2027-01-15');
    await page.getByTestId('panel-tracking-salutation').selectOption('estimada');
    await page.getByTestId('panel-tracking-save').click();
    // A date that runs backwards is refused under its own field, and nothing is saved.
    await expect(page.getByTestId('panel-tracking-error-bcnArrivalDate')).toContainText('Llegada a BCN');
    await page.getByTestId('panel-tracking-bcnArrivalDate').fill('2027-01-17');
    await page.getByTestId('panel-tracking-bcnDepartureDate').fill('2027-01-30');
    await page.getByTestId('panel-tracking-sclArrivalDate').fill('2027-01-31');
    await page.getByTestId('panel-tracking-lodging').selectOption('reserved');
    await page.getByTestId('panel-tracking-notes').fill('Llega un día antes.\nConfirmar traslado.');
    await page.getByTestId('panel-tracking-save').click();
    await expect(page.getByTestId('panel-tracking-msg')).toHaveText('Seguimiento guardado.');

    // The two lines of the school's letters.
    await page.getByTestId('panel-letter-school').fill(`del ${schoolB.schoolName}, de la Región Sintética, Chile`);
    await page.getByTestId('panel-letter-lodging').fill('la Residencia Sintética, ubicada en Calle Falsa 123, Barcelona');
    await page.getByTestId('panel-letter-save-lines').click();
    await expect(page.getByTestId('panel-letter-msg')).toContainText('Datos de la carta guardados');
    await expect(page.getByTestId('panel-letter-missing')).toHaveCount(0);

    // Generate: the PDF is stored with her documents.
    await page.getByTestId('panel-letter-generate').click();
    await expect(page.getByTestId('panel-letter-msg')).toContainText('Carta generada', { timeout: 60_000 });
    const letterItem = page.locator('[data-testid^="panel-doc-"][data-kind="invitation_letter"]');
    await expect(letterItem).toHaveCount(1);
    await expect(letterItem).toContainText(`Carta Invitación - Carla ${carla.lastNames}.pdf`);
    await expect(page.getByTestId('panel-activity-list')).toContainText('Carta de invitación generada');
    await expect(page.getByTestId('panel-activity-list')).toContainText('Salida de SCL: sin indicar → 16-01-2027');

    // Everything the letter needs now exists, so the panel says when it will email itself…
    await expect(page.getByTestId('panel-letter-send-state')).toHaveAttribute('data-state', 'scheduled');
    await expect(page.getByTestId('panel-letter-send-state')).toContainText('09-01-2027');
    // …and "send now" is honest when this environment has no mail provider: nothing is sent,
    // no second letter is stored, and the reason stays on screen.
    await page.getByTestId('panel-letter-send').click();
    await expect(page.getByTestId('panel-letter-msg')).toContainText('el envío de correos no está configurado', { timeout: 60_000 });
    await expect(page.getByTestId('panel-letter-send-error')).toContainText('el envío de correos no está configurado');
    await expect(page.getByTestId('panel-letter-send-state')).toHaveAttribute('data-state', 'scheduled');
    await expect(page.locator('[data-testid^="panel-doc-"][data-kind="invitation_letter"]')).toHaveCount(1);

    // The stored letter really is a PDF, reachable only through a signed URL.
    const detail = (await (await admin.get(`${PANEL_API}/participants/${carla.id}`)).json()) as {
      documents: { id: string; kind: string; mimeType: string }[];
      row: {
        hasLetter: boolean;
        hasAccount: boolean;
        logistics: Record<string, unknown> & { notes: string; lodgingStatus: string };
      };
    };
    expect(detail.row.hasLetter).toBe(true);
    expect(detail.row.hasAccount).toBe(true);
    expect(detail.row.logistics).toMatchObject({
      sclDepartureDate: '2027-01-16',
      bcnArrivalDate: '2027-01-17',
      bcnDepartureDate: '2027-01-30',
      sclArrivalDate: '2027-01-31',
      letterSentAt: null,
      letterSendError: 'email_not_configured',
    });
    expect(detail.row.logistics.notes).toBe('Llega un día antes.\nConfirmar traslado.');
    expect(detail.row.logistics.lodgingStatus).toBe('reserved');
    const letter = detail.documents.find((d) => d.kind === 'invitation_letter')!;
    expect(letter.mimeType).toBe('application/pdf');
    const signedLetter = (await (await admin.get(`${PANEL_API}/documents/${letter.id}`)).json()) as { url: string };
    const anyone = await playwrightRequest.newContext();
    try {
      const pdf = await anyone.get(signedLetter.url);
      expect(pdf.status()).toBe(200);
      const bytes = await pdf.body();
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(bytes.length).toBeGreaterThan(2000);
      expect(pdf.headers()['content-disposition'] ?? '').toContain('attachment');

      // Upload a ticket through the form.
      await page.getByTestId('panel-doc-kind').selectOption('ticket');
      await page.getByTestId('panel-doc-description').fill('Ida y vuelta');
      await page.getByTestId('panel-doc-file').setInputFiles({ name: 'pasaje carla.pdf', mimeType: 'application/pdf', buffer: TICKET_PDF });
      await page.getByTestId('panel-doc-upload').click();
      await expect(page.getByTestId('panel-doc-msg')).toHaveText('Documento subido.');
      const ticketItem = page.locator('[data-testid^="panel-doc-"][data-kind="ticket"]');
      await expect(ticketItem).toContainText('Pasaje aéreo · Ida y vuelta');
      await expect(ticketItem).toContainText('pasaje carla.pdf');

      // The download button fetches the very bytes that were uploaded.
      const ticketId = ((await ticketItem.getAttribute('data-testid')) ?? '').replace('panel-doc-', '');
      const download = page.waitForEvent('download');
      await page.getByTestId(`panel-doc-download-${ticketId}`).click();
      const file = await download;
      expect(file.suggestedFilename()).toBe('pasaje carla.pdf');
      const signedTicket = (await (await admin.get(`${PANEL_API}/documents/${ticketId}`)).json()) as { url: string };
      const fetched = await anyone.get(signedTicket.url);
      expect((await fetched.body()).equals(TICKET_PDF)).toBe(true);

      // A web page renamed to .pdf is refused by its own bytes, and nothing is stored.
      await page.getByTestId('panel-doc-file').setInputFiles({
        name: 'pasaje.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('<html><script>alert(1)</script></html>'),
      });
      await page.getByTestId('panel-doc-upload').click();
      await expect(page.getByTestId('panel-doc-file-error')).toContainText('Tipo de archivo no permitido');
      await expect(page.locator('[data-testid^="panel-doc-"][data-kind]')).toHaveCount(2);

      // Remove the ticket: it leaves the list, its link stops working, the file is gone.
      await page.getByTestId(`panel-doc-remove-${ticketId}`).click();
      await page.getByTestId(`panel-doc-remove-confirm-${ticketId}`).click();
      await expect(page.getByTestId('panel-doc-msg')).toHaveText('Documento eliminado.');
      await expect(page.locator('[data-testid^="panel-doc-"][data-kind="ticket"]')).toHaveCount(0);
      expect((await admin.get(`${PANEL_API}/documents/${ticketId}`)).status()).toBe(404);
      expect((await anyone.get(signedTicket.url)).status()).not.toBe(200);
      await expect(page.getByTestId('panel-activity-list')).toContainText('Documento eliminado: Pasaje aéreo · pasaje carla.pdf');
    } finally {
      await anyone.dispose();
    }

    // Back on the table: the row shows the letter and one document.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(`panel-letter-${carla.id}`)).toContainText('Carta generada');
    await expect(page.getByTestId(`panel-docs-${carla.id}`)).toContainText('1 documento');
    await expect(page.getByTestId(`panel-lodging-${carla.id}`)).toHaveValue('reserved');
    await expect(page.getByTestId(`panel-flight-dates-${carla.id}`)).toContainText('16-01-2027');
    await expect(page.getByTestId(`panel-flight-dates-${carla.id}`)).toContainText('31-01-2027');
    await expect(page.getByTestId(`panel-letter-send-${carla.id}`)).toContainText('Carta: se envía el 09-01-2027');
  });

  test('the traveller with a GENERA account sees her own pasantía, and only hers', async ({ browser, baseURL }) => {
    // An "other" document is FNE's: the traveller never sees it.
    const internal = await admin.post(`${PANEL_API}/participants/${carla.id}/documents`, {
      multipart: {
        kind: 'other',
        description: 'Uso interno',
        file: { name: 'interno.pdf', mimeType: 'application/pdf', buffer: TICKET_PDF },
      },
    });
    expect(internal.status()).toBe(201);
    const internalId = ((await internal.json()) as { document: { id: string } }).document.id;

    const traveller = await apiContextFor(browser, 'docente', baseURL!);
    const context = await browser.newContext({ storageState: await ensureStorageState(browser, 'docente') });
    try {
      expect(((await (await traveller.get('/api/pasantias/mine')).json()) as { hasPasantia: boolean }).hasPasantia).toBe(true);

      const page = await context.newPage();
      await page.goto('/profile/pasantia');
      await expect(page.getByRole('heading', { name: 'Mi pasantía' }).first()).toBeVisible({ timeout: 30_000 });
      const card = page.getByTestId(`mi-pasantia-card-${carla.id}`);
      await expect(card).toBeVisible();
      await expect(page.getByTestId(`mi-pasantia-name-${carla.id}`)).toHaveText(`Carla ${carla.lastNames}`);
      await expect(page.getByTestId(`mi-pasantia-school-${carla.id}`)).toHaveText(schoolB.schoolName);
      await expect(page.getByTestId(`mi-pasantia-dates-${carla.id}`)).toContainText('entre el 18 y el 29 de enero de 2027');
      await expect(page.getByTestId(`mi-pasantia-scl-departure-${carla.id}`)).toHaveText('16 de enero de 2027');
      await expect(page.getByTestId(`mi-pasantia-scl-arrival-${carla.id}`)).toHaveText('31 de enero de 2027');
      await expect(page.getByTestId(`mi-pasantia-lodging-${carla.id}`)).toHaveText('Reservado');
      await expect(page.getByTestId(`mi-pasantia-lodging-line-${carla.id}`)).toContainText('la Residencia Sintética');
      // Her letter is there; FNE's internal file, her RUT and FNE's notes are not.
      await expect(card.locator('[data-testid^="mi-pasantia-doc-download-"]')).toHaveCount(1);
      await expect(card).toContainText('Carta de invitación');
      await expect(card).not.toContainText('interno.pdf');
      await expect(card).not.toContainText(carla.rut.split('-')[0]);
      await expect(card).not.toContainText('Confirmar traslado');
      // The menu shows "Mi pasantía" to her.
      await expect(page.getByTestId('sidebar-item-mi-pasantia').first()).toBeVisible({ timeout: 30_000 });

      // The letter downloads as the PDF it is.
      const download = page.waitForEvent('download');
      await card.locator('[data-testid^="mi-pasantia-doc-download-"]').click();
      expect((await download).suggestedFilename()).toBe(`Carta Invitación - Carla ${carla.lastNames}.pdf`);

      // Asking for FNE's internal file, or for an id that is not a document, is the same 404.
      expect((await traveller.get(`/api/pasantias/mine/documents/${internalId}`)).status()).toBe(404);
      expect((await traveller.get(`/api/pasantias/mine/documents/${randomUUID()}`)).status()).toBe(404);
    } finally {
      await traveller.dispose();
      await context.close();
    }

    // An account that is nobody's traveller (the admin) sees no pasantía and no menu entry.
    expect(((await (await admin.get('/api/pasantias/mine')).json()) as { hasPasantia: boolean }).hasPasantia).toBe(false);
    expect((await admin.get(`/api/pasantias/mine/documents/${internalId}`)).status()).toBe(404);
    const adminContext = await browser.newContext({ storageState: storageStatePath('admin') });
    try {
      const page = await adminContext.newPage();
      await page.goto('/profile/pasantia');
      await expect(page.getByTestId('mi-pasantia-empty')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('sidebar-item-mi-pasantia')).toHaveCount(0);
    } finally {
      await adminContext.close();
    }
  });

  test('two admins editing the same person: the second save is refused and shows what is stored', async () => {
    const before = (await (await admin.get(`${PANEL_API}/participants/${ana.id}`)).json()) as {
      row: { logistics: Record<string, unknown> & { version: number } };
    };
    const body = {
      flightStatus: 'paid',
      lodgingStatus: 'reserved',
      depositReceived: true,
      balanceReceived: false,
      salutation: null,
      notes: null,
      expectedVersion: before.row.logistics.version,
    };
    const [first, second] = await Promise.all([
      admin.patch(`${PANEL_API}/participants/${ana.id}`, { data: body }),
      admin.patch(`${PANEL_API}/participants/${ana.id}`, { data: { ...body, lodgingStatus: 'paid' } }),
    ]);
    const statuses = [first.status(), second.status()].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = first.status() === 409 ? first : second;
    const winner = first.status() === 200 ? first : second;
    const stored = ((await winner.json()) as { row: { logistics: { lodgingStatus: string; version: number } } }).row.logistics;
    const shown = (await loser.json()) as { code: string; row: { logistics: { lodgingStatus: string; version: number } } };
    expect(shown.code).toBe('STALE');
    expect(shown.row.logistics).toMatchObject({ lodgingStatus: stored.lodgingStatus, version: stored.version });
  });
});

/* ================================================================ access */

test.describe('Panel de pasantías — for the global admin only', () => {
  const NOBODY = '00000000-0000-4000-8000-000000000000';
  const ENDPOINTS: [string, string, unknown?][] = [
    ['GET', PANEL_API],
    ['POST', `${PANEL_API}/bulk`, { participantIds: [NOBODY], field: 'flightStatus', value: 'paid' }],
    ['GET', `${PANEL_API}/participants/${NOBODY}`],
    ['PATCH', `${PANEL_API}/participants/${NOBODY}`, {}],
    ['PUT', `${PANEL_API}/participants/${NOBODY}`, {}],
    ['POST', `${PANEL_API}/participants/${NOBODY}/letter`],
    ['POST', `${PANEL_API}/participants/${NOBODY}/send-letter`],
    ['POST', `${PANEL_API}/participants/${NOBODY}/documents`],
    ['PUT', `${PANEL_API}/rosters/${NOBODY}`, {}],
    ['GET', `${PANEL_API}/documents/${NOBODY}`],
    ['DELETE', `${PANEL_API}/documents/${NOBODY}`],
    ['GET', `${PANEL_API}/letter-assets`],
    ['POST', `${PANEL_API}/letter-assets`],
  ];

  async function statuses(client: APIRequestContext): Promise<number[]> {
    const out: number[] = [];
    for (const [method, url, data] of ENDPOINTS) {
      const response = await client.fetch(url, { method, ...(data === undefined ? {} : { data }) });
      out.push(response.status());
    }
    return out;
  }

  test('docente is denied the page and every route', async ({ browser, baseURL }) => {
    const docente = await apiContextFor(browser, 'docente', baseURL!);
    const context = await browser.newContext({ storageState: await ensureStorageState(browser, 'docente') });
    try {
      expect(await statuses(docente)).toEqual(ENDPOINTS.map(() => 403));
      const page = await context.newPage();
      await page.goto(PANEL_PAGE);
      await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'Panel de pasantías' })).toHaveCount(0);
    } finally {
      await docente.dispose();
      await context.close();
    }
  });

  test('anonymous is sent to login and refused by every route', async ({ browser, baseURL }) => {
    const anon = await playwrightRequest.newContext({ baseURL });
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      expect(await statuses(anon)).toEqual(ENDPOINTS.map(() => 401));
      const page = await context.newPage();
      await page.goto(PANEL_PAGE);
      await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 30_000 });
    } finally {
      await anon.dispose();
      await context.close();
    }
  });

  test('the forced-password admin is held on every route, by cookie and by genuine Bearer', async ({ browser, baseURL }) => {
    const cookie = await apiContextFor(browser, FORCED_PASSWORD_FIXTURE_KEY, baseURL!);
    const bearer = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${await genuineAccessToken(E2E_USERS[FORCED_PASSWORD_FIXTURE_KEY])}` },
    });
    const adminBearer = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${await genuineAccessToken(E2E_USERS.admin)}` },
    });
    try {
      // Control: Bearer works for an unflagged admin, so the refusals below are the gate.
      expect((await adminBearer.get(PANEL_API)).status()).toBe(200);
      expect(await statuses(cookie)).toEqual(ENDPOINTS.map(() => 403));
      expect(await statuses(bearer)).toEqual(ENDPOINTS.map(() => 403));
      const held = (await (await bearer.get(PANEL_API)).json()) as Record<string, unknown>;
      expect(held.code).toBe('PASSWORD_CHANGE_REQUIRED');
      expect(held).not.toHaveProperty('rows');
    } finally {
      await cookie.dispose();
      await bearer.dispose();
      await adminBearer.dispose();
    }
  });

  test('no role reaches the panel tables, functions or files except through the admin API', async () => {
    expect(SUPABASE_URL).not.toBe('');
    const adminToken = await genuineAccessToken(E2E_USERS.admin);
    const direct = await playwrightRequest.newContext();
    try {
      for (const [label, bearer] of [
        ['anon', SUPABASE_ANON_KEY],
        ['admin', adminToken],
      ] as const) {
        const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${bearer}` };
        for (const table of [
          'pasantias_panel_logistics',
          'pasantias_panel_roster_details',
          'pasantias_panel_documents',
          'pasantias_panel_activity',
          'pasantias_panel_contacts',
        ]) {
          const read = await direct.get(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, { headers });
          expect([401, 403, 404], `${label} read ${table}`).toContain(read.status());
        }
        for (const fn of [
          'pasantias_panel_save_logistics',
          'pasantias_panel_bulk_set',
          'pasantias_panel_save_participant',
          'pasantias_panel_school_save_participant',
          'pasantias_panel_school_save_funding',
          'pasantias_panel_claim_letter_send',
          'pasantias_panel_finish_letter_send',
          'pasantias_panel_expired_document_paths',
          'pasantias_panel_purge_expired',
          'pasantias_panel_platform_accounts',
          'pasantias_panel_email_ok',
        ]) {
          const rpc = await direct.post(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { headers, data: {} });
          expect([401, 403, 404], `${label} rpc ${fn}`).toContain(rpc.status());
        }
        // The letter images exist by now (the journey uploaded them): still unreachable directly.
        for (const path of ['object/pasantias-documents/letter-assets/logo', 'object/public/pasantias-documents/letter-assets/logo']) {
          const file = await direct.get(`${SUPABASE_URL}/storage/v1/${path}`, { headers });
          expect(file.status(), `${label} storage ${path}`).not.toBe(200);
        }
        const listing = await direct.post(`${SUPABASE_URL}/storage/v1/object/list/pasantias-documents`, {
          headers,
          data: { prefix: 'letter-assets', limit: 10 },
        });
        const listed = listing.status() === 200 ? ((await listing.json()) as unknown[]) : [];
        expect(listed, `${label} storage list`).toHaveLength(0);
      }
    } finally {
      await direct.dispose();
    }
  });
  test('the traveller routes need a session; the two daily jobs need the cron secret', async ({ baseURL }) => {
    const anon = await playwrightRequest.newContext({ baseURL });
    const cron = await playwrightRequest.newContext({
      baseURL,
      // The synthetic secret of the e2e environment (scripts/ci/e2e-local.sh, ci.yml).
      extraHTTPHeaders: {
        Authorization: `Bearer ${process.env.CRON_SECRET ?? 'e2e-synthetic-cron-secret-not-a-real-credential'}`,
      },
    });
    try {
      expect((await anon.get('/api/pasantias/mine')).status()).toBe(401);
      expect((await anon.get(`/api/pasantias/mine/documents/${randomUUID()}`)).status()).toBe(401);
      for (const job of ['/api/cron/pasantias-letters', '/api/cron/pasantias-retention']) {
        expect((await anon.get(job)).status(), `${job} without the secret`).toBe(401);
      }

      // The letter job answers counts only. Whoever it finds due, this environment has no
      // mail provider, so nothing can be reported as sent.
      const letters = await cron.get('/api/cron/pasantias-letters');
      expect(letters.status()).toBe(200);
      const counts = (await letters.json()) as Record<string, unknown>;
      expect(Object.keys(counts).sort()).toEqual(['attempted', 'due', 'failed', 'ok', 'sent']);
      expect(counts.sent).toBe(0);

      // The retention sweep before 28 Feb 2027 deletes nothing: the journey's files are still there.
      const sweep = await cron.get('/api/cron/pasantias-retention');
      expect(sweep.status()).toBe(200);
      const swept = (await sweep.json()) as { ok: boolean; files: number; rows: number };
      if (new Date().toISOString().slice(0, 10) < '2027-02-27') expect(swept).toEqual({ ok: true, files: 0, rows: 0 });
    } finally {
      await anon.dispose();
      await cron.dispose();
    }
  });
});
