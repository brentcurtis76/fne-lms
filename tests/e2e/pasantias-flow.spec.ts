import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from '@playwright/test';

import { createClient } from '@supabase/supabase-js';

import { PRIVACY_NOTICE_VERSION } from '../../lib/legal/privacy-notice';
import {
  E2E_USERS,
  FORCED_PASSWORD_FIXTURE_KEY,
  apiContextFor,
  ensureStorageState,
  type E2eFixtureUser,
} from './helpers/auth';
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
 *
 * ## Provenance (PASANT-B001d)
 *
 * Ported from `82bc0e7b79a750d07f62da7cc5b322eca4d0194e` (blob 3c1462bf, unchanged at
 * `9008bacddcf40a79aa4c051b11ab3a5baf33939b`). The one behavioral adaptation is the
 * cohort: the source imported `COHORT_ID`, which compares the route with itself.
 * See {@link ACTIVE_COHORT}; the rest is in docs/plan/evidence/a9/pasant-b001d-port.md.
 */

/** A cold navigation against a production build runs well past the 30s default. */
test.setTimeout(120_000);

const PASANTIAS_PAGE = '/pasantias';
const BROCHURE_HREF = '/api/pasantias/brochure';
const FICHA_HREF = '/api/pasantias/ficha';
const ADMIN_LEADS_ENDPOINT = '/api/admin/pasantia-leads';

const SEEDED_LEAD = fixtures.pasantiasLead;

/**
 * The cohort a lead submitted today must be filed under, pinned independently of
 * `lib/pasantias/cohort-public.ts`. Importing `COHORT_ID` instead would stay green
 * if the module drifted, because the route validates against that same constant.
 *
 * PASANT-B003 switched the runtime to January 2027, as this comment said it would:
 * the id is the ratified contract's `ids.cohort` (docs/plan/pasantias-january-
 * contract.md §2, DEC-06), which PLAN.md's 2026-10-09 January amendment makes the
 * sole normative source. October's `octubre-2026` (PLAN.md [A1]) is history.
 */
const ACTIVE_COHORT = 'enero-2027';

/** The two program IDs, contract §2, typed here for the same reason. */
type Program = 'inspira' | 'mirada-profunda';

/** The download names the two shared documents carry (C006), typed independently. */
const JANUARY_FILENAMES: Record<string, string> = {
  [FICHA_HREF]: 'Ficha-Pasantias-INSPIRA-Barcelona-enero-2027-2027-01-v2.pdf',
  [BROCHURE_HREF]: 'Pasantias-INSPIRA-Barcelona-enero-2027-2027-01-v1.pdf',
};

/** The columns this spec reads back, as `GET /api/admin/pasantia-leads` returns them. */
interface AdminLeadRow {
  id: string;
  cohort: string;
  email: string;
  institution: string;
  status: string;
  notes?: string | null;
  updated_at?: string | null;
  created_at: string;
  consent_accepted_at: string | null;
  consent_notice_version: string | null;
  marketing_opt_in: boolean;
  marketing_opt_in_at: string | null;
  brochure_sent_at: string | null;
  /** PASANT-B004: every interest of the contact, in contract order. */
  program_interests: { program: string; consent_notice_version: string | null }[];
}

/** One page of `GET /api/admin/pasantia-leads` (PASANT-B004). */
interface AdminLeadPage {
  leads: AdminLeadRow[];
  counts: Record<'new' | 'contacted' | 'converted' | 'dismissed' | 'total', number>;
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  watermark: string | null;
}

/** RFC 2606 reserved, and unique per test, for the uniqueness reason above. */
function uniqueLeadEmail(): string {
  return `a9-flow-${randomUUID()}@example.com`;
}

/**
 * Choose the program, fill the four required fields and submit, optionally ticking
 * the marketing box. Every January submission names exactly one program.
 *
 * `pasantias-lead-website` is a honeypot and is left alone on purpose: a filled
 * honeypot is discarded silently, so a spec that touched it would go on to assert
 * against a row that was never written.
 */
async function submitLead(
  page: Page,
  lead: { email: string; institution: string; marketingOptIn: boolean; program?: Program }
): Promise<void> {
  await page.goto(PASANTIAS_PAGE);

  await page.getByTestId(`pasantias-lead-program-${lead.program ?? 'inspira'}`).check();
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

/** One page of the admin API for a filter set (PASANT-B004), asserted to be a 200. */
async function adminPage(
  api: APIRequestContext,
  params: Record<string, string | number>
): Promise<AdminLeadPage> {
  const query = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)])
  ).toString();
  const response = await api.get(`${ADMIN_LEADS_ENDPOINT}?${query}`);
  expect(response.status(), `admin page read for ${query}`).toBe(200);
  return (await response.json()) as AdminLeadPage;
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

    // The visitor's own direct links to both shared documents, before we look at
    // the database — and no promise that anything was or will be e-mailed (C007).
    await expect(page.getByTestId('pasantias-lead-ficha')).toHaveAttribute('href', FICHA_HREF);
    await expect(page.getByTestId('pasantias-lead-brochure')).toHaveAttribute(
      'href',
      BROCHURE_HREF
    );
    await expect(page.getByTestId('pasantias-lead-success')).not.toContainText(
      /te enviamos|te enviaremos|recibirás|revisa tu correo/i
    );

    const lead = await soleLeadMatching(api, email);

    expect(lead.email).toBe(email);
    expect(lead.cohort).toBe(ACTIVE_COHORT);
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

    // `brochure_sent_at` is the October branch's 24h claim stamp. A January
    // submission claims its acknowledgement on the program interest instead
    // (`pasantias_claim_program_reply`) and never writes this column, so it must
    // be null — and CI has no RESEND_API_KEY, so nothing was mailed either way.
    expect(lead.brochure_sent_at).toBeNull();
  });

  test('a program CTA preselects that program, and the visitor can still change it', async ({
    page,
  }) => {
    await page.goto(PASANTIAS_PAGE);

    await page.getByTestId('pasantias-cta-program-mirada-profunda').click();
    await expect(page.getByTestId('pasantias-lead-program-mirada-profunda')).toBeChecked();
    await expect(page.getByTestId('pasantias-lead-program-inspira')).not.toBeChecked();

    await page.getByTestId('pasantias-lead-program-inspira').check();
    await expect(page.getByTestId('pasantias-lead-program-inspira')).toBeChecked();

    await page.getByTestId('pasantias-cta-program-mirada-profunda').click();
    await expect(page.getByTestId('pasantias-lead-program-mirada-profunda')).toBeChecked();
  });

  test('both programs with one address are two submissions on one contact', async ({ page }) => {
    const email = uniqueLeadEmail();

    await submitLead(page, {
      email,
      institution: 'Colegio Sintetico A9 Dos Programas',
      marketingOptIn: false,
      program: 'inspira',
    });

    // PASANT-B004: what the FIRST submission alone wrote — one contact, one interest.
    // Without this read the both-interest assertion below could be satisfied by a
    // contact that somehow already held both, and would say nothing about submission.
    const afterFirst = await soleLeadMatching(api, email);
    expect(afterFirst.program_interests.map((row) => row.program)).toEqual(['inspira']);

    // The confirmation offers the other program; the second submission is its own
    // consent, so the box starts unchecked and is ticked again.
    await page.getByTestId('pasantias-lead-other-program').click();
    await expect(page.getByTestId('pasantias-lead-program-mirada-profunda')).toBeChecked();
    await expect(page.getByTestId('pasantias-consent')).not.toBeChecked();
    await expect(page.getByTestId('pasantias-lead-email')).toHaveValue(email);
    // The same address as the visitor might retype it, in capitals: the contact key is
    // the NORMALIZED address, so this must still land on the first submission's row.
    // (No extra submission: the public route allows five per minute per client, and
    // this describe already makes four.)
    await page.getByTestId('pasantias-lead-email').fill(email.toUpperCase());
    await page.getByTestId('pasantias-consent').check();
    await page.getByTestId('pasantias-lead-submit').click();
    await expect(page.getByTestId('pasantias-lead-success-program')).toContainText(
      'INSPIRA Mirada Profunda',
      { timeout: 30_000 }
    );

    // One normalized address, one contact row. The two interests live in
    // `pasantias_lead_program_interests`; their table-level persistence is pinned
    // by pgTAP 112 and the PostgREST checks (B002), and since PASANT-B004 the
    // admin API embeds them, so the real row is read back here too.
    const lead = await soleLeadMatching(api, email);
    expect(lead.id, 'the second submission must reuse the first contact').toBe(afterFirst.id);
    expect(lead.cohort).toBe(ACTIVE_COHORT);
    expect(lead.consent_notice_version).toBe(PRIVACY_NOTICE_VERSION);

    // C009-programs, against real PostgREST: both interests on the one contact,
    // each with its own consent version, in contract order.
    expect(lead.program_interests.map((row) => row.program)).toEqual(['inspira', 'mirada-profunda']);
    for (const row of lead.program_interests) {
      expect(row.consent_notice_version).toBe(PRIVACY_NOTICE_VERSION);
    }

    // The program filter matches the contact by ONE interest and still returns
    // BOTH, and counts the contact once (the aliased inner embed, for real).
    for (const program of ['inspira', 'mirada-profunda'] as const) {
      const filtered = await adminPage(api, { search: email, program });
      expect(filtered.pagination.total, `contacts matching ${program}`).toBe(1);
      expect(filtered.leads).toHaveLength(1);
      expect(filtered.leads[0].program_interests.map((row) => row.program)).toEqual([
        'inspira',
        'mirada-profunda',
      ]);
      expect(filtered.leads[0]).not.toHaveProperty('program_match');
    }
    const none = await adminPage(api, { search: email, program: 'sin-programa' });
    expect(none.pagination.total).toBe(0);
    expect(none.leads).toEqual([]);
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

      // The January variant, by its download name — never an October one.
      expect(response.headers()['content-disposition'], `${path} filename`).toContain(
        `filename="${JANUARY_FILENAMES[path]}"`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// PASANT-B004 (C009) — the admin leads surface against the real route, the real
// PostgREST (`max_rows = 1000`) and a real browser. Still no `page.route()`.
//
// The `C009-scale` tests need more than 1000 synthetic contacts with equal
// timestamps, both-interest, single-interest and interest-less contacts in every
// status. Producing them is the seed's job, never this spec's (it may not reach
// past the API into the table): `scripts/ci/seed-e2e.mjs` writes the 1205 OWNED
// contacts `pasantiasBulk` describes. Without that seed these tests FAIL with an
// explicit message rather than pass on a small table. They also need a table
// nobody writes to during the walk: CI runs one worker.
//
// 1205 is the OWNED count, never the table total: the A8 lead and every contact
// the A9 tests above submitted are in the table too. Exact bulk expectations are
// therefore scoped by the descriptor's search token (only owned e-mails carry
// it) or by owned ids; table-wide numbers are compared with the table's own
// unfiltered counts.
// ---------------------------------------------------------------------------

const LEADS_PAGE = '/admin/pasantia-leads';

/** The admin API's maximum page size; the CSV export walks pages of this size. */
const MAX_PAGE_SIZE = 500;

/** The screen's page size. */
const SCREEN_PAGE_SIZE = 50;

/**
 * Microseconds for a `timestamptz` string, written independently of the app's
 * helper: contacts inserted together differ below the millisecond `Date.parse`
 * keeps, and this spec must be able to see that order.
 */
function micros(value: string): number | null {
  const match = /^(.+T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(value);
  if (!match) return null;
  let offset = match[3];
  if (/^[+-]\d{2}$/.test(offset)) offset = `${offset}:00`;
  else if (/^[+-]\d{4}$/.test(offset)) offset = `${offset.slice(0, 3)}:${offset.slice(3)}`;
  const millis = Date.parse(`${match[1]}${offset}`);
  if (Number.isNaN(millis)) return null;
  return millis * 1000 + Number(`${match[2] ?? ''}000000`.slice(0, 6));
}

/** RFC 4180 parse of a downloaded CSV, independent of the app's exporter. */
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      if (char === '\r' && text[index + 1] === '\n') index += 1;
    } else {
      field += char;
    }
  }
  record.push(field);
  records.push(record);
  return records;
}

/**
 * Every contact matching `filters`, page by page at the maximum size, under one
 * watermark. A walk the table moved under is repeated (a local run may have other
 * specs writing), at most three times.
 */
async function walkMatching(
  api: APIRequestContext,
  filters: Record<string, string>
): Promise<{ rows: AdminLeadRow[]; first: AdminLeadPage }> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const first = await adminPage(api, { ...filters, page: 1, pageSize: MAX_PAGE_SIZE });
    const rows = [...first.leads];
    let moved = false;
    for (let page = 2; page <= first.pagination.pageCount; page += 1) {
      const next = await adminPage(api, { ...filters, page, pageSize: MAX_PAGE_SIZE });
      if (next.watermark !== first.watermark || next.pagination.total !== first.pagination.total) {
        moved = true;
        break;
      }
      rows.push(...next.leads);
    }
    if (!moved) return { rows, first };
  }
  throw new Error('The leads table kept changing during the walk; C009-scale needs a quiescent stack.');
}

/** Every contact in the table. */
async function walkAllContacts(
  api: APIRequestContext
): Promise<{ rows: AdminLeadRow[]; first: AdminLeadPage }> {
  return walkMatching(api, {});
}

const SCALE_FIXTURE_MESSAGE =
  'C009-scale needs the PASANT-B004 bulk fixture seeded by scripts/ci/seed-e2e.mjs (pasantiasBulk, 1205 owned contacts); see docs/plan/evidence/pasant-january/b004-admin-completeness.md';

test.describe('PASANT-B004 — the admin leads surface, unmocked', () => {
  let admin: APIRequestContext;
  let docente: APIRequestContext;

  test.beforeAll(async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    admin = await apiContextFor(browser, 'admin', baseURL!);
    docente = await apiContextFor(browser, 'docente', baseURL!);
  });

  test.afterAll(async () => {
    await admin?.dispose();
    await docente?.dispose();
  });

  test('non-admins and anonymous callers are refused on GET, export pages and PATCH', async ({
    baseURL,
  }) => {
    const anonymous = await playwrightRequest.newContext({ baseURL });
    try {
      // An id that matches no contact: a route that let the caller through would
      // answer 404, so the refusal is observable without writing anything.
      const unknownId = randomUUID();
      for (const [label, client, expected] of [
        ['anonymous', anonymous, 401],
        ['docente', docente, 403],
      ] as const) {
        expect((await client.get(ADMIN_LEADS_ENDPOINT)).status(), `${label} GET`).toBe(expected);
        expect(
          (await client.get(`${ADMIN_LEADS_ENDPOINT}?page=2&pageSize=${MAX_PAGE_SIZE}`)).status(),
          `${label} export page`
        ).toBe(expected);
        expect(
          (await client.patch(ADMIN_LEADS_ENDPOINT, { data: { id: unknownId, notes: 'x' } })).status(),
          `${label} PATCH`
        ).toBe(expected);
      }
    } finally {
      await anonymous.dispose();
    }
  });

  test('the real route refuses malformed pagination and unknown filters', async () => {
    for (const query of [
      'page=0',
      'page=-1',
      'page=1.5',
      'page=abc',
      'page=01',
      'page=10001',
      `pageSize=${MAX_PAGE_SIZE + 1}`,
      'pageSize=0',
      'page=1&page=2',
      'program=barcelona',
      'status=archivado',
    ]) {
      const response = await admin.get(`${ADMIN_LEADS_ENDPOINT}?${query}`);
      expect(response.status(), query).toBe(400);
    }
  });

  test('a page past the end is empty and still reports the real total', async () => {
    const response = await adminPage(admin, { search: SEEDED_LEAD.email, page: 5 });

    expect(response.leads).toEqual([]);
    expect(response.pagination.total).toBe(1);
    expect(response.pagination.pageCount).toBe(1);
  });

  test('the seeded pre-January contact is labelled by absence, never given a program', async () => {
    const historical = await adminPage(admin, { search: SEEDED_LEAD.email, program: 'sin-programa' });
    expect(historical.pagination.total).toBe(1);
    expect(historical.leads[0].program_interests).toEqual([]);
    expect(historical.leads[0].cohort).toBe(SEEDED_LEAD.cohort);

    const inspira = await adminPage(admin, { search: SEEDED_LEAD.email, program: 'inspira' });
    expect(inspira.pagination.total).toBe(0);
  });

  for (const viewport of [
    { name: 'desktop', width: 1366, height: 768, testId: 'pasantia-lead-programs-' },
    { name: 'mobile', width: 390, height: 844, testId: 'pasantia-lead-programs-mobile-' },
  ]) {
    test(`the ${viewport.name} list labels a historical contact explicitly (${viewport.width}x${viewport.height})`, async ({
      browser,
    }) => {
      const seeded = await soleLeadMatching(admin, SEEDED_LEAD.email);
      const context = await browser.newContext({
        storageState: await ensureStorageState(browser, 'admin'),
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      try {
        await page.goto(LEADS_PAGE);
        await page.getByTestId('pasantia-leads-search').fill(SEEDED_LEAD.email);

        const labels = page.getByTestId(`${viewport.testId}${seeded.id}`);
        await expect(labels).toBeVisible({ timeout: 30_000 });
        await expect(labels).toContainText('Histórico');
        await expect(labels).not.toContainText('INSPIRA');
        await expect(page.getByTestId('pasantia-leads-range')).toContainText('de 1 contacto ·');
      } finally {
        await context.close();
      }
    });
  }

  test('C009-scale: every contact is reachable once, in a stable order, with exact counts', async () => {
    test.setTimeout(300_000);

    const { rows, first } = await walkAllContacts(admin);
    const total = first.pagination.total;
    expect(total, SCALE_FIXTURE_MESSAGE).toBeGreaterThan(1000);

    // Every contact once: no duplicate, nothing missing.
    expect(rows).toHaveLength(total);
    expect(new Set(rows.map((row) => row.id)).size).toBe(total);

    // Newest first, id descending inside a run of equal timestamps — and the
    // fixture must actually contain such runs, or this proves nothing.
    let equalNeighbours = 0;
    for (let index = 1; index < rows.length; index += 1) {
      const previous = micros(rows[index - 1].created_at);
      const current = micros(rows[index].created_at);
      expect(previous, rows[index - 1].created_at).not.toBeNull();
      expect(current, rows[index].created_at).not.toBeNull();
      if (previous === current) {
        equalNeighbours += 1;
        expect(rows[index - 1].id > rows[index].id, `tie-break at ${index}`).toBe(true);
      } else {
        expect(previous! > current!, `order at ${index}`).toBe(true);
      }
    }
    expect(equalNeighbours, 'the fixture must contain equal timestamps').toBeGreaterThan(0);

    // Newest and oldest reachable from the screen's first and last pages.
    const screenFirst = await adminPage(admin, { page: 1 });
    expect(screenFirst.leads[0].id).toBe(rows[0].id);
    const lastPage = Math.ceil(total / SCREEN_PAGE_SIZE);
    const screenLast = await adminPage(admin, { page: lastPage });
    expect(screenLast.leads[screenLast.leads.length - 1].id).toBe(rows[total - 1].id);

    // Global counts are exact database counts, and each status tab's own
    // filtered total agrees with them.
    expect(first.counts.total).toBe(total);
    for (const status of ['new', 'contacted', 'converted', 'dismissed'] as const) {
      const tally = rows.filter((row) => row.status === status).length;
      expect(tally, `${status} contacts in the fixture`).toBeGreaterThan(0);
      expect(first.counts[status], `${status} count`).toBe(tally);
      const filtered = await adminPage(admin, { status, pageSize: 1 });
      expect(filtered.pagination.total, `${status} filtered total`).toBe(tally);
    }

    // Program combinations, each contact counted once by its filter.
    const has = (row: AdminLeadRow, program: string) =>
      row.program_interests.some((entry) => entry.program === program);
    const both = rows.filter((row) => has(row, 'inspira') && has(row, 'mirada-profunda'));
    const none = rows.filter((row) => row.program_interests.length === 0);
    expect(both.length, 'contacts with both interests').toBeGreaterThan(0);
    expect(none.length, 'contacts with no interest').toBeGreaterThan(0);
    for (const program of ['inspira', 'mirada-profunda'] as const) {
      const matching = rows.filter((row) => has(row, program)).length;
      const filtered = await adminPage(admin, { program, pageSize: 1 });
      expect(filtered.pagination.total, `${program} filtered total`).toBe(matching);
    }
    const unprogrammed = await adminPage(admin, { program: 'sin-programa', pageSize: 1 });
    expect(unprogrammed.pagination.total).toBe(none.length);
  });

  test('C009-scale: the browser reaches the oldest contact and downloads every contact (1366x768)', async ({
    browser,
  }) => {
    test.setTimeout(300_000);

    const { rows, first } = await walkAllContacts(admin);
    const total = first.pagination.total;
    expect(total, SCALE_FIXTURE_MESSAGE).toBeGreaterThan(1000);
    const pageCount = Math.ceil(total / SCREEN_PAGE_SIZE);

    const context = await browser.newContext({
      storageState: await ensureStorageState(browser, 'admin'),
      viewport: { width: 1366, height: 768 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    try {
      await page.goto(LEADS_PAGE);
      const range = page.getByTestId('pasantia-leads-range');
      await expect(range).toContainText(`de ${total} contactos`, { timeout: 60_000 });
      await expect(page.getByTestId('pasantia-leads-tab-all')).toContainText(String(total));

      await page.getByTestId('pasantia-leads-page-last').click();
      await expect(range).toContainText(`Página ${pageCount} de ${pageCount}`);
      await expect(page.getByTestId(`pasantia-lead-toggle-${rows[total - 1].id}`)).toBeVisible();

      await page.getByTestId('pasantia-leads-page-first').click();
      await expect(range).toContainText(`Página 1 de ${pageCount}`);
      await expect(page.getByTestId(`pasantia-lead-toggle-${rows[0].id}`)).toBeVisible();

      // The export is independent of the page on screen: from page 1 it still
      // carries every contact, and only after every page was checked. The header
      // mounts its actions twice (desktop and mobile copy); strict mode still
      // requires exactly one VISIBLE button.
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 180_000 }),
        page.getByTestId('pasantia-leads-export-csv').filter({ visible: true }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/^pasantias-leads-\d{4}-\d{2}-\d{2}\.csv$/);
      await expect(page.getByTestId('pasantia-leads-export-error')).toHaveCount(0);

      const records = parseCsv(readFileSync((await download.path())!, 'utf8'));
      const header = records[0];
      const body = records.slice(1);
      expect(body, 'CSV data rows').toHaveLength(total);
      for (const record of body) {
        expect(record).toHaveLength(header.length);
      }

      const emailColumn = header.indexOf('Email');
      expect(emailColumn).toBeGreaterThanOrEqual(0);
      expect(body.map((record) => record[emailColumn]).sort()).toEqual(
        rows.map((row) => row.email).sort()
      );

      const programsColumn = header.indexOf('Programas');
      expect(body.some((record) => record[programsColumn].includes('; '))).toBe(true);
      expect(body.some((record) => record[programsColumn].startsWith('Histórico'))).toBe(true);
    } finally {
      await context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// PASANT-B004 (C009) — the OWNED bulk fixture, held to its descriptor.
//
// `pasantiasBulk` (scripts/ci/e2e-fixtures.json) states the rules the seeder
// follows and, separately, hand-written expectations. This spec derives every
// owned contact from the rules on its own — it does not import the seeder —
// checks that derivation against the hand-written numbers, and then holds the
// live API, the screen and the downloaded CSV to exact ids, order, labels and
// cells, never to counts alone.
// ---------------------------------------------------------------------------

type LeadStatus = 'new' | 'contacted' | 'converted' | 'dismissed';
type ProgramFilter = Program | 'sin-programa';
type BulkKind = 'inspira' | 'mirada-profunda' | 'both' | 'historical' | 'unclassified';

interface BulkSearchCase {
  search: string;
  status: LeadStatus | null;
  program: ProgramFilter | null;
  indexes: number[];
}

interface BulkDescriptor {
  count: number;
  idPrefix: string;
  emailPrefix: string;
  emailDomain: string;
  searchToken: string;
  firstName: string;
  lastNamePrefix: string;
  institution: string;
  consentNoticeVersion: string;
  kinds: BulkKind[];
  statuses: LeadStatus[];
  cohorts: { january: string; historical: string };
  runs: { from: number; to: number; createdAt: string; ladderMicros: boolean }[];
  hostile: { index: number; fields: Record<string, string>; csv: Record<string, string> }[];
  expected: {
    total: number;
    byKind: Record<BulkKind, number>;
    byStatus: Record<LeadStatus, number>;
    byProgramFilter: Record<ProgramFilter, number>;
    byStatusAndProgramFilter: Record<LeadStatus, Record<ProgramFilter, number>>;
    order: { from: number; to: number }[];
    newestIndex: number;
    oldestIndex: number;
    searches: BulkSearchCase[];
  };
}

const BULK = fixtures.pasantiasBulk as unknown as BulkDescriptor;

const LEAD_STATUS_VALUES: readonly LeadStatus[] = ['new', 'contacted', 'converted', 'dismissed'];
const PROGRAM_FILTERS: readonly ProgramFilter[] = ['inspira', 'mirada-profunda', 'sin-programa'];

interface BulkContact {
  index: number;
  id: string;
  email: string;
  lastName: string;
  kind: BulkKind;
  status: LeadStatus;
  cohort: string;
  programs: Program[];
  createdMicros: number;
}

function bulkContact(index: number): BulkContact {
  const number = String(index).padStart(4, '0');
  const kind = BULK.kinds[(index - 1) % BULK.kinds.length];
  const status = BULK.statuses[Math.floor((index - 1) / BULK.kinds.length) % BULK.statuses.length];
  const run = BULK.runs.find((candidate) => index >= candidate.from && index <= candidate.to);
  if (!run) throw new Error(`pasantiasBulk: contact ${index} is in no run`);
  const base = micros(run.createdAt);
  if (base === null) throw new Error(`pasantiasBulk: unreadable createdAt ${run.createdAt}`);
  const programs: Program[] =
    kind === 'both'
      ? ['inspira', 'mirada-profunda']
      : kind === 'inspira' || kind === 'mirada-profunda'
        ? [kind]
        : [];
  return {
    index,
    id: `${BULK.idPrefix}${String(index).padStart(12, '0')}`,
    email: `${BULK.emailPrefix}${number}@${BULK.emailDomain}`,
    lastName: `${BULK.lastNamePrefix}${number}`,
    kind,
    status,
    cohort: kind === 'historical' ? BULK.cohorts.historical : BULK.cohorts.january,
    programs,
    createdMicros: run.ladderMicros ? base + (run.to - index) : base,
  };
}

const BULK_CONTACTS: BulkContact[] = Array.from({ length: BULK.count }, (_, offset) =>
  bulkContact(offset + 1)
);
const BULK_BY_ID = new Map(BULK_CONTACTS.map((contact) => [contact.id, contact]));
const bulkAt = (index: number): BulkContact => BULK_CONTACTS[index - 1];

/** The API's order over the owned set, as the descriptor declares it (index segments). */
const BULK_ORDER: BulkContact[] = BULK.expected.order.flatMap(({ from, to }) => {
  const step = from <= to ? 1 : -1;
  return Array.from({ length: Math.abs(to - from) + 1 }, (_, offset) =>
    bulkAt(from + offset * step)
  );
});

const HOSTILE_BY_INDEX = new Map(BULK.hostile.map((entry) => [entry.index, entry]));

function matchesProgram(contact: BulkContact, program: ProgramFilter | null): boolean {
  if (program === null) return true;
  if (program === 'sin-programa') return contact.programs.length === 0;
  return contact.programs.includes(program);
}

/** The owned contacts one status/program filter set matches, in the API's order. */
function expectedOwned(status: LeadStatus | null, program: ProgramFilter | null): BulkContact[] {
  return BULK_ORDER.filter(
    (contact) => (status === null || contact.status === status) && matchesProgram(contact, program)
  );
}

/** The descriptor's hand-written count for the same filter set. */
function declaredCount(status: LeadStatus | null, program: ProgramFilter | null): number {
  const { expected } = BULK;
  if (status && program) return expected.byStatusAndProgramFilter[status][program];
  if (status) return expected.byStatus[status];
  if (program) return expected.byProgramFilter[program];
  return expected.total;
}

function filterParams(
  search: string,
  status: LeadStatus | null,
  program: ProgramFilter | null
): Record<string, string> {
  const params: Record<string, string> = { search };
  if (status) params.status = status;
  if (program) params.program = program;
  return params;
}

/** The es-CL labels the screen and the CSV print, typed here independently of the card. */
const PROGRAM_NAMES: Record<Program, string> = {
  inspira: 'Pasantía INSPIRA',
  'mirada-profunda': 'INSPIRA Mirada Profunda',
};
const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  converted: 'Convertido',
  dismissed: 'Descartado',
};

function expectedProgramsCell(contact: BulkContact): string {
  if (contact.programs.length > 0) {
    return contact.programs.map((program) => PROGRAM_NAMES[program]).join('; ');
  }
  if (contact.kind === 'historical') {
    return `Histórico (cohorte ${contact.cohort}) · sin programa registrado`;
  }
  return 'Sin clasificar · sin programa registrado';
}

/** The CSV header row, in order, typed independently of `LEAD_CSV_HEADERS`. */
const CSV_HEADERS = [
  'Fecha',
  'Nombre',
  'Email',
  'WhatsApp',
  'Institución',
  'Cargo',
  'Participantes',
  'Cohorte',
  'Programas',
  'Estado',
  'Programa enviado',
  'Mensaje',
  'UTM source',
  'UTM medium',
  'UTM campaign',
  'Ruta de origen',
  'Versión aviso consentimiento',
  'Notas',
];

/**
 * The cells the downloaded CSV must hold for an owned contact. `Fecha` and
 * `Programa enviado` are presentation of a timestamp and are left out; a hostile
 * contact's cells are the hand-worked `csv` values from the descriptor.
 */
function expectedCsvCells(contact: BulkContact): Record<string, string> {
  return {
    Nombre: `${BULK.firstName} ${contact.lastName}`,
    Email: contact.email,
    WhatsApp: '',
    Institución: BULK.institution,
    Cargo: '',
    Participantes: '',
    Cohorte: contact.cohort,
    Programas: expectedProgramsCell(contact),
    Estado: STATUS_LABELS[contact.status],
    Mensaje: '',
    'UTM source': '',
    'UTM medium': '',
    'UTM campaign': '',
    'Ruta de origen': '',
    'Versión aviso consentimiento': BULK.consentNoticeVersion,
    Notas: '',
    ...(HOSTILE_BY_INDEX.get(contact.index)?.csv ?? {}),
  };
}

/** Clicks the export, waits for the file and parses it; asserts no refusal was shown. */
async function downloadCsv(
  page: Page
): Promise<{ text: string; header: string[]; rows: Record<string, string>[] }> {
  // The header mounts its actions twice (desktop and mobile copy); strict mode
  // still requires exactly one VISIBLE button.
  const exportButton = page.getByTestId('pasantia-leads-export-csv').filter({ visible: true });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 180_000 }),
    exportButton.click(),
  ]);
  await expect(page.getByTestId('pasantia-leads-export-error')).toHaveCount(0);
  await expect(exportButton).toHaveAttribute('aria-busy', 'false');

  const text = readFileSync((await download.path())!, 'utf8');
  const [header, ...body] = parseCsv(text);
  for (const record of body) {
    expect(record).toHaveLength(header.length);
  }
  return {
    text,
    header,
    rows: body.map((record) => Object.fromEntries(header.map((name, index) => [name, record[index]]))),
  };
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const LOCAL_SUPABASE_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/**
 * A GENUINE access token for a synthetic fixture: a password sign-in against the
 * local auth server with the fixture's own credentials, exactly as a Bearer API
 * client would obtain one. Never minted, never lifted from a cookie. Refuses a
 * non-local Supabase URL, so fixture credentials only ever reach the local stack.
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
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error || !data.session) {
    throw new Error(`fixture password sign-in failed: ${error?.message ?? 'no session'}`);
  }
  return data.session.access_token;
}

/** The forced-change refusal: 403, its machine code, and no lead data of any kind. */
async function expectHeldByPasswordGate(response: APIResponse, label: string): Promise<void> {
  expect(response.status(), label).toBe(403);
  const body = (await response.json()) as Record<string, unknown>;
  expect(body.code, label).toBe('PASSWORD_CHANGE_REQUIRED');
  for (const key of ['leads', 'lead', 'counts', 'pagination', 'watermark']) {
    expect(body, `${label} must not carry ${key}`).not.toHaveProperty(key);
  }
}

test.describe('PASANT-B004 — the owned 1205-contact fixture, unmocked', () => {
  let admin: APIRequestContext;

  test.beforeAll(async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    admin = await apiContextFor(browser, 'admin', baseURL!);
  });

  test.afterAll(async () => {
    await admin?.dispose();
  });

  test('the descriptor rules agree with its hand-written expectations', () => {
    const { expected } = BULK;
    expect(BULK_CONTACTS).toHaveLength(expected.total);
    expect(new Set(BULK_CONTACTS.map((contact) => contact.id)).size).toBe(expected.total);
    expect(new Set(BULK_CONTACTS.map((contact) => contact.email)).size).toBe(expected.total);

    for (const [kind, count] of Object.entries(expected.byKind)) {
      expect(BULK_CONTACTS.filter((contact) => contact.kind === kind), `kind ${kind}`).toHaveLength(count);
    }
    for (const status of [null, ...LEAD_STATUS_VALUES]) {
      for (const program of [null, ...PROGRAM_FILTERS]) {
        expect(expectedOwned(status, program).length, `${status} x ${program}`).toBe(
          declaredCount(status, program)
        );
      }
    }

    // The declared order is the API's order, recomputed here from the timestamps.
    const sorted = [...BULK_CONTACTS].sort((a, b) =>
      a.createdMicros !== b.createdMicros ? b.createdMicros - a.createdMicros : a.id < b.id ? 1 : -1
    );
    expect(BULK_ORDER.map((contact) => contact.id)).toEqual(sorted.map((contact) => contact.id));
    expect(BULK_ORDER[0].index).toBe(expected.newestIndex);
    expect(BULK_ORDER[BULK_ORDER.length - 1].index).toBe(expected.oldestIndex);

    // The last-name searches are derivable from the rules; the hostile ones are not
    // (they depend on the route's sanitizer) and are held to the live API only.
    for (const entry of expected.searches.filter((candidate) => /^Lote \d+$/.test(candidate.search))) {
      const derived = expectedOwned(entry.status, entry.program).filter((contact) =>
        contact.lastName.includes(entry.search)
      );
      expect(derived.map((contact) => contact.index), JSON.stringify(entry)).toEqual(entry.indexes);
    }
  });

  test('every owned contact is persisted once, after every newer contact, in created_at DESC, id DESC order', async () => {
    test.setTimeout(300_000);

    const { rows, first } = await walkAllContacts(admin);
    const total = first.pagination.total;
    // The A8 lead is in the table too, so the owned set can never be all of it.
    expect(total, SCALE_FIXTURE_MESSAGE).toBeGreaterThan(BULK.count);
    expect(first.pagination.pageCount, 'the walk must cross the 1000-row line').toBeGreaterThanOrEqual(3);
    expect(rows).toHaveLength(total);
    const position = new Map(rows.map((row, index) => [row.id, index]));
    expect(position.size, 'no contact appears twice').toBe(total);

    // Owned timestamps predate the table itself, so the owned set is exactly the
    // table's tail, in the declared order: nothing missing, nothing twice, nothing
    // out of place — at every one of the 1205 positions.
    const tail = total - BULK.count;
    BULK_ORDER.forEach((contact, offset) => {
      expect(position.get(contact.id), `position of ${contact.id}`).toBe(tail + offset);
    });

    for (const contact of BULK_CONTACTS) {
      const row = rows[position.get(contact.id)!];
      expect(row.email).toBe(contact.email);
      expect(row.status).toBe(contact.status);
      expect(row.cohort).toBe(contact.cohort);
      expect(micros(row.created_at), `created_at of ${contact.id}`).toBe(contact.createdMicros);
      expect(row.program_interests.map((interest) => interest.program)).toEqual(contact.programs);
    }

    // Each equal-timestamp run is real and crosses the page boundaries it is long
    // enough to cross; the ladder differs only below the millisecond.
    let crossesExportPage = false;
    let crossesScreenPage = false;
    for (const run of BULK.runs) {
      const members = BULK_CONTACTS.filter(
        (contact) => contact.index >= run.from && contact.index <= run.to
      ).map((contact) => position.get(contact.id)!);
      const firstPosition = Math.min(...members);
      const lastPosition = Math.max(...members);
      expect(lastPosition - firstPosition + 1, `run ${run.from}-${run.to} is contiguous`).toBe(members.length);

      const instants = new Set(members.map((member) => micros(rows[member].created_at)));
      if (run.ladderMicros) {
        expect(instants.size).toBe(members.length);
        expect(new Set(members.map((member) => Date.parse(rows[member].created_at))).size).toBe(1);
        continue;
      }
      expect(instants.size, `run ${run.from}-${run.to} shares one instant`).toBe(1);
      const crosses = (pageSize: number) =>
        Math.floor(firstPosition / pageSize) !== Math.floor(lastPosition / pageSize);
      if (members.length > MAX_PAGE_SIZE) expect(crosses(MAX_PAGE_SIZE)).toBe(true);
      if (members.length > SCREEN_PAGE_SIZE) expect(crosses(SCREEN_PAGE_SIZE)).toBe(true);
      crossesExportPage = crossesExportPage || crosses(MAX_PAGE_SIZE);
      crossesScreenPage = crossesScreenPage || crosses(SCREEN_PAGE_SIZE);
    }
    expect(crossesExportPage, 'an equal-timestamp run spans an export page boundary').toBe(true);
    expect(crossesScreenPage, 'an equal-timestamp run spans a screen page boundary').toBe(true);

    // Tab counts are the table's own, holding at least the owned share.
    expect(first.counts.total).toBe(total);
    for (const status of LEAD_STATUS_VALUES) {
      expect(first.counts[status]).toBeGreaterThanOrEqual(BULK.expected.byStatus[status]);
    }

    // Newest and oldest owned contact on the owned set's first and last screen page.
    const lastPage = Math.ceil(BULK.count / SCREEN_PAGE_SIZE);
    const ownedFirst = await adminPage(admin, { search: BULK.searchToken, page: 1 });
    expect(ownedFirst.pagination.total).toBe(BULK.count);
    expect(ownedFirst.pagination.pageCount).toBe(lastPage);
    expect(ownedFirst.leads[0].id).toBe(bulkAt(BULK.expected.newestIndex).id);
    const ownedLast = await adminPage(admin, { search: BULK.searchToken, page: lastPage });
    expect(ownedLast.leads).toHaveLength(BULK.count - SCREEN_PAGE_SIZE * (lastPage - 1));
    expect(ownedLast.leads[ownedLast.leads.length - 1].id).toBe(bulkAt(BULK.expected.oldestIndex).id);
  });

  test('every status x program filter over the owned set answers exact ids, keeps every interest and leaves the tabs global', async () => {
    test.setTimeout(300_000);

    const baseline = await adminPage(admin, { pageSize: 1 });
    for (const status of [null, ...LEAD_STATUS_VALUES]) {
      for (const program of [null, ...PROGRAM_FILTERS]) {
        const label = `status=${status ?? 'all'} program=${program ?? 'all'}`;
        const expected = expectedOwned(status, program);
        expect(expected.length, `${label}: derivation vs hand-written count`).toBe(
          declaredCount(status, program)
        );

        const { rows, first } = await walkMatching(
          admin,
          filterParams(BULK.searchToken, status, program)
        );
        expect(first.pagination.total, label).toBe(expected.length);
        expect(rows.map((row) => row.id), label).toEqual(expected.map((contact) => contact.id));
        // The tabs never follow the filter.
        expect(first.counts, `${label}: tab counts`).toEqual(baseline.counts);

        // A contact matched by ONE interest still shows ALL of them, once.
        for (const row of rows) {
          expect(row.program_interests.map((interest) => interest.program), `${label} ${row.id}`).toEqual(
            BULK_BY_ID.get(row.id)!.programs
          );
          expect(row).not.toHaveProperty('program_match');
        }
      }
    }
  });

  test('combined search, hostile search text and no-match searches answer the hand-written ids', async () => {
    const baseline = await adminPage(admin, { pageSize: 1 });
    for (const entry of BULK.expected.searches) {
      const label = JSON.stringify(entry);
      const { rows, first } = await walkMatching(
        admin,
        filterParams(entry.search, entry.status, entry.program)
      );
      // The PostgREST-structure term would match every converted contact if it
      // escaped the search; it must match nothing at all.
      expect(rows.map((row) => row.id), label).toEqual(entry.indexes.map((index) => bulkAt(index).id));
      expect(first.pagination.total, label).toBe(entry.indexes.length);
      expect(first.counts, `${label}: tab counts`).toEqual(baseline.counts);
    }
  });

  test('the forced-password admin is refused on GET, export pages and PATCH by cookie and by a genuine bearer token, and nothing moves', async ({
    browser,
    baseURL,
  }) => {
    const target = bulkAt(1);
    expect(target.status, 'a contact a refused PATCH could otherwise move').toBe('new');
    const before = await soleLeadMatching(admin, target.email);
    expect(before.id).toBe(target.id);

    const cookie = await apiContextFor(browser, FORCED_PASSWORD_FIXTURE_KEY, baseURL!);
    const docente = await apiContextFor(browser, 'docente', baseURL!);
    const bearer = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${await genuineAccessToken(E2E_USERS[FORCED_PASSWORD_FIXTURE_KEY])}`,
      },
    });
    const adminBearer = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${await genuineAccessToken(E2E_USERS.admin)}` },
    });
    try {
      // Controls. The bearer path works for an unflagged admin, so a refusal below is
      // the password gate and not "bearer unsupported"; and a non-admin's 403 carries
      // no forced-change code, so the code below proves the admin decision passed.
      const control = await adminBearer.get(
        `${ADMIN_LEADS_ENDPOINT}?${new URLSearchParams({ search: target.email })}`
      );
      expect(control.status(), 'unflagged admin over bearer').toBe(200);
      expect(((await control.json()) as AdminLeadPage).leads.map((lead) => lead.id)).toEqual([target.id]);
      const nonAdmin = await docente.get(ADMIN_LEADS_ENDPOINT);
      expect(nonAdmin.status()).toBe(403);
      expect(((await nonAdmin.json()) as { code?: string }).code).not.toBe('PASSWORD_CHANGE_REQUIRED');

      const exportPage = `${ADMIN_LEADS_ENDPOINT}?${new URLSearchParams({
        search: BULK.searchToken,
        page: '2',
        pageSize: String(MAX_PAGE_SIZE),
      })}`;
      for (const [label, client] of [
        ['cookie', cookie],
        ['bearer', bearer],
      ] as const) {
        await expectHeldByPasswordGate(await client.get(ADMIN_LEADS_ENDPOINT), `${label} GET`);
        await expectHeldByPasswordGate(await client.get(exportPage), `${label} export page`);
        await expectHeldByPasswordGate(
          await client.patch(ADMIN_LEADS_ENDPOINT, {
            data: { id: target.id, notes: 'Nota sintetica que no debe guardarse' },
          }),
          `${label} notes PATCH`
        );
        await expectHeldByPasswordGate(
          await client.patch(ADMIN_LEADS_ENDPOINT, { data: { id: target.id, status: 'contacted' } }),
          `${label} status PATCH`
        );
      }
    } finally {
      await cookie.dispose();
      await docente.dispose();
      await bearer.dispose();
      await adminBearer.dispose();
    }

    // Nothing moved: same status, same notes, and not even the trigger's updated_at.
    const after = await soleLeadMatching(admin, target.email);
    expect(after.status).toBe(before.status);
    expect(after.notes ?? null).toBe(before.notes ?? null);
    expect(after.updated_at).toBe(before.updated_at);
  });

  test('the screen filters, pages and exports the owned set past 1000 rows, inertly (1366x768)', async ({
    browser,
  }) => {
    test.setTimeout(300_000);

    const baseline = await adminPage(admin, { pageSize: 1 });
    const context = await browser.newContext({
      storageState: await ensureStorageState(browser, 'admin'),
      viewport: { width: 1366, height: 768 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    try {
      await page.goto(LEADS_PAGE);
      const range = page.getByTestId('pasantia-leads-range');
      const tabCount = (key: string) => page.getByTestId(`pasantia-leads-tab-${key}`).locator('span');
      const expectGlobalTabs = async () => {
        await expect(tabCount('all')).toHaveText(String(baseline.counts.total));
        for (const status of LEAD_STATUS_VALUES) {
          await expect(tabCount(status)).toHaveText(String(baseline.counts[status]));
        }
      };

      // The owned set: 1205 contacts, 25 screen pages, newest first.
      const ownedPages = Math.ceil(BULK.count / SCREEN_PAGE_SIZE);
      await page.getByTestId('pasantia-leads-search').fill(BULK.searchToken);
      await expect(range).toContainText(`de ${BULK.count} contactos · Página 1 de ${ownedPages}`, {
        timeout: 60_000,
      });
      await expectGlobalTabs();
      await expect(
        page.getByTestId(`pasantia-lead-toggle-${bulkAt(BULK.expected.newestIndex).id}`)
      ).toBeVisible();

      await page.getByTestId('pasantia-leads-page-last').click();
      await expect(range).toContainText(`Página ${ownedPages} de ${ownedPages}`);
      await expect(
        page.getByTestId(`pasantia-lead-toggle-${bulkAt(BULK.expected.oldestIndex).id}`)
      ).toBeVisible();

      // The pager answers the keyboard.
      const previous = page.getByTestId('pasantia-leads-page-prev');
      await previous.focus();
      await expect(previous).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(range).toContainText(`Página ${ownedPages - 1} de ${ownedPages}`);

      // Exported from a page that is neither the first nor the last: every owned
      // contact, in the API's order, each cell as the descriptor says, and no bare CR.
      const all = await downloadCsv(page);
      expect(all.header).toEqual(CSV_HEADERS);
      expect(all.text.includes('\r'), 'a bare CR would split a row in a spreadsheet').toBe(false);
      expect(all.rows.map((row) => row.Email)).toEqual(BULK_ORDER.map((contact) => contact.email));
      const allByEmail = new Map(all.rows.map((row) => [row.Email, row]));
      for (const contact of BULK_ORDER) {
        const row = allByEmail.get(contact.email)!;
        for (const [column, value] of Object.entries(expectedCsvCells(contact))) {
          expect(row[column], `${contact.email} ${column}`).toBe(value);
        }
      }

      // One captured status x program filter set: exactly its 120 contacts, every
      // interest label kept on the both-interest ones, tabs still global.
      const converted = expectedOwned('converted', 'inspira');
      expect(converted).toHaveLength(BULK.expected.byStatusAndProgramFilter.converted.inspira);
      await page.getByTestId('pasantia-leads-tab-converted').click();
      await page.getByTestId('pasantia-leads-program-filter').selectOption('inspira');
      await expect(range).toContainText(
        `de ${converted.length} contactos · Página 1 de ${Math.ceil(converted.length / SCREEN_PAGE_SIZE)}`
      );
      await expectGlobalTabs();
      const filtered = await downloadCsv(page);
      expect(filtered.rows.map((row) => row.Email)).toEqual(converted.map((contact) => contact.email));
      const filteredByEmail = new Map(filtered.rows.map((row) => [row.Email, row]));
      for (const contact of converted) {
        const row = filteredByEmail.get(contact.email)!;
        expect(row.Programas).toBe(expectedProgramsCell(contact));
        expect(row.Estado).toBe(STATUS_LABELS.converted);
      }
      expect(filtered.rows.some((row) => row.Programas.includes('; '))).toBe(true);

      // No match: the empty state, and a CSV that is the header row and nothing else.
      await page.getByTestId('pasantia-leads-tab-all').click();
      await page.getByTestId('pasantia-leads-program-filter').selectOption('');
      await page.getByTestId('pasantia-leads-search').fill('lote-b004-sin-coincidencia');
      await expect(page.getByText('No hay leads que coincidan con los filtros.')).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId('pasantia-leads-pagination')).toHaveCount(0);
      const empty = await downloadCsv(page);
      expect(empty.header).toEqual(CSV_HEADERS);
      expect(empty.rows).toEqual([]);

      // Hostile text stays text: the stored markup renders verbatim and runs nothing.
      const hostile = bulkAt(12);
      const hostileFields = HOSTILE_BY_INDEX.get(hostile.index)!.fields;
      await page.getByTestId('pasantia-leads-search').fill("O'Higgins'");
      await expect(range).toContainText('de 1 contacto ·', { timeout: 30_000 });
      await page.getByTestId(`pasantia-lead-toggle-${hostile.id}`).click();
      await expect(page.getByTestId(`desktop-lead-message-${hostile.id}`)).toHaveText(
        hostileFields.message
      );
      await expect(page.getByRole('main')).toContainText(hostileFields.role_title);
      await expect(page.locator('img[src="x"]')).toHaveCount(0);
      await expect(page.locator('script', { hasText: '__b004xss' })).toHaveCount(0);
      expect(
        await page.evaluate(() => (window as unknown as { __b004xss?: unknown }).__b004xss)
      ).toBeUndefined();
      expect(dialogs).toEqual([]);
    } finally {
      await context.close();
    }
  });

  for (const viewport of [
    {
      name: 'desktop',
      width: 1366,
      height: 768,
      labels: 'pasantia-lead-programs-',
      toggle: 'pasantia-lead-toggle-',
      card: 'desktop-',
    },
    {
      name: 'mobile',
      width: 390,
      height: 844,
      labels: 'pasantia-lead-programs-mobile-',
      toggle: 'pasantia-lead-toggle-mobile-',
      card: 'mobile-',
    },
  ]) {
    test(`the ${viewport.name} list labels every program kind of the owned set (${viewport.width}x${viewport.height})`, async ({
      browser,
    }) => {
      const entry = BULK.expected.searches.find(
        (candidate) => candidate.search === 'Lote 012' && !candidate.status && !candidate.program
      )!;
      const contacts = entry.indexes.map((index) => bulkAt(index));
      // The ten contacts carry all five kinds — checked, not assumed.
      expect(new Set(contacts.map((contact) => contact.kind)).size).toBe(BULK.kinds.length);

      const context = await browser.newContext({
        storageState: await ensureStorageState(browser, 'admin'),
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      try {
        await page.goto(LEADS_PAGE);
        await page.getByTestId('pasantia-leads-search').fill(entry.search);
        await expect(page.getByTestId('pasantia-leads-range')).toContainText(
          `de ${contacts.length} contactos ·`,
          { timeout: 30_000 }
        );

        for (const contact of contacts) {
          const labels = page.getByTestId(`${viewport.labels}${contact.id}`);
          await expect(labels, contact.id).toBeVisible();
          for (const program of ['inspira', 'mirada-profunda'] as const) {
            await expect(
              labels.getByText(PROGRAM_NAMES[program], { exact: true }),
              `${contact.id} ${program}`
            ).toHaveCount(contact.programs.includes(program) ? 1 : 0);
          }
          if (contact.kind === 'historical') {
            await expect(labels).toContainText(`Histórico (cohorte ${contact.cohort})`);
          } else if (contact.kind === 'unclassified') {
            await expect(labels).toContainText('Sin clasificar');
          } else {
            await expect(labels).not.toContainText('sin programa registrado');
          }
        }

        // The detail card lists both interests of a both-interest contact, each its own row.
        const both = contacts.find((contact) => contact.kind === 'both')!;
        await page.getByTestId(`${viewport.toggle}${both.id}`).click();
        for (const program of both.programs) {
          await expect(
            page.getByTestId(`${viewport.card}lead-program-${program}-${both.id}`)
          ).toContainText(PROGRAM_NAMES[program]);
        }
      } finally {
        await context.close();
      }
    });
  }
});
