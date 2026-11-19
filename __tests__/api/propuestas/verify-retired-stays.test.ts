// @vitest-environment node
/**
 * F20g send-back 1 (1): a retired link stays retired. The public code check
 * reads the proposal as «published», then (while bcrypt runs) an admin
 * retires it. The check's view-tracking update must carry the status it read,
 * so it matches no row and never writes «viewed» over «expired».
 * Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import bcrypt from 'bcryptjs';

const { h } = vi.hoisted(() => ({
  h: {
    row: {} as Record<string, unknown>,
    retireDuringVerify: false,
    updates: [] as Array<{ patch: Record<string, unknown>; eqs: Array<[string, unknown]>; matched: number }>,
  },
}));

vi.mock('@/lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const client = {
    from: (_table: string) => {
      const eqs: Array<[string, unknown]> = [];
      let patch: Record<string, unknown> | null = null;
      const chain: any = {
        select: () => chain,
        update: (p: Record<string, unknown>) => { patch = p; return chain; },
        eq: (c: string, v: unknown) => { eqs.push([c, v]); return chain; },
        single: async () => ({ data: { ...h.row }, error: null }),
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
          if (patch) {
            const matches = eqs.every(([c, v]) => h.row[c] === v);
            if (matches) Object.assign(h.row, patch);
            h.updates.push({ patch, eqs: [...eqs], matched: matches ? 1 : 0 });
          }
          return Promise.resolve({ data: null, error: null }).then(ok, ko);
        },
      };
      return chain;
    },
  };
  return { ...actual, createServiceRoleClient: () => client };
});

vi.mock('@/lib/propuestas-web/access-code', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    verifyAccessCode: vi.fn(async (code: string, hash: string) => {
      const ok = await bcrypt.compare(code, hash);
      // An admin retires the link while the code is being compared.
      if (h.retireDuringVerify) h.row.web_status = 'expired';
      return ok;
    }),
  };
});

vi.mock('@/lib/propuestas-web/access-rate-limit', () => ({
  getProposalRequestIp: () => '203.0.113.9',
  reserveProposalAccessAttempt: vi.fn(async () => ({ allowed: true, degraded: false, remaining: 4, attemptId: 'a1' })),
  releaseProposalAccessAttempt: vi.fn(async () => undefined),
}));
vi.mock('@/lib/propuestas-web/resolve-urls', () => ({ resolveSnapshotUrls: vi.fn(async (s: unknown) => s) }));

import verify from '@/pages/api/propuestas/web/[slug]/verify';

const CODE = 'ABC234';
let HASH = '';

async function postVerify() {
  const { req, res } = createMocks({ method: 'POST', query: { slug: 'escuela-inventada-evoluciona-2026-v1-55555555' }, body: { code: CODE } });
  await verify(req as never, res as never);
  return res;
}

beforeEach(async () => {
  HASH = HASH || (await bcrypt.hash(CODE, 4));
  h.updates = [];
  h.retireDuringVerify = false;
  h.row = { id: 'p1', access_code: HASH, web_status: 'published', viewed_at: null, view_count: 0, snapshot_json: { synthetic: true } };
});

describe('verify — a retired link stays retired (send-back 1)', () => {
  it('a verify that completes after the version was retired leaves it «expired»', async () => {
    h.retireDuringVerify = true;
    await postVerify();
    expect(h.row.web_status).toBe('expired');
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0].patch.web_status).toBe('viewed');
    expect(h.updates[0].eqs).toContainEqual(['web_status', 'published']);
    expect(h.updates[0].matched).toBe(0);
  });

  it('without a retirement, a published proposal still becomes «viewed» and is counted', async () => {
    const res = await postVerify();
    expect(res._getStatusCode()).toBe(200);
    expect(h.row.web_status).toBe('viewed');
    expect(h.row.view_count).toBe(1);
  });

  it('an already viewed proposal is still counted, only while it is still viewed', async () => {
    h.row.web_status = 'viewed';
    h.row.view_count = 3;
    await postVerify();
    expect(h.row.view_count).toBe(4);
    expect(h.updates[0].eqs).toContainEqual(['web_status', 'viewed']);
  });
});
