import { readFileSync } from 'node:fs';

const CONFIG_URL = new URL('../../config/production-qa-simulation-target.json', import.meta.url);

export function loadSimulationTargetConfig() {
  const parsed = JSON.parse(readFileSync(CONFIG_URL, 'utf8'));
  assertConfigShape(parsed);
  return Object.freeze({
    ...parsed,
    qaSchoolIds: Object.freeze([...parsed.qaSchoolIds]),
  });
}

function assertConfigShape(value) {
  if (!value || typeof value !== 'object') throw new Error('simulation target config is invalid');
  if (value.schemaVersion !== 1) throw new Error('simulation target schemaVersion must be 1');
  if (typeof value.manifestVersion !== 'string' || value.manifestVersion === '') {
    throw new Error('simulation target manifestVersion is invalid');
  }
  if (!Array.isArray(value.qaSchoolIds) || value.qaSchoolIds.length !== 2) {
    throw new Error('simulation target must name exactly two QA schools');
  }
  if (new Set(value.qaSchoolIds).size !== value.qaSchoolIds.length) {
    throw new Error('simulation target QA school ids must be unique');
  }
}

export function projectRefFromSupabaseUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
  const match = /^([a-z0-9]+)\.supabase\.co$/.exec(url.hostname);
  if (!match || url.pathname !== '/' || url.search || url.hash) return null;
  return match[1];
}

export function projectRefFromDatabaseUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== '/postgres') return null;
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(url.hostname);
  if (direct) return direct[1];
  if (!url.hostname.endsWith('.pooler.supabase.com')) return null;
  const poolerUser = /^postgres\.([a-z0-9]+)$/.exec(decodeURIComponent(url.username));
  return poolerUser?.[1] ?? null;
}

/** Pure database guard. It validates the nonsecret ref before pg is imported or a pool is built. */
export function assertProductionQaDatabaseTarget(rawUrl, config = loadSimulationTargetConfig()) {
  if (projectRefFromDatabaseUrl(rawUrl) !== config.productionProjectRef) {
    throw new Error('refusing simulation database target: project ref is not allowlisted');
  }
  return Object.freeze({ projectRef: config.productionProjectRef, schoolIds: Object.freeze([...config.qaSchoolIds]) });
}

/** Pure phase-one guard. It performs no network I/O and must run before a client is built. */
export function assertProductionQaTarget(input, config = loadSimulationTargetConfig()) {
  const projectRef = projectRefFromSupabaseUrl(input.supabaseUrl);
  if (projectRef !== config.productionProjectRef) {
    throw new Error('refusing simulation target: Supabase project ref is not allowlisted');
  }
  if (input.supabaseUrl !== config.productionSupabaseUrl) {
    throw new Error('refusing simulation target: Supabase URL is not the exact allowlisted URL');
  }

  if (!Array.isArray(input.schoolIds) || input.schoolIds.length === 0) {
    throw new Error('refusing simulation target: no school ids were requested');
  }
  const allowed = new Set(config.qaSchoolIds);
  const uniqueRequested = new Set(input.schoolIds);
  if (uniqueRequested.size !== input.schoolIds.length) {
    throw new Error('refusing simulation target: duplicate school id');
  }
  for (const schoolId of input.schoolIds) {
    if (!Number.isSafeInteger(schoolId) || !allowed.has(schoolId)) {
      throw new Error('refusing simulation target: school id is not allowlisted');
    }
  }

  return Object.freeze({
    projectRef,
    schoolIds: Object.freeze([...input.schoolIds]),
    manifestVersion: config.manifestVersion,
  });
}

/** Phase-two read-only result validation, required after the no-network target guard. */
export function assertQaTenantPreflight(rows, guardedTarget, config = loadSimulationTargetConfig()) {
  if (!Array.isArray(rows) || rows.length !== guardedTarget.schoolIds.length) {
    throw new Error('refusing simulation target: QA tenant preflight row count mismatch');
  }
  const byId = new Map(rows.map((row) => [row?.id, row]));
  for (const schoolId of guardedTarget.schoolIds) {
    const row = byId.get(schoolId);
    if (!row || row.tenant_kind !== 'qa') {
      throw new Error(`refusing simulation target: school ${schoolId} is not classified qa`);
    }
  }
  if (guardedTarget.projectRef !== config.productionProjectRef) {
    throw new Error('refusing simulation target: guarded project ref drifted');
  }
  return true;
}

export function requiredExecutionConfirmation(config = loadSimulationTargetConfig()) {
  return `execute:${config.manifestVersion}:${config.productionProjectRef}:${config.qaSchoolIds.join(',')}`;
}

export function assertExplicitExecutionConfirmation(value, config = loadSimulationTargetConfig()) {
  if (value !== requiredExecutionConfirmation(config)) {
    throw new Error('refusing simulation write: exact execution confirmation is required');
  }
  return true;
}
