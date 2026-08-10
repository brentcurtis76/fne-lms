// @vitest-environment node
/**
 * Z3-r9 [V1] [V2] (Sol M4) — the request-scoped budget, at the layer that owns it.
 *
 * ## The defect this file is the standing proof against
 *
 * `lib/zoom/client.ts` was written for the cron worker: three attempts, exponential
 * backoff, and up to two 60 s `Retry-After` sleeps honoured inline, over a `fetch` that
 * has no default timeout of its own. Z3-2 put that client on the HTTP request path —
 * `getUserZak`, from `POST /api/meet/session/[id]/join` — where none of those bounds are
 * bounds a user is willing to sit through, and the never-settling case has no bound at
 * all. The route promises that every SDK failure degrades to link mode; a call that
 * never returns never reaches the link response.
 *
 * So the assertions here are about the three places the signal has to REACH, because a
 * budget that only wraps the outermost promise leaves the socket and the timer running:
 *
 *  - the `fetch` itself — asserted by identity, not by "a signal was passed";
 *  - `tokens.getToken()`, so a stalled grant cannot spend the budget either;
 *  - every backoff and `Retry-After` sleep, asserted against the REAL timer rather than
 *    an injected spy, because "the injected sleep was called with 60000" is exactly the
 *    assertion a worker-policy bug passes.
 *
 * The last block is the negative control: with no signal, the worker policy is
 * byte-for-byte what it was.
 *
 * No credentials, real or synthetic — nothing here has a body worth naming.
 */
import { describe, it, expect, vi } from 'vitest';
import { createZoomClient, type ZoomClientDeps } from '../../../lib/zoom/client';
import { isZoomError } from '../../../lib/zoom/errors';
import type { ZoomTokenProvider } from '../../../lib/zoom/token';

/** Small enough that a real 60 s `Retry-After` is unmistakable if it is honoured. */
const BUDGET_MS = 60;

/** Generous: this asserts "not a worker sleep", not a latency figure. */
const BUDGET_SLACK_MS = 4_000;

const ZAK_PATH = '/users/synthetic-host/token';

function budget(ms: number = BUDGET_MS): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  // Nothing in this process should be kept alive by the budget itself.
  if (typeof timer === 'object' && timer && 'unref' in timer) (timer as { unref(): void }).unref();
  return controller.signal;
}

function tokensThatWork(): ZoomTokenProvider {
  return {
    async getToken() {
      return 'synthetic-access-token';
    },
    async forceRefresh() {
      return 'synthetic-access-token';
    },
  };
}

/**
 * A client with NO injected sleep, so the backoff and `Retry-After` waits are the real
 * timers production uses. That is the point of this file.
 */
function build(fetchImpl: unknown, overrides: Partial<ZoomClientDeps> = {}) {
  return createZoomClient({
    fetchImpl: fetchImpl as typeof fetch,
    tokenProvider: tokensThatWork(),
    ...overrides,
  });
}

async function elapsed(work: () => Promise<unknown>): Promise<{ ms: number; error: unknown }> {
  const started = Date.now();
  const error = await work().then(
    () => null,
    (caught: unknown) => caught
  );
  return { ms: Date.now() - started, error };
}

function expectBudgetExhausted(error: unknown) {
  expect(isZoomError(error)).toBe(true);
  const zoomError = error as { message: string; kind: string; outcome?: string };
  expect(zoomError.message).toContain("the caller's budget expired");
  // Ambiguous, not `not_executed`: abandoning a request in flight says nothing about
  // whether Zoom received it.
  expect(zoomError.outcome).toBe('ambiguous');
  // …and it names the OPERATION and nothing else. The success body of this endpoint is
  // a credential, so the message may carry the path (`/users/{id}/token`) and no value.
  expect(zoomError.message).toContain(`GET ${ZAK_PATH}`);
}

describe('[V2] the signal reaches the actual fetch', () => {
  it('hands the CALLER’S signal to fetch — the same object, not a copy', async () => {
    const signal = budget(10_000);
    const seen: Array<AbortSignal | null | undefined> = [];
    const impl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      seen.push(init?.signal);
      return new Response(JSON.stringify({ token: 'x' }), { status: 200 });
    });

    await build(impl).get(ZAK_PATH, { type: 'zak' }, { signal });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(signal);
  });

  it('passes no signal at all when the caller set no budget', async () => {
    const seen: Array<AbortSignal | null | undefined> = [];
    const impl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      seen.push(init?.signal);
      return new Response(JSON.stringify({ token: 'x' }), { status: 200 });
    });

    await build(impl).get(ZAK_PATH, { type: 'zak' });

    // Key-absence: a worker must keep the behaviour it had, and an `undefined` signal
    // handed to a real `fetch` is not the same thing as no key.
    expect(seen[0]).toBeUndefined();
  });
});

describe('[V1] a transport that never settles', () => {
  it('ends on the budget rather than pending forever, even when fetch ignores the signal', async () => {
    // Deliberately signal-blind: the outer bound is what has to hold when the transport
    // will not co-operate, and a co-operative double would test the double.
    const impl = vi.fn(() => new Promise<Response>(() => {}));

    const { ms, error } = await elapsed(() =>
      build(impl).get(ZAK_PATH, { type: 'zak' }, { signal: budget() })
    );

    expectBudgetExhausted(error);
    expect(ms).toBeLessThan(BUDGET_MS + BUDGET_SLACK_MS);
    // One attempt. An exhausted budget is terminal — it must not feed the retry loop.
    expect(impl).toHaveBeenCalledTimes(1);
  });

  it('drops the socket when the transport DOES honour the signal', async () => {
    const impl = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('The operation was aborted.', 'AbortError')),
            { once: true }
          );
        })
    );

    const { ms, error } = await elapsed(() =>
      build(impl).get(ZAK_PATH, { type: 'zak' }, { signal: budget() })
    );

    // Reported as a budget, not as the transport failure it superficially resembles.
    expectBudgetExhausted(error);
    expect(ms).toBeLessThan(BUDGET_MS + BUDGET_SLACK_MS);
  });
});

describe('[V1] a repeated 429 with a worker-sized Retry-After', () => {
  it('does not serve a 60 s wait to somebody who clicked a button', async () => {
    const impl = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 429, message: 'rate limited' }), {
          status: 429,
          headers: { 'retry-after': '60' },
        })
    );

    const { ms, error } = await elapsed(() =>
      build(impl).get(ZAK_PATH, { type: 'zak' }, { signal: budget() })
    );

    expectBudgetExhausted(error);
    // The assertion that matters: 60 s was the honoured wait before this change.
    expect(ms).toBeLessThan(BUDGET_MS + BUDGET_SLACK_MS);
    expect(impl.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('still honours the whole worker policy when there is no budget', async () => {
    const sleeps: number[] = [];
    const impl = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 429, message: 'rate limited' }), {
          status: 429,
          headers: { 'retry-after': '5' },
        })
    );

    const error = await build(impl, {
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
    })
      .get(ZAK_PATH, { type: 'zak' })
      .catch((caught: unknown) => caught);

    expect(isZoomError(error)).toBe(true);
    expect((error as { kind: string }).kind).toBe('rate_limit');
    // Three attempts, two honoured 5 s waits — unchanged by anything in this round.
    expect(impl).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([5_000, 5_000]);
  });
});

describe('[V2] the signal reaches the token work', () => {
  it('ends on the budget when the grant never lands, and never reaches the wire', async () => {
    const impl = vi.fn(async () => new Response('{}', { status: 200 }));
    const stalled: ZoomTokenProvider = {
      getToken: () => new Promise<string>(() => {}),
      forceRefresh: () => new Promise<string>(() => {}),
    };

    const { ms, error } = await elapsed(() =>
      build(impl, { tokenProvider: stalled }).get(ZAK_PATH, { type: 'zak' }, { signal: budget() })
    );

    expectBudgetExhausted(error);
    expect(ms).toBeLessThan(BUDGET_MS + BUDGET_SLACK_MS);
    // No token, no request. The budget is spent before the wire is touched.
    expect(impl).not.toHaveBeenCalled();
  });

  it('refuses immediately when the budget was already spent before the call', async () => {
    const impl = vi.fn(async () => new Response('{}', { status: 200 }));
    const controller = new AbortController();
    controller.abort();

    const error = await build(impl)
      .get(ZAK_PATH, { type: 'zak' }, { signal: controller.signal })
      .catch((caught: unknown) => caught);

    expectBudgetExhausted(error);
    expect(impl).not.toHaveBeenCalled();
  });
});
