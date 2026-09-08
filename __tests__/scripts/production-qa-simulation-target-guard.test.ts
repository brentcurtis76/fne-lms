import { describe, expect, it } from 'vitest';
import {
  assertExplicitExecutionConfirmation,
  assertProductionQaTarget,
  assertQaTenantPreflight,
  loadSimulationTargetConfig,
  projectRefFromSupabaseUrl,
  requiredExecutionConfirmation,
} from '../../scripts/production-qa-simulation/target-guard.mjs';

describe('Production QA simulation target guard', () => {
  const config = loadSimulationTargetConfig();

  it('accepts only the exact governed Production URL and QA school ids', () => {
    const target = assertProductionQaTarget({
      supabaseUrl: config.productionSupabaseUrl,
      schoolIds: [257, 259],
    });
    expect(target).toMatchObject({
      projectRef: 'sxlogxqzmarhqsblxmtj',
      schoolIds: [257, 259],
      manifestVersion: 'sm-sim-v1',
    });
  });

  it.each([
    'http://127.0.0.1:54321',
    'https://different.supabase.co',
    'https://sxlogxqzmarhqsblxmtj.supabase.co/rest/v1',
    'https://sxlogxqzmarhqsblxmtj.supabase.co/?x=1',
    'not-a-url',
  ])('rejects a non-exact target before network access: %s', (supabaseUrl) => {
    expect(() => assertProductionQaTarget({ supabaseUrl, schoolIds: [257] })).toThrow(
      /refusing simulation target/
    );
  });

  it.each([[258], [257, 258], [257, 257], [], ['257']])(
    'rejects an unsafe school set: %j',
    (schoolIds) => {
      expect(() =>
        assertProductionQaTarget({
          supabaseUrl: config.productionSupabaseUrl,
          schoolIds,
        })
      ).toThrow(/refusing simulation target/);
    }
  );

  it('requires every guarded school to be classified qa', () => {
    const target = assertProductionQaTarget({
      supabaseUrl: config.productionSupabaseUrl,
      schoolIds: [257, 259],
    });
    expect(
      assertQaTenantPreflight(
        [
          { id: 257, tenant_kind: 'qa' },
          { id: 259, tenant_kind: 'qa' },
        ],
        target
      )
    ).toBe(true);
    expect(() =>
      assertQaTenantPreflight(
        [
          { id: 257, tenant_kind: 'client' },
          { id: 259, tenant_kind: 'qa' },
        ],
        target
      )
    ).toThrow(/257.*not classified qa/);
  });

  it('requires a non-secret exact execution phrase for write mode', () => {
    const phrase = requiredExecutionConfirmation(config);
    expect(phrase).toBe('execute:sm-sim-v1:sxlogxqzmarhqsblxmtj:257,259');
    expect(assertExplicitExecutionConfirmation(phrase, config)).toBe(true);
    expect(() => assertExplicitExecutionConfirmation('yes', config)).toThrow(
      /exact execution confirmation/
    );
  });

  it('extracts only canonical Supabase project hosts', () => {
    expect(projectRefFromSupabaseUrl(config.productionSupabaseUrl)).toBe(
      'sxlogxqzmarhqsblxmtj'
    );
    expect(projectRefFromSupabaseUrl('https://user@example.supabase.co')).toBeNull();
    expect(projectRefFromSupabaseUrl('https://example.supabase.co.evil.test')).toBeNull();
  });
});
