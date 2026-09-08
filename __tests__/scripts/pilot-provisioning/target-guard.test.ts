import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as guard from '../../../scripts/pilot-provisioning/target-guard.mjs';

const {
  assertConfirmation,
  assertPilotTarget,
  inspectServiceKeyReference,
  loadPilotTargetConfig,
  projectRefFromSupabaseUrl,
  requiredConfirmation,
} = guard;

import { PROD_REF, STAGING_REF, approvedConfig } from './approved-config';

function jwtFor(claims: Record<string, unknown>) {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.signature`;
}

// Deliberately NOT key-shaped: the committed-secrets guard scans the git index,
// and inspectServiceKeyReference treats any non-JWT string as an opaque key.
const SYNTHETIC_KEY = 'synthetic-service-role-placeholder';

const stagingInput = (overrides: Record<string, unknown> = {}) => ({
  targetName: 'staging',
  supabaseUrl: `https://${STAGING_REF}.supabase.co`,
  manifestTarget: 'staging',
  manifestEnvironmentClass: 'staging',
  serviceKey: SYNTHETIC_KEY,
  ...overrides,
});

describe('pilot provisioning target guard', () => {
  it('ships with both targets unapproved and null, so the committed allowlist refuses everything', () => {
    const config = loadPilotTargetConfig();
    expect(config.targets.staging).toMatchObject({ projectRef: null, supabaseUrl: null, approved: false, environmentClass: 'staging' });
    expect(config.targets.realPilot).toMatchObject({ projectRef: null, supabaseUrl: null, approved: false, environmentClass: 'production' });
    expect(() => assertPilotTarget(stagingInput(), config)).toThrow(/refusing pilot target: target staging is not approved/);
    expect(() =>
      assertPilotTarget(
        { ...stagingInput(), targetName: 'realPilot', manifestTarget: 'realPilot', manifestEnvironmentClass: 'production' },
        config,
      ),
    ).toThrow(/refusing pilot target: target realPilot is not approved/);
  });

  it('accepts the exact approved staging target and returns no secret', () => {
    const target = assertPilotTarget(stagingInput(), approvedConfig());
    expect(target).toEqual({
      targetName: 'staging',
      projectRef: STAGING_REF,
      supabaseUrl: `https://${STAGING_REF}.supabase.co`,
      environmentClass: 'staging',
      keyEnv: 'PILOT_STAGING_SERVICE_ROLE_KEY',
      keyShape: 'opaque',
    });
    expect(JSON.stringify(target)).not.toContain(SYNTHETIC_KEY);
  });

  it('accepts a JWT-shaped key only when its ref and role match the target', () => {
    const good = jwtFor({ ref: STAGING_REF, role: 'service_role' });
    expect(assertPilotTarget(stagingInput({ serviceKey: good }), approvedConfig()).keyShape).toBe('jwt');
    expect(() => assertPilotTarget(stagingInput({ serviceKey: jwtFor({ ref: PROD_REF, role: 'service_role' }) }), approvedConfig())).toThrow(
      /service key project ref does not match/,
    );
    expect(() => assertPilotTarget(stagingInput({ serviceKey: jwtFor({ ref: STAGING_REF, role: 'anon' }) }), approvedConfig())).toThrow(
      /service key role is not service_role/,
    );
    expect(() => assertPilotTarget(stagingInput({ serviceKey: '' }), approvedConfig())).toThrow(/service key .* is missing/);
    expect(inspectServiceKeyReference(good)).toEqual({ present: true, shape: 'jwt', ref: STAGING_REF, role: 'service_role' });
  });

  it.each([
    ['production ref on the staging target', stagingInput({ supabaseUrl: `https://${PROD_REF}.supabase.co` }), /not the allowlisted ref/],
    ['localhost', stagingInput({ supabaseUrl: 'http://localhost:54321' }), /loopback/],
    ['127.0.0.1', stagingInput({ supabaseUrl: 'http://127.0.0.1:54321' }), /loopback/],
    ['::1', stagingInput({ supabaseUrl: 'http://[::1]:54321' }), /loopback/],
    ['0.0.0.0', stagingInput({ supabaseUrl: 'http://0.0.0.0:54321' }), /loopback/],
    ['unknown .supabase.co ref', stagingInput({ supabaseUrl: 'https://unknownunknownunknow.supabase.co' }), /not the allowlisted ref/],
    ['non-canonical URL with a path', stagingInput({ supabaseUrl: `https://${STAGING_REF}.supabase.co/rest/v1` }), /not a canonical/],
    ['credentials in the URL', stagingInput({ supabaseUrl: `https://u:p@${STAGING_REF}.supabase.co` }), /not a canonical/],
    ['look-alike host', stagingInput({ supabaseUrl: `https://${STAGING_REF}.supabase.co.evil.test` }), /not a canonical/],
    ['missing URL', stagingInput({ supabaseUrl: undefined }), /missing/],
    ['unknown target name', stagingInput({ targetName: 'prod' }), /unknown target name/],
    ['manifest aimed at another target', stagingInput({ manifestTarget: 'realPilot' }), /manifest target does not match/],
    ['mismatched environment class', stagingInput({ manifestEnvironmentClass: 'production' }), /environment class does not match/],
  ])('rejects %s before any client exists', (_label, input, pattern) => {
    expect(() => assertPilotTarget(input, approvedConfig())).toThrow(pattern);
    expect(() => assertPilotTarget(input, approvedConfig())).toThrow(/^refusing pilot target:/);
  });

  it('rejects the realPilot ref when presented under the staging target name', () => {
    const config = approvedConfig();
    const crossed = stagingInput({ supabaseUrl: `https://${PROD_REF}.supabase.co` });
    expect(() => assertPilotTarget(crossed, config)).toThrow(/refusing pilot target/);
  });

  it('refuses an allowlist entry whose URL and ref disagree, even when approved', () => {
    const config = approvedConfig();
    const broken = {
      ...config,
      targets: { ...config.targets, staging: { ...config.targets.staging, supabaseUrl: `https://${PROD_REF}.supabase.co` } },
    };
    expect(() => assertPilotTarget(stagingInput(), broken)).toThrow(/allowlisted URL does not match its project ref/);
  });

  it('extracts refs only from canonical Supabase hosts', () => {
    expect(projectRefFromSupabaseUrl(`https://${STAGING_REF}.supabase.co`)).toBe(STAGING_REF);
    expect(projectRefFromSupabaseUrl(`https://${STAGING_REF}.supabase.co/`)).toBe(STAGING_REF);
    expect(projectRefFromSupabaseUrl(`http://${STAGING_REF}.supabase.co`)).toBeNull();
    expect(projectRefFromSupabaseUrl('https://short.supabase.co')).toBeNull();
    expect(projectRefFromSupabaseUrl('not a url')).toBeNull();
  });

  it('exposes no bypass, force, skip or override option and never reads the environment', () => {
    const exportNames = Object.keys(guard);
    expect(exportNames.filter((name) => /bypass|force|skip|unsafe|override|allow|insecure|dangerous/i.test(name))).toEqual([]);
    const source = readFileSync(resolve(__dirname, '../../../scripts/pilot-provisioning/target-guard.mjs'), 'utf8');
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/--force|--bypass|--skip|--unsafe|--yes/);
    expect(source).not.toMatch(/argv|process\.argv/);
  });

  it('builds a non-secret exact confirmation from digest and project ref', () => {
    const digest = 'a'.repeat(64);
    expect(requiredConfirmation('apply', digest, STAGING_REF)).toBe(`apply:${'a'.repeat(16)}:${STAGING_REF}`);
    expect(assertConfirmation('apply', `apply:${'a'.repeat(16)}:${STAGING_REF}`, digest, STAGING_REF)).toBe(true);
    expect(() => assertConfirmation('apply', 'yes', digest, STAGING_REF)).toThrow(/exact --confirm string is required/);
    expect(() => assertConfirmation('reset', `apply:${'a'.repeat(16)}:${STAGING_REF}`, digest, STAGING_REF)).toThrow(/refusing pilot reset/);
    expect(() => requiredConfirmation('preflight', digest, STAGING_REF)).toThrow(/only defined for apply and reset/);
  });
});
