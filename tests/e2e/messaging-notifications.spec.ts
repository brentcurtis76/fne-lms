import { test, expect, type Browser, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_USERS, loginViaUi } from './helpers/auth';

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
