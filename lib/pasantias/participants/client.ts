/**
 * BROWSER helpers for the coordinator page (`pages/pasantias/nomina.tsx`).
 *
 * The token lives in the URL fragment (`#k=<token>`). A fragment is never sent
 * in a request or in a Referer, and the page leaves it in place so a reload or
 * a bookmark keeps working (I05). The token travels to our own API only, as
 * `Authorization: Intake <token>`.
 */

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** The token from `location.hash`, or null when it is missing or malformed. */
export function readTokenFromHash(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  for (const part of raw.split('&')) {
    const [key, value] = part.split('=');
    if (key === 'k' && value !== undefined && TOKEN.test(value)) return value;
  }
  return null;
}

function hex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
  return out;
}

/**
 * A v4 UUID used as the create idempotency key (FIRST N6). Not a secret: it
 * only lets a retry of the same attempt be recognised. `crypto.randomUUID` is
 * missing on older browsers, so `getRandomValues` is the fallback.
 */
export function newClientRequestId(): string {
  const c = (typeof crypto !== 'undefined' ? crypto : undefined) as
    | (Crypto & { randomUUID?: () => string })
    | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export type IntakeResponse =
  | { network: false; status: number; body: Record<string, unknown> }
  | { network: true; status: 0; body: Record<string, never> };

/** One call to an intake route. Never throws; a transport failure is `network: true`. */
export async function intakeRequest(
  token: string,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown
): Promise<IntakeResponse> {
  try {
    const response = await fetch(path, {
      method,
      headers: {
        Authorization: `Intake ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      credentials: 'same-origin',
      referrerPolicy: 'no-referrer',
    });
    let parsed: Record<string, unknown> = {};
    try {
      parsed = (await response.json()) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    return { network: false, status: response.status, body: parsed ?? {} };
  } catch {
    return { network: true, status: 0, body: {} };
  }
}
