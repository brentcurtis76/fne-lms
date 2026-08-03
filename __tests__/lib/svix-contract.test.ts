// @vitest-environment node
/**
 * Phase B2 — svix webhook-verification contract (installed version: svix 1.99.1,
 * which delegates to standardwebhooks 1.0.0).
 *
 * Resend 3.5.0 ships no verifier, so D-08's "verify with the `svix` package"
 * decision rests entirely on the shapes locked here. As in the Resend suite,
 * nothing is mocked: real HMACs over real payloads, with the clock controlled so
 * the tolerance window is testable in both directions.
 *
 * See `docs/plan/reviews/fase-b2-findings.md` for the prose version.
 */
import { Webhook, WebhookVerificationError } from 'svix';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Test-only secret. `whsec_` + base64; never a real endpoint secret. */
const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const MSG_ID = 'msg_2b1c3d';
const NOW_SECONDS = 1_800_000_000; // 2027-01-15T08:00:00Z — fixed by fake timers.
const PAYLOAD = '{"type":"email.sent","data":{"email_id":"e1"}}';

/**
 * Known-answer vector. Computed once against svix 1.99.1 and pinned as a
 * literal: if a future upgrade changes the signing scheme (input string,
 * digest, or encoding) this constant, not just the round-trip, goes red.
 */
const KNOWN_SIGNATURE = 'v1,U7MCraEf2jcNYDlIFoljbHyGf/DKuajenoH4Tq4hF+E=';
const KNOWN_MSG_ID = 'msg_2b1c3d';
const KNOWN_TIMESTAMP = 1_700_000_000;
const KNOWN_PAYLOAD = '{"type":"email.sent","data":{"email_id":"e1"}}';

function headers(signature: string, timestamp: number = NOW_SECONDS) {
  return {
    'svix-id': MSG_ID,
    'svix-timestamp': String(timestamp),
    'svix-signature': signature,
  };
}

/** Sign PAYLOAD for `timestamp` with the real key. */
function signAt(timestamp: number, payload: string = PAYLOAD): string {
  return new Webhook(SECRET).sign(MSG_ID, new Date(timestamp * 1000), payload);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW_SECONDS * 1000));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('signing scheme', () => {
  it('matches the pinned known-answer vector', () => {
    const signature = new Webhook(SECRET).sign(
      KNOWN_MSG_ID,
      new Date(KNOWN_TIMESTAMP * 1000),
      KNOWN_PAYLOAD
    );

    expect(signature).toBe(KNOWN_SIGNATURE);
  });

  it('treats a `whsec_`-prefixed secret and its bare base64 identically', () => {
    const bare = SECRET.slice('whsec_'.length);

    expect(signAt(NOW_SECONDS)).toBe(
      new Webhook(bare).sign(MSG_ID, new Date(NOW_SECONDS * 1000), PAYLOAD)
    );
  });

  it('rejects an empty secret with a plain Error, not a verification error', () => {
    // The webhook route must distinguish "endpoint secret missing from the
    // environment" (a 5xx configuration fault) from "bad signature" (401).
    let caught: unknown;
    try {
      // eslint-disable-next-line no-new
      new Webhook('');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(WebhookVerificationError);
    expect((caught as Error).message).toBe("Secret can't be empty.");
  });
});

describe('verify — accepted requests', () => {
  it('returns the parsed payload for a valid signature', () => {
    const result = new Webhook(SECRET).verify(PAYLOAD, headers(signAt(NOW_SECONDS)));

    expect(result).toEqual({ type: 'email.sent', data: { email_id: 'e1' } });
  });

  it('accepts the unbranded `webhook-*` header names', () => {
    const signature = signAt(NOW_SECONDS);

    const result = new Webhook(SECRET).verify(PAYLOAD, {
      'webhook-id': MSG_ID,
      'webhook-timestamp': String(NOW_SECONDS),
      'webhook-signature': signature,
    });

    expect(result).toEqual({ type: 'email.sent', data: { email_id: 'e1' } });
  });

  it('lower-cases header names before reading them', () => {
    // Node's `req.headers` is already lower-cased, but this makes the contract
    // explicit so the route may pass the header bag through untouched.
    const result = new Webhook(SECRET).verify(PAYLOAD, {
      'Svix-Id': MSG_ID,
      'Svix-Timestamp': String(NOW_SECONDS),
      'Svix-Signature': signAt(NOW_SECONDS),
    });

    expect(result).toEqual({ type: 'email.sent', data: { email_id: 'e1' } });
  });

  it('accepts a multi-signature header when any space-separated v1 entry matches', () => {
    // Svix sends every active endpoint key during a secret rotation.
    const good = signAt(NOW_SECONDS);
    const stale = new Webhook('whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA').sign(
      MSG_ID,
      new Date(NOW_SECONDS * 1000),
      PAYLOAD
    );

    expect(new Webhook(SECRET).verify(PAYLOAD, headers(`${stale} ${good}`))).toEqual({
      type: 'email.sent',
      data: { email_id: 'e1' },
    });
    expect(new Webhook(SECRET).verify(PAYLOAD, headers(`${good} ${stale}`))).toEqual({
      type: 'email.sent',
      data: { email_id: 'e1' },
    });
  });

  it('accepts a Buffer payload identically to the equivalent string', () => {
    const result = new Webhook(SECRET).verify(
      Buffer.from(PAYLOAD, 'utf8'),
      headers(signAt(NOW_SECONDS))
    );

    expect(result).toEqual({ type: 'email.sent', data: { email_id: 'e1' } });
  });
});

describe('verify — timestamp tolerance is ±5 minutes (D-08)', () => {
  it('accepts a timestamp 299 s in the past', () => {
    const past = NOW_SECONDS - 299;

    expect(new Webhook(SECRET).verify(PAYLOAD, headers(signAt(past), past))).toEqual({
      type: 'email.sent',
      data: { email_id: 'e1' },
    });
  });

  it('rejects a timestamp 301 s in the past', () => {
    const past = NOW_SECONDS - 301;

    expect(() => new Webhook(SECRET).verify(PAYLOAD, headers(signAt(past), past))).toThrow(
      /Message timestamp too old/
    );
  });

  it('accepts a timestamp 299 s in the future', () => {
    const future = NOW_SECONDS + 299;

    expect(new Webhook(SECRET).verify(PAYLOAD, headers(signAt(future), future))).toEqual({
      type: 'email.sent',
      data: { email_id: 'e1' },
    });
  });

  it('rejects a timestamp 301 s in the future', () => {
    // The future half of the window is the one D-08 calls out explicitly; a
    // verifier that only guards the past would pass every other test here.
    const future = NOW_SECONDS + 301;

    expect(() => new Webhook(SECRET).verify(PAYLOAD, headers(signAt(future), future))).toThrow(
      /Message timestamp too new/
    );
  });
});

describe('verify — rejected requests', () => {
  it('throws WebhookVerificationError when the body was tampered with', () => {
    const signature = signAt(NOW_SECONDS);

    expect(() =>
      new Webhook(SECRET).verify('{"type":"email.bounced"}', headers(signature))
    ).toThrow(WebhookVerificationError);
  });

  it('rejects a re-serialised body, proving the raw bytes are what is signed', () => {
    // Consequence for B7: the webhook route must disable Next's body parser and
    // verify the raw body. `JSON.parse` + `JSON.stringify` already breaks it.
    const reserialised = JSON.stringify(JSON.parse(PAYLOAD).data);

    expect(() => new Webhook(SECRET).verify(reserialised, headers(signAt(NOW_SECONDS)))).toThrow(
      /No matching signature found/
    );
  });

  it('rejects a signature made with a different secret', () => {
    const foreign = new Webhook('whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA').sign(
      MSG_ID,
      new Date(NOW_SECONDS * 1000),
      PAYLOAD
    );

    expect(() => new Webhook(SECRET).verify(PAYLOAD, headers(foreign))).toThrow(
      /No matching signature found/
    );
  });

  it('ignores signature entries whose version is not v1', () => {
    const good = signAt(NOW_SECONDS).split(',')[1];

    expect(() => new Webhook(SECRET).verify(PAYLOAD, headers(`v2,${good}`))).toThrow(
      /No matching signature found/
    );
  });

  it('rejects a signature bound to a different message id', () => {
    const otherId = new Webhook(SECRET).sign(
      'msg_someone_else',
      new Date(NOW_SECONDS * 1000),
      PAYLOAD
    );

    expect(() => new Webhook(SECRET).verify(PAYLOAD, headers(otherId))).toThrow(
      /No matching signature found/
    );
  });

  it.each(['svix-id', 'svix-timestamp', 'svix-signature'])(
    'throws "Missing required headers" when %s is absent',
    (missing) => {
      const bag: Record<string, string> = headers(signAt(NOW_SECONDS));
      delete bag[missing];

      expect(() => new Webhook(SECRET).verify(PAYLOAD, bag)).toThrow(/Missing required headers/);
    }
  );

  it('throws "Invalid Signature Headers" for a non-numeric timestamp', () => {
    const bag = { ...headers(signAt(NOW_SECONDS)), 'svix-timestamp': 'not-a-number' };

    expect(() => new Webhook(SECRET).verify(PAYLOAD, bag)).toThrow(/Invalid Signature Headers/);
  });

  it('throws a SyntaxError, not a verification error, when a valid body is not JSON', () => {
    // `verify` JSON.parses the payload after the HMAC check, so a signed
    // non-JSON body surfaces as a parse failure. The route must not report that
    // as a 401 — the signature was in fact valid.
    const body = 'not json at all';
    const signature = new Webhook(SECRET).sign(MSG_ID, new Date(NOW_SECONDS * 1000), body);

    let caught: unknown;
    try {
      new Webhook(SECRET).verify(body, headers(signature));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SyntaxError);
    expect(caught).not.toBeInstanceOf(WebhookVerificationError);
  });
});
