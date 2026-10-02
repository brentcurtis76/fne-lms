// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { lpReportAll, lpReportVisibleUsers } from '../../../lib/learning-paths/reportScopeDb';

type Answer = { data: unknown; error: unknown } | Error;

function client(all: Answer, perUser: Record<string, Answer> = {}) {
  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
    const answer = fn === 'auth_lp_report_all' ? all : perUser[String(args?.p_user)] ?? { data: false, error: null };
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return { rpc };
}

describe('learning-path report scope (database answers, fail closed)', () => {
  it('all-scope true admits everyone with a single check', async () => {
    const c = client({ data: true, error: null });
    expect([...(await lpReportVisibleUsers(c, ['a', 'b', 'a']))].sort()).toEqual(['a', 'b']);
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });

  it('a failed all-scope check returns no one and makes no per-person calls', async () => {
    for (const failure of [{ data: null, error: { message: 'boom' } }, new Error('network')] as Answer[]) {
      const c = client(failure);
      expect((await lpReportVisibleUsers(c, ['a', 'b'])).size).toBe(0);
      expect(c.rpc).toHaveBeenCalledTimes(1);
      expect(await lpReportAll(client(failure))).toBe(false);
    }
  });

  it('per-person: only explicit TRUE admits; errors and rejections leave that person out', async () => {
    const c = client({ data: false, error: null }, {
      a: { data: true, error: null },
      b: { data: false, error: null },
      c: { data: null, error: { message: 'boom' } },
      d: new Error('network'),
      e: { data: 'true', error: null },
    });
    expect([...(await lpReportVisibleUsers(c, ['a', 'b', 'c', 'd', 'e']))]).toEqual(['a']);
  });

  it('per-person checks run in bounded batches', async () => {
    let inFlight = 0;
    let peak = 0;
    const rpc = vi.fn(async (fn: string) => {
      if (fn === 'auth_lp_report_all') return { data: false, error: null };
      inFlight += 1; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return { data: true, error: null };
    });
    const ids = Array.from({ length: 60 }, (_, i) => `u${i}`);
    expect((await lpReportVisibleUsers({ rpc }, ids)).size).toBe(60);
    expect(peak).toBeLessThanOrEqual(25);
  });
});
