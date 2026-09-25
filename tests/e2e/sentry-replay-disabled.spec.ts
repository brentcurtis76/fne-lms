import { writeFileSync } from 'node:fs';
import { test, expect, type Page, type Request } from '@playwright/test';

/**
 * Sentry must never record or send a session replay (privacy has not signed
 * off on replaying minors' sessions), and a build without a DSN must send no
 * telemetry at all.
 *
 * NEXT_PUBLIC_SENTRY_DSN is inlined at build time, so the mode is decided by
 * the environment the server was started with (Playwright's webServer inherits
 * this process's env):
 *   - no DSN (CI default): the SDK is not initialized and no envelope leaves.
 *   - synthetic loopback DSN: the SDK is initialized, every request to the DSN
 *     host is answered locally by page.route, no envelope item is a replay or
 *     a transaction and no envelope contains the synthetic student marker.
 * A DSN that does not point at loopback is refused before any page loads.
 */

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || '';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const REPLAY_ITEM_TYPES = ['replay_event', 'replay_recording'];
// Synthetic stand-in for a student identifier; it must never reach an envelope.
const MINOR_MARKER = 'synthetic-minor-7f3a';

const VIEWPORTS = [
  { name: 'desktop', size: { width: 1280, height: 800 } },
  { name: 'mobile', size: { width: 375, height: 667 } },
];

function isTelemetry(req: Request) {
  const url = new URL(req.url());
  return /sentry|ingest/i.test(url.host) || /\/api\/\d+\/(envelope|store)\//.test(url.pathname);
}

function envelopeItemTypes(body: string | null): string[] {
  return (body ?? '').split('\n').flatMap((line) => {
    try {
      const parsed = JSON.parse(line);
      return typeof parsed?.type === 'string' ? [parsed.type] : [];
    } catch {
      return [];
    }
  });
}

function sentryState(page: Page) {
  return page.evaluate(() => {
    const hub = (window as any).__SENTRY__?.hub;
    const client = hub?.getClient?.();
    const options = client?.getOptions?.() ?? null;
    return {
      initialized: Boolean(client),
      tracesSampleRate: options?.tracesSampleRate ?? null,
      replaysSessionSampleRate: options?.replaysSessionSampleRate ?? null,
      replaysOnErrorSampleRate: options?.replaysOnErrorSampleRate ?? null,
      replayIntegration: Boolean(client?.getIntegrationById?.('Replay')),
    };
  });
}

function evidenceDir() {
  return process.env.UI_EVIDENCE_DIR || test.info().outputDir;
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `${evidenceDir()}/${name}.png`, fullPage: false });
}

for (const viewport of VIEWPORTS) {
  test.describe(`Sentry replay disabled — ${viewport.name}`, () => {
    test.use({ viewport: viewport.size });

    test('without a DSN the SDK stays off and no telemetry is sent', async ({ page }) => {
      test.skip(DSN !== '', 'server was started with a synthetic DSN');
      const telemetry: string[] = [];
      page.on('request', (req) => {
        if (isTelemetry(req)) telemetry.push(req.url());
      });

      await page.goto('/login');
      await expect(page.locator('body')).toBeVisible();
      await page.waitForLoadState('networkidle');

      expect(await sentryState(page)).toMatchObject({ initialized: false, replayIntegration: false });
      expect(telemetry).toEqual([]);
      await screenshot(page, `sentry-no-dsn-${viewport.name}`);
    });

    test('with a synthetic loopback DSN no replay is recorded or sent', async ({ page }) => {
      test.skip(DSN === '', 'server was started without a DSN');
      const dsnHost = new URL(DSN).hostname;
      expect(LOOPBACK.has(dsnHost), `DSN host ${dsnHost} must be loopback`).toBe(true);

      const itemTypes: string[] = [];
      const envelopes: string[] = [];
      const replayUrls: string[] = [];
      const externalTelemetry: string[] = [];
      page.on('request', (req) => {
        if (/replay/i.test(req.url())) replayUrls.push(req.url());
        if (isTelemetry(req) && new URL(req.url()).hostname !== dsnHost) externalTelemetry.push(req.url());
      });
      await page.route(
        (url) => url.hostname === dsnHost,
        async (route) => {
          const body = route.request().postData() ?? '';
          envelopes.push(body);
          itemTypes.push(...envelopeItemTypes(body));
          await route.fulfill({ status: 200, body: '{}' });
        }
      );

      // A student marker in the path, query, fragment and referrer of the page.
      const markedPath = `/login/${MINOR_MARKER}?alumno=${MINOR_MARKER}#${MINOR_MARKER}`;
      await page.goto(markedPath, { referer: `http://127.0.0.1/user/${MINOR_MARKER}` });
      await expect(page.locator('body')).toBeVisible();

      const state = await sentryState(page);
      expect(state).toEqual({
        initialized: true,
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        replayIntegration: false,
      });

      // An error event is the path that would trigger an on-error replay; the
      // second event also carries the marker in the user and the request body.
      const sent = (text: string) =>
        page.waitForRequest((req) => req.url().includes('/envelope/') && (req.postData() ?? '').includes(text));
      const envelopesSent = Promise.all([sent('SM-19 synthetic replay probe'), sent('SM-19 synthetic privacy probe')]);
      // A transaction forced past sampling, with the marker in its name, span
      // description and span URL, is submitted first and must never be sent.
      const transactionSampled = await page.evaluate((marker) => {
        const hub = (window as any).__SENTRY__.hub;
        const url = `http://127.0.0.1/rest/v1/perfiles?id=eq.${marker}`;
        const transaction = hub.startTransaction({ name: `/user/${marker}`, op: 'navigation', sampled: true });
        transaction.startChild({ op: 'http.client', description: `GET ${url}`, data: { 'http.url': url } }).finish();
        transaction.finish();
        hub.captureEvent({ type: 'transaction', transaction: `/user/${marker}`, spans: [], start_timestamp: 1, timestamp: 2 });
        return transaction.sampled;
      }, MINOR_MARKER);
      expect(transactionSampled).toBe(true);
      await page.evaluate((marker) => {
        const hub = (window as any).__SENTRY__.hub;
        hub.setUser({ id: marker, email: `${marker}@example.invalid`, username: marker });
        hub.captureException(new Error('SM-19 synthetic replay probe'));
        hub.captureEvent({ message: 'SM-19 synthetic privacy probe', level: 'error', request: { data: { rut: marker } } });
      }, MINOR_MARKER);
      await envelopesSent;
      await page.waitForLoadState('networkidle');

      expect(itemTypes.filter((t) => t === 'event')).toHaveLength(2);
      expect(itemTypes.filter((t) => REPLAY_ITEM_TYPES.includes(t))).toEqual([]);
      expect(itemTypes).not.toContain('transaction');
      expect(envelopes.filter((body) => /"(transaction|spans)":/.test(body.split('\n').slice(1).join('\n')))).toEqual([]);
      expect(replayUrls).toEqual([]);
      expect(externalTelemetry).toEqual([]);
      expect(envelopes.filter((body) => body.includes(MINOR_MARKER))).toEqual([]);
      writeFileSync(
        `${evidenceDir()}/sentry-envelope-items-${viewport.name}.json`,
        JSON.stringify({ dsnHost, markedPath, itemTypes, replayUrls, externalTelemetry, envelopes }, null, 2)
      );
      await screenshot(page, `sentry-synthetic-dsn-${viewport.name}`);
    });
  });
}
