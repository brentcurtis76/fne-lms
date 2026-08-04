// @vitest-environment node
/**
 * POST /api/pasantias/lead — the public Pasantías interest form.
 *
 * The service-role client is faked at the `lib/api-auth` boundary (the table
 * grants no anon/authenticated write at all, so there is no lighter seam), and
 * the assertions are made against the column payloads the route hands to
 * Supabase — that is where the D-12 consent shapes and the D-03 transition
 * decision actually become visible. Resend is mocked; the real `lib/rateLimit`
 * limiter runs, so every case that must not be throttled uses its own IP.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { COHORT_ID } from '../../lib/pasantias/cohort-public';
import { PRIVACY_NOTICE_VERSION } from '../../lib/legal/privacy-notice';
import { LEAD_VALIDATION_MESSAGES } from '../../lib/pasantias/leads';
import { LEAD_NOTIFICATION_RECIPIENT } from '../../lib/pasantias/emails';

const { mockSend, mockResendCtor, mockCreateServiceRoleClient, mockBuildAbsoluteUrl } = vi.hoisted(
  () => {
    const send = vi.fn();
    return {
      mockSend: send,
      mockResendCtor: vi.fn(() => ({ emails: { send } })),
      mockCreateServiceRoleClient: vi.fn(),
      mockBuildAbsoluteUrl: vi.fn(),
    };
  }
);

vi.mock('resend', () => ({ Resend: mockResendCtor }));

// Only `buildAbsoluteUrl` is replaced — it is the one call in the auto-reply's
// preparation that can throw (no configured production origin), and a test has
// to be able to make it do so.
vi.mock('../../lib/utils/app-url', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, buildAbsoluteUrl: mockBuildAbsoluteUrl };
});

vi.mock('../../lib/api-auth', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}));

vi.mock('../../lib/securityAuditLog', () => ({
  logSecurityIncident: vi.fn(),
}));

import handler from '../../pages/api/pasantias/lead';

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface ExistingRow {
  id: string;
  status: string;
  marketing_opt_in: boolean;
  brochure_sent_at: string | null;
}

interface UpdateRecord {
  payload: Record<string, unknown>;
  /** `.eq()` filters. */
  filters: Record<string, unknown>;
  /** `.is(column, null)` — only the unsent half of the claim uses it. */
  isNull: string | null;
  /** `.lt(column, value)` — only the expired half of the claim uses it. */
  lessThan: { column: string; value: string } | null;
  /** A claim asks for rows back; every other write does not. */
  kind: 'write' | 'claim';
}

/**
 * Minimal stand-in for the supabase-js chains this route uses:
 * `select().eq().eq().maybeSingle()`, `insert().select().maybeSingle()`,
 * `update().eq()`, and the two halves of the auto-reply claim,
 * `update().eq().is().select()` and `update().eq().lt().select()`.
 *
 * The claim is EVALUATED, not scripted. The fake keeps the real
 * `brochure_sent_at` per row and applies each statement's own predicate to it,
 * so a test cannot pass by replaying a canned "you won" — the route has to
 * issue a statement that genuinely matches. That is what makes the
 * two-simultaneous-submissions case mean anything: the second request loses
 * because the first already moved the column, exactly as PostgreSQL would
 * decide it.
 *
 * ISO-8601 UTC strings compare lexicographically in timestamp order, which is
 * what lets `<` stand in for the SQL comparison.
 */
function createSupabase(
  options: {
    selects?: QueryResult[];
    insert?: QueryResult;
    update?: QueryResult;
    /** Forces both claim statements to error, for the failure path. */
    claimError?: unknown;
  } = {}
) {
  const selectQueue = [...(options.selects ?? [{ data: null, error: null }])];
  const inserts: Array<Record<string, unknown>> = [];
  const updates: UpdateRecord[] = [];
  const selectFilters: Array<Record<string, unknown>> = [];
  /** `brochure_sent_at` as the database would hold it, keyed by row id. */
  const sentAt = new Map<string, string | null>();

  function nextSelect(): QueryResult {
    const result =
      selectQueue.length > 1
        ? (selectQueue.shift() as QueryResult)
        : selectQueue[0] ?? { data: null, error: null };
    const row = result.data as ExistingRow | null;
    if (row?.id && !sentAt.has(row.id)) {
      sentAt.set(row.id, row.brochure_sent_at);
    }
    return result;
  }

  /** Apply one claim/release statement to the stored value. */
  function runGuardedWrite(record: UpdateRecord): QueryResult {
    if (options.claimError) {
      return { data: null, error: options.claimError };
    }

    const id = record.filters.id as string;
    if (!sentAt.has(id)) {
      sentAt.set(id, null);
    }
    const current = sentAt.get(id) ?? null;

    let matches: boolean;
    if (record.isNull) {
      matches = current === null;
    } else if (record.lessThan) {
      matches = current !== null && current < record.lessThan.value;
    } else {
      // The release: guarded on the claim still being ours.
      matches = current === record.filters.brochure_sent_at;
    }

    if (!matches) {
      return { data: [], error: null };
    }

    sentAt.set(id, (record.payload.brochure_sent_at ?? null) as string | null);
    return { data: [{ id }], error: null };
  }

  const from = vi.fn(() => ({
    select: () => {
      const filters: Record<string, unknown> = {};
      const chain = {
        eq(column: string, value: unknown) {
          filters[column] = value;
          return chain;
        },
        maybeSingle: async () => {
          selectFilters.push(filters);
          return nextSelect();
        },
      };
      return chain;
    },
    insert: (payload: Record<string, unknown>) => {
      inserts.push(payload);
      return {
        select: () => ({
          maybeSingle: async () => {
            const result = options.insert ?? {
              data: {
                id: 'lead-new',
                status: 'new',
                marketing_opt_in: payload.marketing_opt_in ?? false,
                brochure_sent_at: null,
              },
              error: null,
            };
            const row = result.data as ExistingRow | null;
            if (row?.id && !sentAt.has(row.id)) {
              sentAt.set(row.id, row.brochure_sent_at);
            }
            return result;
          },
        }),
      };
    },
    update: (payload: Record<string, unknown>) => {
      const record: UpdateRecord = {
        payload,
        filters: {},
        isNull: null,
        lessThan: null,
        kind: 'write',
      };
      let recorded = false;
      const commit = () => {
        if (!recorded) {
          recorded = true;
          updates.push(record);
        }
      };

      const builder = {
        eq(column: string, value: unknown) {
          record.filters[column] = value;
          return builder;
        },
        is(column: string, value: unknown) {
          if (value === null) {
            record.isNull = column;
          }
          return builder;
        },
        lt(column: string, value: string) {
          record.lessThan = { column, value };
          return builder;
        },
        select() {
          record.kind = 'claim';
          const settle = async () => {
            commit();
            return runGuardedWrite(record);
          };
          // The route awaits `.select('id')` directly; `.maybeSingle()` is kept
          // so a future caller of either shape is covered.
          return Object.assign(
            { maybeSingle: settle },
            { then: (ok?: (v: QueryResult) => unknown, no?: (e: unknown) => unknown) => settle().then(ok, no) }
          );
        },
        // Awaiting the builder is what a plain `update().eq()` does.
        then(
          onFulfilled?: (value: QueryResult) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) {
          commit();
          // The claim release is a plain write, but it is still guarded on the
          // stored value, so it goes through the same evaluation.
          const result =
            'brochure_sent_at' in record.filters
              ? runGuardedWrite(record)
              : options.update ?? { data: null, error: null };
          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  }));

  const client = { from };
  mockCreateServiceRoleClient.mockReturnValue(client);
  return { client, inserts, updates, selectFilters, sentAt };
}

function existingRow(overrides: Partial<ExistingRow> = {}): ExistingRow {
  return {
    id: 'lead-1',
    status: 'new',
    marketing_opt_in: false,
    brochure_sent_at: null,
    ...overrides,
  };
}

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter % 250}:${ipCounter}`;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    cohort: COHORT_ID,
    firstName: 'Ana',
    lastName: 'Pérez',
    email: 'Ana@Example.com',
    institution: 'Colegio Uno',
    consent: true,
    ...overrides,
  };
}

async function run(
  body: Record<string, unknown> | undefined,
  opts: { method?: string; ip?: string } = {}
) {
  const { req, res } = createMocks({
    method: opts.method ?? 'POST',
    body,
    headers: { 'x-forwarded-for': opts.ip ?? nextIp() },
  });
  await handler(req as never, res as never);
  return { req, res };
}

/** The payload of the message sent to a given recipient, if any. */
function mailTo(to: string): Record<string, string> | undefined {
  return mockSend.mock.calls
    .map((call) => call[0] as Record<string, string>)
    .find((payload) => payload.to === to);
}

const LEAD_EMAIL = 'ana@example.com';

beforeEach(() => {
  vi.clearAllMocks();
  mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
  mockBuildAbsoluteUrl.mockImplementation((path: string) => `https://nuevaeducacion.org${path}`);
  vi.stubEnv('RESEND_API_KEY', 'test-resend-key');
  vi.stubEnv('EMAIL_FROM_ADDRESS', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('method, rate limit and honeypot [A1]', () => {
  it('rejects non-POST with 405 and touches nothing', async () => {
    const supabase = createSupabase();
    const { res } = await run(undefined, { method: 'GET' });

    expect(res._getStatusCode()).toBe(405);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(supabase.inserts).toHaveLength(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('throttles the sixth request from the same IP inside the window', async () => {
    createSupabase();
    const ip = '198.51.100.251:rate';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { res } = await run(validBody(), { ip });
      expect(res._getStatusCode()).toBe(200);
    }

    const { res } = await run(validBody(), { ip });
    expect(res._getStatusCode()).toBe(429);
  });

  it('honeypot: returns the ordinary success body and stores nothing', async () => {
    const supabase = createSupabase();
    const { res } = await run(validBody({ website: 'http://spam.example' }));

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(supabase.inserts).toHaveLength(0);
    expect(supabase.updates).toHaveLength(0);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('validation [A2]', () => {
  it('returns 400 with per-field es-CL errors and inserts nothing', async () => {
    const supabase = createSupabase();
    const { res } = await run({});

    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.fields).toEqual({
      firstName: LEAD_VALIDATION_MESSAGES.firstNameRequired,
      lastName: LEAD_VALIDATION_MESSAGES.lastNameRequired,
      email: LEAD_VALIDATION_MESSAGES.emailRequired,
      institution: LEAD_VALIDATION_MESSAGES.institutionRequired,
      consent: LEAD_VALIDATION_MESSAGES.consentRequired,
      cohort: LEAD_VALIDATION_MESSAGES.cohortInvalid,
    });
    expect(supabase.inserts).toHaveLength(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('rejects a cohort that is not the running one', async () => {
    const supabase = createSupabase();
    const { res } = await run(validBody({ cohort: 'abril-2026' }));

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().fields.cohort).toBe(LEAD_VALIDATION_MESSAGES.cohortInvalid);
    expect(supabase.inserts).toHaveLength(0);
  });

  it('rejects a submission without the required processing consent', async () => {
    const supabase = createSupabase();
    const { res } = await run(validBody({ consent: false }));

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().fields.consent).toBe(LEAD_VALIDATION_MESSAGES.consentRequired);
    expect(supabase.inserts).toHaveLength(0);
  });
});

describe('insert path and split consent [A3][A4]', () => {
  it('inserts a new lead with the full column set and the required consent evidence', async () => {
    const supabase = createSupabase();
    const before = Date.now();
    const { res } = await run(
      validBody({
        phone: '+56 9 1111 2222',
        roleTitle: 'Directora',
        numPeople: 4,
        message: 'Queremos ir en equipo.',
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'inspira-oct',
      })
    );

    expect(res._getStatusCode()).toBe(200);
    expect(supabase.inserts).toHaveLength(1);

    const payload = supabase.inserts[0];
    expect(payload).toMatchObject({
      cohort: COHORT_ID,
      status: 'new',
      first_name: 'Ana',
      last_name: 'Pérez',
      email: 'Ana@Example.com',
      email_normalized: LEAD_EMAIL,
      institution: 'Colegio Uno',
      phone: '+56 9 1111 2222',
      role_title: 'Directora',
      num_people: 4,
      message: 'Queremos ir en equipo.',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'inspira-oct',
      consent_notice_version: PRIVACY_NOTICE_VERSION,
    });

    // Server clock, not anything the caller sent.
    const acceptedAt = Date.parse(payload.consent_accepted_at as string);
    expect(acceptedAt).toBeGreaterThanOrEqual(before);
    expect(acceptedAt).toBeLessThanOrEqual(Date.now());
  });

  it('dedups on (email_normalized, cohort)', async () => {
    const supabase = createSupabase();
    await run(validBody());

    expect(supabase.selectFilters[0]).toEqual({
      email_normalized: LEAD_EMAIL,
      cohort: COHORT_ID,
    });
  });

  it('writes the false marketing shape when nobody opted in', async () => {
    const supabase = createSupabase();
    await run(validBody());

    expect(supabase.inserts[0]).toMatchObject({
      marketing_opt_in: false,
      marketing_opt_in_at: null,
      marketing_notice_version: null,
    });
  });

  it('writes the complete true marketing shape when the person opted in', async () => {
    const supabase = createSupabase();
    await run(validBody({ marketingOptIn: true }));

    const payload = supabase.inserts[0];
    expect(payload.marketing_opt_in).toBe(true);
    expect(typeof payload.marketing_opt_in_at).toBe('string');
    expect(payload.marketing_notice_version).toBe(PRIVACY_NOTICE_VERSION);
    // The table CHECK accepts only these two shapes — never a half-set row.
    expect(Number.isNaN(Date.parse(payload.marketing_opt_in_at as string))).toBe(false);
  });

  it('returns 500 when the insert fails for a reason other than a duplicate', async () => {
    createSupabase({ insert: { data: null, error: { code: '23502' } } });
    const { res } = await run(validBody());

    expect(res._getStatusCode()).toBe(500);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns 503 when the table is missing', async () => {
    createSupabase({ selects: [{ data: null, error: { code: '42P01' } }] });
    const { res } = await run(validBody());

    expect(res._getStatusCode()).toBe(503);
  });
});

describe('duplicate path is indistinguishable from the new path [A4]', () => {
  it('returns the identical 200 body for a first-time and a repeat submission', async () => {
    createSupabase();
    const first = await run(validBody());

    createSupabase({ selects: [{ data: existingRow(), error: null }] });
    const repeat = await run(validBody());

    expect(first.res._getStatusCode()).toBe(repeat.res._getStatusCode());
    expect(first.res._getJSONData()).toEqual(repeat.res._getJSONData());
    expect(repeat.res._getJSONData()).toEqual({ success: true });
  });

  it('updates the contact fields of an existing lead', async () => {
    const supabase = createSupabase({ selects: [{ data: existingRow(), error: null }] });
    await run(validBody({ institution: 'Colegio Dos', phone: '+56 9 3333 4444' }));

    expect(supabase.inserts).toHaveLength(0);
    const update = supabase.updates[0];
    expect(update.filters).toEqual({ id: 'lead-1' });
    expect(update.payload).toMatchObject({
      institution: 'Colegio Dos',
      phone: '+56 9 3333 4444',
      consent_notice_version: PRIVACY_NOTICE_VERSION,
    });
  });

  it('treats a 23505 race as the duplicate path and still answers 200', async () => {
    const supabase = createSupabase({
      selects: [
        { data: null, error: null },
        { data: existingRow({ id: 'lead-raced' }), error: null },
      ],
      insert: { data: null, error: { code: '23505' } },
    });

    const { res } = await run(validBody());

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(supabase.updates[0].filters).toEqual({ id: 'lead-raced' });
  });
});

describe('status transitions are decided by canTransitionLead [A6]', () => {
  it('re-opens a dismissed lead (dismissed → new is a legal edge)', async () => {
    const supabase = createSupabase({
      selects: [{ data: existingRow({ status: 'dismissed' }), error: null }],
    });
    await run(validBody());

    expect(supabase.updates[0].payload.status).toBe('new');
  });

  for (const status of ['new', 'contacted', 'converted']) {
    it(`leaves the status column unwritten for a ${status} lead`, async () => {
      const supabase = createSupabase({
        selects: [{ data: existingRow({ status }), error: null }],
      });
      await run(validBody());

      expect(supabase.updates[0].payload).not.toHaveProperty('status');
    });
  }
});

describe('marketing opt-in is never silently cleared [A5]', () => {
  it('leaves an existing opt-in untouched when the box is unchecked', async () => {
    const supabase = createSupabase({
      selects: [{ data: existingRow({ marketing_opt_in: true }), error: null }],
    });
    await run(validBody({ marketingOptIn: false }));

    const payload = supabase.updates[0].payload;
    expect(payload).not.toHaveProperty('marketing_opt_in');
    expect(payload).not.toHaveProperty('marketing_opt_in_at');
    expect(payload).not.toHaveProperty('marketing_notice_version');
  });

  it('sets the opt-in with fresh evidence when the box is checked', async () => {
    const supabase = createSupabase({
      selects: [{ data: existingRow({ marketing_opt_in: false }), error: null }],
    });
    await run(validBody({ marketingOptIn: true }));

    const payload = supabase.updates[0].payload;
    expect(payload.marketing_opt_in).toBe(true);
    expect(typeof payload.marketing_opt_in_at).toBe('string');
    expect(payload.marketing_notice_version).toBe(PRIVACY_NOTICE_VERSION);
  });

  it('refreshes the evidence when an opted-in lead opts in again', async () => {
    const supabase = createSupabase({
      selects: [{ data: existingRow({ marketing_opt_in: true }), error: null }],
    });
    await run(validBody({ marketingOptIn: true }));

    expect(supabase.updates[0].payload.marketing_opt_in).toBe(true);
    expect(typeof supabase.updates[0].payload.marketing_opt_in_at).toBe('string');
  });

  // The interleaving the previous shape lost: this request SELECTs `false`,
  // another request stores a true, and only then does this UPDATE run. The
  // payload must carry no marketing key at all, so the outcome cannot depend on
  // when the two statements interleave — a stale submission is structurally
  // incapable of clearing the flag rather than merely unlikely to.
  it('cannot clear an opt-in stored after its own snapshot was taken', async () => {
    const supabase = createSupabase({
      selects: [{ data: existingRow({ marketing_opt_in: false }), error: null }],
    });
    await run(validBody({ marketingOptIn: false }));

    const payload = supabase.updates[0].payload;
    expect(payload).not.toHaveProperty('marketing_opt_in');
    expect(payload).not.toHaveProperty('marketing_opt_in_at');
    expect(payload).not.toHaveProperty('marketing_notice_version');
  });

  // Same guarantee from the other side: no snapshot value produces a different
  // update payload, so nothing about the earlier SELECT can reach the write.
  it('writes the same marketing-free update whatever the snapshot said', async () => {
    const payloads = [];
    for (const snapshot of [true, false]) {
      const supabase = createSupabase({
        selects: [{ data: existingRow({ marketing_opt_in: snapshot }), error: null }],
      });
      await run(validBody({ marketingOptIn: false }));
      payloads.push(supabase.updates[0].payload);
    }

    expect(Object.keys(payloads[0]).sort()).toEqual(Object.keys(payloads[1]).sort());
    expect(Object.keys(payloads[0]).filter((key) => key.startsWith('marketing_'))).toEqual([]);
  });
});

describe('source_path attribution', () => {
  it('persists an accepted same-site path on insert', async () => {
    const supabase = createSupabase();
    const { res } = await run(validBody({ sourcePath: '/pasantias?utm_source=ig' }));

    expect(res._getStatusCode()).toBe(200);
    expect(supabase.inserts[0].source_path).toBe('/pasantias?utm_source=ig');
  });

  it('writes null on insert when no path was reported', async () => {
    const supabase = createSupabase();
    await run(validBody());

    expect(supabase.inserts[0]).toHaveProperty('source_path', null);
  });

  // The value is browser-reported, so an off-site or injected shape is dropped
  // to null — never stored, and never a 400 the visitor cannot act on.
  for (const value of [
    'https://evil.example',
    '//evil.example',
    'javascript:alert(1)',
    '/pasantias\r\nX-Injected: 1',
    `/${'a'.repeat(400)}`,
  ]) {
    it(`drops ${JSON.stringify(value).slice(0, 40)} without failing the submission`, async () => {
      const supabase = createSupabase();
      const { res } = await run(validBody({ sourcePath: value }));

      expect(res._getStatusCode()).toBe(200);
      expect(supabase.inserts[0].source_path).toBeNull();
    });
  }

  it('refreshes the stored path when a resubmission reports one', async () => {
    const supabase = createSupabase({ selects: [{ data: existingRow(), error: null }] });
    await run(validBody({ sourcePath: '/pasantias/barcelona' }));

    expect(supabase.updates[0].payload.source_path).toBe('/pasantias/barcelona');
  });

  // Never overwrite a stored value with null: leaving the column out of the
  // UPDATE payload is what preserves the original attribution.
  for (const [label, value] of [
    ['the field is absent', undefined],
    ['the reported value was refused', 'https://evil.example'],
  ] as const) {
    it(`leaves source_path unwritten on update when ${label}`, async () => {
      const supabase = createSupabase({ selects: [{ data: existingRow(), error: null }] });
      await run(validBody(value === undefined ? {} : { sourcePath: value }));

      expect(supabase.updates[0].payload).not.toHaveProperty('source_path');
    });
  }
});

describe('auto-reply and internal notification [A7]', () => {
  it('sends both messages and stamps brochure_sent_at on auto-reply success', async () => {
    const supabase = createSupabase();
    const { res } = await run(validBody());

    expect(res._getStatusCode()).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(2);

    const autoReply = mailTo('Ana@Example.com');
    expect(autoReply).toBeDefined();
    expect(autoReply?.html).toContain('/api/pasantias/brochure');

    const notification = mailTo(LEAD_NOTIFICATION_RECIPIENT);
    expect(notification).toBeDefined();
    expect(notification?.html).toContain('Colegio Uno');

    // The stamp is the CLAIM, taken before the send — and it is the only write
    // to the column, because a successful send never releases it. A never-sent
    // lead is claimed by the `IS NULL` half, so the second half never runs.
    const claims = supabase.updates.filter((entry) => entry.kind === 'claim');
    expect(claims).toHaveLength(1);
    expect(typeof claims[0].payload.brochure_sent_at).toBe('string');
    expect(claims[0].filters).toEqual({ id: 'lead-new' });
    expect(claims[0].isNull).toBe('brochure_sent_at');
    expect(supabase.updates.filter((entry) => 'brochure_sent_at' in entry.payload)).toHaveLength(1);
  });

  // The bug this shape exists to avoid: PostgREST accepts an `or` filter on
  // SELECT but rejects it on UPDATE for non-PK columns, so a claim written that
  // way passes every fake and fails only in production (see the incident note on
  // `lib/bots/store.ts:claimSessionTransition`). Each claim statement must carry
  // exactly one predicate.
  it('claims with single-predicate statements, never an `or` filter', async () => {
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const supabase = createSupabase({
      selects: [{ data: existingRow({ brochure_sent_at: longAgo }), error: null }],
    });
    await run(validBody());

    const claims = supabase.updates.filter((entry) => entry.kind === 'claim');
    expect(claims).toHaveLength(2);
    expect(claims[0].isNull).toBe('brochure_sent_at');
    expect(claims[0].lessThan).toBeNull();
    expect(claims[1].lessThan?.column).toBe('brochure_sent_at');
    expect(claims[1].isNull).toBeNull();
    for (const claim of claims) {
      expect(Object.keys(claim.filters)).toEqual(['id']);
    }
  });

  it('is the FNE frame, not the Genera emailLayout', async () => {
    createSupabase();
    await run(validBody());

    const autoReply = mailTo('Ana@Example.com');
    expect(autoReply?.html).toContain('Fundación Nueva Educación');
    expect(autoReply?.html).not.toContain('HUB DE TRANSFORMACIÓN');
  });

  it('carries no prices (D-02)', async () => {
    createSupabase();
    await run(validBody());

    const autoReply = mailTo('Ana@Example.com');
    expect(autoReply?.html).not.toMatch(/€|\bEUR\b|\bUSD\b|\$\s?\d/);
  });

  it('does not re-send the auto-reply inside the 24h window, but still notifies', async () => {
    // The window belongs to whoever holds the claim, so the refusal comes back
    // from the conditional UPDATE, not from a decision made in this process.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const supabase = createSupabase({
      selects: [{ data: existingRow({ brochure_sent_at: oneHourAgo }), error: null }],
    });
    const { res } = await run(validBody());

    expect(res._getStatusCode()).toBe(200);
    expect(mailTo('Ana@Example.com')).toBeUndefined();
    expect(mailTo(LEAD_NOTIFICATION_RECIPIENT)).toBeDefined();
    // Both halves were tried and neither matched; the stored value is untouched.
    expect(supabase.updates.filter((entry) => entry.kind === 'claim')).toHaveLength(2);
    expect(supabase.sentAt.get('lead-1')).toBe(oneHourAgo);
  });

  it('re-sends the auto-reply once the window has passed', async () => {
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    createSupabase({
      selects: [{ data: existingRow({ brochure_sent_at: longAgo }), error: null }],
    });
    await run(validBody());

    expect(mailTo('Ana@Example.com')).toBeDefined();
  });

  it('two simultaneous submissions produce exactly one auto-reply', async () => {
    // Both requests read the same row and see the same null `brochure_sent_at`
    // — the interleaving the old read-then-write shape could not survive. Only
    // one of them wins the conditional UPDATE, so only one message goes out.
    const supabase = createSupabase({
      selects: [{ data: existingRow(), error: null }],
    });

    const [first, second] = await Promise.all([run(validBody()), run(validBody())]);

    expect(first.res._getStatusCode()).toBe(200);
    expect(second.res._getStatusCode()).toBe(200);

    const autoReplies = mockSend.mock.calls
      .map((call) => call[0] as Record<string, string>)
      .filter((payload) => payload.to === 'Ana@Example.com');
    expect(autoReplies).toHaveLength(1);

    // FNE still gets both internal notifications — only the auto-reply dedups.
    expect(
      mockSend.mock.calls.filter(
        (call) => (call[0] as Record<string, string>).to === LEAD_NOTIFICATION_RECIPIENT
      )
    ).toHaveLength(2);
  });

  it('skips the auto-reply rather than risking a duplicate when a claim errors', async () => {
    const supabase = createSupabase({
      selects: [{ data: existingRow(), error: null }],
      claimError: { code: '42501', message: 'permission denied' },
    });
    const { res } = await run(validBody());

    expect(res._getStatusCode()).toBe(200);
    expect(mailTo('Ana@Example.com')).toBeUndefined();
    expect(mailTo(LEAD_NOTIFICATION_RECIPIENT)).toBeDefined();
    // The first statement's error ends the claim — a failed guard is never
    // retried past, because "we could not tell" must not read as "go ahead".
    expect(supabase.updates.filter((entry) => entry.kind === 'claim')).toHaveLength(1);
  });

  it('releases the claim without RESEND_API_KEY: still 200, nothing sent', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const supabase = createSupabase();
    const { res } = await run(validBody());

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(mockSend).not.toHaveBeenCalled();

    // Nothing left the process, so the window re-opens: the release restores
    // what the row held, guarded on the claim still being ours.
    const release = supabase.updates.filter((entry) => entry.kind === 'write').at(-1);
    expect(release?.payload).toEqual({ brochure_sent_at: null });
    expect(Object.keys(release?.filters ?? {})).toEqual(['id', 'brochure_sent_at']);
  });

  it('releases the claim when Resend answers with an error: still 200', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'nope' } });
    const supabase = createSupabase();
    const { res } = await run(validBody());

    expect(res._getStatusCode()).toBe(200);
    const release = supabase.updates.filter((entry) => entry.kind === 'write').at(-1);
    expect(release?.payload).toEqual({ brochure_sent_at: null });
  });

  it('KEEPS the claim when the mail transport throws — the outcome is unknown', async () => {
    // Resend may already hold the message, so re-opening the window could mail
    // the person twice. [A7] is an upper bound: hold the claim instead.
    mockSend.mockRejectedValue(new Error('socket hang up'));
    const supabase = createSupabase();
    const { res } = await run(validBody());

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(
      supabase.updates.filter(
        (entry) => entry.kind === 'write' && 'brochure_sent_at' in entry.payload
      )
    ).toHaveLength(0);
  });

  it('still notifies FNE when preparing the auto-reply throws', async () => {
    // `buildAbsoluteUrl` throws with no configured production origin. That is
    // the auto-reply's problem alone — the internal notification is independent.
    mockBuildAbsoluteUrl.mockImplementation(() => {
      throw new Error('NEXT_PUBLIC_APP_URL missing');
    });
    const supabase = createSupabase();
    const { res } = await run(validBody());

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(mailTo(LEAD_NOTIFICATION_RECIPIENT)).toBeDefined();
    expect(mailTo('Ana@Example.com')).toBeUndefined();
    // The URL is resolved before the claim, so the throw costs no window.
    expect(supabase.updates.filter((entry) => entry.kind === 'claim')).toHaveLength(0);
  });
});

describe('hostile input is escaped at every interpolation [A7]', () => {
  const HOSTILE = '<script>alert(1)</script>';

  it('escapes the name in both messages', async () => {
    createSupabase();
    await run(validBody({ firstName: HOSTILE }));

    for (const payload of mockSend.mock.calls.map((call) => call[0] as Record<string, string>)) {
      expect(payload.html).not.toContain('<script>');
      expect(payload.html).toContain('&lt;script&gt;');
    }
  });

  it('escapes institution, role, phone and message in the notification', async () => {
    createSupabase();
    await run(
      validBody({
        institution: `Colegio ${HOSTILE}`,
        roleTitle: `"><img src=x onerror=alert(1)>`,
        phone: `<b>+56</b>`,
        message: `hola ${HOSTILE}`,
      })
    );

    const notification = mailTo(LEAD_NOTIFICATION_RECIPIENT);
    expect(notification?.html).not.toContain('<script>');
    expect(notification?.html).not.toContain('<img src=x');
    expect(notification?.html).not.toContain('<b>+56</b>');
    expect(notification?.html).toContain('&lt;script&gt;');
  });

  it('keeps line breaks out of the subject lines', async () => {
    createSupabase();
    await run(validBody({ firstName: 'Ana\nBcc: victim@example.com', institution: 'Uno\r\nDos' }));

    for (const payload of mockSend.mock.calls.map((call) => call[0] as Record<string, string>)) {
      expect(payload.subject).not.toMatch(/[\r\n]/);
    }
  });
});
