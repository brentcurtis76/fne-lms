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
const ACTION_LINK = 'https://genera.example.org/reset-password?token_hash=fresh-synthetic-token';

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
}

function makeTracker(): Tracker {
  return { fromCalls: [], generateLinkCalls: [] };
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
  /** Rows the audit ledger lookup returns — non-empty means "recently sent". */
  recentAudit?: unknown[];
  auditLookupError?: { message: string } | null;
  /** Fails the reservation insert (the fail-closed write). */
  auditInsertError?: { message: string } | null;
  profile?: Record<string, unknown> | null;
  profileError?: { message: string } | null;
  generateLinkError?: { message: string } | null;
  generateLinkNull?: boolean;
}

function buildClient(tracker: Tracker, opts: ClientOptions = {}) {
  let auditReadDone = false;

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

  return {
    auth: {
      admin: {
        generateLink: vi.fn(async (params: unknown) => {
          tracker.generateLinkCalls.push(params);
          if (opts.generateLinkError) return { data: null, error: opts.generateLinkError };
          if (opts.generateLinkNull) return { data: { properties: {} }, error: null };
          return { data: { properties: { action_link: ACTION_LINK } }, error: null };
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
        // The FIRST touch is the ledger read; every later one is a write.
        if (!auditReadDone) {
          auditReadDone = true;
          return chain(table, {
            data: opts.recentAudit ?? [],
            error: opts.auditLookupError ?? null,
          });
        }
        return chain(table, { data: null, error: opts.auditInsertError ?? null });
      }
      if (table === 'profiles') {
        return chain(table, {
          data: 'profile' in opts ? opts.profile : { first_name: 'Ana', must_change_password: true },
          error: opts.profileError ?? null,
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

describe('repeated resends', () => {
  it('429 when a resend already happened inside the cooldown', async () => {
    const { res, tracker } = await run({
      recentAudit: [{ occurred_at: new Date().toISOString() }],
    });

    expect(res._getStatusCode()).toBe(429);
    expect(res._getJSONData().code).toBe('RESEND_TOO_SOON');
    expect(res._getJSONData().retryAfterMinutes).toBe(RESEND_COOLDOWN_MINUTES);
    // Nothing was reserved and nothing was sent.
    expect(auditWrites(tracker)).toEqual([]);
    expect(tracker.generateLinkCalls).toEqual([]);
  });

  it('counts FAILED attempts too — a rejection must not reset the cooldown', async () => {
    const { tracker } = await run();
    const ledgerRead = tracker.fromCalls.find(
      (c) => c.table === 'security_audit_events' && c.selects.length > 0
    )!;
    expect(ledgerRead.ins).toContainEqual({
      col: 'outcome',
      vals: ['success', 'failure', 'partial_failure'],
    });
  });

  it('queries the ledger scoped to this target and this action', async () => {
    const { tracker } = await run();
    const ledgerRead = tracker.fromCalls.find(
      (c) => c.table === 'security_audit_events' && c.selects.length > 0
    )!;
    expect(ledgerRead.eqs).toContainEqual({ col: 'action', val: 'invitation_resent' });
    expect(ledgerRead.eqs).toContainEqual({ col: 'target_user_id', val: LINKED_USER_ID });
  });

  it('FAILS CLOSED when the ledger cannot be READ', async () => {
    // "No recent resend" and "cannot tell" must not collapse into the same
    // answer, or an unreadable trail becomes an unlimited allowance to mail
    // recovery links at an address.
    const { res, tracker } = await run({ auditLookupError: { message: 'connection reset' } });

    expect(res._getStatusCode()).toBe(503);
    expect(res._getJSONData().code).toBe('AUDIT_UNAVAILABLE');
    expect(tracker.generateLinkCalls).toEqual([]);
  });

  it('FAILS CLOSED when the reservation cannot be WRITTEN — nothing is sent', async () => {
    const { res, tracker } = await run({ auditInsertError: { message: 'insert failed' } });

    expect(res._getStatusCode()).toBe(503);
    expect(res._getJSONData().code).toBe('AUDIT_UNAVAILABLE');
    expect(res._getJSONData().error).toContain('no se envió nada');
    expect(tracker.generateLinkCalls).toEqual([]);
  });

  it('reserves the slot BEFORE sending', async () => {
    const { tracker } = await run();
    const writes = auditWrites(tracker);
    // Row 1 is the reservation, written as a failure because at that instant
    // that is what it is.
    expect(writes[0]).toMatchObject({
      action: 'invitation_resent',
      outcome: 'failure',
      target_user_id: LINKED_USER_ID,
    });
    expect((writes[0].metadata as Record<string, unknown>).stage).toBe('requested');
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
    const writes = auditWrites(tracker);
    expect((writes[1].metadata as Record<string, unknown>).stage).toBe('generate_link');
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
    expect(body.email).toEqual({ sent: false, reason: 'not_configured' });
    expect(body.message).toContain('el servicio de correo no está configurado');
  });

  it('records the outcome row after the attempt', async () => {
    const { tracker } = await run();
    const writes = auditWrites(tracker);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toMatchObject({ action: 'invitation_resent', outcome: 'failure' });
    expect((writes[1].metadata as Record<string, unknown>).stage).toBe('delivered');
    expect((writes[1].metadata as Record<string, unknown>).email_failure_reason).toBe(
      'not_configured'
    );
  });

  it('never returns or audits the action link', async () => {
    const { res, tracker } = await run();

    expect(res._getData()).not.toContain('token_hash');
    expect(res._getData()).not.toContain(ACTION_LINK);
    expect(JSON.stringify(auditWrites(tracker))).not.toContain('token_hash');
    expect(JSON.stringify(auditWrites(tracker))).not.toContain(ACTION_LINK);
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
