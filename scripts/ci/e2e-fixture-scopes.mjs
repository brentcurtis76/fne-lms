/**
 * QA-ROLES — the scope-field vocabulary, shared by the seeder and its unit tests.
 *
 * WHY THIS IS A MODULE AND NOT THREE TERNARIES IN THE SEEDER: the mappings it replaces
 * were all of the shape `name === 'primary' ? id : null`, which is FAIL-OPEN. A misspelled
 * scope value — `'primry'`, `'seconday'`, `'Global'` — did not fail. It fell through to the
 * primary fixture or to NULL, seeded a persona with a scope nobody asked for, and every
 * spec that trusted that scope then passed for the wrong reason. A cross-network control is
 * worth exactly nothing if a typo can silently move the supervisor out of the network.
 *
 * So: every scope value is checked against a closed vocabulary and an unknown one throws.
 * Absent is the one thing that is always allowed, and it always means "no scope" (except
 * `school`, whose documented default is the primary school — see resolveSchoolId).
 *
 * `scripts/ci/seed-e2e.mjs` imports this and validates the WHOLE fixture file up front, so
 * a typo is reported once, with every offender named, before any row is written. The
 * resolvers below stay fail-closed anyway: the up-front pass and the per-call guard are
 * deliberately redundant, because the up-front pass only walks the shapes it knows about.
 *
 * Pure and side-effect free on purpose — importing it starts nothing and connects to
 * nothing, which is what lets `__tests__/scripts/ci/e2e-fixture-scopes.test.ts` exercise it
 * with no database at all.
 */

/**
 * Every scope field a persona (or an `inactiveRoles` entry, or an org block) may carry,
 * and the ONLY values each one accepts. Absent is always additionally allowed.
 *
 * Keep this in step with the `SCOPE FIELDS` section of `scripts/ci/e2e-fixtures.json`:
 * that comment is the human-readable copy, this is the enforced one.
 */
export const SCOPE_VALUES = Object.freeze({
  school: Object.freeze(['primary', 'secondary']),
  roleScope: Object.freeze(['global']),
  generation: Object.freeze(['primary']),
  community: Object.freeze(['zoom', 'role']),
  network: Object.freeze(['primary', 'secondary']),
});

/** The scope field names, in the order the fixture documentation lists them. */
export const SCOPE_FIELDS = Object.freeze(Object.keys(SCOPE_VALUES));

/**
 * Absent — and ONLY absent. `null` counts, an empty string does not: `''` is a value
 * somebody wrote, and treating it as "no scope" is the fail-open behaviour this module
 * exists to remove.
 */
function isAbsent(value) {
  return value === undefined || value === null;
}

function supportedList(field) {
  return ['absent', ...SCOPE_VALUES[field].map((value) => JSON.stringify(value))].join(', ');
}

function unknownScopeMessage(label, field, value) {
  return (
    `${label}: ${field}=${JSON.stringify(value)} is not a supported scope value ` +
    `— supported: ${supportedList(field)}`
  );
}

function unknownScope(label, field, value) {
  return new Error(`[e2e-fixtures] ${unknownScopeMessage(label, field, value)}`);
}

/**
 * Every unsupported scope value on ONE spec — a persona, or one `inactiveRoles` entry.
 * Returns a (possibly empty) list rather than throwing, so the caller can report all of
 * them at once instead of one re-run per typo.
 */
export function collectScopeProblems(label, spec) {
  const problems = [];
  if (spec === null || typeof spec !== 'object') return problems;

  for (const field of SCOPE_FIELDS) {
    const value = spec[field];
    if (isAbsent(value)) continue;
    if (!SCOPE_VALUES[field].includes(value)) {
      problems.push(unknownScopeMessage(label, field, value));
    }
  }
  return problems;
}

/**
 * Validate every scope value in the fixture file, and throw ONE error naming all of them.
 *
 * Covers the two shapes the handoff requires — each persona and each of its `inactiveRoles`
 * entries — plus the org blocks that also carry scope fields (`network.school`,
 * `networkSecondary.school`, `roleCommunity.generation`, `zoom.community.generation`).
 * Those are included because they are the same fields with the same fail-open history;
 * leaving them out would fail closed for a persona's `generation` and stay fail-open for a
 * growth community's.
 */
export function assertFixtureScopes(fixtures) {
  const problems = [];

  for (const [key, user] of Object.entries(fixtures.users ?? {})) {
    problems.push(...collectScopeProblems(`users.${key}`, user));
    const extras = Array.isArray(user?.inactiveRoles) ? user.inactiveRoles : [];
    extras.forEach((extra, index) => {
      problems.push(...collectScopeProblems(`users.${key}.inactiveRoles[${index}]`, extra));
    });
  }

  for (const key of ['network', 'networkSecondary']) {
    problems.push(...collectScopeProblems(key, fixtures[key]));
  }
  problems.push(...collectScopeProblems('roleCommunity', fixtures.roleCommunity));
  problems.push(...collectScopeProblems('zoom.community', fixtures.zoom?.community));

  if (problems.length === 0) return;

  throw new Error(
    `[e2e-fixtures] ${problems.length} unsupported scope value(s) in ` +
      'scripts/ci/e2e-fixtures.json:\n' +
      problems.map((problem) => `  - ${problem}`).join('\n') +
      '\nAn unsupported value used to be mapped silently to the primary fixture or to NULL, ' +
      'which seeded the wrong scope and made every spec that trusted it pass for the wrong ' +
      'reason. Fix the value, or add it to SCOPE_VALUES in scripts/ci/e2e-fixture-scopes.mjs ' +
      'and to the SCOPE FIELDS section of the fixture file.'
  );
}

/**
 * The school a spec points at. Absent means the PRIMARY school — the documented default,
 * and the only scope field whose absence is not "no scope".
 */
export function resolveSchoolId(fixtures, name, label = 'fixture') {
  if (isAbsent(name) || name === 'primary') return fixtures.school.id;
  if (name === 'secondary') return fixtures.schoolSecondary.id;
  throw unknownScope(label, 'school', name);
}

/**
 * The `school_id` for a ROLE row, which is where `roleScope` applies.
 *
 * `roleScope: 'global'` means NULL, which is what lib/utils/session-policy.ts:31 reads as
 * GLOBAL consultor access. A profile is never global — `resolveSchoolId` is what the
 * profile uses — so this split is the whole reason the two functions are separate.
 */
export function resolveRoleSchoolId(fixtures, spec, label = 'fixture') {
  if (isAbsent(spec.roleScope)) return resolveSchoolId(fixtures, spec.school, label);
  if (spec.roleScope === 'global') return null;
  throw unknownScope(label, 'roleScope', spec.roleScope);
}

/** The generation a spec points at. Absent means none. */
export function resolveGenerationId(fixtures, name, label = 'fixture') {
  if (isAbsent(name)) return null;
  if (name === 'primary') return fixtures.generation.id;
  throw unknownScope(label, 'generation', name);
}

/** The growth community a spec points at. Absent means none. */
export function resolveCommunityId(fixtures, name, label = 'fixture') {
  if (isAbsent(name)) return null;
  if (name === 'zoom') return fixtures.zoom.community.id;
  if (name === 'role') return fixtures.roleCommunity.id;
  throw unknownScope(label, 'community', name);
}

/** The school network a spec points at. Absent means none. */
export function resolveNetworkId(fixtures, name, label = 'fixture') {
  if (isAbsent(name)) return null;
  if (name === 'primary') return fixtures.network.id;
  if (name === 'secondary') return fixtures.networkSecondary.id;
  throw unknownScope(label, 'network', name);
}
