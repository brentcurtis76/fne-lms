// @vitest-environment node
/**
 * S3 — the centralised audit writer.
 *
 * The defect being fixed is unusual in that the code looked correct at every
 * call site: eight of them inserted a well-formed row into `public.audit_logs`
 * and handled the error path politely. The table has never existed, so every
 * one of those inserts returned 42P01 and every one of those polite handlers
 * swallowed it. The platform reported a complete audit trail and kept none.
 *
 * What is under test here:
 *   - the row shape actually written,
 *   - the sanitiser, which is the application half of a two-layer privacy
 *     guarantee (the storage half is the CHECK constraint, covered by
 *     supabase/tests/050-security-audit-events-rls.sql),
 *   - that the writer NEVER throws, which is what makes the fail-open decision
 *     safe to state,
 *   - and that the lookup used for rate limiting distinguishes "nothing recent"
 *     from "cannot tell", so a fail-closed caller can stay fail-closed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SECURITY_AUDIT_ACTIONS,
  SECURITY_AUDIT_TABLE,
  findRecentSecurityAudit,
  recordSecurityAudit,
  sanitiseAuditMetadata,
} from '../../../lib/security/audit';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const TARGET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

interface InsertCapture {
  table: string;
  row: Record<string, unknown>;
}

function makeClient(result: { error?: unknown } = {}) {
  const inserts: InsertCapture[] = [];
  const client = {
    from: vi.fn((table: string) => ({
      insert: vi.fn(async (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return { data: null, error: result.error ?? null };
      }),
    })),
  };
  return { client: client as never, inserts };
}

/** A client whose `.from()` throws — the "the SDK itself blew up" path. */
function makeThrowingClient(message = 'network down') {
  return {
    from: vi.fn(() => {
      throw new Error(message);
    }),
  } as never;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  errorSpy.mockRestore();
  vi.clearAllMocks();
});

describe('recordSecurityAudit — the row that lands', () => {
  it('writes to security_audit_events, not the phantom audit_logs', async () => {
    const { client, inserts } = makeClient();
    await recordSecurityAudit(client, { action: 'password_reset_admin', outcome: 'success' });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe(SECURITY_AUDIT_TABLE);
    expect(inserts[0].table).not.toBe('audit_logs');
  });

  it('maps the event onto the table columns', async () => {
    const { client, inserts } = makeClient();
    const result = await recordSecurityAudit(client, {
      action: 'password_reset_admin',
      outcome: 'success',
      actorUserId: ACTOR,
      actorRole: 'equipo_directivo',
      targetUserId: TARGET,
      schoolId: 42,
      metadata: { requester_role: 'equipo_directivo' },
    });

    expect(result).toEqual({ recorded: true });
    expect(inserts[0].row).toEqual({
      action: 'password_reset_admin',
      outcome: 'success',
      actor_user_id: ACTOR,
      actor_role: 'equipo_directivo',
      target_user_id: TARGET,
      school_id: 42,
      metadata: { requester_role: 'equipo_directivo' },
    });
  });

  it('does not write occurred_at — the database stamps it', async () => {
    const { client, inserts } = makeClient();
    await recordSecurityAudit(client, { action: 'role_assigned', outcome: 'success' });
    expect(inserts[0].row).not.toHaveProperty('occurred_at');
  });

  it('nulls a non-uuid actor or target rather than sending junk to a uuid column', async () => {
    const { client, inserts } = makeClient();
    await recordSecurityAudit(client, {
      action: 'role_assigned',
      outcome: 'success',
      actorUserId: 'not-a-uuid',
      targetUserId: '',
    });
    expect(inserts[0].row.actor_user_id).toBeNull();
    expect(inserts[0].row.target_user_id).toBeNull();
  });

  it('nulls a non-integer school id', async () => {
    const { client, inserts } = makeClient();
    await recordSecurityAudit(client, {
      action: 'role_assigned',
      outcome: 'success',
      schoolId: Number.NaN,
    });
    expect(inserts[0].row.school_id).toBeNull();
  });

  it('defaults metadata to an empty object', async () => {
    const { client, inserts } = makeClient();
    await recordSecurityAudit(client, { action: 'role_assigned', outcome: 'success' });
    expect(inserts[0].row.metadata).toEqual({});
  });
});

describe('recordSecurityAudit — never throws', () => {
  it('reports a returned error instead of throwing', async () => {
    const { client } = makeClient({ error: { message: 'relation does not exist' } });
    const result = await recordSecurityAudit(client, {
      action: 'password_reset_admin',
      outcome: 'success',
    });

    expect(result.recorded).toBe(false);
    expect(result.error).toBe('relation does not exist');
  });

  it('reports a thrown error instead of propagating it', async () => {
    const result = await recordSecurityAudit(makeThrowingClient(), {
      action: 'password_reset_admin',
      outcome: 'success',
    });

    expect(result.recorded).toBe(false);
    expect(result.error).toBe('network down');
  });

  // The failure has to be alertable, or "fail open" becomes "fail silent" —
  // which is exactly the state the phantom table left the platform in.
  it('logs every failure under the stable [security-audit] prefix', async () => {
    const { client } = makeClient({ error: { message: 'boom' } });
    await recordSecurityAudit(client, { action: 'role_assigned', outcome: 'success' });

    expect(errorSpy).toHaveBeenCalledWith(
      '[security-audit] write failed',
      expect.objectContaining({ action: 'role_assigned', error: 'boom' })
    );
  });

  it('logs a thrown failure under the same prefix', async () => {
    await recordSecurityAudit(makeThrowingClient(), { action: 'role_assigned', outcome: 'success' });
    expect(errorSpy).toHaveBeenCalledWith('[security-audit] write threw', expect.any(Object));
  });
});

describe('sanitiseAuditMetadata — the privacy guarantee, application half', () => {
  it.each([
    'password',
    'temporaryPassword',
    'temporary_password',
    'Temporary_Password',
    'newPassword',
    'currentPassword',
    'contrasena',
    'credentials',
    'token',
    'token_hash',
    'access_token',
    'refresh_token',
    'apiKey',
    'api_key',
    'secret',
    'authorization',
    'cookie',
    'actionLink',
    'action_link',
    'recoveryUrl',
    'recovery_url',
    'reset_url',
    'html',
    'email_body',
    'email',
    'emailAddress',
    'to',
    'from',
    'body',
  ])('drops the forbidden key %s', (key) => {
    const sanitised = sanitiseAuditMetadata({ [key]: 'sensitive', kept: 'ok' });
    expect(sanitised).not.toHaveProperty(key);
    expect(sanitised.kept).toBe('ok');
  });

  it('keeps email_domain — the security signal without the identity', () => {
    expect(sanitiseAuditMetadata({ email_domain: 'example.com' })).toEqual({
      email_domain: 'example.com',
    });
  });

  it('strips forbidden keys RECURSIVELY, where the storage CHECK cannot reach', () => {
    const sanitised = sanitiseAuditMetadata({
      outer: { inner: { password: 'sensitive', role: 'docente' } },
    });
    expect(sanitised).toEqual({ outer: { inner: { role: 'docente' } } });
  });

  it('strips forbidden keys inside arrays', () => {
    const sanitised = sanitiseAuditMetadata({
      rows: [{ email: 'someone@example.com', status: 'created' }],
    });
    expect(sanitised).toEqual({ rows: [{ status: 'created' }] });
  });

  // The values that arrive without an incriminating key.
  it('redacts a URL value even under an innocent key', () => {
    expect(
      sanitiseAuditMetadata({ detail: 'https://example.com/reset-password?token_hash=abc' })
    ).toEqual({ detail: '[redacted-url]' });
  });

  it('redacts a query string carrying a token even without a scheme', () => {
    expect(sanitiseAuditMetadata({ detail: '/reset-password?token_hash=abc' })).toEqual({
      detail: '[redacted-url]',
    });
  });

  it('redacts a JWT-shaped value', () => {
    expect(
      sanitiseAuditMetadata({ detail: 'bearer eyJhbGciOiJIUzI1NiJ9.payload.signature' })
    ).toEqual({ detail: '[redacted-token]' });
  });

  it('truncates a long string rather than storing it whole', () => {
    const sanitised = sanitiseAuditMetadata({ note: 'x'.repeat(500) });
    expect(String(sanitised.note)).toHaveLength(201); // 200 + ellipsis
  });

  it('caps array length', () => {
    const sanitised = sanitiseAuditMetadata({ items: Array.from({ length: 100 }, (_, i) => i) });
    expect(sanitised.items).toHaveLength(20);
  });

  it('truncates beyond the depth limit instead of recursing forever', () => {
    const sanitised = sanitiseAuditMetadata({ a: { b: { c: { d: { e: 'deep' } } } } });
    expect(JSON.stringify(sanitised)).toContain('[truncated]');
  });

  it('survives a cyclic object without hanging', () => {
    const cyclic: Record<string, unknown> = { name: 'loop' };
    cyclic.self = cyclic;
    expect(() => sanitiseAuditMetadata(cyclic)).not.toThrow();
  });

  it('replaces an oversized payload with a marker rather than refusing the write', () => {
    // Losing the detail is survivable; losing the fact that the operation
    // happened is not — so an over-large payload degrades to a marker rather
    // than failing the insert.
    const oversized: Record<string, unknown> = { other: 'kept' };
    for (let i = 0; i < 40; i += 1) oversized[`field_${i}`] = 'y'.repeat(200);

    const sanitised = sanitiseAuditMetadata(oversized);
    expect(sanitised.truncated).toBe(true);
    expect(sanitised.keys).toEqual(expect.arrayContaining(['other']));
    expect(JSON.stringify(sanitised).length).toBeLessThan(4096);
  });

  it.each([
    ['undefined', undefined],
    ['an array', ['not', 'an', 'object'] as unknown],
    ['a string', 'nope' as unknown],
  ])('returns an empty object for %s', (_label, input) => {
    expect(sanitiseAuditMetadata(input as never)).toEqual({});
  });

  it('drops values that cannot be represented in jsonb', () => {
    const sanitised = sanitiseAuditMetadata({
      fn: () => 'nope',
      sym: Symbol('nope'),
      inf: Number.POSITIVE_INFINITY,
      ok: 'kept',
    });
    expect(sanitised).toEqual({ fn: null, sym: null, inf: null, ok: 'kept' });
  });

  // End to end through the writer: a call site that hands over a secret must
  // not be able to persist it, even though the writer trusts its callers.
  it('a careless call site cannot get a secret into the row', async () => {
    const { client, inserts } = makeClient();
    await recordSecurityAudit(client, {
      action: 'password_reset_admin',
      outcome: 'success',
      metadata: {
        temporaryPassword: 'Sintetica2026',
        nested: { action_link: 'https://example.com/x' },
      },
    });

    const serialised = JSON.stringify(inserts[0].row);
    expect(serialised).not.toContain('Sintetica2026');
    expect(serialised).not.toContain('example.com/x');
  });
});

describe('findRecentSecurityAudit — the rate-limit ledger', () => {
  function makeQueryClient(response: { data?: unknown[]; error?: unknown }) {
    const calls: Record<string, unknown>[] = [];
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'gte', 'order']) {
      builder[method] = vi.fn((...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      });
    }
    builder.limit = vi.fn(async (...args: unknown[]) => {
      calls.push({ method: 'limit', args });
      return { data: response.data ?? null, error: response.error ?? null };
    });
    return { client: { from: vi.fn(() => builder) } as never, calls };
  }

  it('finds the most recent matching event', async () => {
    const { client, calls } = makeQueryClient({ data: [{ occurred_at: '2026-08-18T10:00:00Z' }] });
    const result = await findRecentSecurityAudit(client, {
      action: 'invitation_resent',
      targetUserId: TARGET,
      since: '2026-08-18T09:00:00Z',
    });

    expect(result).toEqual({ found: true, occurredAt: '2026-08-18T10:00:00Z' });
    expect(calls).toContainEqual({ method: 'eq', args: ['action', 'invitation_resent'] });
    expect(calls).toContainEqual({ method: 'eq', args: ['target_user_id', TARGET] });
    expect(calls).toContainEqual({ method: 'gte', args: ['occurred_at', '2026-08-18T09:00:00Z'] });
  });

  it('counts successes only by default', async () => {
    const { client, calls } = makeQueryClient({ data: [] });
    await findRecentSecurityAudit(client, {
      action: 'invitation_resent',
      targetUserId: TARGET,
      since: '2026-08-18T09:00:00Z',
    });
    expect(calls).toContainEqual({ method: 'in', args: ['outcome', ['success']] });
  });

  it('reports "nothing recent" as found: false with NO error', async () => {
    const { client } = makeQueryClient({ data: [] });
    const result = await findRecentSecurityAudit(client, {
      action: 'invitation_resent',
      targetUserId: TARGET,
      since: '2026-08-18T09:00:00Z',
    });
    expect(result).toEqual({ found: false });
  });

  // The distinction the whole fail-closed decision rests on: "no recent resend"
  // and "cannot tell whether there was one" must not be the same answer, or an
  // unreadable trail silently becomes an unlimited resend allowance.
  it('reports a lookup failure as an ERROR, distinguishable from "nothing recent"', async () => {
    const { client } = makeQueryClient({ error: { message: 'connection reset' } });
    const result = await findRecentSecurityAudit(client, {
      action: 'invitation_resent',
      targetUserId: TARGET,
      since: '2026-08-18T09:00:00Z',
    });
    expect(result.found).toBe(false);
    expect(result.error).toBe('connection reset');
  });

  it('reports a thrown lookup failure the same way, without propagating', async () => {
    const result = await findRecentSecurityAudit(makeThrowingClient('socket hang up'), {
      action: 'invitation_resent',
      targetUserId: TARGET,
      since: '2026-08-18T09:00:00Z',
    });
    expect(result.found).toBe(false);
    expect(result.error).toBe('socket hang up');
  });
});

describe('SECURITY_AUDIT_ACTIONS', () => {
  it('has no duplicates', () => {
    expect(new Set(SECURITY_AUDIT_ACTIONS).size).toBe(SECURITY_AUDIT_ACTIONS.length);
  });

  it('covers every operation the remediation is required to audit', () => {
    for (const required of [
      'password_reset_admin',
      'password_change_voluntary',
      'password_change_forced',
      'user_created_manual',
      'user_created_bulk',
      'bulk_credentials_delivered',
      'role_assigned',
      'invitation_resent',
    ]) {
      expect(SECURITY_AUDIT_ACTIONS).toContain(required);
    }
  });
});
