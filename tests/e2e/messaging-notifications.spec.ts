import { test, expect, type Browser, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import NotificationService from '../../lib/notificationService';
import { E2E_SCHOOL_SECONDARY, E2E_USERS, loginViaUi } from './helpers/auth';

/**
 * N0-02 — community post mentions (/api/messaging/mention).
 *
 * The author (the synthetic admin, a member of the zoom fixture community)
 * mentions the community's leader through the real post composer. The browser sends only the post and
 * mentioned-user ids; the server checks the saved post, the saved post_mentions
 * row and both users' workspace access before notifying. Every check goes
 * through the app as a signed-in user: recipients read their own notifications
 * from their own notifications page.
 *
 * Local fixture this spec needs (not part of the CI seed): an active user_roles
 * row making `admin` a member of that community (the composer's user search
 * needs the author's own community row, and only an admin may read the other
 * members' profiles), and `user_mentioned` preferences with e-mail off for
 * `gcLeader` and `consultorOtherSchool`, so no run can reach an e-mail provider.
 */

const MENTION = '**/api/messaging/mention';
const INJECTED = 'TEXTO_INYECTADO';
const SAVED_NOTICE = 'Tu publicación se guardó, pero no pudimos enviar la notificación de mención.';
const DESKTOP = { width: 1366, height: 768 };
const MOBILE = { width: 390, height: 844 };
const EVIDENCE_DIR = process.env.UI_EVIDENCE_DIR;

type Notification = { id: string; title: string; description: string | null; related_url: string | null; created_at: string };

const evidence: Record<string, unknown> = {};
const ids = { outsider: '' };
let runStart = 0;

/**
 * Opens the signed-in user's notifications page and returns the rows its own
 * query loaded that were created during this run. (Locally that page never gets
 * past "Verificando sesión..." after loading them, so the rows are read from that query.)
 */
async function ownNotifications(page: Page): Promise<Notification[]> {
  const loaded = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      decodeURIComponent(r.url()).includes('/rest/v1/user_notifications?select=*,notification_type:notification_types')
  );
  await page.goto('/notifications');
  const response = await loaded;
  expect(response.status()).toBe(200);
  const rows = (await response.json()) as Notification[];
  return rows.filter((n) => Date.parse(n.created_at) >= runStart);
}

async function shot(page: Page, name: string) {
  const dir = EVIDENCE_DIR ?? test.info().outputDir;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
}

async function signedInPage(browser: Browser, key: keyof typeof E2E_USERS, viewport: typeof DESKTOP) {
  const context = await browser.newContext({ viewport, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 200));
  });
  await loginViaUi(page, E2E_USERS[key]);
  return { context, page, consoleErrors };
}

/** Opens the composer from the keyboard and types a post that mentions the community leader. */
async function composeMention(page: Page, marker: string) {
  await page.goto('/community/workspace');
  const composer = page.getByRole('button', { name: /¿Qué quieres compartir\?/ });
  await expect(composer).toBeVisible({ timeout: 30_000 });
  await composer.focus();
  await page.keyboard.press('Enter');
  const editor = page.locator('.ProseMirror');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type(`${marker} para `);
  // The suggestion popup must open before the next key: a key pressed while its
  // user search is still loading reaches the composer's onKeyDown before the
  // popup exists (existing CreatePostModal race, reported with N0-02).
  await page.keyboard.type('@');
  const option = page.getByRole('button', { name: /Lider Comunidad Sintetico/ });
  await expect(option).toBeVisible();
  await page.keyboard.type('Lider');
  await expect(option).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(editor.locator('.mention')).toHaveCount(1);
  await page.keyboard.type(' fin');
  return page.getByRole('button', { name: 'Publicar', exact: true });
}

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.describe('community post mention → messaging/mention (N0-02)', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    runStart = Date.now() - 2_000;
    const outsider = await signedInPage(browser, 'consultorOtherSchool', DESKTOP);
    const session = await outsider.page.request.get('/api/auth/session');
    ids.outsider = String(((await session.json()) as { user?: { id?: string } }).user?.id ?? '');
    expect(ids.outsider).toMatch(/^[0-9a-f-]{36}$/);
    await outsider.page.goto('/notifications');
    await outsider.page.request.post('/api/messaging/mention', { data: {} });
    await outsider.context.close();

    // Dev server only: a route or chunk compiled for the first time mid-journey
    // triggers Fast Refresh, which remounts the composer while the mention popup
    // is loading. Open the composer and its user search once, untimed, first.
    const warm = await signedInPage(browser, 'admin', DESKTOP);
    await warm.page.goto('/community/workspace');
    const composer = warm.page.getByRole('button', { name: /¿Qué quieres compartir\?/ });
    await expect(composer).toBeVisible({ timeout: 60_000 });
    await composer.click();
    await warm.page.locator('.ProseMirror').click();
    const search = warm.page.waitForResponse((r) => r.url().includes('/api/community/search-users'));
    await warm.page.keyboard.type(' @');
    await search;
    await warm.context.close();
  });

  test.afterAll(() => {
    if (EVIDENCE_DIR) {
      mkdirSync(EVIDENCE_DIR, { recursive: true });
      writeFileSync(join(EVIDENCE_DIR, 'ui-evidence.json'), JSON.stringify(evidence, null, 2));
    }
  });

  test('UI1: desktop member mentions a member; one generic notification despite a tampered request', async ({ browser }) => {
    const { context, page, consoleErrors } = await signedInPage(browser, 'admin', DESKTOP);
    const sentBodies: Record<string, unknown>[] = [];
    await page.route(MENTION, (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      sentBodies.push(body);
      // A tampered client: extra text, name and recipient fields beside the real ids.
      return route.continue({
        postData: JSON.stringify({
          ...body,
          content: INJECTED,
          content_preview: INJECTED,
          author_name: INJECTED,
          recipient_id: ids.outsider,
          workspace_id: randomUUID(),
        }),
      });
    });

    const marker = `NOTIF-02 E2E escritorio ${Date.now()}`;
    const publish = await composeMention(page, marker);
    const mentionResponse = page.waitForResponse((r) => r.url().includes('/api/messaging/mention'));
    await publish.click();
    const response = await mentionResponse;
    const responseBody = await response.json();
    expect(response.status()).toBe(200);
    expect(responseBody).toMatchObject({ success: true, notificationSent: true });

    expect(sentBodies).toHaveLength(1);
    expect(Object.keys(sentBodies[0]).sort()).toEqual(['context', 'discussion_id', 'mentioned_user_id']);
    expect(sentBodies[0].mentioned_user_id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page.getByText(marker)).toBeVisible();
    await expect(page.getByText(SAVED_NOTICE)).toHaveCount(0);
    await shot(page, 'ui1-desktop-posted');

    await page.reload();
    await expect(page.getByText(marker)).toBeVisible({ timeout: 30_000 });
    await shot(page, 'ui1-desktop-after-reload');

    const member = await signedInPage(browser, 'gcLeader', DESKTOP);
    const memberNotifications = await ownNotifications(member.page);
    expect(memberNotifications).toHaveLength(1);
    const text = JSON.stringify(memberNotifications[0]);
    expect(text).not.toContain(INJECTED);
    expect(text).not.toContain(marker);
    await member.context.close();

    const outsider = await signedInPage(browser, 'consultorOtherSchool', DESKTOP);
    const outsiderNotifications = await ownNotifications(outsider.page);
    expect(outsiderNotifications).toHaveLength(0);
    await outsider.context.close();

    evidence.UI1 = {
      actor: `${E2E_USERS.admin.email} (community member via fixture role row)`,
      role: 'admin (post author)',
      recipient: `${E2E_USERS.gcLeader.email} (lider_comunidad, seeded member)`,
      viewport: '1366x768',
      actions: ['login', 'open /community/workspace', 'keyboard-open composer', 'type @Lider + Enter', 'Publicar', 'reload'],
      browserRequestBody: sentBodies[0],
      tampering: 'content, content_preview, author_name, recipient_id (outsider), workspace_id added in flight',
      response: { status: response.status(), body: responseBody },
      recipientNotifications: memberNotifications,
      outsiderNotifications: outsiderNotifications.length,
      marker,
      consoleErrors,
      screenshots: ['ui1-desktop-posted.png', 'ui1-desktop-after-reload.png'],
    };
    await context.close();
  });

  test('UI2: mobile nonmember and forged targets are denied without a notification', async ({ browser }) => {
    const first = (evidence.UI1 as { browserRequestBody?: Record<string, string> } | undefined)?.browserRequestBody;
    const firstPost = first?.discussion_id;
    const memberId = first?.mentioned_user_id;
    expect(firstPost).toBeTruthy();
    const target = { discussion_id: firstPost, mentioned_user_id: memberId, context: 'community_post' };

    // 1. Anonymous.
    const anonContext = await browser.newContext({ viewport: MOBILE, storageState: { cookies: [], origins: [] } });
    const anonPage = await anonContext.newPage();
    await anonPage.goto('/login');
    const anon = await anonPage.request.post('/api/messaging/mention', { data: target });
    const anonBody = await anon.json();
    expect(anon.status()).toBe(401);
    await anonContext.close();

    // 2. A signed-in user from another school replays the author's mention.
    const other = await signedInPage(browser, 'consultorOtherSchool', MOBILE);
    const foreign = await other.page.request.post('/api/messaging/mention', { data: target });
    const foreignBody = await foreign.json();
    expect(foreign.status()).toBe(403);
    await shot(other.page, 'ui2-mobile-other-school');
    await other.context.close();

    // 3. The author on mobile, keyboard only; the saved mention and the notify
    //    request are both rewritten to a user outside the community.
    const { context, page, consoleErrors } = await signedInPage(browser, 'admin', MOBILE);
    await page.route('**/rest/v1/post_mentions**', (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const rows = route.request().postDataJSON() as Array<Record<string, unknown>>;
      return route.continue({
        postData: JSON.stringify(rows.map((row) => ({ ...row, mentioned_user_id: ids.outsider }))),
      });
    });
    let secondPost = '';
    await page.route(MENTION, (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      secondPost = String(body.discussion_id ?? '');
      return route.continue({ postData: JSON.stringify({ ...body, mentioned_user_id: ids.outsider }) });
    });

    const marker = `NOTIF-02 E2E móvil ${Date.now()}`;
    const publish = await composeMention(page, marker);
    for (let i = 0; i < 15 && !(await publish.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(publish).toBeFocused();
    const mentionResponse = page.waitForResponse((r) => r.url().includes('/api/messaging/mention'));
    await page.keyboard.press('Enter');
    const denied = await mentionResponse;
    const deniedBody = await denied.json();
    expect(denied.status()).toBe(403);
    expect(deniedBody).toEqual({ error: 'El usuario mencionado no pertenece a esta comunidad' });

    // The post itself is saved and shown, and the author is told only the notification failed.
    await expect(page.getByText(marker)).toBeVisible();
    const notice = page.getByRole('status').filter({ hasText: SAVED_NOTICE });
    await expect(notice).toBeVisible();
    await expect(notice).toHaveText(SAVED_NOTICE);
    await expect(page.getByText(deniedBody.error)).toHaveCount(0);
    const noticeText = await notice.textContent();
    await shot(page, 'ui2-mobile-forged-target-denied');

    // 4. Forged target on the author's own post: a member with no saved mention there.
    const forged = await page.request.post('/api/messaging/mention', {
      data: { discussion_id: secondPost, mentioned_user_id: memberId, context: 'community_post' },
    });
    const forgedBody = await forged.json();
    expect(forged.status()).toBe(404);

    await page.reload();
    const composer = page.getByRole('button', { name: /¿Qué quieres compartir\?/ });
    await expect(composer).toBeVisible({ timeout: 30_000 });
    await composer.focus();
    await expect(composer).toBeFocused();
    await shot(page, 'ui2-mobile-after-reload');

    await context.close();

    const outsiderCheck = await signedInPage(browser, 'consultorOtherSchool', MOBILE);
    const outsiderNotifications = await ownNotifications(outsiderCheck.page);
    expect(outsiderNotifications).toHaveLength(0);
    await outsiderCheck.context.close();
    const memberCheck = await signedInPage(browser, 'gcLeader', MOBILE);
    const memberNotifications = await ownNotifications(memberCheck.page);
    expect(memberNotifications).toHaveLength(1);
    await memberCheck.context.close();

    evidence.UI2 = {
      viewport: '390x844',
      anonymous: { status: anon.status(), body: anonBody },
      otherSchool: { actor: E2E_USERS.consultorOtherSchool.email, status: foreign.status(), body: foreignBody },
      forgedSavedMention: {
        actor: E2E_USERS.admin.email,
        rewrittenTo: 'post_mentions insert and notify request → outsider (other school)',
        status: denied.status(),
        body: deniedBody,
        visibleNotice: noticeText,
      },
      forgedTargetWithoutSavedMention: { status: forged.status(), body: forgedBody },
      outsiderNotifications: outsiderNotifications.length,
      memberNotificationsTotal: memberNotifications.length,
      marker,
      consoleErrors,
      screenshots: ['ui2-mobile-other-school.png', 'ui2-mobile-forged-target-denied.png', 'ui2-mobile-after-reload.png'],
    };
  });
});

/**
 * Opens the bell until `visible` shows in it: the dev server reloads open pages
 * when another worker compiles a route, which can close the dropdown.
 */
function showInBellOf(page: Page, mobile: boolean, visible: ReturnType<Page['getByText']>) {
  return expect(async () => {
    if (!(await page.getByRole('heading', { name: 'Notificaciones', level: 3 }).isVisible())) {
      const bell = page.getByRole('button', { name: /^Notificaciones/ });
      const onScreen = await bell.evaluate((el) => el.getBoundingClientRect().left >= 0 && el.getBoundingClientRect().right <= window.innerWidth);
      if (mobile && !onScreen) await page.getByRole('button', { name: 'Abrir menú de navegación' }).click({ timeout: 5_000 });
      await bell.click({ timeout: 5_000 });
    }
    await expect(visible).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 90_000 });
}

/**
 * N2-02 — the message and mention bells render the payloads the routes persist.
 *
 * The author sends a direct message to the community leader through the real
 * /api/messaging/send route (the mention bell comes from UI1 above). The rows
 * must carry the author's name and the routes' generic copy, never the body,
 * the catalog category `community`, and a `notification_type_id` only where the
 * type row exists (`user_mentioned` is a fixture row; `message_sent` has none).
 * The leader sees both bells on desktop and mobile and the message bell opens
 * the messaging section; the other-school consultor sees neither. The message,
 * its bell and its audit row are deleted by id.
 */
test.describe('message and mention bells render the persisted payloads (N2-02)', () => {
  const author = `${E2E_USERS.admin.firstName} ${E2E_USERS.admin.lastName}`;
  const messageTitle = `Mensaje de ${author}`;
  const mentionTitle = `${author} te ha mencionado`;
  const body = `N08 cuerpo privado ${Date.now()}`;
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } });
  const n202: Record<string, unknown> = {};
  let messageId = '';

  test.afterAll(async () => {
    const count = (r: { error: { message: string } | null; count: number | null }) => (r.error ? r.error.message : r.count ?? -1);
    if (messageId) {
      const occurrence = NotificationService.resolveOccurrence('message_sent', { message_id: messageId });
      const ref = `occ-${createHash('sha256').update(JSON.stringify(['message_sent', occurrence])).digest('hex')}`;
      n202.cleanup = {
        notification_events: count(await service.from('notification_events').delete({ count: 'exact' }).eq('event_type', 'message_sent').eq('event_data->>occurrence_ref', ref)),
        user_notifications: count(await service.from('user_notifications').delete({ count: 'exact' }).in('id', (n202.messageRowIds as string[]) ?? [])),
        workspace_messages: count(await service.from('workspace_messages').delete({ count: 'exact' }).eq('id', messageId)),
      };
      n202.remaining = {
        workspace_messages: count(await service.from('workspace_messages').select('id', { count: 'exact', head: true }).eq('id', messageId)),
        notification_events: count(await service.from('notification_events').select('id', { count: 'exact', head: true }).eq('event_data->>occurrence_ref', ref)),
      };
    }
    const manifest = JSON.stringify({ spec: 'messaging-notifications N2-02', at: new Date().toISOString(), messageId, ...n202 });
    if (EVIDENCE_DIR) writeFileSync(join(EVIDENCE_DIR, 'n2-02-messaging.json'), manifest);
    if (process.env.NOTIF08_EVIDENCE_MANIFEST) appendFileSync(process.env.NOTIF08_EVIDENCE_MANIFEST, `${manifest}\n`);
  });

  test('D1/D2: the real send route stores the author name, generic copy, catalog category and only an existing type id', async ({ browser }) => {
    const { data: leader } = await service.from('profiles').select('id').eq('email', E2E_USERS.gcLeader.email).single();
    const sender = await signedInPage(browser, 'admin', DESKTOP);
    const response = await sender.page.request.post('/api/messaging/send', { data: { recipient_id: leader?.id, content: body } });
    const result = await response.json();
    expect(response.status()).toBe(200);
    expect(result).toMatchObject({ success: true, notificationSent: true });
    messageId = result.messageId;
    await sender.context.close();

    const { data: rows } = await service.from('user_notifications')
      .select('id, title, description, related_url, category, notification_type_id')
      .eq('user_id', leader?.id).gte('created_at', new Date(runStart).toISOString()).order('created_at');
    n202.rows = rows;
    n202.messageRowIds = (rows ?? []).filter((r) => r.title === messageTitle).map((r) => r.id);
    expect((rows ?? []).map(({ id: _id, ...row }) => row)).toEqual([
      { title: mentionTitle, description: 'Te mencionaron en una publicación', related_url: '/community/workspace?section=overview', category: 'community', notification_type_id: 'user_mentioned' },
      { title: messageTitle, description: 'Tienes un nuevo mensaje', related_url: '/community/workspace?section=messaging', category: 'community', notification_type_id: null },
    ]);
    expect(JSON.stringify(rows)).not.toContain(body);
  });

  for (const [name, viewport] of [['desktop', DESKTOP], ['mobile', MOBILE]] as const) {
    test(`D6 ${name}: the recipient sees both bells and the message opens messaging; the outsider sees neither`, async ({ browser }) => {
      const showInBell = (page: Page, visible: ReturnType<Page['getByText']>) => showInBellOf(page, name === 'mobile', visible);

      const outsider = await signedInPage(browser, 'consultorOtherSchool', viewport);
      await showInBell(outsider.page, outsider.page.getByRole('heading', { name: 'Notificaciones', level: 3 }));
      await expect(outsider.page.getByText(messageTitle)).toHaveCount(0);
      await expect(outsider.page.getByText(mentionTitle)).toHaveCount(0);
      await shot(outsider.page, `n2-02-${name}-outsider-bell`);
      await outsider.context.close();

      const recipient = await signedInPage(browser, 'gcLeader', viewport);
      const message = recipient.page.getByText(messageTitle);
      await showInBell(recipient.page, message);
      await expect(recipient.page.getByText(mentionTitle).first()).toBeVisible();
      await expect(recipient.page.getByText('Te mencionaron en una publicación').first()).toBeVisible();
      await expect(recipient.page.getByText('Tienes un nuevo mensaje')).toBeVisible();
      await expect(recipient.page.getByText(body)).toHaveCount(0);
      await shot(recipient.page, `n2-02-${name}-recipient-bell`);
      await expect(async () => {
        await showInBell(recipient.page, message);
        await message.click({ timeout: 5_000 });
        await expect(recipient.page).toHaveURL(/\/community\/workspace\?section=messaging$/, { timeout: 10_000 });
      }).toPass({ timeout: 90_000 });
      await shot(recipient.page, `n2-02-${name}-recipient-message-link`);
      n202[`D6-${name}`] = { recipient: E2E_USERS.gcLeader.email, outsider: E2E_USERS.consultorOtherSchool.email, consoleErrors: recipient.consoleErrors };
      await recipient.context.close();
    });
  }
});

/**
 * N2-02 — the real POST /api/meetings/[id]/finalize on the migrated schema.
 *
 * Synthetic rows only (*@qa.local.test): a community with a workspace, its
 * leader (creator of every meeting) and four members. Meeting A is finalized
 * for `attended`: attendees with community email `off` and with no address get
 * the bell like the one with `immediate`, the absent member does not. Meeting B
 * is finalized for `community`: every active member gets it. Meeting C is a
 * draft another caller already finalized (the race loser's view). The summary
 * mail keeps its own filter; this stack has no provider key, so no mail leaves
 * and the route must say so. Every fixture is deleted by id.
 */
test.describe('meeting_finalized bells through the real finalize route (N2-02)', () => {
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } });
  const run = randomBytes(4).toString('hex');
  const password = `N08-${randomBytes(12).toString('base64url')}!a1`;
  const titles = { a: `Reunión N08 asistentes ${run}`, b: `Reunión N08 comunidad ${run}`, c: `Reunión N08 carrera ${run}` };
  const users = Object.fromEntries(
    (['leader', 'emailOff', 'noEmail', 'mailed', 'absent'] as const).map((key) => [key, { id: '', email: `notif08-${run}-${key.toLowerCase()}@qa.local.test` }])
  ) as Record<'leader' | 'emailOff' | 'noEmail' | 'mailed' | 'absent', { id: string; email: string }>;
  const owned = { community: '', workspace: '', a: '', b: '', c: '' };
  const meeting: Record<string, unknown> = { run };
  const userIds = () => Object.values(users).map((u) => u.id).filter(Boolean);
  const must = <T,>(label: string, r: { data: T; error: { message: string } | null }): T => {
    if (r.error) throw new Error(`${label}: ${r.error.message}`);
    return r.data;
  };
  const signedInAs = async (browser: Browser, email: string, viewport: typeof DESKTOP) => {
    const context = await browser.newContext({ viewport, storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await loginViaUi(page, { email, password } as Parameters<typeof loginViaUi>[1]);
    return { context, page };
  };
  const finalize = async (page: Page, id: string, audience: string) => {
    const response = await page.request.post(`/api/meetings/${id}/finalize`, { data: { audience } });
    return { status: response.status(), body: await response.json() };
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'x:').hostname)) throw new Error('refusing a non-local Supabase URL');
    if (process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY must be unset: no real provider');
    const school = E2E_SCHOOL_SECONDARY.id;
    owned.community = must('community', await service.from('growth_communities').insert({ name: `Comunidad N08 ${run}`, school_id: school }).select('id').single()).id;
    owned.workspace = must('workspace', await service.from('community_workspaces').insert({ community_id: owned.community, name: `Espacio N08 ${run}` }).select('id').single()).id;
    for (const [key, user] of Object.entries(users)) {
      const created = await service.auth.admin.createUser({ email: user.email, password, email_confirm: true });
      if (created.error) throw new Error(`createUser: ${created.error.message}`);
      user.id = created.data.user.id;
      must('profile', await service.from('profiles').upsert({
        id: user.id, email: key === 'noEmail' ? null : user.email, first_name: 'Sintetica', last_name: key, name: `Sintetica ${key}`,
        must_change_password: false, approval_status: 'approved', school_id: school,
      }, { onConflict: 'id' }));
      must('role', await service.from('user_roles').insert({ user_id: user.id, role_type: key === 'leader' ? 'lider_comunidad' : 'docente', community_id: owned.community, school_id: school, is_active: true }));
    }
    must('category prefs', await service.from('user_notification_category_prefs').insert([
      { user_id: users.emailOff.id, category: 'community', email_mode: 'off' },
      { user_id: users.mailed.id, category: 'community', email_mode: 'immediate' },
    ]));
    for (const key of ['a', 'b', 'c'] as const) {
      owned[key] = must('meeting', await service.from('community_meetings').insert({
        workspace_id: owned.workspace, title: titles[key], meeting_date: '2030-07-01T15:00:00Z', created_by: users.leader.id, status: 'borrador',
        summary: 'Resumen sintetico.', finalized_at: key === 'c' ? new Date().toISOString() : null,
      }).select('id').single()).id;
    }
    must('attendees', await service.from('meeting_attendees').insert(
      (['emailOff', 'noEmail', 'mailed', 'absent'] as const).map((key) => ({ meeting_id: owned.a, user_id: users[key].id, attendance_status: key === 'absent' ? 'absent' : 'attended' }))
    ));
  });

  test.afterAll(async () => {
    const count = (r: { error: { message: string } | null; count: number | null }) => (r.error ? r.error.message : r.count ?? -1);
    const cleanup: Record<string, number | string> = {};
    const remaining: Record<string, number | string> = {};
    const ids = userIds();
    const meetings = [owned.a, owned.b, owned.c].filter(Boolean);
    for (const id of meetings) {
      const ref = `occ-${createHash('sha256').update(JSON.stringify(['meeting_finalized', NotificationService.resolveOccurrence('meeting_finalized', { meeting_id: id })])).digest('hex')}`;
      cleanup[`notification_events_${id.slice(0, 8)}`] = count(await service.from('notification_events').delete({ count: 'exact' }).eq('event_type', 'meeting_finalized').eq('event_data->>occurrence_ref', ref));
    }
    if (meetings.length) {
      for (const table of ['meeting_attendees', 'meeting_work_sessions']) cleanup[table] = count(await service.from(table).delete({ count: 'exact' }).in('meeting_id', meetings));
      cleanup.community_meetings = count(await service.from('community_meetings').delete({ count: 'exact' }).in('id', meetings));
      remaining.community_meetings = count(await service.from('community_meetings').select('id', { count: 'exact', head: true }).in('id', meetings));
    }
    if (ids.length) {
      for (const table of ['user_notifications', 'user_notification_category_prefs', 'user_roles']) {
        cleanup[table] = count(await service.from(table).delete({ count: 'exact' }).in('user_id', ids));
        remaining[table] = count(await service.from(table).select('user_id', { count: 'exact', head: true }).in('user_id', ids));
      }
    }
    if (owned.workspace) cleanup.community_workspaces = count(await service.from('community_workspaces').delete({ count: 'exact' }).eq('id', owned.workspace));
    if (owned.community) cleanup.growth_communities = count(await service.from('growth_communities').delete({ count: 'exact' }).eq('id', owned.community));
    if (ids.length) {
      cleanup.profiles = count(await service.from('profiles').delete({ count: 'exact' }).in('id', ids));
      remaining.profiles = count(await service.from('profiles').select('id', { count: 'exact', head: true }).in('id', ids));
    }
    for (const id of ids) cleanup[`auth_user_${id.slice(0, 8)}`] = (await service.auth.admin.deleteUser(id)).error ? 'error' : 1;
    const manifest = JSON.stringify({ spec: 'messaging-notifications N2-02 meeting finalize', at: new Date().toISOString(), owned, ...meeting, cleanup, remaining });
    if (EVIDENCE_DIR) {
      mkdirSync(EVIDENCE_DIR, { recursive: true });
      writeFileSync(join(EVIDENCE_DIR, 'n2-02-meeting.json'), manifest);
    }
    if (process.env.NOTIF08_EVIDENCE_MANIFEST) appendFileSync(process.env.NOTIF08_EVIDENCE_MANIFEST, `${manifest}\n`);
  });

  test('D2/D3: the real POST finalizes once, 403s an outsider and a repeat, 409s the race loser, and bells the audience whatever their email', async ({ browser }) => {
    const absent = await signedInAs(browser, users.absent.email, DESKTOP);
    const outsider = await finalize(absent.page, owned.a, 'attended');
    await absent.context.close();
    expect(outsider.status).toBe(403);

    const leader = await signedInAs(browser, users.leader.email, DESKTOP);
    const attended = await finalize(leader.page, owned.a, 'attended');
    const repeat = await finalize(leader.page, owned.a, 'attended');
    const race = await finalize(leader.page, owned.c, 'attended');
    const community = await finalize(leader.page, owned.b, 'community');
    await leader.context.close();
    Object.assign(meeting, { outsider, attended, repeat, race, community });

    // Only `mailed` passes the summary filter for A; B adds the leader and the absent member (default mode).
    // No provider key here, so nothing is sent and the route reports it.
    expect(attended).toMatchObject({ status: 200, body: { data: { ok: true, recipients_count: 1, sent: 0, failed: 1, summary_email_sent: false } } });
    expect(community).toMatchObject({ status: 200, body: { data: { ok: true, recipients_count: 3, sent: 0, failed: 3, summary_email_sent: false } } });
    expect(repeat.status).toBe(403);
    expect(race).toMatchObject({ status: 409, body: { code: 'meeting_already_finalized' } });

    const rows = must('meetings', await service.from('community_meetings').select('id, status, finalized_by, finalize_audience').in('id', [owned.a, owned.b, owned.c]));
    expect(rows.map(({ id, ...row }) => ({ key: Object.entries(owned).find(([, v]) => v === id)?.[0], ...row })).sort((x, y) => String(x.key).localeCompare(String(y.key)))).toEqual([
      { key: 'a', status: 'completada', finalized_by: users.leader.id, finalize_audience: 'attended' },
      { key: 'b', status: 'completada', finalized_by: users.leader.id, finalize_audience: 'community' },
      { key: 'c', status: 'borrador', finalized_by: null, finalize_audience: null },
    ]);

    const bells = must('bells', await service.from('user_notifications').select('user_id, title, description, related_url, category').in('user_id', userIds()));
    const who = (id: string) => Object.entries(users).find(([, u]) => u.id === id)?.[0];
    const got = bells.map((b) => `${who(b.user_id)} ${b.title}`).sort();
    meeting.bells = got;
    expect(got).toEqual([
      ...['emailOff', 'noEmail', 'mailed'].map((k) => `${k} Reunión finalizada: ${titles.a}`),
      ...['leader', 'emailOff', 'noEmail', 'mailed', 'absent'].map((k) => `${k} Reunión finalizada: ${titles.b}`),
    ].sort());
    for (const bell of bells) expect(bell).toMatchObject({ related_url: '/community/workspace?section=meetings', category: 'community' });
  });

  for (const [name, viewport] of [['desktop', DESKTOP], ['mobile', MOBILE]] as const) {
    test(`D5 ${name}: the email-off attendee's bell opens the meetings page; the absent member has only the community meeting`, async ({ browser }) => {
      const mobile = name === 'mobile';
      const absent = await signedInAs(browser, users.absent.email, viewport);
      await showInBellOf(absent.page, mobile, absent.page.getByText(`Reunión finalizada: ${titles.b}`));
      await expect(absent.page.getByText(titles.a)).toHaveCount(0);
      await shot(absent.page, `n2-02-${name}-meeting-absent-bell`);
      await absent.context.close();

      const { context, page } = await signedInAs(browser, users.emailOff.email, viewport);
      const item = page.getByText(`Reunión finalizada: ${titles.a}`);
      await showInBellOf(page, mobile, item);
      await expect(page.getByText(`fue finalizada por Sintetica leader. Enviada a quienes asistieron.`)).toBeVisible();
      await shot(page, `n2-02-${name}-meeting-attendee-bell`);
      await expect(async () => {
        await showInBellOf(page, mobile, item);
        await item.click({ timeout: 5_000 });
        await expect(page).toHaveURL(/\/community\/workspace\?section=meetings$/, { timeout: 10_000 });
      }).toPass({ timeout: 90_000 });
      await shot(page, `n2-02-${name}-meeting-attendee-link`);
      await context.close();
    });
  }
});
