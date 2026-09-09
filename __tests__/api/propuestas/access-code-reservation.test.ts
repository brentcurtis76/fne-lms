// @vitest-environment node
/**
 * R2-02 (2026-09-07) — attempt accounting is a prerequisite of verification, at
 * BOTH public callers:
 *   pages/api/propuestas/web/[slug]/verify.ts
 *   lib/propuestas-web/download-access.ts
 *
 * Codex reproduced, against the previous code with a synthetic database double
 * whose counts read zero and whose inserts failed, twelve wrong guesses (401 each)
 * followed by a correct guess that succeeded — thirteen verifications, no
 * accounting. This suite replays that scenario against both callers and asserts
 * the corrected behaviour: no guess is compared without a successful reservation;
 * a write failure answers 503 and the comparison never runs; an exhausted window
 * answers 429 before comparison; a correct code releases its reservation; a
 * failed release leaves the slot consumed. The comparison itself is instrumented
 * so "reached verification" is observable. Synthetic hash and code only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import bcrypt from 'bcryptjs';

const { mockRpc, mockFrom, mockCheckIsAdmin, verifySpy } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockCheckIsAdmin: vi.fn(),
  verifySpy: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createServiceRoleClient: () => ({ rpc: mockRpc, from: mockFrom }),
    checkIsAdmin: mockCheckIsAdmin,
  };
});

vi.mock('../../../lib/propuestas-web/access-code', async (importOriginal) => {
  const actual = (await importOriginal()) as { verifyAccessCode: (c: string, h: string) => Promise<boolean> };
  return {
    ...actual,
    verifyAccessCode: (code: string, hash: string) => {
      verifySpy(code);
      return actual.verifyAccessCode(code, hash);
    },
  };
});

vi.mock('../../../lib/propuestas-web/resolve-urls', () => ({
  resolveSnapshotUrls: async (s: unknown) => s,
}));

import verifyHandler from '../../../pages/api/propuestas/web/[slug]/verify';
import { authorizeProposalDownload } from '../../../lib/propuestas-web/download-access';

const CORRECT = 'ABC234';
const WRONG = 'ZZZ999';
let HASH = '';

/**
 * Synthetic limiter state: a counter that can be told its writes fail. The
 * reservation RPC is what the database would do — count, and record when under
 * the limit — except that "insert fails" is simulated as an RPC error, which is
 * exactly what a failing INSERT inside the SECURITY DEFINER function produces.
 */
function installLimiter(opts: { writesFail?: boolean; max?: number; releaseFails?: boolean } = {}) {
  const state = { recorded: 0, released: 0 };
  const max = opts.max ?? 5;
  mockRpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    if (fn === 'reserve_propuesta_access_attempt') {
      if (opts.writesFail) return { data: null, error: { message: 'synthetic insert failure (write path down)' } };
      if (state.recorded - state.released >= max) return { data: { allowed: false, remaining: 0, attempt_id: null }, error: null };
      state.recorded += 1;
      return { data: { allowed: true, remaining: max - (state.recorded - state.released), attempt_id: state.recorded }, error: null };
    }
    if (fn === 'release_propuesta_access_attempt') {
      if (opts.releaseFails) return { data: null, error: { message: 'synthetic delete failure' } };
      state.released += 1;
      return { data: true, error: null };
    }
    throw new Error(`unexpected rpc ${fn} ${JSON.stringify(args)}`);
  });
  return state;
}

/** propuesta_generadas lookup double for verify.ts (and view tracking update). */
function installProposalTable() {
  mockFrom.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'update']) chain[m] = () => chain;
    chain.single = async () => ({
      data: table === 'propuesta_generadas'
        ? { id: 'p1', access_code: HASH, web_status: 'published', viewed_at: null, view_count: 0, snapshot_json: { synthetic: true } }
        : null,
      error: null,
    });
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve);
    return chain;
  });
}

async function postVerify(code: string) {
  const { req, res } = createMocks({
    method: 'POST',
    query: { slug: 'synthetic-slug' },
    body: { code },
    headers: { 'x-forwarded-for': '203.0.113.9' },
  });
  await verifyHandler(req as never, res as never);
  return res;
}

async function download(code: string) {
  const { req, res } = createMocks({ method: 'GET', headers: { 'x-forwarded-for': '203.0.113.9' } });
  return authorizeProposalDownload(req as never, res as never, { rpc: mockRpc, from: mockFrom } as never, 'synthetic-slug', HASH, code);
}

beforeEach(async () => {
  HASH = HASH || (await bcrypt.hash(CORRECT, 4));
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: false });
  installProposalTable();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Codex reproduction: limiter reads work, writes fail', () => {
  it('verify.ts: twelve wrong guesses and a correct one — NONE reaches verification, every answer is 503', async () => {
    installLimiter({ writesFail: true });
    for (let i = 0; i < 12; i += 1) {
      const res = await postVerify(WRONG);
      expect(res._getStatusCode()).toBe(503);
    }
    const correct = await postVerify(CORRECT);
    expect(correct._getStatusCode()).toBe(503);
    expect(correct._getJSONData()).not.toHaveProperty('data');
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it('download-access.ts: the same thirteen attempts are refused with 503 before comparison', async () => {
    installLimiter({ writesFail: true });
    for (let i = 0; i < 12; i += 1) {
      const r = await download(WRONG);
      expect(r).toMatchObject({ ok: false, status: 503 });
    }
    const r = await download(CORRECT);
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(verifySpy).not.toHaveBeenCalled();
  });
});

describe('verify.ts — reservation precedes verification', () => {
  it('a correct code with a healthy limiter succeeds, and its reservation is released', async () => {
    const state = installLimiter();
    const res = await postVerify(CORRECT);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().data.snapshot).toEqual({ synthetic: true });
    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(state).toEqual({ recorded: 1, released: 1 });
    // reserve was called BEFORE verify
    const reserveOrder = mockRpc.mock.invocationCallOrder[0];
    expect(reserveOrder).toBeLessThan(verifySpy.mock.invocationCallOrder[0]);
  });

  it('limit exhaustion: five wrong guesses are 401 with a descending remaining, the sixth (even correct) is 429 and is never compared', async () => {
    installLimiter();
    const remaining: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await postVerify(WRONG);
      expect(res._getStatusCode()).toBe(401);
      remaining.push(res._getJSONData().remaining);
    }
    expect(remaining).toEqual([4, 3, 2, 1, 0]);
    expect(verifySpy).toHaveBeenCalledTimes(5);
    const sixth = await postVerify(CORRECT);
    expect(sixth._getStatusCode()).toBe(429);
    expect(verifySpy).toHaveBeenCalledTimes(5);
  });

  it('a failed release keeps the slot consumed (fail-closed) and still answers the snapshot', async () => {
    const state = installLimiter({ releaseFails: true });
    const res = await postVerify(CORRECT);
    expect(res._getStatusCode()).toBe(200);
    expect(state).toEqual({ recorded: 1, released: 0 });
  });

  it('a malformed body is 400 and reserves nothing (not a guess)', async () => {
    const state = installLimiter();
    const { req, res } = createMocks({ method: 'POST', query: { slug: 'synthetic-slug' }, body: {} });
    await verifyHandler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
    expect(state.recorded).toBe(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('an unknown proposal is 404 and reserves nothing', async () => {
    const state = installLimiter();
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq']) chain[m] = () => chain;
      chain.single = async () => ({ data: null, error: { message: 'not found' } });
      return chain;
    });
    const res = await postVerify(WRONG);
    expect(res._getStatusCode()).toBe(404);
    expect(state.recorded).toBe(0);
  });

  it('concurrent guesses: ten simultaneous wrong guesses admit at most five comparisons', async () => {
    installLimiter();
    const results = await Promise.all(Array.from({ length: 10 }, () => postVerify(WRONG)));
    const statuses = results.map((r) => r._getStatusCode()).sort();
    expect(statuses.filter((s) => s === 401)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(5);
    expect(verifySpy).toHaveBeenCalledTimes(5);
  });
});

describe('download-access.ts — reservation precedes verification', () => {
  it('legitimate success releases the reservation', async () => {
    const state = installLimiter();
    expect(await download(CORRECT)).toEqual({ ok: true });
    expect(state).toEqual({ recorded: 1, released: 1 });
  });

  it('wrong code: 401 with the remaining count already accounted for', async () => {
    installLimiter();
    expect(await download(WRONG)).toEqual({ ok: false, status: 401, error: 'Codigo de sesion invalido', remaining: 4 });
  });

  it('exhausted window: 429 before comparison', async () => {
    installLimiter({ max: 0 });
    const r = await download(CORRECT);
    expect(r).toMatchObject({ ok: false, status: 429 });
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it('a missing hash is a 500 configuration error before any limiter call', async () => {
    installLimiter();
    const { req, res } = createMocks({ method: 'GET' });
    const r = await authorizeProposalDownload(req as never, res as never, { rpc: mockRpc } as never, 'slug', null, CORRECT);
    expect(r).toMatchObject({ ok: false, status: 500 });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('no code: falls through to the admin preview check without touching the limiter', async () => {
    installLimiter();
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true });
    expect(await download('')).toEqual({ ok: true });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
