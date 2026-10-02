import { test, expect, request, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseEnv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loginViaUi, E2E_SCHOOL_SECONDARY, type E2eFixtureUser } from './helpers/auth';

/**
 * SM-H8 (W-MEET-01) — a NEW meeting filled the way a person fills it, and who
 * may see what afterwards, on the seeded local stack (real server, real DB).
 *
 *   1. The creator (community leader) creates a meeting: date typed with the
 *      keyboard, one participant ticked, then on step 3 (which opens at the
 *      top) an agreement, a commitment and a task, each assigned by picking
 *      from a list that offers ONLY the participant. "Crear Reunión" saves;
 *      every row is in the database, the stored instant is the Chile wall
 *      time typed, and the card shows that same time and "Acuerdos (1)" /
 *      "Compromisos (1)" / "Tareas (1)" apart. The eye opens the details.
 *   2. The participant reads the content; no edit or delete button.
 *   3. A community member who did not take part sees the meeting card but
 *      none of its agreements, commitments or tasks.
 *   4. The creator deletes it with the card's delete button.
 *
 * Standalone: it creates its own synthetic community, accounts and meeting
 * with the service role and removes exactly those rows by id afterwards.
 */

const ROOT = join(__dirname, '..', '..');
const fileEnv: Record<string, string> = (() => {
  try {
    return parseEnv(readFileSync(join(ROOT, '.env.local'), 'utf8'));
  } catch {
    return {};
  }
})();
function requiredEnv(key: string): string {
  const value = process.env[key] || fileEnv[key];
  if (!value) throw new Error(`[meeting-create-and-access] ${key} is not set — see the .env.local block in .github/workflows/ci.yml.`);
  return value;
}

const service: SupabaseClient = createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const STAMP = Date.now().toString(36);
const TITLE = `Reunion sintetica SMH8 ${STAMP}`;
const AGREEMENT = `Acuerdo sintetico SMH8 ${STAMP}`;
const COMMITMENT = `Compromiso sintetico SMH8 ${STAMP}`;
const TASK = `Tarea sintetica SMH8 ${STAMP}`;

type Person = 'creator' | 'participant' | 'bystander';
const people = {} as Record<Person, E2eFixtureUser & { id: string }>;
const created = { accounts: [] as string[], roles: [] as string[], community: '', workspace: '', meetings: [] as string[] };

async function must<T>(label: string, run: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await run;
  if (error) throw new Error(`[meeting-create-and-access] ${label}: ${error.message}`);
  return data;
}

async function createPerson(person: Person, roleType: string, lastName: string) {
  const email = `e2e-smh8-${person}-${STAMP}@example.com`;
  const password = `Smh8${person[0].toUpperCase()}${person.slice(1)}Sintetico2026`;
  const account = await must('createUser', service.auth.admin.createUser({ email, password, email_confirm: true }));
  const id = account.user!.id;
  created.accounts.push(id);
  await must('profile', service.from('profiles').upsert({
    id, email, first_name: 'Sintetico', last_name: lastName, name: `Sintetico ${lastName}`,
    approval_status: 'approved', must_change_password: false, school_id: E2E_SCHOOL_SECONDARY.id,
  }, { onConflict: 'id' }));
  const role = await must('role', service.from('user_roles').insert({
    user_id: id, role_type: roleType, community_id: created.community, school_id: E2E_SCHOOL_SECONDARY.id, is_active: true,
  }).select('id').single());
  created.roles.push((role as { id: string }).id);
  people[person] = { id, email, password, firstName: 'Sintetico', lastName, role: roleType };
}

async function openMeetings(page: Page) {
  await page.goto('/community/workspace?section=meetings');
  await expect(page.getByRole('button', { name: 'Nueva Reunión' }).or(page.getByText(TITLE)).first()).toBeVisible({ timeout: 30_000 });
}

function card(page: Page) {
  return page.locator('div.bg-white.border').filter({ hasText: TITLE }).first();
}

test.describe.configure({ mode: 'serial' });

test.describe('SM-H8 meetings: create like a person, then who sees what', () => {
  // en-US fixes the datetime-local segment order the keyboard sequence below uses.
  test.use({ locale: 'en-US', timezoneId: 'America/Santiago', viewport: { width: 1366, height: 900 }, storageState: { cookies: [], origins: [] } });

  test.beforeAll(async () => {
    const community = await must('community', service.from('growth_communities').insert({
      name: `Comunidad Sintetica SMH8 ${STAMP}`, school_id: E2E_SCHOOL_SECONDARY.id,
    }).select('id').single());
    created.community = (community as { id: string }).id;
    const workspace = await must('workspace', service.from('community_workspaces').insert({
      community_id: created.community, name: `Espacio Sintetico SMH8 ${STAMP}`,
    }).select('id').single());
    created.workspace = (workspace as { id: string }).id;
    await createPerson('creator', 'lider_comunidad', 'Lider SMH8');
    await createPerson('participant', 'docente', 'Participante SMH8');
    await createPerson('bystander', 'docente', 'Ajeno SMH8');
    // The dev server compiles API routes on first use and then refreshes page
    // props, which unmounts an open meeting modal. Anonymous requests compile
    // them up front; each route refuses them before doing anything.
    const warm = await request.newContext({ baseURL: process.env.E2E_APP_ORIGIN });
    for (const path of ['/api/community/members', '/api/meetings/warm/autosave', '/api/meetings/warm/recipients',
      '/api/meetings/warm/work-session/start', '/api/meetings/warm/work-session/warm/end', '/api/meetings/delete']) {
      expect((await warm.get(path)).status()).toBeGreaterThanOrEqual(400);
    }
    await warm.dispose();
  });

  test.afterAll(async () => {
    // Every step runs even if an earlier one fails; failures are reported at the end.
    const errors: string[] = [];
    const step = async (label: string, run: PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await run;
      if (error) errors.push(`${label}: ${error.message}`);
    };
    const { data: meetings } = await service.from('community_meetings').select('id').eq('workspace_id', created.workspace || '00000000-0000-0000-0000-000000000000');
    const ids = [...new Set([...created.meetings, ...((meetings as Array<{ id: string }>) ?? []).map((m) => m.id)])];
    if (ids.length) {
      for (const table of ['meeting_tasks', 'meeting_commitments', 'meeting_agreements', 'meeting_attendees', 'meeting_read_grants', 'meeting_attachments', 'meeting_work_sessions']) {
        await step(`delete ${table}`, service.from(table).delete().in('meeting_id', ids));
      }
      await step('delete meetings', service.from('community_meetings').delete().in('id', ids));
      // The delete route writes a security audit row per deletion attempt.
      await step('delete audit rows', service.from('security_audit_events').delete().eq('action', 'meeting_deleted').in('metadata->>meeting_id', ids));
    }
    if (created.roles.length) await step('delete roles', service.from('user_roles').delete().in('id', created.roles));
    if (created.workspace) await step('delete workspace', service.from('community_workspaces').delete().eq('id', created.workspace));
    if (created.community) await step('delete community', service.from('growth_communities').delete().eq('id', created.community));
    if (created.accounts.length) await step('delete profiles', service.from('profiles').delete().in('id', created.accounts));
    for (const id of created.accounts) await step('deleteUser', service.auth.admin.deleteUser(id));
    if (errors.length) throw new Error(`[meeting-create-and-access] cleanup incomplete: ${errors.join('; ')}`);
  });

  test('the creator fills a new meeting like a person and everything is saved', async ({ page }) => {
    test.setTimeout(180_000);
    await loginViaUi(page, people.creator);
    await openMeetings(page);
    await page.getByRole('button', { name: 'Nueva Reunión' }).click();

    // Step 1 — title, date and time TYPED (no programmatic fill), one participant.
    await page.getByPlaceholder('Ej: Reunión de planificación semanal').fill(TITLE);
    const date = page.getByTestId('meeting-date');
    // A half-typed date LOOKS filled but is empty (Chrome's year box takes up to
    // six digits, so hour digits typed straight after the year land in it). The
    // form must say the date is incomplete, not just "required".
    await date.focus();
    await page.keyboard.type('10022026');
    await page.getByPlaceholder('Ej: Reunión de planificación semanal').focus();
    await expect(page.getByTestId('meeting-date-incomplete')).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('La fecha y hora están incompletas: completa día, mes, año, hora y minutos.').first()).toBeVisible();
    // Typed the way a person does: month, day, year, Tab to the hour, minutes, PM (en-US).
    await date.focus();
    await page.keyboard.press('Home');
    for (const part of ['10', '02', '2026', 'Tab', '04', '00', 'P']) {
      if (part === 'Tab') await page.keyboard.press('Tab');
      else await page.keyboard.type(part);
    }
    await expect(date).toHaveValue('2026-10-02T16:00');
    await expect(page.getByTestId('meeting-date-incomplete')).toHaveCount(0);
    await page.getByTestId(`meeting-attendee-${people.participant.id}`).check();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    // Step 2 — summary.
    await page.locator('[contenteditable="true"]').first().click();
    await page.keyboard.type('Resumen sintetico SMH8');
    const body = page.getByTestId('meeting-step-body');
    await body.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    // Step 2 really is scrolled down before moving on (otherwise the next check proves nothing).
    expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Siguiente' }).click();

    // Step 3 opens at the top: "Documentos" is the first thing in view.
    await expect(page.getByRole('heading', { name: 'Documentos' })).toBeInViewport();
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBe(0);

    await page.getByRole('button', { name: 'Agregar Acuerdo' }).click();
    await page.locator('[contenteditable="true"]').nth(0).click();
    await page.keyboard.type(AGREEMENT);

    await page.getByRole('button', { name: 'Agregar Compromiso' }).click();
    await page.locator('[contenteditable="true"]').nth(1).click();
    await page.keyboard.type(COMMITMENT);
    const commitmentAssignee = page.getByTestId('meeting-commitment-assignee-0');
    // Only the participant can be chosen (owner rule), not the creator nor the bystander.
    await expect(commitmentAssignee.locator('option')).toHaveText(['Asignar a…', 'Sintetico Participante SMH8']);
    await commitmentAssignee.selectOption({ label: 'Sintetico Participante SMH8' });
    await page.getByTestId('meeting-commitment-due-0').click();
    await page.getByTestId('meeting-commitment-due-0').press('Home');
    await page.keyboard.type('10092026');
    await expect(page.getByTestId('meeting-commitment-due-0')).toHaveValue('2026-10-09');

    await page.getByRole('button', { name: 'Agregar Tarea' }).click();
    await page.getByTestId('meeting-task-title-0').click();
    await page.keyboard.type(TASK);
    await expect(page.getByTestId('meeting-task-assignee-0').locator('option')).toHaveText(['Asignar a…', 'Sintetico Participante SMH8']);
    await page.getByTestId('meeting-task-assignee-0').selectOption({ label: 'Sintetico Participante SMH8' });
    await page.getByTestId('meeting-task-due-0').click();
    await page.getByTestId('meeting-task-due-0').press('Home');
    await page.keyboard.type('10162026');
    await expect(page.getByTestId('meeting-task-due-0')).toHaveValue('2026-10-16');

    await page.getByRole('button', { name: 'Crear Reunión' }).click();
    await expect(page.getByText('Reunión documentada correctamente')).toBeVisible({ timeout: 30_000 });

    // Database: one meeting, the typed Chile wall time as its instant, every item.
    const meeting = await must('meeting', service.from('community_meetings')
      .select('id, meeting_date').eq('workspace_id', created.workspace).eq('title', TITLE).single());
    const { id: meetingId, meeting_date: meetingDate } = meeting as { id: string; meeting_date: string };
    created.meetings.push(meetingId);
    expect(new Date(meetingDate).toISOString()).toBe('2026-10-02T19:00:00.000Z');
    const [agreements, commitments, tasks, attendees] = await Promise.all([
      must('agreements', service.from('meeting_agreements').select('agreement_text').eq('meeting_id', meetingId)),
      must('commitments', service.from('meeting_commitments').select('commitment_text, assigned_to, due_date').eq('meeting_id', meetingId)),
      must('tasks', service.from('meeting_tasks').select('task_title, assigned_to, due_date').eq('meeting_id', meetingId)),
      must('attendees', service.from('meeting_attendees').select('user_id, role').eq('meeting_id', meetingId)),
    ]);
    expect(agreements).toEqual([{ agreement_text: AGREEMENT }]);
    expect(commitments).toEqual([{ commitment_text: COMMITMENT, assigned_to: people.participant.id, due_date: '2026-10-09' }]);
    expect(tasks).toEqual([{ task_title: TASK, assigned_to: people.participant.id, due_date: '2026-10-16' }]);
    expect(attendees).toEqual([{ user_id: people.participant.id, role: 'participant' }]);

    // The card: same time as typed, acuerdos and compromisos counted apart.
    const meetingCard = card(page);
    // es-CL 12-hour format: 16:00 → "04:00 p. m." (it showed 01:00 p. m. before SM-H8).
    await expect(meetingCard).toContainText(/2 de octubre de 2026, 04:00\sp\.\sm\./);
    await expect(meetingCard.getByTestId(`meeting-chip-agreements-${meetingId}`)).toHaveText(/Acuerdos \(1\)/);
    await expect(meetingCard.getByTestId(`meeting-chip-commitments-${meetingId}`)).toHaveText(/Compromisos \(1\)/);
    await expect(meetingCard.getByTestId(`meeting-chip-tasks-${meetingId}`)).toHaveText(/Tareas \(1\)/);
    await expect(meetingCard.getByTestId(`meeting-delete-${meetingId}`)).toBeVisible();

    // The eye opens the details.
    await meetingCard.getByTestId(`meeting-view-${meetingId}`).click();
    const details = page.locator('div.fixed.inset-0.z-50').filter({ has: page.getByRole('heading', { name: TITLE }) });
    await expect(details.getByRole('heading', { name: TITLE })).toBeVisible();
    await details.getByRole('button', { name: /Compromisos \(1\)/ }).click();
    await expect(details.getByText(COMMITMENT)).toBeVisible();
    await details.getByRole('button', { name: 'Cerrar' }).click();
    await expect(details).toHaveCount(0);
  });

  test('the participant reads the content but cannot edit or delete', async ({ page }) => {
    test.setTimeout(120_000);
    const meetingId = created.meetings[0];
    await loginViaUi(page, people.participant);
    await openMeetings(page);
    const meetingCard = card(page);
    await expect(meetingCard).toBeVisible();
    // As a participant (not only as the task's assignee) every kind of content is readable.
    await meetingCard.getByTestId(`meeting-chip-agreements-${meetingId}`).click();
    await expect(meetingCard.getByText(AGREEMENT)).toBeVisible();
    await meetingCard.getByTestId(`meeting-chip-commitments-${meetingId}`).click();
    await expect(meetingCard.getByText(COMMITMENT)).toBeVisible();
    await meetingCard.getByTestId(`meeting-chip-tasks-${meetingId}`).click();
    await expect(meetingCard.getByText(TASK)).toBeVisible();
    await expect(meetingCard.getByTestId(`meeting-edit-${meetingId}`)).toHaveCount(0);
    await expect(meetingCard.getByTestId(`meeting-delete-${meetingId}`)).toHaveCount(0);
  });

  test('a member who did not take part sees the meeting but not its agreements, commitments or tasks', async ({ page }) => {
    test.setTimeout(120_000);
    const meetingId = created.meetings[0];
    await loginViaUi(page, people.bystander);
    await openMeetings(page);
    const meetingCard = card(page);
    await expect(meetingCard).toBeVisible();
    await expect(meetingCard.getByTestId(`meeting-content-hidden-${meetingId}`)).toBeVisible();
    await expect(meetingCard.getByTestId(`meeting-chip-agreements-${meetingId}`)).toHaveCount(0);
    await expect(meetingCard.getByTestId(`meeting-chip-commitments-${meetingId}`)).toHaveCount(0);
    await expect(meetingCard.getByTestId(`meeting-chip-tasks-${meetingId}`)).toHaveCount(0);
    await expect(meetingCard.getByTestId(`meeting-delete-${meetingId}`)).toHaveCount(0);
    for (const text of [AGREEMENT, COMMITMENT, TASK]) await expect(page.getByText(text)).toHaveCount(0);

    // The eye opens the details (title, date, summary stay visible) without the content.
    await meetingCard.getByTestId(`meeting-view-${meetingId}`).click();
    const details = page.locator('div.fixed.inset-0.z-50').filter({ has: page.getByRole('heading', { name: TITLE }) });
    await expect(details.getByTestId('meeting-content-hidden')).toBeVisible();
    await expect(details.getByRole('button', { name: /Compromisos|Tareas|Acuerdos|Documentos/ })).toHaveCount(0);
    for (const text of [AGREEMENT, COMMITMENT, TASK]) await expect(details.getByText(text)).toHaveCount(0);
  });

  test('the creator deletes the meeting with the delete button', async ({ page }) => {
    test.setTimeout(120_000);
    const meetingId = created.meetings[0];
    await loginViaUi(page, people.creator);
    await openMeetings(page);
    await card(page).getByTestId(`meeting-delete-${meetingId}`).click();
    await page.locator('input[name="deletionType"][value="hard"]').check();
    await page.getByPlaceholder('Escribe aquí para confirmar').fill('eliminar reunión');
    await page.getByRole('button', { name: 'Eliminar permanentemente' }).click();
    await expect(page.getByText(TITLE)).toHaveCount(0, { timeout: 30_000 });
    const rows = await must('gone', service.from('community_meetings').select('id').eq('id', meetingId));
    expect(rows).toEqual([]);
  });
});
