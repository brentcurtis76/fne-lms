/**
 * QA-ROLES follow-up — the fail-closed scope vocabulary.
 *
 * These are the tests for the defect, not for the feature. Every mapping in
 * `scripts/ci/e2e-fixture-scopes.mjs` replaced a ternary of the shape
 * `name === 'primary' ? id : null`, which did not reject a misspelled scope value — it
 * mapped it to the primary fixture or to NULL and carried on. The persona was then seeded
 * with a scope nobody asked for, and every spec that trusted that scope passed for the
 * wrong reason. A `network: 'primry'` typo would have moved the supervisor out of the
 * cross-network control without a single test going red.
 *
 * So each case below asserts the OLD behaviour is gone: the value throws, and the message
 * says which persona, which field, and what was accepted instead. `toThrow` alone would
 * pass on any error at all, so every case pins the message.
 *
 * No database, no client, no network: the module under test is pure, which is the reason
 * it is a module rather than three ternaries inside the seeder.
 */
import { describe, it, expect } from 'vitest';
import fixtures from '../../../scripts/ci/e2e-fixtures.json';
import {
  SCOPE_FIELDS,
  SCOPE_VALUES,
  assertFixtureScopes,
  collectScopeProblems,
  resolveCommunityId,
  resolveGenerationId,
  resolveNetworkId,
  resolveRoleSchoolId,
  resolveSchoolId,
} from '../../../scripts/ci/e2e-fixture-scopes.mjs';

/** A deep clone, so a case that corrupts a persona cannot leak into the next one. */
function cloneFixtures(): any {
  return JSON.parse(JSON.stringify(fixtures));
}

describe('e2e fixture scopes — the shipped roster', () => {
  it('passes validation unchanged', () => {
    expect(() => assertFixtureScopes(cloneFixtures())).not.toThrow();
  });

  it('declares a closed vocabulary for all five scope fields', () => {
    expect(SCOPE_FIELDS).toEqual(['school', 'roleScope', 'generation', 'community', 'network']);
    expect(SCOPE_VALUES.school).toEqual(['primary', 'secondary']);
    expect(SCOPE_VALUES.roleScope).toEqual(['global']);
    expect(SCOPE_VALUES.generation).toEqual(['primary']);
    expect(SCOPE_VALUES.community).toEqual(['zoom', 'role']);
    expect(SCOPE_VALUES.network).toEqual(['primary', 'secondary']);
  });
});

describe('e2e fixture scopes — unknown values on a persona', () => {
  // One realistic typo per field. `Global` and `Primary` are in here on purpose: a
  // case-only mistake is the one a reader is least likely to spot by eye.
  const cases: { field: string; value: string; supported: string }[] = [
    { field: 'school', value: 'primry', supported: 'absent, "primary", "secondary"' },
    { field: 'school', value: 'Secondary', supported: 'absent, "primary", "secondary"' },
    { field: 'roleScope', value: 'Global', supported: 'absent, "global"' },
    { field: 'roleScope', value: 'globl', supported: 'absent, "global"' },
    { field: 'generation', value: 'Primary', supported: 'absent, "primary"' },
    { field: 'generation', value: 'secondary', supported: 'absent, "primary"' },
    { field: 'community', value: 'zooom', supported: 'absent, "zoom", "role"' },
    { field: 'community', value: 'roles', supported: 'absent, "zoom", "role"' },
    { field: 'network', value: 'primry', supported: 'absent, "primary", "secondary"' },
    { field: 'network', value: 'seconday', supported: 'absent, "primary", "secondary"' },
  ];

  for (const { field, value, supported } of cases) {
    it(`rejects ${field}="${value}" and names the persona, the field and what is supported`, () => {
      const corrupted = cloneFixtures();
      corrupted.users.networkSupervisor[field] = value;

      let thrown: Error | undefined;
      try {
        assertFixtureScopes(corrupted);
      } catch (error) {
        thrown = error as Error;
      }

      expect(thrown, `${field}="${value}" was accepted`).toBeInstanceOf(Error);
      expect(thrown!.message).toContain('users.networkSupervisor');
      expect(thrown!.message).toContain(`${field}=${JSON.stringify(value)}`);
      expect(thrown!.message).toContain(`supported: ${supported}`);
    });
  }

  it('rejects the empty string — it is a value somebody wrote, not an absent field', () => {
    const corrupted = cloneFixtures();
    corrupted.users.networkSupervisor.network = '';
    expect(() => assertFixtureScopes(corrupted)).toThrow(/network="" is not a supported/);
  });

  it('accepts an explicitly absent field', () => {
    const corrupted = cloneFixtures();
    corrupted.users.networkSupervisor.network = null;
    expect(() => assertFixtureScopes(corrupted)).not.toThrow();
  });
});

describe('e2e fixture scopes — unknown values inside inactiveRoles', () => {
  it('rejects a typo on an inactive role row and names its index', () => {
    const corrupted = cloneFixtures();
    corrupted.users.inactiveConsultor.inactiveRoles[0].school = 'primry';

    expect(() => assertFixtureScopes(corrupted)).toThrow(
      /users\.inactiveConsultor\.inactiveRoles\[0\]: school="primry"/
    );
  });

  it('rejects a typo on every scope field an inactive entry may carry', () => {
    for (const field of SCOPE_FIELDS) {
      const corrupted = cloneFixtures();
      corrupted.users.inactiveConsultor.inactiveRoles[0][field] = 'nonsense';

      expect(() => assertFixtureScopes(corrupted), `${field} was accepted`).toThrow(
        new RegExp(`inactiveRoles\\[0\\]: ${field}="nonsense"`)
      );
    }
  });
});

describe('e2e fixture scopes — org blocks carry scope fields too', () => {
  it('rejects an unknown school on either network block', () => {
    for (const key of ['network', 'networkSecondary']) {
      const corrupted = cloneFixtures();
      corrupted[key].school = 'tertiary';
      expect(() => assertFixtureScopes(corrupted), `${key} was accepted`).toThrow(
        new RegExp(`${key}: school="tertiary"`)
      );
    }
  });

  it('rejects an unknown generation on either growth community', () => {
    const corruptedRole = cloneFixtures();
    corruptedRole.roleCommunity.generation = 'primry';
    expect(() => assertFixtureScopes(corruptedRole)).toThrow(
      /roleCommunity: generation="primry"/
    );

    const corruptedZoom = cloneFixtures();
    corruptedZoom.zoom.community.generation = 'primry';
    expect(() => assertFixtureScopes(corruptedZoom)).toThrow(
      /zoom\.community: generation="primry"/
    );
  });
});

describe('e2e fixture scopes — every offender is reported at once', () => {
  it('collects problems across personas rather than stopping at the first', () => {
    const corrupted = cloneFixtures();
    corrupted.users.networkSupervisor.network = 'primry';
    corrupted.users.generationLeader.generation = 'Primary';
    corrupted.users.inactiveConsultor.inactiveRoles[0].school = 'seconday';

    let message = '';
    try {
      assertFixtureScopes(corrupted);
    } catch (error) {
      message = (error as Error).message;
    }

    // One re-run per typo is exactly the loop this aggregation exists to avoid.
    expect(message).toContain('3 unsupported scope value(s)');
    expect(message).toContain('users.networkSupervisor');
    expect(message).toContain('users.generationLeader');
    expect(message).toContain('users.inactiveConsultor.inactiveRoles[0]');
  });

  it('reports several bad fields on one persona', () => {
    const corrupted = cloneFixtures();
    corrupted.users.networkSupervisor.school = 'primry';
    corrupted.users.networkSupervisor.network = 'seconday';

    expect(collectScopeProblems('users.networkSupervisor', corrupted.users.networkSupervisor))
      .toHaveLength(2);
  });
});

describe('e2e fixture scopes — the resolvers are fail-closed on their own', () => {
  // Redundant with assertFixtureScopes by design: the up-front pass only walks the shapes
  // it knows about, so a future caller that hands a resolver an unvalidated value must
  // still not get a silent primary/NULL.
  const f = cloneFixtures();

  it('resolveSchoolId maps the known values and throws on anything else', () => {
    expect(resolveSchoolId(f, undefined)).toBe(f.school.id);
    expect(resolveSchoolId(f, 'primary')).toBe(f.school.id);
    expect(resolveSchoolId(f, 'secondary')).toBe(f.schoolSecondary.id);
    expect(() => resolveSchoolId(f, 'primry', 'users.x')).toThrow(
      /users\.x: school="primry" is not a supported scope value/
    );
  });

  it('resolveRoleSchoolId honours roleScope and throws on an unknown one', () => {
    expect(resolveRoleSchoolId(f, { roleScope: 'global', school: 'primary' })).toBeNull();
    expect(resolveRoleSchoolId(f, { school: 'secondary' })).toBe(f.schoolSecondary.id);
    expect(() => resolveRoleSchoolId(f, { roleScope: 'globl' }, 'users.x')).toThrow(
      /users\.x: roleScope="globl" is not a supported scope value/
    );
  });

  it('resolveGenerationId returns null when absent and throws on an unknown value', () => {
    expect(resolveGenerationId(f, undefined)).toBeNull();
    expect(resolveGenerationId(f, 'primary')).toBe(f.generation.id);
    expect(() => resolveGenerationId(f, 'secondary', 'users.x')).toThrow(
      /users\.x: generation="secondary" is not a supported scope value/
    );
  });

  it('resolveCommunityId distinguishes the two communities and throws on an unknown one', () => {
    expect(resolveCommunityId(f, undefined)).toBeNull();
    expect(resolveCommunityId(f, 'zoom')).toBe(f.zoom.community.id);
    expect(resolveCommunityId(f, 'role')).toBe(f.roleCommunity.id);
    expect(() => resolveCommunityId(f, 'zooom', 'users.x')).toThrow(
      /users\.x: community="zooom" is not a supported scope value/
    );
  });

  it('resolveNetworkId distinguishes the two networks and throws on an unknown one', () => {
    expect(resolveNetworkId(f, undefined)).toBeNull();
    expect(resolveNetworkId(f, 'primary')).toBe(f.network.id);
    expect(resolveNetworkId(f, 'secondary')).toBe(f.networkSecondary.id);
    expect(() => resolveNetworkId(f, 'primry', 'users.x')).toThrow(
      /users\.x: network="primry" is not a supported scope value/
    );
  });

  it('never silently maps an unknown value onto the primary fixture', () => {
    // The old behaviour, stated as the assertion it failed: each of these returned a real
    // id (or null) instead of throwing.
    expect(() => resolveSchoolId(f, 'primry')).toThrow();
    expect(() => resolveGenerationId(f, 'primry')).toThrow();
    expect(() => resolveCommunityId(f, 'zooom')).toThrow();
    expect(() => resolveNetworkId(f, 'primry')).toThrow();
  });
});
