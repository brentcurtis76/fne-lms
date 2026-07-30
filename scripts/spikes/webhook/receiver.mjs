/**
 * Z0B-2 webhook verification harness — STANDALONE, spike-only.
 *
 * Deliberately NOT a Next.js route: the production webhook endpoint is Z1b's
 * work (`pages/api/zoom/webhook.ts`, parallel branch). This process exists to
 * (a) answer Zoom's CRC challenge so Brent can validate the subscription, and
 * (b) capture REAL payloads and header sets for the Z1b fixture library, with
 * the raw bytes preserved so signature semantics can be proven rather than
 * assumed.
 *
 * What it verifies empirically, per plan §20:
 *  - CRC challenge-response (HMAC-SHA256 of plainToken with the Secret Token)
 *  - signature over the RAW body — every request records BOTH the raw-body
 *    signature and the signature over a re-serialized (JSON.parse→stringify)
 *    body, so the "re-serialized body must fail" claim is measured, not assumed
 *  - header set actually delivered (x-zm-request-id, traceparent, …)
 *  - timestamp freshness (skew between x-zm-request-timestamp and arrival)
 *  - retry behaviour: FAIL_EVENTS makes the receiver answer ≥500 for a chosen
 *    event so Zoom's 5/20/60-min retry schedule can be observed
 *
 * Usage:
 *   node scripts/spikes/webhook/receiver.mjs                 # 200 everything
 *   FAIL_EVENTS=meeting.participant_left node …/receiver.mjs  # 500 that event
 *
 * Capture file: scripts/spikes/webhook/captures/events.jsonl (gitignored)
 */

import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadSpikeEnv } from '../zoom/lib.mjs';

const PORT = Number(process.env.PORT ?? 4000);
const ROOT = process.cwd();
const CAPTURE_DIR = path.join(ROOT, 'scripts/spikes/webhook/captures');
const CAPTURE_FILE = path.join(CAPTURE_DIR, 'events.jsonl');

const env = loadSpikeEnv(ROOT);
const SECRET = env.ZOOM_WEBHOOK_SECRET_TOKEN;

/** Events to answer with 500 so Zoom's retry schedule can be observed. */
const FAIL_EVENTS = new Set(
  (process.env.FAIL_EVENTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

mkdirSync(CAPTURE_DIR, { recursive: true });

/** Zoom's documented scheme: HMAC-SHA256 over `v0:{timestamp}:{body}`. */
function signature(timestamp, bodyString) {
  return `v0=${createHmac('sha256', SECRET).update(`v0:${timestamp}:${bodyString}`).digest('hex')}`;
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

let seq = 0;

const server = http.createServer((req, res) => {
  const arrivedAt = Date.now();
  /** Collect BYTES, never a decoded string — the signature is over raw bytes. */
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const rawBuffer = Buffer.concat(chunks);
    const rawBody = rawBuffer.toString('utf8');
    seq += 1;

    const timestamp = req.headers['x-zm-request-timestamp'];
    const receivedSignature = req.headers['x-zm-signature'];

    let parsed = null;
    let parseError = null;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : null;
    } catch (error) {
      parseError = String(error);
    }

    // The core experiment: sign the raw bytes, and sign a canonical
    // re-serialization of the same object. If Zoom's body is not byte-identical
    // to JSON.stringify(JSON.parse(body)), the second signature differs — which
    // is exactly why the production route must read the raw body.
    const rawSignature = timestamp ? signature(timestamp, rawBody) : null;
    const reserializedBody = parsed !== null ? JSON.stringify(parsed) : null;
    const reserializedSignature =
      timestamp && reserializedBody !== null ? signature(timestamp, reserializedBody) : null;

    const rawMatches = Boolean(
      receivedSignature && rawSignature && safeEqual(receivedSignature, rawSignature)
    );
    const reserializedMatches = Boolean(
      receivedSignature && reserializedSignature && safeEqual(receivedSignature, reserializedSignature)
    );

    const eventName = parsed?.event ?? null;

    const record = {
      seq,
      arrivedAt: new Date(arrivedAt).toISOString(),
      method: req.method,
      url: req.url,
      event: eventName,
      headers: req.headers,
      // Byte-level facts about the body, so a later reader can reason about
      // whitespace/ordering without the raw body being re-parsed.
      body: {
        byteLength: rawBuffer.length,
        raw: rawBody,
        parseError,
        reserializedByteLength: reserializedBody === null ? null : Buffer.byteLength(reserializedBody),
        byteIdenticalToReserialization: reserializedBody === null ? null : reserializedBody === rawBody,
      },
      verification: {
        timestampHeader: timestamp ?? null,
        /**
         * MEASURED, and not what this spike first assumed: `x-zm-request-timestamp`
         * is epoch **SECONDS** (10 digits). The asymmetry that makes this easy to get
         * wrong is that `event_ts` INSIDE the body is epoch milliseconds (13 digits),
         * so a payload carries both units at once. Real observed skew on a validated
         * endpoint: ~1 second.
         *
         * `timestampUnit` is recorded per request rather than assumed, so a future
         * change in Zoom's format shows up as data instead of as a silently broken
         * freshness check.
         */
        timestampUnit: timestamp ? (String(timestamp).length <= 11 ? 'seconds' : 'milliseconds') : null,
        skewMs: timestamp
          ? arrivedAt - (String(timestamp).length <= 11 ? Number(timestamp) * 1000 : Number(timestamp))
          : null,
        bodyEventTs: parsed?.event_ts ?? null,
        rawBodySignatureMatches: rawMatches,
        reserializedBodySignatureMatches: reserializedMatches,
      },
    };

    appendFileSync(CAPTURE_FILE, `${JSON.stringify(record)}\n`);

    const flag = rawMatches ? 'sig-ok' : 'SIG-MISMATCH';
    const reFlag = reserializedMatches ? 're-sig-ALSO-ok' : 're-sig-fails';

    // CRC challenge — this is what makes the Marketplace "Validate" button pass.
    if (eventName === 'endpoint.url_validation') {
      const plainToken = parsed?.payload?.plainToken ?? '';
      const encryptedToken = createHmac('sha256', SECRET).update(plainToken).digest('hex');
      const responseBody = JSON.stringify({ plainToken, encryptedToken });
      console.log(`#${seq} endpoint.url_validation  ${flag} · ${reFlag} → 200 CRC answered`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(responseBody);
      return;
    }

    if (eventName && FAIL_EVENTS.has(eventName)) {
      console.log(
        `#${seq} ${eventName}  ${flag} · ${reFlag} → 500 (FAIL_EVENTS: observing Zoom's retry schedule)`
      );
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'spike-induced failure to observe retry behaviour' }));
      return;
    }

    const skew = record.verification.skewMs;
    console.log(
      `#${seq} ${eventName ?? '(no event)'}  ${flag} · ${reFlag} · skew ${skew ?? '?'}ms · ${rawBuffer.length}B → 204`
    );
    res.writeHead(204);
    res.end();
  });
});

server.listen(PORT, () => {
  console.log(`webhook receiver on http://127.0.0.1:${PORT}  (captures → ${CAPTURE_FILE})`);
  if (FAIL_EVENTS.size > 0) {
    console.log(`FAIL_EVENTS active: ${[...FAIL_EVENTS].join(', ')}`);
  }
});
