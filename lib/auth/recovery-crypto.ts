/**
 * Server-only cryptography for the recovery queue and retry grant.
 *
 * The Supabase service-role secret is already a high-entropy, shared secret on
 * every server instance. Domain-separated SHA-256 derivation gives this module
 * independent AES/HMAC keys without adding another deployment secret whose
 * absence could strand recovery users. Rotating the service key intentionally
 * invalidates queued envelopes and grants; their maximum useful lifetime is
 * short, and a rotation is a security event.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';

const VERSION = 'v1';
const GRANT_PREFIX = 'rg1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RecoveryEnvelopePurpose = 'request' | 'message' | 'grant';

export interface RecoveryGrantClaims {
  purpose: 'password_recovery';
  subject: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

export type RecoveryGrantVerification =
  | { ok: true; claims: RecoveryGrantClaims; grantHash: string }
  | { ok: false; reason: 'missing' | 'invalid' | 'expired' | 'not_configured' };

function configuredSecret(explicit?: string): string | null {
  const secret = explicit ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  return typeof secret === 'string' && secret.length >= 32 ? secret : null;
}

function deriveKey(secret: string, purpose: RecoveryEnvelopePurpose | 'ip'): Buffer {
  return createHash('sha256')
    .update('fne-lms/auth-recovery/')
    .update(purpose)
    .update('\0')
    .update(secret)
    .digest();
}

function aad(purpose: RecoveryEnvelopePurpose): Buffer {
  return Buffer.from(`fne-lms/auth-recovery/${purpose}/${VERSION}`, 'utf8');
}

/** AES-256-GCM. The returned string is safe to persist; plaintext is not. */
export function sealRecoveryEnvelope(
  value: Record<string, unknown>,
  purpose: RecoveryEnvelopePurpose,
  explicitSecret?: string
): string {
  const secret = configuredSecret(explicitSecret);
  if (!secret) throw new Error('RECOVERY_CRYPTO_NOT_CONFIGURED');

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, purpose), iv);
  cipher.setAAD(aad(purpose));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), ciphertext.toString('base64url'), tag.toString('base64url')].join('.');
}

export function openRecoveryEnvelope(
  envelope: string,
  purpose: RecoveryEnvelopePurpose,
  explicitSecret?: string
): Record<string, unknown> | null {
  const secret = configuredSecret(explicitSecret);
  if (!secret || typeof envelope !== 'string') return null;

  const [version, ivPart, ciphertextPart, tagPart, extra] = envelope.split('.');
  if (version !== VERSION || !ivPart || !ciphertextPart || !tagPart || extra !== undefined) {
    return null;
  }

  try {
    const iv = Buffer.from(ivPart, 'base64url');
    const ciphertext = Buffer.from(ciphertextPart, 'base64url');
    const tag = Buffer.from(tagPart, 'base64url');
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) return null;

    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret, purpose), iv);
    decipher.setAAD(aad(purpose));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(plaintext);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function hashRecoveryGrant(grant: string): string {
  return createHash('sha256').update(grant, 'utf8').digest('hex');
}

export function issueRecoveryGrant(
  subject: string,
  options: { now?: Date; ttlSeconds?: number; secret?: string } = {}
): { grant: string; grantHash: string; expiresAt: string } {
  if (!UUID.test(subject)) throw new Error('RECOVERY_GRANT_INVALID_SUBJECT');
  const now = options.now ?? new Date();
  const ttlSeconds = options.ttlSeconds ?? 15 * 60;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 60 * 60) {
    throw new Error('RECOVERY_GRANT_INVALID_TTL');
  }

  const claims: RecoveryGrantClaims = {
    purpose: 'password_recovery',
    subject,
    nonce: randomBytes(32).toString('base64url'),
    issuedAt: Math.floor(now.getTime() / 1000),
    expiresAt: Math.floor(now.getTime() / 1000) + ttlSeconds,
  };
  const sealed = sealRecoveryEnvelope({ ...claims }, 'grant', options.secret);
  const grant = `${GRANT_PREFIX}.${sealed}`;
  return {
    grant,
    grantHash: hashRecoveryGrant(grant),
    expiresAt: new Date(claims.expiresAt * 1000).toISOString(),
  };
}

export function verifyRecoveryGrant(
  grant: unknown,
  options: { now?: Date; secret?: string } = {}
): RecoveryGrantVerification {
  if (typeof grant !== 'string' || grant.length === 0) return { ok: false, reason: 'missing' };
  if (!configuredSecret(options.secret)) return { ok: false, reason: 'not_configured' };
  if (!grant.startsWith(`${GRANT_PREFIX}.`)) return { ok: false, reason: 'invalid' };

  const parsed = openRecoveryEnvelope(grant.slice(GRANT_PREFIX.length + 1), 'grant', options.secret);
  if (
    !parsed ||
    parsed.purpose !== 'password_recovery' ||
    typeof parsed.subject !== 'string' ||
    !UUID.test(parsed.subject) ||
    typeof parsed.nonce !== 'string' ||
    parsed.nonce.length < 40 ||
    typeof parsed.issuedAt !== 'number' ||
    typeof parsed.expiresAt !== 'number' ||
    !Number.isSafeInteger(parsed.issuedAt) ||
    !Number.isSafeInteger(parsed.expiresAt) ||
    parsed.expiresAt <= parsed.issuedAt ||
    parsed.expiresAt - parsed.issuedAt > 60 * 60
  ) {
    return { ok: false, reason: 'invalid' };
  }

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (parsed.expiresAt <= nowSeconds) return { ok: false, reason: 'expired' };

  return {
    ok: true,
    claims: parsed as unknown as RecoveryGrantClaims,
    grantHash: hashRecoveryGrant(grant),
  };
}

/** HMAC rather than a raw IP or stable unsalted digest. */
export function fingerprintRecoveryIp(ip: string, explicitSecret?: string): string {
  const secret = configuredSecret(explicitSecret);
  if (!secret) throw new Error('RECOVERY_CRYPTO_NOT_CONFIGURED');
  return createHmac('sha256', deriveKey(secret, 'ip'))
    .update(typeof ip === 'string' && ip.length > 0 ? ip : 'unknown')
    .digest('hex');
}
