/**
 * Zoom webhook receiver (plan §4 jobs/webhook architecture, §8 lifecycle, Z1b-3).
 *
 * This route is the ONLY consumer of `lib/zoom/verifier.ts`. Everything cryptographic
 * lives there; everything about *what a verified event means* lives here.
 *
 * ## Why the body parser is off
 *
 * The signed string is `v0:{x-zm-request-timestamp}:{raw body}` and "raw body" means
 * **the bytes that arrived**. Next's body parser hands back a parsed object, and
 * re-serializing it produces a different input in the general case. The verifier's
 * module header records the trap in full: every real payload the Z0B-2 spike captured
 * happened to be byte-identical to its re-serialization, so a re-serializing verifier
 * would have passed every live test and still been wrong. The committed 41-vector
 * suite is what actually pins it. We therefore read the stream ourselves.
 *
 * ## Gate order, and why verification precedes the CRC branch
 *
 *  1. **Unconfigured → 404.** No `ZOOM_WEBHOOK_SECRET_TOKEN`, no route — the same
 *     "feature absent → route absent" contract `/api/meet/diag-signature` uses. A
 *     deployment without the secret cannot verify anything, so answering 401 would
 *     advertise an endpoint that can never succeed.
 *  2. **POST only → 405.**
 *  3. **1 MB cap → 413.** Bounded before the bytes are buffered, not after.
 *  4. **Signature + freshness → 401.** The typed rejection reason is logged
 *     server-side (it is the §18 "webhook signature failures" signal) and NEVER
 *     echoed to the caller: which of five reasons failed is an oracle.
 *  5. **CRC handshake → 200**, answered only for a request that already verified.
 *
 * Step 5's ordering is a deliberate call. Zoom signs `endpoint.url_validation` with
 * the same secret as every other event, so verifying first costs nothing operationally
 * — and answering an UNVERIFIED CRC would turn this route into a chosen-plaintext MAC
 * oracle: anyone could POST `{"event":"endpoint.url_validation","payload":{"plainToken":X}}`
 * and read back `HMAC-SHA256(X, secret)` for an X of their choosing. That is a direct
 * attack on the webhook secret itself. If a future Marketplace validation ever 401s,
 * the logged reason says exactly which of the five checks failed.
 *
 * ## Idempotency and the `processed_at` marker
 *
 * `dedupe_key` (= `sha256(raw body)`, body alone — see the verifier header) is UNIQUE,
 * so a Zoom retry conflicts and is absorbed. But "absorbed" must not mean "dropped":
 * a first delivery that inserted the ledger row and then died before applying the
 * lifecycle leaves `processed_at IS NULL`, and the retry — which would otherwise be a
 * silent 200 — finishes the work. Status writes are idempotent, so re-applying an
 * already-applied event would be harmless anyway; `processed_at` just keeps us from
 * doing pointless work on the ordinary replay.
 *
 * ## Scope (§15, Z1b-3)
 *
 * Rows-only lifecycle. `meeting.started` / `meeting.ended` move
 * `zoom_internal.zoom_meetings.status`; every other event type is recorded and
 * nothing else. Recording and participant handling arrive in Z4/Z7, and **nothing
 * here enqueues a job** — the queue is driven by the ticker and the reconciler.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  computeWebhookCrcResponse,
  readWebhookSecret,
  verifyZoomWebhook,
  WEBHOOK_URL_VALIDATION_EVENT,
} from '../../../lib/zoom/verifier';
import {
  defaultZoomWebhookStore,
  type ZoomWebhookStore,
} from '../../../lib/zoom/webhook-store';

/** Raw stream, not a parsed object. See the module header. */
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * 1 MB. The largest fixture in the committed library is `recording.completed` at
 * 2,914 bytes, so this is ~350× the biggest thing Zoom has actually been observed to
 * send — generous enough that a future event type cannot trip it, small enough that
 * an unauthenticated caller cannot make us buffer arbitrary memory. The cap is
 * enforced DURING the read, so an oversized body is refused without being held.
 */
export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

const BODY_TOO_LARGE = Symbol('body_too_large');

/** Shape of the slice of a Zoom event body this route reads. */
interface ZoomWebhookBody {
  event?: unknown;
  payload?: {
    plainToken?: unknown;
    object?: {
      id?: unknown;
      uuid?: unknown;
    };
  };
}

/**
 * Buffers the request body, refusing anything past `limitBytes`.
 *
 * Event-based rather than `for await`, matching the repo's existing
 * bodyParser-disabled precedent (`pages/api/licitaciones/[id]/ates.ts`). Listeners
 * attach synchronously, which is also what lets the suite drive the stream.
 */
function readRawBody(
  req: NextApiRequest,
  limitBytes: number
): Promise<Buffer | typeof BODY_TOO_LARGE> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const onData = (chunk: Buffer | string) => {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
      total += buf.length;
      if (total > limitBytes) {
        settled = true;
        cleanup();
        // Stop pulling bytes we have already decided to refuse. Guarded because the
        // suite's request double is an EventEmitter, not a socket.
        if (typeof req.destroy === 'function') req.destroy();
        resolve(BODY_TOO_LARGE);
        return;
      }
      chunks.push(buf);
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks));
    };
    const onError = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    function cleanup() {
      req.off?.('data', onData);
      req.off?.('end', onEnd);
      req.off?.('error', onError);
    }

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

/**
 * Zoom sends `payload.object.id` as a decimal STRING (the committed fixtures show
 * `"86084701483"`), while `zoom_meetings.zoom_meeting_number` is `bigint`. Accepts a
 * number too, because Zoom's own docs are inconsistent about the type across events.
 * Anything else is "no meeting number", which lands on the row-only path.
 */
function readMeetingNumber(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const parsed = Number(raw.trim());
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function readOccurrenceUuid(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/**
 * The §15 lifecycle application: rows only, and only for the two meeting events.
 *
 * `meeting.started` is where `zoom_meeting_uuid` is captured — **not** provisioning.
 * That is the routed Z0B finding: Zoom mints a NEW uuid for every occurrence, so the
 * uuid a create/read returns at provision time is not the uuid the recording,
 * participant and transcript APIs will key on. The fake models it (`startOccurrence`
 * returns both uuids so a test can assert they differ). Writing it here, from the
 * event that announces the occurrence, is the only correct moment.
 *
 * An unknown meeting number is normal until provisioning exists (Z1b-4) and stays
 * normal afterwards for meetings created outside the LMS: the ledger row is the whole
 * of the work, and the response is still 200.
 */
async function applyLifecycle(
  store: ZoomWebhookStore,
  eventType: string,
  object: { id?: unknown; uuid?: unknown } | undefined
): Promise<void> {
  if (eventType !== 'meeting.started' && eventType !== 'meeting.ended') return;

  const meetingNumber = readMeetingNumber(object?.id);
  if (meetingNumber === null) return;

  const meetingId = await store.findMeetingIdByNumber(meetingNumber);
  if (meetingId === null) return;

  if (eventType === 'meeting.started') {
    await store.setMeetingStatus(meetingId, 'started', readOccurrenceUuid(object?.uuid));
    return;
  }
  // `meeting.ended` carries the same occurrence uuid, but `started` already captured
  // it; passing null here means a malformed/absent uuid can never blank the column.
  await store.setMeetingStatus(meetingId, 'ended', null);
}

export interface ZoomWebhookHandlerDeps {
  store?: ZoomWebhookStore;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}

export async function handleZoomWebhook(
  req: NextApiRequest,
  res: NextApiResponse,
  deps: ZoomWebhookHandlerDeps = {}
): Promise<void> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => Date.now());

  // Gate 1 — feature absent → route absent.
  let secret: string;
  try {
    secret = readWebhookSecret(env);
  } catch {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  // Gate 2 — POST only.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Gate 3 — bounded read.
  const rawBody = await readRawBody(req, MAX_WEBHOOK_BODY_BYTES);
  if (rawBody === BODY_TOO_LARGE) {
    res.status(413).json({ error: 'Payload too large' });
    return;
  }

  // Gate 4 — signature and freshness, over the bytes that arrived.
  const verification = verifyZoomWebhook({
    secret,
    rawBody,
    signatureHeader: req.headers['x-zm-signature'],
    timestampHeader: req.headers['x-zm-request-timestamp'],
    nowMs: now(),
  });
  // `=== false` rather than `!`: the repo compiles with `strict: false`, and without
  // strictNullChecks TypeScript will not narrow a discriminated union through a
  // truthiness test — only through an explicit comparison against the literal.
  if (verification.ok === false) {
    // Server-side only — §18 counts these as the secret-rotation signal. The caller
    // learns nothing beyond "no".
    console.warn(`[zoom-webhook] rejected: ${verification.reason}`);
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  let body: ZoomWebhookBody;
  try {
    body = JSON.parse(rawBody.toString('utf8')) as ZoomWebhookBody;
  } catch {
    // Only reachable for a body Zoom signed and we cannot parse, which no retry
    // fixes. 400 rather than 500 so it is not counted as our failure.
    console.warn('[zoom-webhook] verified body was not JSON');
    res.status(400).json({ error: 'Malformed body' });
    return;
  }

  const eventType = typeof body.event === 'string' ? body.event : '';
  if (eventType === '') {
    console.warn('[zoom-webhook] verified body carried no event type');
    res.status(400).json({ error: 'Malformed body' });
    return;
  }

  // Gate 5 — CRC handshake. No ledger row: the handshake is not an event, it carries
  // no `payload.object`, and Zoom re-validates every 72 h — recording it would grow
  // the ledger forever with rows nothing ever reads.
  if (eventType === WEBHOOK_URL_VALIDATION_EVENT) {
    const plainToken = body.payload?.plainToken;
    if (typeof plainToken !== 'string') {
      res.status(400).json({ error: 'Malformed body' });
      return;
    }
    res.status(200).json(computeWebhookCrcResponse(secret, plainToken));
    return;
  }

  const store = deps.store ?? defaultZoomWebhookStore(env);
  const object = body.payload?.object;

  try {
    const write = await store.recordEvent({
      dedupe_key: verification.dedupeKey,
      event_type: eventType,
      zoom_meeting_uuid: readOccurrenceUuid(object?.uuid),
      raw_payload: body as unknown as Record<string, unknown>,
    });

    if (write === 'duplicate') {
      const processedAt = await store.readProcessedAt(verification.dedupeKey);
      if (processedAt !== null) {
        // Already applied (or the row vanished under a retention scrub). Absorbed.
        res.status(200).json({ status: 'duplicate' });
        return;
      }
      // Recorded but never applied — the first delivery died mid-flight. Finish it.
    }

    await applyLifecycle(store, eventType, object);
    await store.markProcessed(verification.dedupeKey, new Date(now()).toISOString());
  } catch (error) {
    // Zoom retries any non-2xx; the dedupe ledger absorbs the replayed body and the
    // NULL `processed_at` above makes the retry resume rather than no-op.
    console.error('[zoom-webhook] persistence failed:', error);
    res.status(500).json({ error: 'Internal error' });
    return;
  }

  res.status(200).json({ status: 'ok' });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  return handleZoomWebhook(req, res);
}
