import { readFileSync } from 'node:fs';

/**
 * Pure, synchronous pilot-provisioning target guard.
 *
 * Runs BEFORE any Supabase client exists and performs no I/O beyond reading the
 * frozen allowlist in config/pilot-provisioning-targets.json. It never reads
 * the environment or the command line (the CLI hands it plain values), accepts no
 * bypass/force/skip option, and never prints or returns a key value. Every
 * refusal message starts with `refusing pilot target:` so operators and tests
 * can tell a guard stop from any other error.
 */

const CONFIG_URL = new URL('../../config/pilot-provisioning-targets.json', import.meta.url);

export const TARGET_NAMES = Object.freeze(['staging', 'realPilot']);
export const ENVIRONMENT_CLASSES = Object.freeze(['staging', 'production']);
export const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '[::1]']);

const refuse = (reason) => new Error(`refusing pilot target: ${reason}`);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

export function loadPilotTargetConfig(configUrl = CONFIG_URL) {
  const parsed = JSON.parse(readFileSync(configUrl, 'utf8'));
  assertConfigShape(parsed);
  return deepFreeze(parsed);
}

export function assertConfigShape(value) {
  if (!value || typeof value !== 'object') throw new Error('pilot target config is invalid');
  if (value.schemaVersion !== 1) throw new Error('pilot target config schemaVersion must be 1');
  if (!value.targets || typeof value.targets !== 'object') throw new Error('pilot target config has no targets');
  const names = Object.keys(value.targets).sort();
  if (names.join(',') !== [...TARGET_NAMES].sort().join(',')) {
    throw new Error('pilot target config must define exactly the staging and realPilot targets');
  }
  for (const name of names) {
    const entry = value.targets[name];
    if (!entry || typeof entry !== 'object') throw new Error(`pilot target ${name} is invalid`);
    if (!ENVIRONMENT_CLASSES.includes(entry.environmentClass)) {
      throw new Error(`pilot target ${name} has an unknown environmentClass`);
    }
    if (typeof entry.approved !== 'boolean') throw new Error(`pilot target ${name} approved must be boolean`);
    if (typeof entry.keyEnv !== 'string' || !/^[A-Z][A-Z0-9_]+$/.test(entry.keyEnv)) {
      throw new Error(`pilot target ${name} keyEnv is invalid`);
    }
    if (entry.projectRef !== null && typeof entry.projectRef !== 'string') {
      throw new Error(`pilot target ${name} projectRef must be null or a string`);
    }
    if (entry.supabaseUrl !== null && typeof entry.supabaseUrl !== 'string') {
      throw new Error(`pilot target ${name} supabaseUrl must be null or a string`);
    }
  }
  if (value.targets.staging.environmentClass !== 'staging') {
    throw new Error('pilot target staging must be environmentClass staging');
  }
  if (value.targets.realPilot.environmentClass !== 'production') {
    throw new Error('pilot target realPilot must be environmentClass production');
  }
  return true;
}

/** Returns the canonical project ref for an exact `https://<ref>.supabase.co` URL, else null. */
export function projectRefFromSupabaseUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname);
  if (!match || url.pathname !== '/' || url.search || url.hash) return null;
  if (rawUrl !== `https://${match[1]}.supabase.co` && rawUrl !== `https://${match[1]}.supabase.co/`) return null;
  return match[1];
}

export function isLoopbackUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return false;
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return LOOPBACK_HOSTS.has(host) || host.startsWith('127.') || host.endsWith('.localhost');
  } catch {
    return false;
  }
}

/**
 * Decodes the payload of a JWT-shaped key WITHOUT verifying it, only to compare
 * its `ref` and `role` claims with the allowlisted entry. Non-JWT keys (the
 * `sb_secret_` family) carry no claims and are accepted as opaque.
 * The key is never stored on the returned object.
 */
export function inspectServiceKeyReference(serviceKey) {
  if (typeof serviceKey !== 'string' || serviceKey.trim() === '') {
    return { present: false, shape: 'missing', ref: null, role: null };
  }
  const parts = serviceKey.split('.');
  if (parts.length !== 3 || !serviceKey.startsWith('ey')) {
    return { present: true, shape: 'opaque', ref: null, role: null };
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return {
      present: true,
      shape: 'jwt',
      ref: typeof payload.ref === 'string' ? payload.ref : null,
      role: typeof payload.role === 'string' ? payload.role : null,
    };
  } catch {
    return { present: true, shape: 'jwt-undecodable', ref: null, role: null };
  }
}

/**
 * Phase-one guard. Validates the requested target name, the exact runtime URL,
 * the environment class the manifest intends, and the key REFERENCE (presence
 * and, for JWTs, embedded ref/role) against the frozen allowlist.
 *
 * Returns a frozen, secret-free description of the guarded target.
 */
export function assertPilotTarget(input, config = loadPilotTargetConfig()) {
  if (!input || typeof input !== 'object') throw refuse('no target input');
  const { targetName, supabaseUrl, manifestTarget, manifestEnvironmentClass, serviceKey } = input;

  if (!TARGET_NAMES.includes(targetName)) throw refuse(`unknown target name`);
  const entry = config.targets[targetName];
  if (manifestTarget !== targetName) throw refuse('manifest target does not match the requested target');
  if (manifestEnvironmentClass !== entry.environmentClass) {
    throw refuse('manifest environment class does not match the allowlisted target');
  }
  if (entry.approved !== true) throw refuse(`target ${targetName} is not approved in the allowlist`);
  if (typeof entry.projectRef !== 'string' || !PROJECT_REF_PATTERN.test(entry.projectRef)) {
    throw refuse(`target ${targetName} has no valid allowlisted project ref`);
  }
  if (projectRefFromSupabaseUrl(entry.supabaseUrl) !== entry.projectRef) {
    throw refuse(`target ${targetName} allowlisted URL does not match its project ref`);
  }

  if (typeof supabaseUrl !== 'string' || supabaseUrl === '') throw refuse('runtime Supabase URL is missing');
  if (isLoopbackUrl(supabaseUrl)) throw refuse('runtime Supabase URL is a loopback/local address');
  const runtimeRef = projectRefFromSupabaseUrl(supabaseUrl);
  if (runtimeRef === null) throw refuse('runtime Supabase URL is not a canonical https://<ref>.supabase.co URL');
  if (runtimeRef !== entry.projectRef) throw refuse('runtime Supabase project ref is not the allowlisted ref');
  if (supabaseUrl !== entry.supabaseUrl) throw refuse('runtime Supabase URL is not the exact allowlisted URL');

  const other = TARGET_NAMES.filter((name) => name !== targetName).map((name) => config.targets[name].projectRef);
  if (other.includes(runtimeRef)) throw refuse('runtime project ref belongs to a different target class');

  const key = inspectServiceKeyReference(serviceKey);
  if (!key.present) throw refuse(`service key ${entry.keyEnv} is missing`);
  if (key.shape === 'jwt-undecodable') throw refuse('service key is not a decodable JWT');
  if (key.shape === 'jwt') {
    if (key.ref !== entry.projectRef) throw refuse('service key project ref does not match the allowlisted target');
    if (key.role !== 'service_role') throw refuse('service key role is not service_role');
  }

  return Object.freeze({
    targetName,
    projectRef: entry.projectRef,
    supabaseUrl: entry.supabaseUrl,
    environmentClass: entry.environmentClass,
    keyEnv: entry.keyEnv,
    keyShape: key.shape,
  });
}

/** The exact, non-secret confirmation an operator must type for a write verb. */
export function requiredConfirmation(verb, manifestDigest, projectRef) {
  if (!['apply', 'reset'].includes(verb)) throw new Error('confirmation is only defined for apply and reset');
  if (typeof manifestDigest !== 'string' || !/^[0-9a-f]{64}$/.test(manifestDigest)) {
    throw new Error('manifest digest is invalid');
  }
  if (typeof projectRef !== 'string' || !PROJECT_REF_PATTERN.test(projectRef)) {
    throw new Error('project ref is invalid');
  }
  return `${verb}:${manifestDigest.slice(0, 16)}:${projectRef}`;
}

export function assertConfirmation(verb, value, manifestDigest, projectRef) {
  if (value !== requiredConfirmation(verb, manifestDigest, projectRef)) {
    throw new Error(`refusing pilot ${verb}: exact --confirm string is required`);
  }
  return true;
}
