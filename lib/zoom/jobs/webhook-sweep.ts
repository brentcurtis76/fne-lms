/**
 * `webhook_sweep` — finishes webhook deliveries that were recorded but never applied
 * (Z1b-3 finding ⑤, routed into Z1b-4).
 *
 * ## The window this closes
 *
 * `/api/zoom/webhook` inserts the ledger row first and applies the lifecycle second.
 * A process that dies between the two leaves `processed_at IS NULL` — and because
 * `dedupe_key` is UNIQUE, Zoom's retry of that same body conflicts. The route already
 * handles the retry it *sees* (a duplicate whose `processed_at` is NULL resumes
 * instead of being absorbed), but Zoom does not retry forever. After the last retry,
 * the only thing left is this sweep. It is the reason the route writes the marker at
 * all.
 *
 * ## Same code, not the same shape of code
 *
 * The lifecycle lives in `lib/zoom/webhook-lifecycle.ts` and BOTH callers import it.
 * A copy here would be a copy only the recovery path exercises, which is the copy most
 * likely to rot unnoticed.
 *
 * ## Why the age floor
 *
 * Only rows older than `SWEEP_MIN_AGE_MINUTES` are touched, so the sweep never races a
 * delivery the route is handling at this instant. Re-applying is harmless anyway —
 * every lifecycle write is an absolute assignment — but doing pointless work against a
 * live request is still worth not doing.
 *
 * ## Idempotent
 *
 * A second run finds nothing (the first marked the rows processed), and even a
 * concurrent double-run converges: two workers applying the same absolute status write
 * produce the same row.
 */
import { applyWebhookLifecycle, type ZoomWebhookObject } from '../webhook-lifecycle';
import {
  defaultZoomWebhookStore,
  type UnappliedWebhookEvent,
  type ZoomWebhookSweepStore,
} from '../webhook-store';
import { ZoomJobLeaseLostError, type ZoomJobHandler } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 15 minutes. Comfortably past Zoom's own retry schedule for a single delivery, so a
 * row this old is one no retry is coming for.
 */
export const SWEEP_MIN_AGE_MINUTES = 15;

/**
 * Bounded so one tick cannot run past its lease on a large backlog. Whatever is left
 * is picked up by the next hourly sweep — the rows are not going anywhere.
 */
export const SWEEP_MAX_ROWS = 200;

/** Heartbeat every N rows: enough to keep a long sweep's lease alive. */
const HEARTBEAT_EVERY = 25;

export interface WebhookSweepDeps {
  store?: ZoomWebhookSweepStore;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  minAgeMinutes?: number;
  maxRows?: number;
  clientFactory?: (env: NodeJS.ProcessEnv) => SupabaseClient;
}

export interface WebhookSweepResult extends Record<string, unknown> {
  scanned: number;
  applied: number;
  /** Rows whose `raw_payload` was already scrubbed — nothing left to apply. */
  skipped_no_payload: number;
}

/** The slice of a stored `raw_payload` the lifecycle needs. */
interface StoredPayload {
  event?: unknown;
  payload?: { object?: ZoomWebhookObject };
}

function readEventType(row: UnappliedWebhookEvent, stored: StoredPayload): string {
  // Prefer the payload's own event, fall back to the column the route denormalised.
  return typeof stored.event === 'string' && stored.event !== ''
    ? stored.event
    : row.event_type;
}

export function createWebhookSweepHandler(deps: WebhookSweepDeps = {}): ZoomJobHandler {
  return async (ctx) => {
    const env = deps.env ?? process.env;
    const now = deps.now ?? (() => Date.now());
    const store =
      deps.store ??
      (deps.clientFactory
        ? defaultZoomWebhookStore(env, deps.clientFactory)
        : defaultZoomWebhookStore(env));
    const minAgeMinutes = deps.minAgeMinutes ?? SWEEP_MIN_AGE_MINUTES;
    const maxRows = deps.maxRows ?? SWEEP_MAX_ROWS;

    const receivedBefore = new Date(now() - minAgeMinutes * 60_000).toISOString();
    const rows = await store.listUnappliedEvents(receivedBefore, maxRows);

    let applied = 0;
    let skippedNoPayload = 0;

    for (const [index, row] of rows.entries()) {
      if (index > 0 && index % HEARTBEAT_EVERY === 0) {
        const alive = await ctx.heartbeat({ scanned: index, applied });
        if (!alive) throw new ZoomJobLeaseLostError(ctx.job.id);
      }

      if (row.raw_payload === null) {
        // The 30-day retention scrub nulls `raw_payload` but keeps the row for dedupe.
        // There is nothing left to apply, and leaving `processed_at` NULL would make
        // this row reappear in every sweep forever. Mark it and move on.
        await store.markProcessed(row.dedupe_key, new Date(now()).toISOString());
        skippedNoPayload += 1;
        continue;
      }

      const stored = row.raw_payload as StoredPayload;
      await applyWebhookLifecycle(store, readEventType(row, stored), stored.payload?.object);
      await store.markProcessed(row.dedupe_key, new Date(now()).toISOString());
      applied += 1;
    }

    const result: WebhookSweepResult = {
      scanned: rows.length,
      applied,
      skipped_no_payload: skippedNoPayload,
    };
    return result;
  };
}

/** The registry entry. Built per invocation so it can close over deps in tests. */
export const webhookSweepJobHandler: ZoomJobHandler = (ctx) => createWebhookSweepHandler()(ctx);
