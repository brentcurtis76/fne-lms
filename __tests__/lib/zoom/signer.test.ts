// @vitest-environment node
/**
 * SDK JWT signer contract (plan §17 blocking gate: "JWT claims/clamps").
 *
 * The signer is pure, so these tests pin a real byte-level output rather than
 * mocking anything: given a fixed clock, a fixed key and a fixed secret, the token
 * is fully determined and every claim can be read back out of it.
 */
import { createHmac } from 'crypto';
import { describe, it, expect } from 'vitest';
import {
  buildZoomSdkPayload,
  signZoomSdkJwt,
  ZoomSignerError,
  SDK_JOIN_TTL_SECONDS,
  SDK_SIGNATURE_IAT_BACKDATE_SECONDS,
  SDK_SIGNATURE_MAX_TTL_SECONDS,
  SDK_SIGNATURE_MIN_TTL_SECONDS,
  type ZoomSdkSignaturePayload,
} from '../../../lib/zoom/signer';

const SDK_KEY = 'SdkClientIdInvented1';
const SDK_SECRET = 'SdkClientSecretInvented00001';
const MEETING = '90210042001';
const NOW_MS = 1_800_000_000_000;
const NOW_SECONDS = NOW_MS / 1000;

function sign(overrides: Partial<Parameters<typeof signZoomSdkJwt>[0]> = {}) {
  return signZoomSdkJwt({
    sdkKey: SDK_KEY,
    sdkSecret: SDK_SECRET,
    meetingNumber: MEETING,
    role: 0,
    nowMs: NOW_MS,
    ...overrides,
  });
}

function decode(token: string) {
  const [header, payload, signature] = token.split('.');
  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as Record<string, unknown>,
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ZoomSdkSignaturePayload,
    signature,
    unsigned: `${header}.${payload}`,
  };
}

describe('signZoomSdkJwt — claim shape', () => {
  it('emits exactly the §4 claim set', () => {
    const { payload } = decode(sign());
    expect(Object.keys(payload).sort()).toEqual(
      ['appKey', 'exp', 'iat', 'mn', 'role', 'sdkKey', 'tokenExp'].sort()
    );
  });

  it('mirrors the SDK key into both appKey and sdkKey', () => {
    const { payload } = decode(sign());
    expect(payload.appKey).toBe(SDK_KEY);
    expect(payload.sdkKey).toBe(SDK_KEY);
  });

  it('backdates iat by 30 s, because Zoom rejects a token from its own future', () => {
    const { payload } = decode(sign());
    expect(payload.iat).toBe(NOW_SECONDS - SDK_SIGNATURE_IAT_BACKDATE_SECONDS);
    expect(SDK_SIGNATURE_IAT_BACKDATE_SECONDS).toBe(30);
  });

  it('sets exp === tokenExp — Zoom checks both and will not say which failed', () => {
    const { payload } = decode(sign());
    expect(payload.tokenExp).toBe(payload.exp);
  });

  it('defaults to the 2 h production join TTL (§4)', () => {
    const { payload } = decode(sign());
    expect(payload.exp - payload.iat).toBe(SDK_JOIN_TTL_SECONDS);
    expect(SDK_JOIN_TTL_SECONDS).toBe(7200);
  });

  it('honours an explicit TTL', () => {
    const { payload } = decode(sign({ ttlSeconds: SDK_SIGNATURE_MIN_TTL_SECONDS }));
    expect(payload.exp - payload.iat).toBe(1800);
  });

  it('carries the meeting number as a string in `mn`', () => {
    const { payload } = decode(sign());
    expect(payload.mn).toBe(MEETING);
    expect(typeof payload.mn).toBe('string');
  });

  it('uses HS256', () => {
    const { header } = decode(sign());
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
  });
});

describe('signZoomSdkJwt — role is the caller’s decision (§5)', () => {
  it('emits role 0 when the caller says participant', () => {
    expect(decode(sign({ role: 0 })).payload.role).toBe(0);
  });

  it('emits role 1 when the caller says host', () => {
    expect(decode(sign({ role: 1 })).payload.role).toBe(1);
  });

  it('refuses any other value rather than coercing it', () => {
    // A route that forwarded `req.body.role` would land here rather than minting
    // something Zoom might interpret generously.
    expect(() => sign({ role: 2 as unknown as 0 })).toThrow(ZoomSignerError);
    expect(() => sign({ role: '1' as unknown as 1 })).toThrow(ZoomSignerError);
    expect(() => sign({ role: undefined as unknown as 0 })).toThrow(ZoomSignerError);
  });
});

describe('signZoomSdkJwt — §20 clamps', () => {
  it.each([
    ['exactly the minimum', SDK_SIGNATURE_MIN_TTL_SECONDS],
    ['exactly the maximum', SDK_SIGNATURE_MAX_TTL_SECONDS],
  ])('accepts %s', (_label, ttlSeconds) => {
    const { payload } = decode(sign({ ttlSeconds }));
    expect(payload.exp - payload.iat).toBe(ttlSeconds);
  });

  it.each([
    ['one second under the minimum', SDK_SIGNATURE_MIN_TTL_SECONDS - 1],
    ['one second over the maximum', SDK_SIGNATURE_MAX_TTL_SECONDS + 1],
    ['zero', 0],
    ['negative', -1],
  ])('rejects %s', (_label, ttlSeconds) => {
    expect(() => sign({ ttlSeconds })).toThrow(ZoomSignerError);
  });

  it('rejects a fractional TTL rather than emitting a non-integer exp', () => {
    expect(() => sign({ ttlSeconds: 1800.5 })).toThrow(ZoomSignerError);
  });

  it('the bounds are the documented ones', () => {
    expect(SDK_SIGNATURE_MIN_TTL_SECONDS).toBe(1800);
    expect(SDK_SIGNATURE_MAX_TTL_SECONDS).toBe(48 * 3600);
  });
});

describe('signZoomSdkJwt — input validation', () => {
  it.each([
    ['8 digits', '12345678'],
    ['12 digits', '123456789012'],
    ['digits with a space', '902 1004 2001'],
    ['digits with a dash', '90210-42001'],
    ['empty', ''],
  ])('rejects a meeting number of %s', (_label, meetingNumber) => {
    expect(() => sign({ meetingNumber })).toThrow(ZoomSignerError);
  });

  it.each([['9 digits', '902100420'], ['10 digits', '9021004200'], ['11 digits', '90210042001']])(
    'accepts %s',
    (_label, meetingNumber) => {
      expect(decode(sign({ meetingNumber })).payload.mn).toBe(meetingNumber);
    }
  );

  it('refuses to sign without a key or without a secret', () => {
    expect(() => sign({ sdkKey: '' })).toThrow(ZoomSignerError);
    expect(() => sign({ sdkSecret: '' })).toThrow(ZoomSignerError);
  });

  it('an error message never leaks the secret', () => {
    const error = (() => {
      try {
        sign({ ttlSeconds: 1 });
        return null;
      } catch (e) {
        return e as Error;
      }
    })();
    expect(error?.message).not.toContain(SDK_SECRET);
  });
});

describe('signZoomSdkJwt — signature', () => {
  it('is an HS256 MAC over `header.payload` with the SDK secret', () => {
    const token = sign();
    const { unsigned, signature } = decode(token);
    const expected = createHmac('sha256', SDK_SECRET).update(unsigned).digest('base64url');
    expect(signature).toBe(expected);
  });

  it('changes under a rotated secret', () => {
    expect(sign()).not.toBe(sign({ sdkSecret: 'a-different-secret' }));
  });

  it('does not verify against a tampered payload', () => {
    // Escalating role:0 → role:1 in the encoded payload must break the MAC.
    const { header, payload, signature } = (() => {
      const [h, p, s] = sign().split('.');
      return { header: h, payload: p, signature: s };
    })();
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ZoomSdkSignaturePayload;
    decoded.role = 1;
    const forged = Buffer.from(JSON.stringify(decoded)).toString('base64url');
    const recomputed = createHmac('sha256', SDK_SECRET).update(`${header}.${forged}`).digest('base64url');

    expect(recomputed).not.toBe(signature);
  });

  it('never embeds the secret in the token', () => {
    expect(sign()).not.toContain(SDK_SECRET);
  });

  it('emits three base64url segments with no padding and no URL-unsafe characters', () => {
    const token = sign();
    expect(token.split('.')).toHaveLength(3);
    expect(token).not.toContain('=');
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
  });

  it('matches the hand-rolled base64url the spike endpoint shipped', () => {
    // The route previously did this transform inline. Node's 'base64url' encoding is
    // the same thing; this asserts it rather than assuming it, since a mismatch would
    // be an invalid JWT at meeting time and nowhere earlier.
    const manual = (input: Buffer | string) =>
      Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const payload = buildZoomSdkPayload({ sdkKey: SDK_KEY, meetingNumber: MEETING, role: 0, nowMs: NOW_MS });
    const header = { alg: 'HS256', typ: 'JWT' };
    const unsigned = `${manual(JSON.stringify(header))}.${manual(JSON.stringify(payload))}`;
    const expected = `${unsigned}.${manual(createHmac('sha256', SDK_SECRET).update(unsigned).digest())}`;

    expect(sign()).toBe(expected);
  });
});

describe('signZoomSdkJwt — purity', () => {
  it('reads no environment variable', () => {
    const saved = {
      ZOOM_SDK_CLIENT_ID: process.env.ZOOM_SDK_CLIENT_ID,
      ZOOM_SDK_CLIENT_SECRET: process.env.ZOOM_SDK_CLIENT_SECRET,
    };
    delete process.env.ZOOM_SDK_CLIENT_ID;
    delete process.env.ZOOM_SDK_CLIENT_SECRET;
    try {
      expect(() => sign()).not.toThrow();
    } finally {
      // Restore by DELETING when absent — assigning `undefined` stores "undefined",
      // and vitest runs threads:false so a leak would poison later files.
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('is deterministic for a fixed clock', () => {
    expect(sign()).toBe(sign());
  });

  it('advances with the clock', () => {
    expect(sign({ nowMs: NOW_MS })).not.toBe(sign({ nowMs: NOW_MS + 1000 }));
  });
});
