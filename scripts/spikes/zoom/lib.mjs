/**
 * Shared helpers for the Z0B-2 live-Zoom spike scripts.
 *
 * Spike-only, run from a developer machine against FNE's real Zoom account with
 * SYNTHETIC meeting content. Nothing here is production code: the production
 * client library is Z1b's `lib/zoom/*` (parallel branch). This file exists so
 * the individual spike scripts stay readable and so credential handling happens
 * in exactly one place.
 *
 * Credentials come from `.env.spike.local` (gitignored). They are never logged:
 * `redact()` is applied to every response body this module prints, and callers
 * are expected to route output through it.
 */

import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import path from 'node:path';

const ENV_FILE = '.env.spike.local';

/** Minimal dotenv reader — the spike scripts run outside Next.js's env loading. */
export function loadSpikeEnv(rootDir = process.cwd()) {
  const raw = readFileSync(path.join(rootDir, ENV_FILE), 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  const required = [
    'ZOOM_S2S_ACCOUNT_ID',
    'ZOOM_S2S_CLIENT_ID',
    'ZOOM_S2S_CLIENT_SECRET',
    'ZOOM_WEBHOOK_SECRET_TOKEN',
    'ZOOM_SDK_CLIENT_ID',
    'ZOOM_SDK_CLIENT_SECRET',
    'ZOOM_LICENSED_HOST_EMAIL',
  ];
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`${ENV_FILE} is missing: ${missing.join(', ')}`);
  }
  return env;
}

/**
 * Every secret-shaped value the spike touches, so a stray `console.log` of a
 * response body cannot leak one into a terminal transcript or a results doc.
 */
export function makeRedactor(env) {
  const secrets = [
    env.ZOOM_S2S_CLIENT_SECRET,
    env.ZOOM_S2S_CLIENT_ID,
    env.ZOOM_S2S_ACCOUNT_ID,
    env.ZOOM_WEBHOOK_SECRET_TOKEN,
    env.ZOOM_SDK_CLIENT_SECRET,
    env.ZOOM_SDK_CLIENT_ID,
  ].filter(Boolean);

  return function redact(value) {
    let text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    for (const secret of secrets) {
      text = text.split(secret).join('«redacted»');
    }
    // Bearer tokens and Zoom download tokens are JWTs — collapse them too.
    text = text.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '«jwt-redacted»');
    return text;
  };
}

/** Server-to-Server OAuth token. Cached for the lifetime of the process. */
let tokenCache = null;
export async function getS2SToken(env) {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const basic = Buffer.from(`${env.ZOOM_S2S_CLIENT_ID}:${env.ZOOM_S2S_CLIENT_SECRET}`).toString(
    'base64'
  );
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(env.ZOOM_S2S_ACCOUNT_ID)}`,
    { method: 'POST', headers: { Authorization: `Basic ${basic}` } }
  );
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`token ${res.status}: ${JSON.stringify(body)}`);
  }
  tokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    scopeCount: (body.scope ?? '').split(/\s+/).filter(Boolean).length,
  };
  return tokenCache.token;
}

export function tokenMeta() {
  return tokenCache ? { scopeCount: tokenCache.scopeCount } : null;
}

/**
 * Zoom API call. Returns `{ status, headers, body }` — never throws on a non-2xx
 * so the spike can record exact error codes (a 4711 missing-scope error is a
 * RESULT, not a crash).
 */
export async function zoomApi(env, method, apiPath, { body, query } = {}) {
  const token = await getS2SToken(env);
  const url = new URL(`https://api.zoom.us/v2${apiPath}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { _raw: text };
    }
  }
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: parsed,
  };
}

/**
 * Meeting SDK JWT (Meeting SDK app credentials, NOT the S2S pair).
 *
 * Claims per §20: appKey/sdkKey, mn, role, iat, exp, tokenExp; exp must be
 * ≥ iat+1800s and ≤ 48h. `tokenExp` must equal `exp` or the SDK rejects it.
 */
export function signSdkJwt(env, { meetingNumber, role = 0, expSeconds = 3600 }) {
  const iat = Math.floor(Date.now() / 1000) - 30; // small skew allowance
  const exp = iat + Math.max(1800, expSeconds);

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    appKey: env.ZOOM_SDK_CLIENT_ID,
    sdkKey: env.ZOOM_SDK_CLIENT_ID,
    mn: String(meetingNumber),
    role,
    iat,
    exp,
    tokenExp: exp,
  };

  const b64 = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  const unsigned = `${b64(header)}.${b64(payload)}`;
  const signature = createHmac('sha256', env.ZOOM_SDK_CLIENT_SECRET)
    .update(unsigned)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${unsigned}.${signature}`;
}

/** The mandated name for every meeting this spike creates. */
export const SPIKE_MEETING_TOPIC = 'PRUEBA SPIKE — no unirse';

/**
 * Safety interlock for every destructive Zoom call in this spike.
 *
 * The recording round trip trashes and then permanently deletes files. Deleting
 * the wrong meeting's recording is unrecoverable, so no destructive call may be
 * issued without first reading the meeting back from Zoom and proving its topic
 * is the spike topic. Callers pass the meeting id/uuid they intend to destroy.
 */
export async function assertSpikeMeeting(env, meetingIdOrUuid) {
  const res = await zoomApi(env, 'GET', `/meetings/${encodeURIComponent(meetingIdOrUuid)}`);
  if (res.status !== 200) {
    throw new Error(
      `SAFETY ABORT: cannot verify meeting ${meetingIdOrUuid} before a destructive call (status ${res.status})`
    );
  }
  const topic = res.body?.topic ?? '';
  if (!topic.startsWith('PRUEBA SPIKE')) {
    throw new Error(
      `SAFETY ABORT: meeting ${meetingIdOrUuid} topic is ${JSON.stringify(topic)} — not a spike meeting. Refusing to touch it.`
    );
  }
  return res.body;
}
