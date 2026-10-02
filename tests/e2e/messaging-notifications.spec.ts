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

/**
 * N2-03 — workspace message mentions and replies through the server route.
 *
 * Synthetic rows only (*@qa.local.test): a community with a workspace and one
 * thread, the replied-to member's parent message, the author, a member to
 * mention and an outsider from another community. The author replies through
 * the real composer and mentions the member; the first notification request is
 * failed in the browser, and the repeat — by the same body, then by message id
 * alone — fills the bells once. Recipients open their bell into the thread on
 * desktop and mobile; the outsider has none. Every fixture is deleted by id.
 */
test.describe('workspace message mentions and replies (N2-03)', () => {
  const ROUTE = '/api/community/workspace-message-notifications';
  const MENTION_COPY = 'Te mencionaron en un mensaje del espacio de trabajo';
  const REPLY_COPY = 'Respondieron a tu mensaje en el espacio de trabajo';
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } });
  const run = randomBytes(4).toString('hex');
  const password = `N09-${randomBytes(12).toString('base64url')}!a1`;
  const thread = { title: `Hilo N09 ${run}`, parent: `Mensaje padre N09 ${run}`, reply: `Respuesta N09 ${run} privada`, mobileReply: `Respuesta movil N09 ${run}` };
  const otherThread = { title: `Hilo ajeno N09 ${run}`, message: `Mensaje ajeno N09 ${run}` };
  const communityName = `Comunidad N09 ${run}`;
  const otherCommunityName = `Comunidad N09 otra ${run}`;
  const users = Object.fromEntries(
    (['autora', 'miembro', 'replicada', 'externa'] as const).map((key) => [key, { id: '', email: `notif09-${run}-${key}@qa.local.test`, name: `Sintetica ${key[0].toUpperCase()}${key.slice(1)}` }])
  ) as Record<'autora' | 'miembro' | 'replicada' | 'externa', { id: string; email: string; name: string }>;
  const owned = { community: '', otherCommunity: '', workspace: '', otherWorkspace: '', thread: '', parent: '', otherThread: '' };
  const n203: Record<string, unknown> = { run };
  const threadUrl = () => new RegExp(`/community/workspace\\?section=messaging&thread=${owned.thread}$`);
  const userIds = () => Object.values(users).map((u) => u.id).filter(Boolean);
  const must = <T,>(label: string, r: { data: T; error: { message: string } | null }): T => {
    if (r.error) throw new Error(`${label}: ${r.error.message}`);
    return r.data;
  };
  const bells = async () =>
    must('bells', await service.from('user_notifications').select('user_id, title, description, related_url, category').in('user_id', userIds()));
  const signedInAs = async (browser: Browser, key: keyof typeof users, viewport: typeof DESKTOP) => {
    const context = await browser.newContext({ viewport, storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await loginViaUi(page, { email: users[key].email, password } as Parameters<typeof loginViaUi>[1]);
    return { context, page };
  };
  /** Opens the owned thread from the messaging section, once the composer's member list has loaded. */
  const openThread = async (page: Page) => {
    const members = page.waitForResponse((r) => r.url().includes('/api/community/members'));
    await page.goto('/community/workspace?section=messaging');
    await members;
    await page.getByText(thread.title).first().click();
    await expect(page.getByPlaceholder('Escribe un mensaje...')).toBeVisible({ timeout: 30_000 });
  };
  /** The page shows `name`'s messaging with the owned thread open, straight from the link. */
  const expectThreadOpen = async (page: Page, name: string) => {
    await expect(page.getByRole('heading', { name: `Mensajería de ${name}`, exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: thread.title, exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder('Escribe un mensaje...')).toBeVisible();
    await expect(page.getByText(thread.reply).first()).toBeVisible({ timeout: 30_000 });
  };
  const replyTo = async (page: Page, text: string) => {
    await page
      .locator('div')
      .filter({ hasText: text })
      .filter({ has: page.getByRole('button', { name: 'Responder' }) })
      .last()
      .getByRole('button', { name: 'Responder' })
      .click();
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'x:').hostname)) throw new Error('refusing a non-local Supabase URL');
    if (process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY must be unset: no real provider');
    const school = E2E_SCHOOL_SECONDARY.id;
    owned.community = must('community', await service.from('growth_communities').insert({ name: communityName, school_id: school }).select('id').single()).id;
    owned.otherCommunity = must('community', await service.from('growth_communities').insert({ name: otherCommunityName, school_id: school }).select('id').single()).id;
    owned.workspace = must('workspace', await service.from('community_workspaces').insert({ community_id: owned.community, name: `Espacio N09 ${run}` }).select('id').single()).id;
    owned.otherWorkspace = must('workspace', await service.from('community_workspaces').insert({ community_id: owned.otherCommunity, name: `Espacio N09 otro ${run}` }).select('id').single()).id;
    for (const [key, user] of Object.entries(users)) {
      const created = await service.auth.admin.createUser({ email: user.email, password, email_confirm: true });
      if (created.error) throw new Error(`createUser: ${created.error.message}`);
      user.id = created.data.user.id;
      const [first, last] = user.name.split(' ');
      must('profile', await service.from('profiles').upsert({
        id: user.id, email: user.email, first_name: first, last_name: last, name: user.name,
        must_change_password: false, approval_status: 'approved', school_id: school,
      }, { onConflict: 'id' }));
      // `replicada` belongs to both communities; its first role makes the other one its default.
      if (key === 'replicada') must('role', await service.from('user_roles').insert({ user_id: user.id, role_type: 'docente', community_id: owned.otherCommunity, school_id: school, is_active: true }));
      must('role', await service.from('user_roles').insert({ user_id: user.id, role_type: 'docente', community_id: key === 'externa' ? owned.otherCommunity : owned.community, school_id: school, is_active: true }));
      must('category prefs', await service.from('user_notification_category_prefs').insert({ user_id: user.id, category: 'community', email_mode: 'off' }));
    }
    owned.thread = must('thread', await service.from('message_threads').insert({ workspace_id: owned.workspace, thread_title: thread.title, created_by: users.replicada.id }).select('id').single()).id;
    owned.parent = must('parent', await service.from('community_messages').insert({ workspace_id: owned.workspace, thread_id: owned.thread, author_id: users.replicada.id, content: thread.parent }).select('id').single()).id;
    owned.otherThread = must('thread', await service.from('message_threads').insert({ workspace_id: owned.otherWorkspace, thread_title: otherThread.title, created_by: users.externa.id }).select('id').single()).id;
    must('message', await service.from('community_messages').insert({ workspace_id: owned.otherWorkspace, thread_id: owned.otherThread, author_id: users.externa.id, content: otherThread.message }));
  });

  test.afterAll(async () => {
    const count = (r: { error: { message: string } | null; count: number | null }) => (r.error ? r.error.message : r.count ?? -1);
    const cleanup: Record<string, number | string> = {};
    const remaining: Record<string, number | string> = {};
    const ids = userIds();
    if (owned.thread) {
      const messages = must('messages', await service.from('community_messages').select('id').eq('thread_id', owned.thread)).map((m: { id: string }) => m.id);
      for (const id of messages) {
        for (const event of ['user_mentioned', 'message_sent']) {
          const ref = `occ-${createHash('sha256').update(JSON.stringify([event, NotificationService.resolveOccurrence(event, { message_id: id })])).digest('hex')}`;
          cleanup[`notification_events_${event}_${id.slice(0, 8)}`] = count(await service.from('notification_events').delete({ count: 'exact' }).eq('event_type', event).eq('event_data->>occurrence_ref', ref));
        }
      }
      cleanup.message_mentions = count(await service.from('message_mentions').delete({ count: 'exact' }).in('message_id', messages));
      cleanup.community_messages = count(await service.from('community_messages').delete({ count: 'exact' }).eq('thread_id', owned.thread));
      cleanup.message_threads = count(await service.from('message_threads').delete({ count: 'exact' }).eq('id', owned.thread));
      remaining.community_messages = count(await service.from('community_messages').select('id', { count: 'exact', head: true }).eq('thread_id', owned.thread));
    }
    if (owned.otherThread) {
      cleanup.other_community_messages = count(await service.from('community_messages').delete({ count: 'exact' }).eq('thread_id', owned.otherThread));
      cleanup.other_message_threads = count(await service.from('message_threads').delete({ count: 'exact' }).eq('id', owned.otherThread));
      remaining.other_community_messages = count(await service.from('community_messages').select('id', { count: 'exact', head: true }).eq('thread_id', owned.otherThread));
    }
    if (ids.length) {
      for (const table of ['user_notifications', 'notifications', 'user_notification_category_prefs', 'user_roles']) {
        cleanup[table] = count(await service.from(table).delete({ count: 'exact' }).in('user_id', ids));
        remaining[table] = count(await service.from(table).select('user_id', { count: 'exact', head: true }).in('user_id', ids));
      }
    }
    for (const id of [owned.workspace, owned.otherWorkspace].filter(Boolean)) cleanup[`community_workspaces_${id.slice(0, 8)}`] = count(await service.from('community_workspaces').delete({ count: 'exact' }).eq('id', id));
    for (const id of [owned.community, owned.otherCommunity].filter(Boolean)) cleanup[`growth_communities_${id.slice(0, 8)}`] = count(await service.from('growth_communities').delete({ count: 'exact' }).eq('id', id));
    if (ids.length) {
      cleanup.profiles = count(await service.from('profiles').delete({ count: 'exact' }).in('id', ids));
      remaining.profiles = count(await service.from('profiles').select('id', { count: 'exact', head: true }).in('id', ids));
    }
    for (const id of ids) cleanup[`auth_user_${id.slice(0, 8)}`] = (await service.auth.admin.deleteUser(id)).error ? 'error' : 1;
    const manifest = JSON.stringify({ spec: 'messaging-notifications N2-03 workspace messages', at: new Date().toISOString(), owned, users, ...n203, cleanup, remaining });
    if (EVIDENCE_DIR) {
      mkdirSync(EVIDENCE_DIR, { recursive: true });
      writeFileSync(join(EVIDENCE_DIR, 'n2-03-workspace.json'), manifest);
    }
    if (process.env.NOTIF09_EVIDENCE_MANIFEST) appendFileSync(process.env.NOTIF09_EVIDENCE_MANIFEST, `${manifest}\n`);
  });

  test('D1/D3 desktop: the real reply with a mention stays sent when its notification fails, and each repeat fills the bells once', async ({ browser }) => {
    const { context, page } = await signedInAs(browser, 'autora', DESKTOP);
    const attempts: Record<string, unknown>[] = [];
    await page.route(`**${ROUTE}`, async (route) => {
      attempts.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 503, json: { error: 'unavailable' } });
    });
    await openThread(page);
    await expect(page.getByText(thread.parent).first()).toBeVisible();
    await replyTo(page, thread.parent);
    const textarea = page.getByPlaceholder('Escribe un mensaje...');
    await textarea.click();
    await textarea.pressSequentially(`${thread.reply} @Sintetica`);
    await page.getByRole('button', { name: new RegExp(users.miembro.name) }).click();
    await shot(page, 'n2-03-desktop-compose');
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(page.getByText('Mensaje enviado')).toBeVisible();
    await expect(page.getByText(thread.reply).first()).toBeVisible();
    await shot(page, 'n2-03-desktop-sent-notification-failed');

    const saved = must('reply', await service.from('community_messages').select('id, reply_to_id, author_id').eq('thread_id', owned.thread).eq('author_id', users.autora.id).single());
    expect(saved.reply_to_id).toBe(owned.parent);
    expect(attempts).toEqual([{ message_id: saved.id, workspace_id: owned.workspace, mentioned_user_ids: [users.miembro.id] }]);
    expect(await bells()).toEqual([]);
    await page.unroute(`**${ROUTE}`);

    const retry = await page.request.post(ROUTE, { data: attempts[0] });
    const again = await page.request.post(ROUTE, { data: { message_id: saved.id, workspace_id: owned.workspace } });
    n203.retries = [{ status: retry.status(), body: await retry.json() }, { status: again.status(), body: await again.json() }];
    expect(n203.retries).toEqual([
      { status: 200, body: { success: true, notified: 2 } },
      { status: 200, body: { success: true, notified: 2 } },
    ]);
    await context.close();

    const rows = await bells();
    const who = (id: string) => Object.entries(users).find(([, u]) => u.id === id)?.[0];
    n203.bells = rows.map((b) => ({ ...b, user_id: who(b.user_id) }));
    const link = `/community/workspace?section=messaging&thread=${owned.thread}`;
    expect(n203.bells).toEqual(expect.arrayContaining([
      { user_id: 'miembro', title: `${users.autora.name} te ha mencionado`, description: MENTION_COPY, related_url: link, category: 'community' },
      { user_id: 'replicada', title: `Mensaje de ${users.autora.name}`, description: REPLY_COPY, related_url: link, category: 'community' },
    ]));
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain(thread.reply);
    expect(must('legacy', await service.from('notifications').select('id').in('user_id', userIds()))).toEqual([]);
    expect(must('mentions', await service.from('message_mentions').select('mentioned_user_id').eq('message_id', saved.id))).toEqual([{ mentioned_user_id: users.miembro.id }]);
  });

  test('D2: anonymous, outsider and forged requests are refused without a bell', async ({ browser }) => {
    const { id: messageId } = must('reply', await service.from('community_messages').select('id').eq('thread_id', owned.thread).eq('author_id', users.autora.id).single());
    const anon = await browser.newContext({ viewport: MOBILE, storageState: { cookies: [], origins: [] } });
    const anonPage = await anon.newPage();
    await anonPage.goto('/login');
    const anonymous = (await anonPage.request.post(ROUTE, { data: { message_id: messageId, workspace_id: owned.workspace } })).status();
    await anon.close();

    const outsider = await signedInAs(browser, 'externa', MOBILE);
    const answer = async (r: Awaited<ReturnType<Page['request']['post']>>) => ({ status: r.status(), body: await r.json() });
    const foreign = await answer(await outsider.page.request.post(ROUTE, { data: { message_id: messageId, workspace_id: owned.workspace, mentioned_user_ids: [users.externa.id] } }));
    await outsider.page.goto('/community/workspace?section=messaging');
    await expect(outsider.page.getByText(thread.title)).toHaveCount(0);
    await shot(outsider.page, 'n2-03-mobile-outsider-workspace');
    await outsider.context.close();

    const author = await signedInAs(browser, 'autora', MOBILE);
    const missing = await answer(await author.page.request.post(ROUTE, { data: { message_id: randomUUID(), workspace_id: owned.workspace } }));
    const otherWorkspace = await answer(await author.page.request.post(ROUTE, { data: { message_id: messageId, workspace_id: owned.otherWorkspace } }));
    await author.context.close();

    n203.denials = { anonymous, outsider: foreign, missing, otherWorkspace };
    expect(n203.denials).toEqual({
      anonymous: 401,
      outsider: { status: 403, body: { error: 'Solo el autor del mensaje puede notificar' } },
      missing: { status: 404, body: { error: 'Mensaje no encontrado' } },
      otherWorkspace: { status: 400, body: { error: 'El mensaje no pertenece a este espacio' } },
    });
    expect((await bells()).filter((b) => b.user_id === users.externa.id)).toEqual([]);
    expect(await bells()).toHaveLength(2);
  });

  test('D6 desktop (r1 D1/D3): the replied-to member of two communities opens their bell straight into the thread of its own community; the outsider has none', async ({ browser }) => {
    const outsider = await signedInAs(browser, 'externa', DESKTOP);
    await showInBellOf(outsider.page, false, outsider.page.getByRole('heading', { name: 'Notificaciones', level: 3 }));
    await expect(outsider.page.getByText(users.autora.name)).toHaveCount(0);
    await shot(outsider.page, 'n2-03-desktop-outsider-bell');
    await outsider.context.close();

    const { context, page } = await signedInAs(browser, 'replicada', DESKTOP);
    // Without a link the page opens the other community, its default
    await page.goto('/community/workspace?section=messaging');
    await expect(page.getByRole('heading', { name: `Mensajería de ${otherCommunityName}`, exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(otherThread.title)).toBeVisible();
    await shot(page, 'n2-03-desktop-replied-default-community');
    const item = page.getByText(`Mensaje de ${users.autora.name}`);
    await showInBellOf(page, false, item);
    await expect(page.getByText(REPLY_COPY)).toBeVisible();
    await expect(page.getByText(thread.reply)).toHaveCount(0);
    await shot(page, 'n2-03-desktop-replied-bell');
    await expect(async () => {
      await showInBellOf(page, false, item);
      await item.click({ timeout: 5_000 });
      await expect(page).toHaveURL(threadUrl(), { timeout: 10_000 });
    }).toPass({ timeout: 90_000 });
    await expectThreadOpen(page, communityName);
    await expect(page.getByText(otherThread.title)).toHaveCount(0);
    await expect(page.getByText(otherThread.message)).toHaveCount(0);
    await expect(page.getByTestId('thread-link-unavailable')).toHaveCount(0);
    await shot(page, 'n2-03-desktop-replied-thread');
    await context.close();
  });

  test('r2 D1/D2 desktop: on one mounted page the same bell reopens its thread after the thread is closed and after another section is visited', async ({ browser }) => {
    const { context, page } = await signedInAs(browser, 'replicada', DESKTOP);
    const logs: string[] = [];
    page.on('console', (message) => logs.push(message.text()));
    const composer = page.getByPlaceholder('Escribe un mensaje...');
    const item = page.getByText(`Mensaje de ${users.autora.name}`);
    const closeThread = page
      .locator('div')
      .filter({ has: page.getByRole('heading', { name: thread.title, exact: true }) })
      .filter({ has: page.getByRole('button') })
      .last()
      .getByRole('button');
    /** Clicks the bell until the thread is open again, then checks it is the right one on the same mounted page. */
    const openFromBell = async () => {
      await expect(async () => {
        await showInBellOf(page, false, item);
        await item.click({ timeout: 5_000 });
        await expect(composer).toBeVisible({ timeout: 10_000 });
      }).toPass({ timeout: 90_000 });
      await expect(page).toHaveURL(threadUrl());
      await expectThreadOpen(page, communityName);
      await expect(page.getByText(otherThread.title)).toHaveCount(0);
      await expect(page.getByTestId('thread-link-unavailable')).toHaveCount(0);
      expect(await page.evaluate(() => (window as unknown as { n09Mounted?: boolean }).n09Mounted)).toBe(true);
    };

    await page.goto('/community/workspace?section=messaging');
    await expect(page.getByRole('heading', { name: `Mensajería de ${otherCommunityName}`, exact: true })).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => { (window as unknown as { n09Mounted?: boolean }).n09Mounted = true; });
    await openFromBell();
    await shot(page, 'n2-03-r2-desktop-first-click');

    await closeThread.click();
    await expect(composer).toHaveCount(0);
    await expect(page.getByText(thread.title)).toBeVisible();
    await shot(page, 'n2-03-r2-desktop-thread-closed');
    await openFromBell();
    await shot(page, 'n2-03-r2-desktop-reopened-after-close');

    await page.getByRole('navigation', { name: 'Tabs' }).getByRole('button', { name: 'Documentos' }).click();
    await expect(page).toHaveURL(/\/community\/workspace\?section=documents$/);
    await expect(page.getByRole('heading', { name: `Mensajería de ${communityName}`, exact: true })).toBeHidden();
    await shot(page, 'n2-03-r2-desktop-other-section');
    await openFromBell();
    await shot(page, 'n2-03-r2-desktop-reopened-after-section');

    for (const secret of [...Object.values(users).map((u) => u.email), password]) expect(logs.join('\n')).not.toContain(secret);
    n203.repeatBell = { closeThenReclick: 'reopened', sectionThenReclick: 'reopened', samePage: true };
    await context.close();
  });

  test('D6 mobile (r1 D2): the mentioned member\'s bell opens the thread directly and they reply; the author gets one reply bell and the outsider none', async ({ browser }) => {
    const { context, page } = await signedInAs(browser, 'miembro', MOBILE);
    const item = page.getByText(`${users.autora.name} te ha mencionado`);
    await showInBellOf(page, true, item);
    await expect(page.getByText(MENTION_COPY)).toBeVisible();
    await shot(page, 'n2-03-mobile-member-bell');
    await expect(async () => {
      await showInBellOf(page, true, item);
      await item.click({ timeout: 5_000 });
      await expect(page).toHaveURL(threadUrl(), { timeout: 10_000 });
    }).toPass({ timeout: 90_000 });
    await expectThreadOpen(page, communityName);
    await shot(page, 'n2-03-mobile-member-thread');
    await replyTo(page, thread.reply);
    await page.getByPlaceholder('Escribe un mensaje...').fill(thread.mobileReply);
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(page.getByText('Mensaje enviado')).toBeVisible();
    await shot(page, 'n2-03-mobile-member-replied');
    await context.close();

    await expect(async () => {
      const authorBells = (await bells()).filter((b) => b.user_id === users.autora.id);
      expect(authorBells.map((b) => [b.title, b.description])).toEqual([[`Mensaje de ${users.miembro.name}`, REPLY_COPY]]);
    }).toPass({ timeout: 15_000 });
    expect((await bells()).filter((b) => b.user_id === users.miembro.id)).toHaveLength(1);

    const outsider = await signedInAs(browser, 'externa', MOBILE);
    await showInBellOf(outsider.page, true, outsider.page.getByRole('heading', { name: 'Notificaciones', level: 3 }));
    await expect(outsider.page.getByText(users.miembro.name)).toHaveCount(0);
    await expect(outsider.page.getByText(users.autora.name)).toHaveCount(0);
    await shot(outsider.page, 'n2-03-mobile-outsider-bell');
    await outsider.context.close();
    n203.mobile = { authorReplyBell: 1, memberBells: 1 };
  });

  test('r1 D4: a foreign, missing or malformed thread link opens no thread and keeps each user in their own community', async ({ browser }) => {
    const notice = (page: Page) => page.getByRole('alert').filter({ hasText: 'No pudimos abrir la conversación del enlace.' });
    const expectNoThreadOpened = async (page: Page, name: string, listed: string) => {
      await expect(notice(page)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('heading', { name: `Mensajería de ${name}`, exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(listed)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByPlaceholder('Escribe un mensaje...')).toHaveCount(0);
    };

    const logs: string[] = [];
    const outsider = await signedInAs(browser, 'externa', DESKTOP);
    outsider.page.on('console', (message) => logs.push(message.text()));
    await outsider.page.goto(`/community/workspace?section=messaging&thread=${owned.thread}`);
    await expectNoThreadOpened(outsider.page, otherCommunityName, otherThread.title);
    for (const hidden of [communityName, thread.title, thread.parent, thread.reply]) await expect(outsider.page.getByText(hidden)).toHaveCount(0);
    await shot(outsider.page, 'n2-03-desktop-foreign-thread-link');
    await outsider.page.getByTestId('thread-link-unavailable-dismiss').click();
    await expect(notice(outsider.page)).toHaveCount(0);
    await outsider.context.close();

    const member = await signedInAs(browser, 'miembro', MOBILE);
    member.page.on('console', (message) => logs.push(message.text()));
    const results: Record<string, string> = { foreign: 'notice' };
    for (const [label, target] of [['missing', randomUUID()], ['malformed', 'no-es-un-hilo']] as const) {
      await member.page.goto(`/community/workspace?section=messaging&thread=${target}`);
      await expectNoThreadOpened(member.page, communityName, thread.title);
      await expect(member.page.getByText(otherThread.title)).toHaveCount(0);
      await shot(member.page, `n2-03-mobile-${label}-thread-link`);
      results[label] = 'notice';
    }
    await member.context.close();
    for (const secret of [...Object.values(users).map((u) => u.email), password]) expect(logs.join('\n')).not.toContain(secret);
    n203.deniedLinks = results;
  });
});
