import { describe, expect, it } from 'vitest';
import { shouldShowQaSimulationBanner } from '../../../lib/simulation/route-context';

describe('QA simulation route context', () => {
  const qaRole = {
    school_id: 257,
    is_active: true,
    school: { tenant_kind: 'qa' },
  };
  const clientRole = {
    school_id: 10,
    is_active: true,
    school: { tenant_kind: 'client' },
  };

  it('shows for an allowlisted QA profile', () => {
    expect(
      shouldShowQaSimulationBanner({
        profileSchoolId: 257,
        profileTenantKind: 'qa',
        roles: [qaRole],
      })
    ).toBe(true);
  });

  it('uses a route school only to select among authoritative role rows', () => {
    expect(
      shouldShowQaSimulationBanner({ routeSchoolId: '257', roles: [qaRole, clientRole] })
    ).toBe(true);
    expect(
      shouldShowQaSimulationBanner({ routeSchoolId: '10', roles: [qaRole, clientRole] })
    ).toBe(false);
    expect(
      shouldShowQaSimulationBanner({ routeSchoolId: '259', roles: [qaRole] })
    ).toBe(false);
  });

  it('never shows for a non-allowlisted QA row or a mixed route without selection', () => {
    expect(
      shouldShowQaSimulationBanner({
        profileSchoolId: 300,
        profileTenantKind: 'qa',
        roles: [{ school_id: 300, is_active: true, school: { tenant_kind: 'qa' } }],
      })
    ).toBe(false);
    expect(shouldShowQaSimulationBanner({ roles: [qaRole, clientRole] })).toBe(false);
  });
});
