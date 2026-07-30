/**
 * Meeting SDK JWT signer (plan §4: "SDK JWT signer (pure function; claims
 * `appKey, mn, role, iat, exp, tokenExp`, exp=tokenExp=iat+2h)").
 *
 * Pure by construction: no `fetch`, no database, no `process.env`. Everything it
 * needs arrives as an argument, including the clock. That matters because this is
 * the one place in the integration layer that mints a credential, and a pure
 * function is a function a reviewer can read to completion.
 *
 * ## `role` is the caller's decision, always
 *
 * Plan §5: "SDK JWT — minted per request, never persisted, `role` decided
 * server-side (client-supplied role ignored)". This module takes `role` as a typed
 * argument and never infers, defaults, or reads it from anywhere. A caller that
 * forwards a request body into this parameter has broken §5 — the type cannot stop
 * that, but nothing here helps it either. The §9.4 issuance rule (`role: 1` only for
 * the assigned facilitator on their own mapped host, or an admin on an org-owned
 * pool identity) is enforced by the join API in Z2, upstream of this call.
 *
 * ## Claim shape (verified against vendor docs, plan §20)
 *
 *  - `appKey` and `sdkKey` carry the same value. Zoom's SDK reads one or the other
 *    depending on version; sending both is what the working spike join used.
 *  - `iat` is backdated by 30 s. Zoom rejects a token whose `iat` is in its own
 *    future, and the two clocks are demonstrably independent — the webhook capture
 *    caught Zoom's clock 15 ms AHEAD of ours on `meeting.ended`.
 *  - `exp === tokenExp`. Zoom checks both; a mismatch fails the join with an error
 *    that does not say which claim was wrong.
 *  - `exp - iat` must be ≥ 1800 s and ≤ 48 h. Both bounds are enforced here rather
 *    than trusted, because the failure is a rejected join at meeting time.
 */
import { createHmac } from 'crypto';

/** Zoom rejects a token issued in its own future; 30 s absorbs clock skew. */
export const SDK_SIGNATURE_IAT_BACKDATE_SECONDS = 30;

/** §20: `exp` must be at least this far past `iat`. */
export const SDK_SIGNATURE_MIN_TTL_SECONDS = 1800;

/** §20: …and at most this far. */
export const SDK_SIGNATURE_MAX_TTL_SECONDS = 48 * 3600;

/**
 * TTL for a production join payload (plan §4: "exp=tokenExp=iat+2h"). Two hours
 * covers a 90-minute session plus a late start; a participant who needs longer
 * re-clicks join and gets fresh credentials, which is the design anyway.
 */
export const SDK_JOIN_TTL_SECONDS = 2 * 3600;

/** 0 = participant, 1 = host. Never widen this to `number`. */
export type ZoomSdkRole = 0 | 1;

export interface ZoomSdkSignatureInput {
  /** Meeting SDK client id. Becomes both `appKey` and `sdkKey`. */
  sdkKey: string;
  /** Meeting SDK client secret — the HMAC key. Never appears in the output. */
  sdkSecret: string;
  /** Digits only; Zoom ids are 9–11 digits. */
  meetingNumber: string;
  /** Decided server-side by the caller. See the header. */
  role: ZoomSdkRole;
  /** Defaults to `SDK_JOIN_TTL_SECONDS`. */
  ttlSeconds?: number;
  /** Injectable clock (epoch ms). Defaults to `Date.now()`. */
  nowMs?: number;
}

export interface ZoomSdkSignaturePayload {
  appKey: string;
  sdkKey: string;
  mn: string;
  role: ZoomSdkRole;
  iat: number;
  exp: number;
  tokenExp: number;
}

/**
 * RFC 7515 base64url: standard base64 with `+`→`-`, `/`→`_`, and no padding.
 * Node's `'base64url'` encoding produces exactly this; the equivalence with the
 * hand-rolled form the spike endpoint shipped is asserted in the test suite.
 */
function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/** Thrown for an input this module refuses to sign. Never carries the secret. */
export class ZoomSignerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZoomSignerError';
  }
}

/**
 * Builds the claim set without signing it. Exported so a caller (or a test) can
 * assert what is about to be minted without needing the secret.
 */
export function buildZoomSdkPayload(
  input: Omit<ZoomSdkSignatureInput, 'sdkSecret'>
): ZoomSdkSignaturePayload {
  const ttlSeconds = input.ttlSeconds ?? SDK_JOIN_TTL_SECONDS;

  if (!input.sdkKey) {
    throw new ZoomSignerError('Zoom SDK key is required to mint a signature.');
  }
  if (!/^\d{9,11}$/.test(input.meetingNumber)) {
    throw new ZoomSignerError('Zoom meeting number must be 9–11 digits.');
  }
  if (input.role !== 0 && input.role !== 1) {
    throw new ZoomSignerError('Zoom SDK role must be 0 (participant) or 1 (host).');
  }
  if (!Number.isInteger(ttlSeconds)) {
    throw new ZoomSignerError('Zoom SDK signature TTL must be a whole number of seconds.');
  }
  if (ttlSeconds < SDK_SIGNATURE_MIN_TTL_SECONDS || ttlSeconds > SDK_SIGNATURE_MAX_TTL_SECONDS) {
    throw new ZoomSignerError(
      `Zoom SDK signature TTL must be between ${SDK_SIGNATURE_MIN_TTL_SECONDS} and ${SDK_SIGNATURE_MAX_TTL_SECONDS} seconds.`
    );
  }

  const nowMs = input.nowMs ?? Date.now();
  const iat = Math.floor(nowMs / 1000) - SDK_SIGNATURE_IAT_BACKDATE_SECONDS;
  const exp = iat + ttlSeconds;

  return {
    appKey: input.sdkKey,
    sdkKey: input.sdkKey,
    mn: input.meetingNumber,
    role: input.role,
    iat,
    exp,
    // Zoom validates both, and they must agree.
    tokenExp: exp,
  };
}

/** Signs the claim set as a compact HS256 JWT. */
export function signZoomSdkJwt(input: ZoomSdkSignatureInput): string {
  if (!input.sdkSecret) {
    throw new ZoomSignerError('Zoom SDK secret is required to mint a signature.');
  }
  const payload = buildZoomSdkPayload(input);
  const header = { alg: 'HS256', typ: 'JWT' };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = base64url(createHmac('sha256', input.sdkSecret).update(unsigned).digest());
  return `${unsigned}.${signature}`;
}
