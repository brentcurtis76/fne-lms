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
 *
 * January (PASANT-B002b) goes through `supabase.rpc`; the fake evaluates a
 * model of the three accepted functions (see `createSupabase`). Those cases
 * check the route's contract with the RPCs — exact arguments, one call per
 * submission, the claim/settle sequence — and are no evidence for the SQL.
 *
 * Since PASANT-B003 the public cohort IS January, so the active fixture
 * (`validBody()`) is a January submission with one program, and every valid
 * POST takes the RPC path. The route still carries its single-track branch
 * (October's insert/update, triage re-open, marketing never cleared,
 * `brochure_sent_at` claim and release); that branch is unreachable while the
 * public cohort requires a program, but it is kept, not deleted, and so are the
 * tests that pin it. They run through `useLegacySingleTrack()`, which makes the
 * public module report the retired single-track cohort for those describes
 * only — a test seam, documented here, that changes no product code.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

/** Whether the public cohort reads as the retired single-track one (legacy describes only). */
const legacyCohort = vi.hoisted(() => ({ active: false }));

vi.mock('../../lib/pasantias/cohort-public', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const mocked: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) {
    Object.defineProperty(mocked, key, {
      enumerable: true,
      configurable: true,
      get: () => (key === 'COHORT_ID' && legacyCohort.active ? 'octubre-2026' : actual[key]),
    });
  }
  return mocked;
});

/**
 * Run the enclosing describe against the route's single-track branch: the
 * public cohort reads as `octubre-2026` and `validBody()` carries no program.
 */
function useLegacySingleTrack(): void {
  beforeEach(() => {
    legacyCohort.active = true;
  });
  afterEach(() => {
    legacyCohort.active = false;
  });
}

// A namespace import, read as `cohortPublic.COHORT_ID` on every use. Vitest
// rewrites a named import in a file that calls `vi.mock` into a one-time
// destructure, which would freeze the getter above at module evaluation (when
// the seam is off) and leave the fixture posting January inside the legacy
// describes. The namespace keeps the mocked module object, so reads stay live.
import * as cohortPublic from '../../lib/pasantias/cohort-public';
import { PRIVACY_NOTICE_VERSION } from '../../lib/legal/privacy-notice';
import { JANUARY_COHORT_ID, LEAD_VALIDATION_MESSAGES } from '../../lib/pasantias/leads';
import {
  JANUARY_COHORT_LABEL,
  JANUARY_PROGRAM_NAMES,
  LEAD_NOTIFICATION_RECIPIENT,
} from '../../lib/pasantias/emails';

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
/** One recorded `supabase.rpc(name, args)` call. */
interface RpcCall {
  name: string;
  args: Record<string, unknown>;
  /** What the fake answered. */
  result?: QueryResult;
}

/** The fake's copy of one `pasantias_lead_program_interests` row's reply columns. */
interface InterestState {
  id: string;
  leadId: string;
  program: string;
  /** Epoch ms of the fake clock; null when never claimed. */
  replyClaimedAt: number | null;
  token: string | null;
  previous: number | null;
  providerAcceptedAt: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function createSupabase(
  options: {
    selects?: QueryResult[];
    insert?: QueryResult;
    update?: QueryResult;
    /** Forces both claim statements to error, for the failure path. */
    claimError?: unknown;
    /** January RPCs: force an error, or replace a result, per function. */
    rpc?: {
      submitError?: unknown;
      submitData?: unknown;
      claimError?: unknown;
      settleError?: unknown;
      settleData?: unknown;
    };
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

  /*
   * January RPCs — an in-memory MODEL of the accepted SQL
   * (`20261013020000_pasantias_january_program_interests.sql`), evaluated rather
   * than scripted, like the October claim above: one contact per normalized
   * email, one interest per (contact, program), a 24 h claim per interest that
   * a token settles. It lets the route's use of the RPCs be checked; it proves
   * nothing about the SQL itself — that is pgTAP 112 and the real-PostgREST
   * gates, which stay open.
   */
  const rpcCalls: RpcCall[] = [];
  const contacts = new Map<string, string>();
  const interests = new Map<string, InterestState>();
  let clock = Date.now();
  let serial = 0;

  const interestById = (id: unknown) => [...interests.values()].find((row) => row.id === id);
  const invalid = (reason: string) => ({
    data: null,
    error: { code: '22023', message: reason },
  });

  function submit(args: Record<string, unknown>): QueryResult {
    const email = String(args.p_email).trim().toLowerCase();
    let leadId = contacts.get(email);
    const leadCreated = !leadId;
    if (!leadId) {
      serial += 1;
      leadId = `jan-lead-${serial}`;
      contacts.set(email, leadId);
    }
    const key = `${leadId}:${String(args.p_program)}`;
    let interest = interests.get(key);
    const interestCreated = !interest;
    if (!interest) {
      serial += 1;
      interest = {
        id: `interest-${serial}`,
        leadId,
        program: String(args.p_program),
        replyClaimedAt: null,
        token: null,
        previous: null,
        providerAcceptedAt: null,
      };
      interests.set(key, interest);
    }
    return {
      data: [
        {
          lead_id: leadId,
          interest_id: interest.id,
          lead_created: leadCreated,
          interest_created: interestCreated,
        },
      ],
      error: null,
    };
  }

  function claim(args: Record<string, unknown>): QueryResult {
    const row = interestById(args.p_interest_id);
    if (!row) return invalid('pasantias_claim_program_reply: unknown_interest');
    if (row.replyClaimedAt !== null && row.replyClaimedAt >= clock - DAY_MS) {
      return { data: [{ claimed: false, claim_token: null, claimed_at: null }], error: null };
    }
    serial += 1;
    row.previous = row.replyClaimedAt;
    row.replyClaimedAt = clock;
    row.token = `token-${serial}`;
    return {
      data: [{ claimed: true, claim_token: row.token, claimed_at: new Date(clock).toISOString() }],
      error: null,
    };
  }

  function settle(args: Record<string, unknown>): QueryResult {
    const outcome = args.p_outcome;
    if (!['not_sent', 'provider_accepted', 'ambiguous'].includes(String(outcome)) || !args.p_claim_token) {
      return invalid('pasantias_settle_program_reply: invalid_argument');
    }
    const row = interestById(args.p_interest_id);
    if (!row) return invalid('pasantias_settle_program_reply: unknown_interest');
    if (row.token !== args.p_claim_token) return { data: false, error: null };
    if (outcome === 'not_sent') row.replyClaimedAt = row.previous;
    if (outcome === 'provider_accepted') row.providerAcceptedAt = clock;
    row.token = null;
    row.previous = null;
    return { data: true, error: null };
  }

  // An override REPLACES the model's answer and leaves the model untouched: a
  // forced `false` settle is a refusal, and a refusal changes no row.
  const rpcOptions = options.rpc ?? {};
  function answer(name: string, args: Record<string, unknown>): QueryResult {
    if (name === 'pasantias_submit_program_interest') {
      if (rpcOptions.submitError) return { data: null, error: rpcOptions.submitError };
      if ('submitData' in rpcOptions) return { data: rpcOptions.submitData, error: null };
      return submit(args);
    }
    if (name === 'pasantias_claim_program_reply') {
      if (rpcOptions.claimError) return { data: null, error: rpcOptions.claimError };
      return claim(args);
    }
    if (name === 'pasantias_settle_program_reply') {
      if (rpcOptions.settleError) return { data: null, error: rpcOptions.settleError };
      if ('settleData' in rpcOptions) return { data: rpcOptions.settleData, error: null };
      return settle(args);
    }
    return { data: null, error: { code: 'PGRST202', message: `no function ${name}` } };
  }

  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    const call: RpcCall = { name, args };
    rpcCalls.push(call);
    call.result = answer(name, args);
    return call.result;
  });

  const client = { from, rpc };
  mockCreateServiceRoleClient.mockReturnValue(client);
  return {
    client,
    inserts,
    updates,
    selectFilters,
    sentAt,
    rpcCalls,
    contacts,
    interests,
    /** Move the fake database clock forward. */
    advance(ms: number) {
      clock += ms;
    },
  };
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

/**
 * The active fixture: the public cohort and, outside the legacy describes,
 * exactly one program — what the January form posts.
 */
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    cohort: cohortPublic.COHORT_ID,
    ...(legacyCohort.active ? {} : { program: 'inspira' }),
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

/*
 * What the installed Resend SDK (3.5) RESOLVES from `emails.send` — it never
 * throws there. An HTTP error is the API's JSON body, which carries its status;
 * a request that could not complete is a status-less `application_error`.
 */
const RESEND_422 = { statusCode: 422, name: 'validation_error', message: 'nope' };
const RESEND_503 = { statusCode: 503, name: 'application_error', message: 'Service unavailable' };
const RESEND_FETCH_FAILURE = {
  name: 'application_error',
  message: 'Unable to fetch data. The request could not be resolved.',
};

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

/**
 * The seam itself. If `useLegacySingleTrack()` stops reaching the fixture, these
 * fail by name instead of turning the legacy describes into 400s or vacuous
 * passes. The January check runs after the legacy one, so it also shows the
 * seam is switched off again.
 */
describe('test seam: useLegacySingleTrack() reaches the fixture and the route [B003]', () => {
  describe('inside a legacy describe', () => {
    useLegacySingleTrack();

    it('validBody() is an October submission with no program, filed single-track', async () => {
      expect(cohortPublic.COHORT_ID).toBe('octubre-2026');
      expect(validBody().cohort).toBe('octubre-2026');
      expect(validBody()).not.toHaveProperty('program');

      // The route reads the same live value: it accepts the October cohort and
      // takes the insert path, not the January RPC.
      const supabase = createSupabase();
      const { res } = await run(validBody());

      expect(res._getStatusCode()).toBe(200);
      expect(supabase.rpcCalls).toHaveLength(0);
      expect(supabase.inserts).toHaveLength(1);
      expect(supabase.inserts[0].cohort).toBe('octubre-2026');
    });
  });

  it('outside it, validBody() is the January submission with program inspira', () => {
    expect(cohortPublic.COHORT_ID).toBe('enero-2027');
    expect(validBody().cohort).toBe('enero-2027');
    expect(validBody().program).toBe('inspira');
  });
});

/* --------------------------------------------------------------------------
 * The single-track branch (legacy). From here to the January section, every
 * describe pins the route's October-era branch through `useLegacySingleTrack()`
 * — see the file header for why it is kept and how it is reached.
 * ------------------------------------------------------------------------ */

describe('insert path and split consent [A3][A4]', () => {
  useLegacySingleTrack();

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
      cohort: cohortPublic.COHORT_ID,
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
      cohort: cohortPublic.COHORT_ID,
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
  useLegacySingleTrack();

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
  useLegacySingleTrack();

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
  useLegacySingleTrack();

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
  useLegacySingleTrack();

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
  useLegacySingleTrack();

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
    // Non-vacuity: `not.toMatch` passes on undefined, so the message must exist.
    expect(autoReply).toBeDefined();
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

  it('releases the claim when Resend answers with an explicit refusal: still 200', async () => {
    mockSend.mockResolvedValue({ data: null, error: RESEND_422 });
    const supabase = createSupabase();
    const { res } = await run(validBody());

    expect(res._getStatusCode()).toBe(200);
    const release = supabase.updates.filter((entry) => entry.kind === 'write').at(-1);
    expect(release?.payload).toEqual({ brochure_sent_at: null });
  });

  // BROWSER-RUNTIME-04: the SDK RESOLVES these instead of throwing. Neither says
  // the message was refused, so the window is held exactly as for a throw.
  for (const [label, error] of [
    ['the request never completed (no status)', RESEND_FETCH_FAILURE],
    ['503', RESEND_503],
  ] as const) {
    it(`KEEPS the claim when Resend resolves an error value with ${label}`, async () => {
      mockSend.mockResolvedValue({ data: null, error });
      const supabase = createSupabase();
      const { res } = await run(validBody());

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ success: true });
      expect(mailTo('Ana@Example.com')).toBeDefined();
      const claims = supabase.updates.filter((entry) => entry.kind === 'claim');
      expect(claims).toHaveLength(1);
      expect(
        supabase.updates.filter(
          (entry) => entry.kind === 'write' && 'brochure_sent_at' in entry.payload
        )
      ).toHaveLength(0);
      expect(supabase.sentAt.get('lead-new')).toBe(claims[0].payload.brochure_sent_at);
    });
  }

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
  useLegacySingleTrack();

  const HOSTILE = '<script>alert(1)</script>';

  it('escapes the name in both messages', async () => {
    createSupabase();
    await run(validBody({ firstName: HOSTILE }));

    // Non-vacuity: the loop below proves nothing over zero messages.
    expect(mockSend).toHaveBeenCalledTimes(2);
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

    // Non-vacuity: the loop below proves nothing over zero messages.
    expect(mockSend).toHaveBeenCalledTimes(2);
    for (const payload of mockSend.mock.calls.map((call) => call[0] as Record<string, string>)) {
      expect(payload.subject).not.toMatch(/[\r\n]/);
    }
  });
});

/* ------------------------------------------------ January 2027 (PASANT-B002b) */

/**
 * The accepted `pasantias_submit_program_interest` signature, transcribed from
 * `docs/plan/evidence/pasant-january/b002-database-contract.md` §4 — not from
 * the route. All eighteen are required keys: PostgREST resolves the function by
 * argument names and the signature has no defaults.
 */
const SUBMIT_RPC_KEYS = [
  'p_cohort',
  'p_program',
  'p_first_name',
  'p_last_name',
  'p_email',
  'p_institution',
  'p_phone',
  'p_role_title',
  'p_num_people',
  'p_message',
  'p_source_path',
  'p_utm_source',
  'p_utm_medium',
  'p_utm_campaign',
  'p_processing_consent',
  'p_consent_notice_version',
  'p_marketing_opt_in',
  'p_marketing_notice_version',
];

const SUBMIT_RPC = 'pasantias_submit_program_interest';
const CLAIM_RPC = 'pasantias_claim_program_reply';
const SETTLE_RPC = 'pasantias_settle_program_reply';

function januaryBody(overrides: Record<string, unknown> = {}) {
  return validBody({ cohort: JANUARY_COHORT_ID, program: 'inspira', ...overrides });
}

/** The January acknowledgements sent to the person, in send order. */
function januaryAcks(to = 'Ana@Example.com'): Array<Record<string, string>> {
  return mockSend.mock.calls
    .map((call) => call[0] as Record<string, string>)
    .filter((payload) => payload.to === to);
}

function callsTo(supabase: ReturnType<typeof createSupabase>, name: string): RpcCall[] {
  return supabase.rpcCalls.filter((call) => call.name === name);
}

describe('January: validation happens before any database call [B002b]', () => {
  const cases: Array<[string, Record<string, unknown>, string, string]> = [
    ['no program', { program: undefined }, 'program', LEAD_VALIDATION_MESSAGES.programRequired],
    ['an empty program', { program: '' }, 'program', LEAD_VALIDATION_MESSAGES.programRequired],
    // One POST is one interest: a list is refused, never split into several writes.
    ['both programs as an array', { program: ['inspira', 'mirada-profunda'] }, 'program', LEAD_VALIDATION_MESSAGES.programInvalid],
    ['a one-element array', { program: ['inspira'] }, 'program', LEAD_VALIDATION_MESSAGES.programInvalid],
    ['a `programs` list instead of `program`', { program: undefined, programs: ['inspira'] }, 'program', LEAD_VALIDATION_MESSAGES.programRequired],
    ['an unknown program', { program: 'pasantia-inspira' }, 'program', LEAD_VALIDATION_MESSAGES.programInvalid],
    ['a re-cased program', { program: 'INSPIRA' }, 'program', LEAD_VALIDATION_MESSAGES.programInvalid],
    ['a padded program', { program: ' inspira ' }, 'program', LEAD_VALIDATION_MESSAGES.programInvalid],
    ['a non-string program', { program: 1 }, 'program', LEAD_VALIDATION_MESSAGES.programInvalid],
    ['no processing consent', { consent: false }, 'consent', LEAD_VALIDATION_MESSAGES.consentRequired],
    ['a truthy-ish processing consent', { consent: 'true' }, 'consent', LEAD_VALIDATION_MESSAGES.consentRequired],
  ];

  for (const [label, overrides, field, message] of cases) {
    it(`rejects ${label} with 400 and writes nothing`, async () => {
      const supabase = createSupabase();
      const { res } = await run(januaryBody(overrides));

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().fields[field]).toBe(message);
      expect(supabase.rpcCalls).toHaveLength(0);
      expect(supabase.client.from).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });
  }

  it('rejects a cohort name close to the January one', async () => {
    const supabase = createSupabase();
    const { res } = await run(januaryBody({ cohort: 'enero-2026' }));

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().fields.cohort).toBe(LEAD_VALIDATION_MESSAGES.cohortInvalid);
    expect(supabase.rpcCalls).toHaveLength(0);
  });

  it('honeypot: the ordinary success body, no client, no RPC', async () => {
    createSupabase();
    const { res } = await run(januaryBody({ website: 'http://spam.example' }));

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('shares the rate limit with the October path', async () => {
    createSupabase();
    const ip = '198.51.100.252:january-rate';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { res } = await run(januaryBody(), { ip });
      expect(res._getStatusCode()).toBe(200);
    }
    const { res } = await run(januaryBody(), { ip });
    expect(res._getStatusCode()).toBe(429);
  });
});

describe('January: exactly one atomic submission RPC per POST [B002b]', () => {
  it('calls the accepted RPC once, with exactly the accepted argument names', async () => {
    const supabase = createSupabase();
    const { res } = await run(januaryBody());

    expect(res._getStatusCode()).toBe(200);
    const submits = callsTo(supabase, SUBMIT_RPC);
    expect(submits).toHaveLength(1);
    expect(Object.keys(submits[0].args).sort()).toEqual([...SUBMIT_RPC_KEYS].sort());
    // Nothing else may write the contact: the October table calls stay unused,
    // so `notes`, `status` and `brochure_sent_at` are the SQL's alone.
    expect(supabase.client.from).not.toHaveBeenCalled();
  });

  it('passes the validated values, null for every absent optional', async () => {
    const supabase = createSupabase();
    await run(januaryBody({ program: 'mirada-profunda' }));

    expect(callsTo(supabase, SUBMIT_RPC)[0].args).toEqual({
      p_cohort: JANUARY_COHORT_ID,
      p_program: 'mirada-profunda',
      p_first_name: 'Ana',
      p_last_name: 'Pérez',
      p_email: 'Ana@Example.com',
      p_institution: 'Colegio Uno',
      p_phone: null,
      p_role_title: null,
      p_num_people: null,
      p_message: null,
      p_source_path: null,
      p_utm_source: null,
      p_utm_medium: null,
      p_utm_campaign: null,
      p_processing_consent: true,
      p_consent_notice_version: PRIVACY_NOTICE_VERSION,
      p_marketing_opt_in: false,
      p_marketing_notice_version: null,
    });
  });

  it('passes every optional field and an accepted source path through', async () => {
    const supabase = createSupabase();
    await run(
      januaryBody({
        phone: '+56 9 1111 2222',
        roleTitle: 'Directora',
        numPeople: '4',
        message: 'Queremos ir en equipo.',
        sourcePath: '/pasantias?utm_source=ig',
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'inspira-ene',
      })
    );

    expect(callsTo(supabase, SUBMIT_RPC)[0].args).toMatchObject({
      p_phone: '+56 9 1111 2222',
      p_role_title: 'Directora',
      p_num_people: 4,
      p_message: 'Queremos ir en equipo.',
      p_source_path: '/pasantias?utm_source=ig',
      p_utm_source: 'google',
      p_utm_medium: 'cpc',
      p_utm_campaign: 'inspira-ene',
    });
  });

  it('drops a refused source path to null rather than failing (same rule as October)', async () => {
    const supabase = createSupabase();
    const { res } = await run(januaryBody({ sourcePath: '//evil.example' }));

    expect(res._getStatusCode()).toBe(200);
    expect(callsTo(supabase, SUBMIT_RPC)[0].args.p_source_path).toBeNull();
  });

  // D-12: two purposes, two pieces of evidence. The marketing version is the
  // server's and is sent only with an affirmative opt-in; an unchecked box sends
  // `false` and the SQL never clears an earlier opt-in on it.
  it('keeps processing and marketing consent separate', async () => {
    const supabase = createSupabase();
    await run(januaryBody({ marketingOptIn: true }));
    await run(januaryBody({ marketingOptIn: 'true' }));

    const [optIn, notOptIn] = callsTo(supabase, SUBMIT_RPC).map((call) => call.args);
    expect(optIn).toMatchObject({
      p_processing_consent: true,
      p_consent_notice_version: PRIVACY_NOTICE_VERSION,
      p_marketing_opt_in: true,
      p_marketing_notice_version: PRIVACY_NOTICE_VERSION,
    });
    expect(notOptIn).toMatchObject({
      p_processing_consent: true,
      p_consent_notice_version: PRIVACY_NOTICE_VERSION,
      p_marketing_opt_in: false,
      p_marketing_notice_version: null,
    });
  });

  it('files the second program as a separate POST on the same contact', async () => {
    const supabase = createSupabase();
    const first = await run(januaryBody({ program: 'inspira' }));
    const second = await run(januaryBody({ program: 'mirada-profunda', email: '  ANA@example.COM ' }));

    expect(callsTo(supabase, SUBMIT_RPC).map((call) => call.args.p_program)).toEqual([
      'inspira',
      'mirada-profunda',
    ]);
    // One normalized email, one contact, both interests kept.
    expect(supabase.contacts.size).toBe(1);
    expect([...supabase.interests.values()].map((row) => row.program).sort()).toEqual([
      'inspira',
      'mirada-profunda',
    ]);
    expect(new Set([...supabase.interests.values()].map((row) => row.leadId)).size).toBe(1);
    expect(first.res._getJSONData()).toEqual(second.res._getJSONData());
  });

  it('a repeat of the same program is idempotent and answers identically', async () => {
    const supabase = createSupabase();
    const first = await run(januaryBody());
    const repeat = await run(januaryBody());

    expect(callsTo(supabase, SUBMIT_RPC)).toHaveLength(2);
    expect(supabase.interests.size).toBe(1);
    expect(repeat.res._getStatusCode()).toBe(first.res._getStatusCode());
    expect(repeat.res._getJSONData()).toEqual(first.res._getJSONData());
  });

  it('new contact, repeat and second program are indistinguishable to the caller', async () => {
    createSupabase();
    const bodies = [];
    for (const program of ['inspira', 'inspira', 'mirada-profunda']) {
      const { res } = await run(januaryBody({ program }));
      bodies.push([res._getStatusCode(), res._getJSONData()]);
    }

    expect(bodies).toEqual([
      [200, { success: true }],
      [200, { success: true }],
      [200, { success: true }],
    ]);
  });
});

describe('January: submission failures are reported, never half-claimed [B002b]', () => {
  it('a refused value (validators drifted) is a 400 with nothing sent', async () => {
    const supabase = createSupabase({
      rpc: { submitError: { code: '22023', message: 'pasantias_submit_program_interest: invalid_email' } },
    });
    const { res } = await run(januaryBody());

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'Revisa los datos del formulario.' });
    expect(callsTo(supabase, CLAIM_RPC)).toHaveLength(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  for (const code of ['PGRST202', '42883', '42P01']) {
    it(`answers 503 when the January objects are missing (${code})`, async () => {
      createSupabase({ rpc: { submitError: { code, message: 'missing' } } });
      const { res } = await run(januaryBody());

      expect(res._getStatusCode()).toBe(503);
      expect(mockSend).not.toHaveBeenCalled();
    });
  }

  it('any other submission error is a 500 with no claim and no mail', async () => {
    const supabase = createSupabase({ rpc: { submitError: { code: '08006', message: 'down' } } });
    const { res } = await run(januaryBody());

    expect(res._getStatusCode()).toBe(500);
    expect(callsTo(supabase, SUBMIT_RPC)).toHaveLength(1);
    expect(callsTo(supabase, CLAIM_RPC)).toHaveLength(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('a submission that returns no row is a 500, not a success', async () => {
    const supabase = createSupabase({ rpc: { submitData: [] } });
    const { res } = await run(januaryBody());

    expect(res._getStatusCode()).toBe(500);
    expect(callsTo(supabase, CLAIM_RPC)).toHaveLength(0);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('January: reply claim and settlement belong to the submitted interest [B002b]', () => {
  it('claims this interest, sends one acknowledgement, settles provider_accepted with its own token', async () => {
    const supabase = createSupabase();
    const { res } = await run(januaryBody());

    expect(res._getStatusCode()).toBe(200);
    const interestId = [...supabase.interests.values()][0].id;
    expect(callsTo(supabase, CLAIM_RPC).map((call) => call.args)).toEqual([{ p_interest_id: interestId }]);

    const [claimCall] = callsTo(supabase, CLAIM_RPC);
    const claimToken = (claimCall.result?.data as Array<{ claim_token: string }>)[0].claim_token;
    const [settleCall] = callsTo(supabase, SETTLE_RPC);
    expect(settleCall.args).toEqual({
      p_interest_id: interestId,
      p_claim_token: claimToken,
      p_outcome: 'provider_accepted',
    });
    expect(claimToken).toMatch(/^token-/);
    expect(januaryAcks()).toHaveLength(1);
    expect([...supabase.interests.values()][0].providerAcceptedAt).not.toBeNull();
  });

  it('the acknowledgement names this program only, links both shared documents and no October fact', async () => {
    createSupabase();
    await run(januaryBody({ program: 'mirada-profunda' }));

    const [ack] = januaryAcks();
    expect(ack.html).toContain(JANUARY_PROGRAM_NAMES['mirada-profunda']);
    expect(ack.html).toContain('INSPIRA Mirada Profunda');
    expect(ack.html).not.toContain('Pasantía INSPIRA');
    expect(ack.html).toContain(JANUARY_COHORT_LABEL);
    expect(ack.subject).toContain(JANUARY_PROGRAM_NAMES['mirada-profunda']);
    // PASANT-B003: one ficha and one brochure, each for both programs, at the
    // configured origin (here the mocked `buildAbsoluteUrl`).
    expect(ack.html).toContain('href="https://nuevaeducacion.org/api/pasantias/ficha"');
    expect(ack.html).toContain('href="https://nuevaeducacion.org/api/pasantias/brochure"');
    expect(ack.html).not.toContain('Octubre');
    expect(ack.html).not.toMatch(/€|\bEUR\b|\bUSD\b|\bCLP\b|\$\s?\d/);
    expect(ack.html).not.toMatch(/te enviaremos|se pondr[áa] en contacto|recibir[áa]s/i);
  });

  it('a missing production origin sends no acknowledgement, settles not_sent, and still answers 200 and tells FNE', async () => {
    const supabase = createSupabase();
    mockBuildAbsoluteUrl.mockImplementation(() => {
      throw new Error('No se puede resolver la URL pública de la aplicación en producción.');
    });

    const { res } = await run(januaryBody());

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(januaryAcks()).toHaveLength(0);
    const [settleCall] = callsTo(supabase, SETTLE_RPC);
    // Known not sent: the claim is restored, so the next submission may try again.
    expect(settleCall.args.p_outcome).toBe('not_sent');
    expect(mailTo(LEAD_NOTIFICATION_RECIPIENT)).toBeDefined();
  });

  it('each program of one contact has its own window', async () => {
    const supabase = createSupabase();
    await run(januaryBody({ program: 'inspira' }));
    await run(januaryBody({ program: 'mirada-profunda' }));

    const acks = januaryAcks();
    expect(acks).toHaveLength(2);
    expect(acks[0].html).toContain(JANUARY_PROGRAM_NAMES.inspira);
    expect(acks[1].html).toContain(JANUARY_PROGRAM_NAMES['mirada-profunda']);
    // Each settle names the interest its own claim was for.
    const claimed = callsTo(supabase, CLAIM_RPC).map((call) => call.args.p_interest_id);
    const settled = callsTo(supabase, SETTLE_RPC).map((call) => call.args.p_interest_id);
    expect(settled).toEqual(claimed);
    expect(new Set(claimed).size).toBe(2);
  });

  it('a repeat inside 24 h re-files the interest but sends nothing; FNE is still told', async () => {
    const supabase = createSupabase();
    await run(januaryBody());
    mockSend.mockClear();

    const { res } = await run(januaryBody());

    expect(res._getStatusCode()).toBe(200);
    expect(januaryAcks()).toHaveLength(0);
    expect(mailTo(LEAD_NOTIFICATION_RECIPIENT)).toBeDefined();
    expect(callsTo(supabase, SETTLE_RPC)).toHaveLength(1);
  });

  it('two simultaneous submissions of one program produce exactly one acknowledgement', async () => {
    const supabase = createSupabase();
    const [first, second] = await Promise.all([run(januaryBody()), run(januaryBody())]);

    expect(first.res._getStatusCode()).toBe(200);
    expect(second.res._getStatusCode()).toBe(200);
    expect(januaryAcks()).toHaveLength(1);
    expect(callsTo(supabase, CLAIM_RPC)).toHaveLength(2);
    expect(callsTo(supabase, SETTLE_RPC)).toHaveLength(1);
  });

  for (const [label, arrange] of [
    ['RESEND_API_KEY is missing', () => vi.stubEnv('RESEND_API_KEY', '')],
    ['the provider rejects the message', () => mockSend.mockResolvedValue({ data: null, error: RESEND_422 })],
  ] as const) {
    it(`settles not_sent when ${label}, so the next submission can try again`, async () => {
      const supabase = createSupabase();
      arrange();
      const { res } = await run(januaryBody());

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ success: true });
      expect(callsTo(supabase, SETTLE_RPC).map((call) => call.args.p_outcome)).toEqual(['not_sent']);
      expect([...supabase.interests.values()][0].replyClaimedAt).toBeNull();

      vi.stubEnv('RESEND_API_KEY', 'test-resend-key');
      mockSend.mockReset();
      mockSend.mockResolvedValue({ data: { id: 'email-2' }, error: null });
      await run(januaryBody());

      expect(januaryAcks()).toHaveLength(1);
      expect(callsTo(supabase, SETTLE_RPC).map((call) => call.args.p_outcome)).toEqual([
        'not_sent',
        'provider_accepted',
      ]);
    });
  }

  it('settles ambiguous when the transport throws, and keeps the window for 24 h', async () => {
    mockSend.mockRejectedValue(new Error('socket hang up'));
    const supabase = createSupabase();
    const { res } = await run(januaryBody());

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(callsTo(supabase, SETTLE_RPC).map((call) => call.args.p_outcome)).toEqual(['ambiguous']);

    mockSend.mockReset();
    mockSend.mockResolvedValue({ data: { id: 'email-2' }, error: null });
    await run(januaryBody());
    expect(januaryAcks()).toHaveLength(0);

    supabase.advance(DAY_MS + 1000);
    await run(januaryBody());
    expect(januaryAcks()).toHaveLength(1);
  });

  // BROWSER-RUNTIME-04 (PF3/PF3b): the SDK resolves, rather than throws, when the
  // request failed or the provider answered 5xx. Same hold as a throw: one
  // acknowledgement attempt, the claim kept, and an accepted repeat sends none.
  for (const [label, error] of [
    ['the request never completed (no status)', RESEND_FETCH_FAILURE],
    ['503', RESEND_503],
  ] as const) {
    it(`settles ambiguous when Resend resolves an error value with ${label}, and a repeat sends no second acknowledgement`, async () => {
      mockSend.mockResolvedValue({ data: null, error });
      const supabase = createSupabase();
      const { res } = await run(januaryBody());

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ success: true });
      expect(januaryAcks()).toHaveLength(1);
      expect(callsTo(supabase, SETTLE_RPC).map((call) => call.args.p_outcome)).toEqual(['ambiguous']);
      const [row] = [...supabase.interests.values()];
      expect(row.replyClaimedAt).not.toBeNull();
      expect(row.providerAcceptedAt).toBeNull();

      // The provider would now accept; the held claim still refuses a second copy.
      mockSend.mockReset();
      mockSend.mockResolvedValue({ data: { id: 'email-2' }, error: null });
      const repeat = await run(januaryBody());

      expect(repeat.res._getStatusCode()).toBe(200);
      expect(repeat.res._getJSONData()).toEqual({ success: true });
      expect(januaryAcks()).toHaveLength(0);
      expect(mailTo(LEAD_NOTIFICATION_RECIPIENT)).toBeDefined();
      expect(callsTo(supabase, CLAIM_RPC)).toHaveLength(2);
      expect(callsTo(supabase, SETTLE_RPC)).toHaveLength(1);
    });
  }

  it('a settle refused because the claim is no longer held changes nothing and still answers 200', async () => {
    const supabase = createSupabase({ rpc: { settleData: false } });
    const { res } = await run(januaryBody());

    expect(res._getStatusCode()).toBe(200);
    expect(januaryAcks()).toHaveLength(1);
    expect(callsTo(supabase, SETTLE_RPC)).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('settle refused')
    );
    // The refusal is not applied: the claim this request took is still open
    // exactly as the claim left it, and nothing was stamped.
    const [claimCall] = callsTo(supabase, CLAIM_RPC);
    const claimed = (claimCall.result?.data as Array<{ claim_token: string }>)[0];
    const [row] = [...supabase.interests.values()];
    expect(row.token).toBe(claimed.claim_token);
    expect(row.replyClaimedAt).not.toBeNull();
    expect(row.providerAcceptedAt).toBeNull();
  });

  // The stale-owner interleaving, driven through the route: A claims and its
  // send stalls past the 24 h window; B claims the same interest anew and its
  // send is still in flight when A's send finally fails. A must settle with
  // the token ITS claim returned, and that stale `not_sent` must not restore,
  // clear or stamp anything on B's open claim. This checks what the route
  // sends and how it handles `false`; the SQL's token predicate itself is
  // pgTAP 112 (counterexample c), not this fake.
  it('a delayed stale owner settles with its own token and cannot release the newer claim', async () => {
    const supabase = createSupabase();

    type SendAnswer = { data: unknown; error: unknown };
    const deferred = () => {
      let resolve!: (value: SendAnswer) => void;
      const promise = new Promise<SendAnswer>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    };
    const ackA = deferred();
    const ackB = deferred();
    const pendingAcks = [ackA, ackB];
    mockSend.mockImplementation((payload: Record<string, string>) =>
      payload.to === 'Ana@Example.com'
        ? (pendingAcks.shift() as ReturnType<typeof deferred>).promise
        : Promise.resolve({ data: { id: 'notification' }, error: null })
    );

    // A: claimed, acknowledgement in flight.
    const requestA = run(januaryBody());
    await vi.waitFor(() => expect(januaryAcks()).toHaveLength(1));

    // A's window expires; B takes a new claim on the same interest.
    supabase.advance(DAY_MS + 1000);
    const requestB = run(januaryBody());
    await vi.waitFor(() => expect(januaryAcks()).toHaveLength(2));

    const claims = callsTo(supabase, CLAIM_RPC).map(
      (call) => (call.result?.data as Array<{ claimed: boolean; claim_token: string }>)[0]
    );
    expect(claims.map((claim) => claim.claimed)).toEqual([true, true]);
    const [tokenA, tokenB] = claims.map((claim) => claim.claim_token);
    expect(tokenA).not.toBe(tokenB);

    const [row] = [...supabase.interests.values()];
    const bClaim = { token: row.token, replyClaimedAt: row.replyClaimedAt, previous: row.previous };
    expect(bClaim.token).toBe(tokenB);

    // A's send now fails as known-not-sent (provider refusal).
    ackA.resolve({ data: null, error: RESEND_422 });
    const a = await requestA;

    expect(a.res._getStatusCode()).toBe(200);
    const [settleA] = callsTo(supabase, SETTLE_RPC);
    expect(settleA.args).toEqual({
      p_interest_id: row.id,
      p_claim_token: tokenA,
      p_outcome: 'not_sent',
    });
    expect(settleA.result?.data).toBe(false);
    // B's claim is exactly as B left it: not restored, not cleared, not stamped.
    expect({ token: row.token, replyClaimedAt: row.replyClaimedAt, previous: row.previous }).toEqual(bClaim);
    expect(row.providerAcceptedAt).toBeNull();

    // B's send is accepted; B settles its own claim.
    ackB.resolve({ data: { id: 'email-b' }, error: null });
    const b = await requestB;

    expect(b.res._getStatusCode()).toBe(200);
    const settleB = callsTo(supabase, SETTLE_RPC)[1];
    expect(settleB.args).toEqual({
      p_interest_id: row.id,
      p_claim_token: tokenB,
      p_outcome: 'provider_accepted',
    });
    expect(settleB.result?.data).toBe(true);
    expect(row.token).toBeNull();
    expect(row.replyClaimedAt).toBe(bClaim.replyClaimedAt);
    expect(row.providerAcceptedAt).not.toBeNull();
  });

  it('a failed claim skips the acknowledgement but still notifies FNE', async () => {
    const supabase = createSupabase({ rpc: { claimError: { code: '42501', message: 'denied' } } });
    const { res } = await run(januaryBody());

    expect(res._getStatusCode()).toBe(200);
    expect(januaryAcks()).toHaveLength(0);
    expect(callsTo(supabase, SETTLE_RPC)).toHaveLength(0);
    expect(mailTo(LEAD_NOTIFICATION_RECIPIENT)).toBeDefined();
  });

  it('a failed settle is logged and the response is unchanged', async () => {
    createSupabase({ rpc: { settleError: { code: '08006', message: 'down' } } });
    const { res } = await run(januaryBody());

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(januaryAcks()).toHaveLength(1);
  });

  it('never touches brochure_sent_at or any October table write', async () => {
    const supabase = createSupabase();
    await run(januaryBody());

    expect(supabase.client.from).not.toHaveBeenCalled();
    expect(supabase.inserts).toHaveLength(0);
    expect(supabase.updates).toHaveLength(0);
  });

  it('tells FNE which program and cohort the submission was for', async () => {
    createSupabase();
    await run(januaryBody({ program: 'mirada-profunda' }));

    const notification = mailTo(LEAD_NOTIFICATION_RECIPIENT);
    expect(notification?.subject).toContain(JANUARY_COHORT_LABEL);
    expect(notification?.html).toContain(JANUARY_PROGRAM_NAMES['mirada-profunda']);
    expect(notification?.html).not.toContain('Octubre');
  });
});

describe('October stays single-track and unchanged next to January [B002b]', () => {
  useLegacySingleTrack();

  it('refuses a program on the October cohort and writes nothing', async () => {
    const supabase = createSupabase();
    const { res } = await run(validBody({ program: 'inspira' }));

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().fields.program).toBe(LEAD_VALIDATION_MESSAGES.programInvalid);
    expect(supabase.inserts).toHaveLength(0);
    expect(supabase.rpcCalls).toHaveLength(0);
  });

  it('an October submission never calls a January RPC and keeps its brochure reply', async () => {
    const supabase = createSupabase();
    const { res } = await run(validBody());

    expect(res._getStatusCode()).toBe(200);
    expect(supabase.rpcCalls).toHaveLength(0);
    expect(supabase.inserts).toHaveLength(1);
    expect(mailTo('Ana@Example.com')?.html).toContain('/api/pasantias/brochure');
    expect(mailTo(LEAD_NOTIFICATION_RECIPIENT)?.subject).toMatch(/^\[Pasantías INSPIRA\] /);
  });
});

/**
 * PASANT-B003: the public cohort is January. The default fixture is a January
 * submission, and the October form a stale cached page might still post is
 * refused with a visible error and no write of any kind — with no
 * October-specific rule anywhere: the cohort pin does it.
 */
describe('after the January switch, the active form is January [B003]', () => {
  it('the default fixture is the public cohort with one program, and it takes the atomic RPC path', async () => {
    const supabase = createSupabase();
    const { res } = await run(validBody());

    expect(cohortPublic.COHORT_ID).toBe('enero-2027');
    expect(cohortPublic.COHORT_ID).toBe(JANUARY_COHORT_ID);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(callsTo(supabase, SUBMIT_RPC)).toHaveLength(1);
    expect(callsTo(supabase, SUBMIT_RPC)[0].args.p_cohort).toBe('enero-2027');
    expect(callsTo(supabase, SUBMIT_RPC)[0].args.p_program).toBe('inspira');
    expect(supabase.client.from).not.toHaveBeenCalled();
  });

  it('a stale October form (no program) gets the visible cohort error and nothing is written', async () => {
    const supabase = createSupabase();
    const { res } = await run(validBody({ cohort: 'octubre-2026', program: undefined }));

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().fields).toEqual({ cohort: LEAD_VALIDATION_MESSAGES.cohortInvalid });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(supabase.rpcCalls).toHaveLength(0);
    expect(supabase.inserts).toHaveLength(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('a program-less submission for the public cohort is refused, never filed single-track', async () => {
    const supabase = createSupabase();
    const { res } = await run(validBody({ program: undefined }));

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().fields).toEqual({ program: LEAD_VALIDATION_MESSAGES.programRequired });
    expect(supabase.inserts).toHaveLength(0);
    expect(supabase.rpcCalls).toHaveLength(0);
  });

  it('interest in both programs is two POSTs with one address, each its own atomic call', async () => {
    const supabase = createSupabase();
    const first = await run(validBody({ program: 'inspira' }));
    const second = await run(validBody({ program: 'mirada-profunda', email: '  ANA@example.COM ' }));

    expect([first.res._getStatusCode(), second.res._getStatusCode()]).toEqual([200, 200]);
    const submits = callsTo(supabase, SUBMIT_RPC);
    expect(submits.map((call) => call.args.p_program)).toEqual(['inspira', 'mirada-profunda']);
    expect(new Set([...supabase.interests.values()].map((interest) => interest.leadId)).size).toBe(1);
    expect(supabase.interests.size).toBe(2);
  });
});
