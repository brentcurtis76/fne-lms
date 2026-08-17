import { randomUUID } from 'node:crypto';

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

import { COHORT_ID } from '../../lib/pasantias/cohort-public';
import { PRIVACY_NOTICE_VERSION } from '../../lib/legal/privacy-notice';
import { apiContextFor } from './helpers/auth';
import fixtures from '../../scripts/ci/e2e-fixtures.json';

/**
 * A9 [A1] — one real submission, all the way to the row.
 *
 * ## Why this spec exists when `pasantias-form.spec.ts` already covers the form
 *
 * That spec intercepts every POST with `page.route()`. It proves what the browser
 * *sends* — which is the right thing for it to prove, and it stays. What nothing
 * proved until now is what *persists*: the API tests use fakes, the form spec uses
 * a mock, and so the three pieces (browser → route → row) had never executed as one
 * thing. Track A is a release gate away from shipping, and "each half works" is not
 * evidence that the whole does.
 *
 * **There is deliberately no `page.route()` in this file.** Every request here goes
 * to the real handler against the real (ephemeral, seeded) database CI stands up in
 * gate 4. A mock added here would silently turn the spec back into the one it was
 * written to complement.
 *
 * ## Why persistence is read through the admin API and not the public response
 *
 * `POST /api/pasantias/lead` answers `200 {"success": true}` on **both** the
 * new-lead path and the already-known-address path (anti-enumeration, by design).
 * It reveals nothing about the row. So the assertions read the lead back through
 * `GET /api/admin/pasantia-leads` as the admin fixture — the only surface that
 * exposes the row, and the same posture D-04 forces on everything else: RLS grants
 * no authenticated write, admin gets SELECT only, and a test may not reach past the
 * API into the table.
 *
 * The assertions use **raw column names** (`brochure_sent_at`, `marketing_opt_in`),
 * not A8's UI labels for them ("Programa enviado"). The column is the contract; the
 * label is presentation and may change without the contract changing.
 *
 * ## Why every lead is minted fresh
 *
 * The table is unique on `(email_normalized, cohort)`, and a second submission of
 * the same address for the same cohort takes the **update** path — which may even
 * re-open a `dismissed` lead, since `dismissed → new` is a legal D-03 edge. A spec
 * with a fixed address would therefore assert one thing on its first run and a
 * different thing on every run after. Each test mints its own UUID address instead.
 *
 * Synthetic only (Ley 21.719): `example.com` is RFC 2606 reserved and can never
 * reach a real mailbox, and every name and institution below is invented.
 */

/** A cold navigation against a production build runs well past the 30s default. */
test.setTimeout(120_000);

const PASANTIAS_PAGE = '/pasantias';
const BROCHURE_HREF = '/api/pasantias/brochure';
const FICHA_HREF = '/api/pasantias/ficha';
const ADMIN_LEADS_ENDPOINT = '/api/admin/pasantia-leads';

const SEEDED_LEAD = fixtures.pasantiasLead;

/** The columns this spec reads back, as `GET /api/admin/pasantia-leads` returns them. */
interface AdminLeadRow {
  id: string;
  cohort: string;
  email: string;
  institution: string;
  status: string;
  consent_accepted_at: string | null;
  consent_notice_version: string | null;
  marketing_opt_in: boolean;
  marketing_opt_in_at: string | null;
  brochure_sent_at: string | null;
}

/** RFC 2606 reserved, and unique per test, for the uniqueness reason above. */
function uniqueLeadEmail(): string {
  return `a9-flow-${randomUUID()}@example.com`;
}

/**
 * Fill the four required fields and submit, optionally ticking the marketing box.
 *
 * `pasantias-lead-website` is a honeypot and is left alone on purpose: a filled
 * honeypot is discarded silently, so a spec that touched it would go on to assert
 * against a row that was never written.
 */
async function submitLead(
  page: Page,
  lead: { email: string; institution: string; marketingOptIn: boolean }
): Promise<void> {
  await page.goto(PASANTIAS_PAGE);

  await page.getByTestId('pasantias-lead-first-name').fill('Valentina');
  await page.getByTestId('pasantias-lead-last-name').fill('Sintetica');
  await page.getByTestId('pasantias-lead-email').fill(lead.email);
  await page.getByTestId('pasantias-lead-institution').fill(lead.institution);

  await page.getByTestId('pasantias-consent').check();
  if (lead.marketingOptIn) {
    await page.getByTestId('pasantias-marketing-optin').check();
  } else {
    await expect(page.getByTestId('pasantias-marketing-optin')).not.toBeChecked();
  }

  await page.getByTestId('pasantias-lead-submit').click();

  // The success panel is the browser's own evidence that the POST returned 200;
  // everything after this reads the database side of the same submission.
  await expect(page.getByTestId('pasantias-lead-success')).toBeVisible({ timeout: 30_000 });
}

/**
 * The leads the admin API returns for `search`.
 *
 * `?search=` is an `ilike` across first name, last name, e-mail and institution, so
 * a UUID address matches exactly one row — which is how every assertion below stays
 * scoped to the lead its own test created. The leads table is NOT empty in CI (A8
 * seeds a permanent fixture into it), so "the row" and bare table counts are both
 * meaningless here.
 */
async function leadsMatching(api: APIRequestContext, search: string): Promise<AdminLeadRow[]> {
  const response = await api.get(`${ADMIN_LEADS_ENDPOINT}?search=${encodeURIComponent(search)}`);
  expect(response.status(), `admin lead read for ${search}`).toBe(200);

  const body = (await response.json()) as { leads: AdminLeadRow[] };
  return body.leads;
}

/** The single lead matching `search`, with the count asserted rather than assumed. */
async function soleLeadMatching(api: APIRequestContext, search: string): Promise<AdminLeadRow> {
  const leads = await leadsMatching(api, search);
  expect(leads, `exactly one lead should match ${search}`).toHaveLength(1);
  return leads[0];
}

test.describe('A9 — the Pasantías lead flow, unmocked', () => {
  let api: APIRequestContext;

  test.beforeAll(async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    api = await apiContextFor(browser, 'admin', baseURL!);
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test('a real submission persists with split consent evidence and no false brochure stamp', async ({
    page,
  }) => {
    const email = uniqueLeadEmail();
    const institution = 'Colegio Sintetico A9 Flujo';

    await submitLead(page, { email, institution, marketingOptIn: false });

    // The visitor's own copy of the brochure link, before we look at the database.
    await expect(page.getByTestId('pasantias-lead-brochure')).toHaveAttribute(
      'href',
      BROCHURE_HREF
    );

    const lead = await soleLeadMatching(api, email);

    expect(lead.email).toBe(email);
    expect(lead.cohort).toBe(COHORT_ID);
    expect(lead.status).toBe('new');
    expect(lead.institution).toBe(institution);
    // A8's permanent fixture lives in this table too; this pins that we read ours.
    expect(lead.institution).not.toBe(SEEDED_LEAD.institution);

    // D-12, half one: processing consent is required and is evidenced by a server
    // clock plus the exact notice version accepted. The version is compared to the
    // imported constant, never to a copied literal — a literal here would keep
    // passing after somebody bumped the notice and forgot this surface.
    expect(lead.consent_accepted_at).not.toBeNull();
    expect(
      Number.isNaN(Date.parse(lead.consent_accepted_at!)),
      `consent_accepted_at is not a parseable timestamp: ${lead.consent_accepted_at}`
    ).toBe(false);
    expect(lead.consent_notice_version).toBe(PRIVACY_NOTICE_VERSION);

    // D-12, half two: no default may assert consent. The box was never clicked, so
    // the flag is false AND its evidence timestamp is absent — a `false` with a
    // timestamp beside it would be a record claiming an opt-in nobody made.
    expect(lead.marketing_opt_in).toBe(false);
    expect(lead.marketing_opt_in_at).toBeNull();

    // The claim-and-release contract, executed end to end for the first time.
    // `brochure_sent_at` is not "the brochure was sent" — it is the auto-reply's
    // atomic 24h claim stamp. CI has no RESEND_API_KEY, so the send returns
    // `not_configured`, `canReleaseAutoReplyClaim` is true because nothing left the
    // process, and the claim is restored to what it was: null. The alternative —
    // keeping the stamp — would mark this lead "brochure sent" for a day when
    // nobody was ever mailed, which is exactly what lib/pasantias/emails.ts says
    // must not happen. This assertion is that sentence made executable.
    expect(lead.brochure_sent_at).toBeNull();
  });

  test('the optional marketing opt-in is recorded only when the visitor clicks it', async ({
    page,
  }) => {
    const email = uniqueLeadEmail();

    await submitLead(page, {
      email,
      institution: 'Colegio Sintetico A9 Marketing',
      marketingOptIn: true,
    });

    const lead = await soleLeadMatching(api, email);

    // The opposite branch of the test above, against a real row. The pair is the
    // only place D-12's "separately evidenced purposes" is proven as data rather
    // than as a payload the browser claimed to send.
    expect(lead.marketing_opt_in).toBe(true);
    expect(lead.marketing_opt_in_at).not.toBeNull();
    expect(
      Number.isNaN(Date.parse(lead.marketing_opt_in_at!)),
      `marketing_opt_in_at is not a parseable timestamp: ${lead.marketing_opt_in_at}`
    ).toBe(false);
    expect(lead.consent_notice_version).toBe(PRIVACY_NOTICE_VERSION);
  });

  test("A8's seeded lead is untouched by this spec", async () => {
    // `tests/e2e/pasantias-leads-admin.spec.ts` is read-only on this fixture by
    // design — it is not reset between local runs, so anything that triaged it
    // would pass once and fail forever after. This spec writes to the same table,
    // so it states that promise as an assertion instead of leaving it a promise.
    // The expectations are read from the fixture JSON, never retyped.
    const lead = await soleLeadMatching(api, SEEDED_LEAD.email);

    expect(lead.status).toBe(SEEDED_LEAD.status);
    expect(lead.consent_notice_version).toBe(SEEDED_LEAD.consentNoticeVersion);
  });

  test('the ficha and the brochure both serve a real PDF', async ({ request }) => {
    // Unauthenticated on purpose: both are public URLs (D-05 — the brochure is
    // UI-gated but deliberately shareable), and the checklist rows that used to
    // cover them were "somebody clicked it and a PDF appeared". The magic-number
    // check is what turns that into evidence: a 200 with an HTML error page in the
    // body would satisfy a status-only assertion.
    for (const path of [FICHA_HREF, BROCHURE_HREF]) {
      // Both render server-side on a cold cache, which is the CI case every time.
      const response = await request.get(path, { timeout: 90_000 });

      expect(response.status(), `${path} status`).toBe(200);
      expect(response.headers()['content-type'], `${path} content-type`).toContain(
        'application/pdf'
      );

      const body = await response.body();
      expect(body.subarray(0, 4).toString('latin1'), `${path} does not start with %PDF`).toBe(
        '%PDF'
      );
    }
  });
});
