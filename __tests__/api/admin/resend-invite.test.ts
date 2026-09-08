// @vitest-environment node
/**
 * S7 — /api/admin/tractor-signups/resend-invite.
 *
 * THE PROBLEM. Granting access to a new signup does four things: create the auth
 * user, upsert the profile, mark the signup `granted`, and e-mail a recovery
 * link. Only the last one can fail without failing the request — and when it
 * did, the signup was already `granted`, so the panel refused to grant it again,
 * the account existed with a random 16-character password nobody knows, and
 * nothing in the product could produce another link. The person was stranded
 * permanently.
 *
 * That is not hypothetical: `RESEND_API_KEY` is absent from the Vercel
 * Production environment, so the send has been failing for every grant.
 *
 * The audit fail-closed behaviour is asserted in both directions, because this
 * is the ONE operation in the remediation where the audit row is not a record of
 * the effect but the rate-limit ledger itself.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCheckIsAdmin, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdmin: mockCheckIsAdmin,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

vi.mock('../../../lib/rateLimit', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, rateLimit: () => async () => true };
});

import handler, { RESEND_COOLDOWN_MINUTES } from '../../../pages/api/admin/tractor-signups/resend-invite';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const SIGNUP_ID = '22222222-2222-4222-8222-222222222222';
const LINKED_USER_ID = '33333333-3333-4333-8333-333333333333';
const HASHED_TOKEN = 'fresh-synthetic-hashed-token';
/** The URL the endpoint builds from it — the one the message actually carries. */
const RECOVERY_URL =
  'https://genera.example.org/reset-password?token_hash=fresh-synthetic-hashed-token&type=recovery';

interface FromCall {
  table: string;
  inserts: unknown[];
  selects: unknown[];
  eqs: Array<{ col: string; val: unknown }>;
  ins: Array<{ col: string; vals: unknown }>;
}

interface Tracker {
  fromCalls: FromCall[];
  generateLinkCalls: unknown[];
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
  /** Every side effect, in order, so "reserved BEFORE sending" is assertable. */
  order: string[];
}

function makeTracker(): Tracker {
  return { fromCalls: [], generateLinkCalls: [], rpcCalls: [], order: [] };
}

function signupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SIGNUP_ID,
    source: 'registro_general',
    first_name: 'Ana',
    last_name: 'Pérez',
    email: 'ana@example.com',
    email_normalized: 'ana@example.com',
    status: 'granted',
    linked_user_id: LINKED_USER_ID,
    school_id: 55,
    ...overrides,
  };
}

interface ClientOptions {
  signup?: Record<string, unknown> | null;
  signupError?: { code?: string; message: string } | null;
  /** What `claim_invitation_resend` answers. Defaults to a granted claim. */
  claim?: { claimed: boolean; retry_after_seconds?: number } | null;
  /** The claim RPC itself failed — the fail-closed case. */
  claimError?: { message: string } | null;
  /** The claim returned something unrecognisable. Also fail-closed. */
  claimShape?: unknown;
  /** Delegate the claim to a shared ledger, for the concurrency tests. */
  claimImpl?: (args: Record<string, unknown>) => Promise<unknown>;
  profile?: Record<string, unknown> | null;
  profileError?: { message: string } | null;
  generateLinkError?: { message: string } | null;
  generateLinkNull?: boolean;
}

function buildClient(tracker: Tracker, opts: ClientOptions = {}) {
  const chain = (table: string, resolved: { data: unknown; error: unknown }) => {
    const call: FromCall = { table, inserts: [], selects: [], eqs: [], ins: [] };
    tracker.fromCalls.push(call);
    const proxyHandler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(resolved);
        if (prop === 'insert') {
          return vi.fn((vals: unknown) => {
            call.inserts.push(vals);
            return new Proxy({}, proxyHandler);
          });
        }
        if (prop === 'select') {
          return vi.fn((vals?: unknown) => {
            call.selects.push(vals);
            return new Proxy({}, proxyHandler);
          });
        }
        if (prop === 'eq') {
          return vi.fn((col: string, val: unknown) => {
            call.eqs.push({ col, val });
            return new Proxy({}, proxyHandler);
          });
        }
        if (prop === 'in') {
          return vi.fn((col: string, vals: unknown) => {
            call.ins.push({ col, vals });
            return new Proxy({}, proxyHandler);
          });
        }
        return vi.fn(() => new Proxy({}, proxyHandler));
      },
    };
    return new Proxy({}, proxyHandler);
  };

  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    tracker.rpcCalls.push({ fn, args });
    tracker.order.push(`rpc:${fn}`);

    if (fn !== 'claim_invitation_resend') return { data: null, error: null };

    if (opts.claimImpl) {
      return { data: await opts.claimImpl(args), error: null };
    }
    if (opts.claimError) {
      return { data: null, error: opts.claimError };
    }
    if ('claimShape' in opts) {
      return { data: opts.claimShape, error: null };
    }
    return {
      data: [opts.claim ?? { claimed: true, retry_after_seconds: 0 }],
      error: null,
    };
  });

  return {
    rpc,
    auth: {
      admin: {
        generateLink: vi.fn(async (params: unknown) => {
          tracker.generateLinkCalls.push(params);
          tracker.order.push('generateLink');
          if (opts.generateLinkError) return { data: null, error: opts.generateLinkError };
          if (opts.generateLinkNull) return { data: { properties: {} }, error: null };
          // F2: the endpoint uses `hashed_token`, not `action_link`, and builds
          // its own `/reset-password?token_hash=…` URL from it.
          return { data: { properties: { hashed_token: HASHED_TOKEN } }, error: null };
        }),
      },
    },
    from: vi.fn((table: string) => {
      if (table === 'tractor_signups') {
        return chain(table, {
          data: 'signup' in opts ? opts.signup : signupRow(),
          error: opts.signupError ?? null,
        });
      }
      if (table === 'security_audit_events') {
        // Only OUTCOME rows reach the table through the client now. The
        // reservation is written inside `claim_invitation_resend`, in the same
        // transaction as the check that authorised it (F5).
        tracker.order.push('auditWrite');
        return chain(table, { data: null, error: null });
      }
      if (table === 'profiles') {
        return chain(table, {
          data: 'profile' in opts ? opts.profile : { first_name: 'Ana', must_change_password: true },
          error: opts.profileError ?? null,
        });
      }
      if (table === 'schools') {
        return chain(table, {
          data: { id: 55, tenant_kind: 'client', internal_zoom_testing_enabled: false },
          error: null,
        });
      }
      return chain(table, { data: null, error: null });
    }),
  };
}

async function run(opts: ClientOptions = {}, body: Record<string, unknown> = { signupId: SIGNUP_ID }) {
  const tracker = makeTracker();
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
  mockCreateServiceRoleClient.mockReturnValue(buildClient(tracker, opts));
  const { req, res } = createMocks({ method: 'POST', body });
  await handler(req as never, res as never);
  return { res, tracker };
}

function auditWrites(tracker: Tracker): Array<Record<string, unknown>> {
  return tracker.fromCalls
    .filter((c) => c.table === 'security_audit_events')
    .flatMap((c) => c.inserts) as Array<Record<string, unknown>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  // No mail transport configured — the production state today. Tests that need
  // a successful send stub the key and inject nothing: the mailer's own suite
  // covers the transport, this one covers the endpoint's decisions.
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://genera.example.org');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

describe('authorization', () => {
  it('405 for a non-POST method', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(405);
  });

  it('401 when authentication fails', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: null, error: new Error('no session') });
    const { req, res } = createMocks({ method: 'POST', body: { signupId: SIGNUP_ID } });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('403 for a non-admin', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: { id: ADMIN_ID }, error: null });
    const { req, res } = createMocks({ method: 'POST', body: { signupId: SIGNUP_ID } });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error).toContain('Solo administradores');
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('400 for a malformed signupId — no query is issued with it', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
    const { req, res } = createMocks({ method: 'POST', body: { signupId: 'not-a-uuid' } });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Signup state
// ---------------------------------------------------------------------------

describe('signup state', () => {
  it('404 when the signup does not exist', async () => {
    const { res } = await run({ signup: null });
    expect(res._getStatusCode()).toBe(404);
  });

  it('404 for an unknown signup source', async () => {
    const { res } = await run({ signup: signupRow({ source: 'otra_cosa' }) });
    expect(res._getStatusCode()).toBe(404);
  });

  it('400 for a PENDING signup — the answer there is "grant it", not "resend"', async () => {
    const { res, tracker } = await run({ signup: signupRow({ status: 'pending', linked_user_id: null }) });
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().code).toBe('SIGNUP_NOT_GRANTED');
    expect(auditWrites(tracker)).toEqual([]);
  });

  it('400 for a granted signup with no linked account', async () => {
    const { res } = await run({ signup: signupRow({ linked_user_id: null }) });
    expect(res._getStatusCode()).toBe(400);
  });

  it('400 when the signup has no usable e-mail', async () => {
    const { res } = await run({
      signup: signupRow({ email: 'not-an-email', email_normalized: 'not-an-email' }),
    });
    expect(res._getStatusCode()).toBe(400);
  });

  it('503 when the signups table is missing', async () => {
    const { res } = await run({ signupError: { code: '42P01', message: 'relation does not exist' } });
    expect(res._getStatusCode()).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting, and the fail-closed audit
// ---------------------------------------------------------------------------

describe('the cooldown claim (F5)', () => {
  it('429 when the claim is refused because one was already made', async () => {
    const { res, tracker } = await run({
      claim: { claimed: false, retry_after_seconds: 240 },
    });

    expect(res._getStatusCode()).toBe(429);
    expect(res._getJSONData().code).toBe('RESEND_TOO_SOON');
    expect(res._getJSONData().retryAfterMinutes).toBe(RESEND_COOLDOWN_MINUTES);
    expect(res._getJSONData().retryAfterSeconds).toBe(240);
    // Nothing was sent and no outcome row was written.
    expect(auditWrites(tracker)).toEqual([]);
    expect(tracker.generateLinkCalls).toEqual([]);
  });

  it('claims through the RPC, scoped to this target, with this cooldown', async () => {
    const { tracker } = await run();

    expect(tracker.rpcCalls).toHaveLength(1);
    expect(tracker.rpcCalls[0].fn).toBe('claim_invitation_resend');
    expect(tracker.rpcCalls[0].args).toMatchObject({
      p_target_user_id: LINKED_USER_ID,
      p_actor_user_id: ADMIN_ID,
      p_cooldown_seconds: RESEND_COOLDOWN_MINUTES * 60,
    });
  });

  it('claims BEFORE it mints a link or sends anything', async () => {
    const { tracker } = await run();

    const claimAt = tracker.order.indexOf('rpc:claim_invitation_resend');
    const linkAt = tracker.order.indexOf('generateLink');

    expect(claimAt).toBeGreaterThanOrEqual(0);
    expect(linkAt).toBeGreaterThan(claimAt);
  });

  it('FAILS CLOSED when the claim itself errors — nothing is sent', async () => {
    // "No recent resend" and "cannot tell" must not collapse into the same
    // answer, or an unreadable ledger becomes an unlimited allowance to mail
    // recovery links at an address.
    const { res, tracker } = await run({ claimError: { message: 'connection reset' } });

    expect(res._getStatusCode()).toBe(503);
    expect(res._getJSONData().code).toBe('AUDIT_UNAVAILABLE');
    expect(tracker.generateLinkCalls).toEqual([]);
    expect(auditWrites(tracker)).toEqual([]);
  });

  it.each([
    ['null', null],
    ['an empty array', []],
    ['an object with no verdict', [{ retry_after_seconds: 0 }]],
    ['a string', 'yes'],
  ])('FAILS CLOSED when the claim returns %s', async (_label, shape) => {
    const { res, tracker } = await run({ claimShape: shape });

    expect(res._getStatusCode()).toBe(503);
    expect(res._getJSONData().code).toBe('AUDIT_UNAVAILABLE');
    expect(res._getJSONData().error).toContain('no se envió nada');
    expect(tracker.generateLinkCalls).toEqual([]);
  });

  it('accepts the single-row shape PostgREST returns for a TABLE function', async () => {
    // `claim_invitation_resend` RETURNS TABLE, so supabase-js hands back an
    // array. Both shapes are tolerated so a PostgREST version that unwraps a
    // one-row result does not silently become a fail-closed outage.
    const { res } = await run({ claimShape: { claimed: true, retry_after_seconds: 0 } });
    expect(res._getStatusCode()).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// F5 — the race, and a negative control that proves this test can see it.
//
// The defect was three round trips with no lock between them: read the ledger,
// insert a reservation, send. Two requests for the same recipient both read "no
// recent resend", both inserted, and both sent — so the recipient got two
// recovery links and the second silently killed the first.
//
// Both tests below drive TWO CONCURRENT handler invocations against ONE shared
// ledger. The only difference is whether the claim they share is atomic.
// ---------------------------------------------------------------------------

/** Yield to the microtask/timer queue — the window a race opens in. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function makeSharedLedger() {
  const rows: number[] = [];
  let held = false;
  const waiting: Array<() => void> = [];

  return {
    rows,

    /**
     * What `claim_invitation_resend` does: take the per-target advisory lock
     * FIRST, then check and insert inside it.
     */
    async atomic(args: Record<string, unknown>) {
      while (held) {
        await new Promise<void>((resolve) => waiting.push(resolve));
      }
      held = true;
      try {
        // The gap the old shape lost the race in. Under the lock it is harmless.
        await tick();
        const since = Date.now() - Number(args.p_cooldown_seconds) * 1000;
        if (rows.some((at) => at >= since)) {
          return [{ claimed: false, retry_after_seconds: 300 }];
        }
        rows.push(Date.now());
        return [{ claimed: true, retry_after_seconds: 0 }];
      } finally {
        held = false;
        waiting.shift()?.();
      }
    },

    /**
     * THE NEGATIVE CONTROL: the old read-then-insert, with the same gap and no
     * lock. Present so this suite demonstrably distinguishes the two — a
     * concurrency test that passes against the broken implementation proves
     * nothing.
     */
    async readThenInsert(args: Record<string, unknown>) {
      const since = Date.now() - Number(args.p_cooldown_seconds) * 1000;
      const recent = rows.some((at) => at >= since);
      await tick();
      if (recent) {
        return [{ claimed: false, retry_after_seconds: 300 }];
      }
      rows.push(Date.now());
      return [{ claimed: true, retry_after_seconds: 0 }];
    },
  };
}

async function runConcurrentPair(
  claimImpl: (args: Record<string, unknown>) => Promise<unknown>
) {
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });

  const trackers = [makeTracker(), makeTracker()];
  const clients = trackers.map((t) => buildClient(t, { claimImpl }));
  let next = 0;
  mockCreateServiceRoleClient.mockImplementation(() => clients[next++]);

  const mocks = [0, 1].map(() =>
    createMocks({ method: 'POST', body: { signupId: SIGNUP_ID } })
  );

  await Promise.all(mocks.map((m) => handler(m.req as never, m.res as never)));

  return {
    statuses: mocks.map((m) => m.res._getStatusCode()).sort(),
    providerCalls: trackers.reduce((n, t) => n + t.generateLinkCalls.length, 0),
  };
}

describe('two concurrent resends for the SAME recipient', () => {
  it('produce at most ONE provider call when the claim is atomic', async () => {
    const ledger = makeSharedLedger();
    const { statuses, providerCalls } = await runConcurrentPair((args) => ledger.atomic(args));

    expect(providerCalls).toBe(1);
    // One is served, one is told to wait.
    expect(statuses).toEqual([200, 429]);
    expect(ledger.rows).toHaveLength(1);
  });

  it('NEGATIVE CONTROL: read-then-insert lets both through', async () => {
    // This is the defect, reproduced. If the assertion above ever passes for a
    // non-atomic claim, this test is what says the suite stopped being able to
    // tell the difference.
    const ledger = makeSharedLedger();
    const { providerCalls } = await runConcurrentPair((args) => ledger.readThenInsert(args));

    expect(providerCalls).toBe(2);
    expect(ledger.rows).toHaveLength(2);
  });

  it('DIFFERENT recipients never block each other', async () => {
    const ledger = makeSharedLedger();
    // Two different targets: the advisory lock is keyed on the target, so both
    // claims succeed. Modelled by giving each its own ledger, which is exactly
    // what per-target key isolation means.
    const other = makeSharedLedger();

    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
    const t1 = makeTracker();
    const t2 = makeTracker();
    const c1 = buildClient(t1, { claimImpl: (args) => ledger.atomic(args) });
    const c2 = buildClient(t2, { claimImpl: (args) => other.atomic(args) });
    let next = 0;
    const clients = [c1, c2];
    mockCreateServiceRoleClient.mockImplementation(() => clients[next++]);

    const mocks = [0, 1].map(() =>
      createMocks({ method: 'POST', body: { signupId: SIGNUP_ID } })
    );
    await Promise.all(mocks.map((m) => handler(m.req as never, m.res as never)));

    expect(mocks.map((m) => m.res._getStatusCode())).toEqual([200, 200]);
    expect(t1.generateLinkCalls).toHaveLength(1);
    expect(t2.generateLinkCalls).toHaveLength(1);
  });

  it('a FAILED provider attempt still consumes the cooldown', async () => {
    // The reservation is written before the send and counts regardless of
    // outcome, so a broken mailer cannot be retried into a mail-bomb.
    const ledger = makeSharedLedger();

    const first = await runConcurrentPair((args) => ledger.atomic(args));
    expect(first.providerCalls).toBe(1);

    // The send failed (no RESEND_API_KEY in this suite), and the next attempt is
    // still refused.
    const second = await runConcurrentPair((args) => ledger.atomic(args));
    expect(second.providerCalls).toBe(0);
    expect(second.statuses).toEqual([429, 429]);
  });
});

// ---------------------------------------------------------------------------
// Which e-mail, and the fresh link
// ---------------------------------------------------------------------------

describe('a NEW account that has never set a password', () => {
  it('generates a FRESH recovery link rather than reusing the expired one', async () => {
    const { tracker } = await run({ profile: { first_name: 'Ana', must_change_password: true } });

    expect(tracker.generateLinkCalls).toHaveLength(1);
    expect(tracker.generateLinkCalls[0]).toMatchObject({
      type: 'recovery',
      email: 'ana@example.com',
    });
  });

  it('points the fresh link at the canonical origin, not the request Host', async () => {
    const { tracker } = await run();
    expect(tracker.generateLinkCalls[0]).toMatchObject({
      options: { redirectTo: 'https://genera.example.org/reset-password' },
    });
  });

  it('502 when a fresh link cannot be minted, and the failure is audited', async () => {
    const { res, tracker } = await run({ generateLinkError: { message: 'gotrue is down' } });

    expect(res._getStatusCode()).toBe(502);
    expect(res._getJSONData().code).toBe('LINK_GENERATION_FAILED');
    // One row through the client: the failure. The reservation that authorised
    // the attempt was written inside the claim RPC, in the same transaction as
    // the check — which is the whole point of F5.
    const writes = auditWrites(tracker);
    expect(writes).toHaveLength(1);
    expect((writes[0].metadata as Record<string, unknown>).stage).toBe('generate_link');
  });

  it('502 when generateLink succeeds but returns no link', async () => {
    const { res } = await run({ generateLinkNull: true });
    expect(res._getStatusCode()).toBe(502);
  });
});

describe('an EXISTING account that already has a password', () => {
  it('does NOT mint a recovery link — it sends the access notice', async () => {
    // Sending "restablece tu contraseña" to somebody whose password is fine
    // trains the exact habit phishing relies on, and invalidates a working
    // credential for no reason.
    const { res, tracker } = await run({
      profile: { first_name: 'Ana', must_change_password: false },
    });

    expect(tracker.generateLinkCalls).toEqual([]);
    expect(res._getJSONData().kind).toBe('access_granted');
  });

  it('derives the choice from state, so it cannot go stale', async () => {
    const setup = await run({ profile: { first_name: 'Ana', must_change_password: true } });
    expect(setup.res._getJSONData().kind).toBe('password_setup');

    const notice = await run({ profile: { first_name: 'Ana', must_change_password: false } });
    expect(notice.res._getJSONData().kind).toBe('access_granted');
  });
});

// ---------------------------------------------------------------------------
// Delivery outcomes
// ---------------------------------------------------------------------------

describe('delivery outcomes', () => {
  it('reports MISSING configuration honestly, in es-CL, with a 200', async () => {
    // A 200 with `sent: false`: the reservation and the audit DID happen, and
    // the administrator's next step depends on knowing which part failed.
    const { res } = await run();

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.success).toBe(false);
    expect(body.email).toEqual({ sent: false, status: 'not_configured', reason: 'not_configured' });
    expect(body.message).toContain('el servicio de correo no está configurado');
  });

  it('records the outcome row after the attempt', async () => {
    const { tracker } = await run();
    const writes = auditWrites(tracker);
    // Exactly one row reaches the table through the client — the outcome. The
    // reservation is written by `claim_invitation_resend` inside the same
    // transaction as the check that authorised it, so it is not visible here.
    // Two rows per resend total, as before; one of them now has a lock behind it.
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ action: 'invitation_resent', outcome: 'failure' });
    expect((writes[0].metadata as Record<string, unknown>).stage).toBe('delivered');
    expect((writes[0].metadata as Record<string, unknown>).email_failure_reason).toBe(
      'not_configured'
    );
  });

  it('never returns or audits the action link', async () => {
    const { res, tracker } = await run();

    expect(res._getData()).not.toContain('token_hash');
    expect(res._getData()).not.toContain(HASHED_TOKEN);
    expect(res._getData()).not.toContain(RECOVERY_URL);
    expect(JSON.stringify(auditWrites(tracker))).not.toContain('token_hash');
    expect(JSON.stringify(auditWrites(tracker))).not.toContain(HASHED_TOKEN);
    expect(JSON.stringify(auditWrites(tracker))).not.toContain(RECOVERY_URL);
  });

  it('never returns the recipient address', async () => {
    const { res } = await run();
    expect(res._getData()).not.toContain('ana@example.com');
  });

  it('tells the caller the cooldown so the UI can explain the next retry', async () => {
    const { res } = await run();
    expect(res._getJSONData().cooldownMinutes).toBe(RESEND_COOLDOWN_MINUTES);
  });
});

describe('unexpected failures', () => {
  it('500 without leaking internals when the profile lookup errors', async () => {
    const { res } = await run({ profileError: { message: 'permission denied for table profiles' } });
    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error interno del servidor' });
  });
});
