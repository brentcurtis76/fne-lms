// @vitest-environment node
/**
 * The CONTENTS of the three approved low-level auth modules, enforced — and the
 * negative controls that make that enforcement evidence.
 *
 * The fourth independent review's finding: a boundary that only names WHICH
 * files may hold the password-capable primitives goes green the day an approved
 * maintenance wrapper quietly gains a `password` field, because the file was
 * already on the list. So the guard now pins, per module, the exact auth
 * attributes each primitive call may carry, refuses spreads/aliases/computed
 * shapes inside the approved modules, and requires the shared password policy
 * to be called where the contract says it must exist.
 *
 * Every case below feeds the checker an IN-MEMORY MUTATED copy of the real
 * module source — the widening is injected into today's actual code, not into a
 * synthetic fixture that could drift away from it. Each mutation first asserts
 * it really changed the source, so a refactor that breaks an anchor fails
 * loudly here instead of silently testing nothing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  scanSource,
  APPROVED_MODULE_CONTRACTS,
} from '../../scripts/ci/check-browser-boundaries.mjs';

const ROOT = process.cwd();
const MAINTENANCE = join(ROOT, 'lib', 'auth', 'admin-user-maintenance.ts');
const PROVISIONING = join(ROOT, 'lib', 'auth', 'account-provisioning.ts');
const COMPLETION = join(ROOT, 'lib', 'auth', 'password-completion.ts');

function mutate(path: string, anchor: string, replacement: string): string {
  const source = readFileSync(path, 'utf8');
  expect(source, `anchor not found in ${path}: ${anchor}`).toContain(anchor);
  return source.replace(anchor, replacement);
}

function rules(path: string, source: string): string[] {
  return scanSource(path, source, { browser: false }).map((f: any) => f.rule);
}

describe('the contract table itself', () => {
  it('covers exactly the three approved modules and pins their attribute sets', () => {
    expect([...APPROVED_MODULE_CONTRACTS.keys()].sort()).toEqual([
      'lib/auth/account-provisioning.ts',
      'lib/auth/admin-user-maintenance.ts',
      'lib/auth/password-completion.ts',
    ]);
    const maintenance = APPROVED_MODULE_CONTRACTS.get('lib/auth/admin-user-maintenance.ts')!;
    expect(maintenance.primitives.updateUserById.allowedKeys).not.toContain('password');
    expect(maintenance.primitives.createUser).toBeNull();
    const provisioning = APPROVED_MODULE_CONTRACTS.get('lib/auth/account-provisioning.ts')!;
    expect(provisioning.primitives.updateUserById).toBeNull();
    expect(provisioning.requiredCallees).toContain('firstPasswordPolicyError');
    const completion = APPROVED_MODULE_CONTRACTS.get('lib/auth/password-completion.ts')!;
    expect(completion.requiredCallees).toContain('firstPasswordPolicyError');
  });
});

describe('positive controls: the real modules satisfy their contracts', () => {
  it.each([MAINTENANCE, PROVISIONING, COMPLETION])('%s is clean as written', (path) => {
    expect(rules(path, readFileSync(path, 'utf8'))).toEqual([]);
  });
});

describe('negative controls: each widening of an approved module is refused', () => {
  it('a password added to updateAuthUserEmail', () => {
    const mutated = mutate(MAINTENANCE, '{ email })', '{ email, password: newPassword })');
    expect(rules(MAINTENANCE, mutated)).toContain('APPROVED_MODULE_ATTRIBUTE');
  });

  it('a password added to clearAdministrativeResetMarker', () => {
    const mutated = mutate(
      MAINTENANCE,
      'user_metadata: { password_reset_by_admin: null, password_reset_at: null },',
      'user_metadata: { password_reset_by_admin: null, password_reset_at: null }, password: temporary,'
    );
    expect(rules(MAINTENANCE, mutated)).toContain('APPROVED_MODULE_ATTRIBUTE');
  });

  it('an arbitrary auth attribute added inside an approved module', () => {
    const mutated = mutate(
      PROVISIONING,
      'app_metadata: input.appMetadata,',
      'app_metadata: input.appMetadata, ban_duration: "none",'
    );
    expect(rules(PROVISIONING, mutated)).toContain('APPROVED_MODULE_ATTRIBUTE');
  });

  it('a spread added to an approved payload', () => {
    const mutated = mutate(MAINTENANCE, '{ email })', '{ email, ...extras })');
    expect(rules(MAINTENANCE, mutated)).toContain('APPROVED_MODULE_PAYLOAD_SHAPE');
  });

  it('a variable payload detached from the call site', () => {
    const mutated = mutate(
      PROVISIONING,
      `return admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: input.emailConfirm,
    user_metadata: input.userMetadata,
    app_metadata: input.appMetadata,
  });`,
      'const attributes = buildAttributes(input); return admin.auth.admin.createUser(attributes);'
    );
    expect(rules(PROVISIONING, mutated)).toContain('APPROVED_MODULE_PAYLOAD_SHAPE');
  });

  it('a computed key smuggled into an approved payload', () => {
    const mutated = mutate(
      MAINTENANCE,
      '{ email })',
      '{ email, ["pass" + "word"]: newPassword })'
    );
    expect(rules(MAINTENANCE, mutated)).toContain('APPROVED_MODULE_PAYLOAD_SHAPE');
  });

  it('an alias taken to the raw primitive inside an approved module', () => {
    const mutated = mutate(
      COMPLETION,
      'const updatePromise = admin.auth.admin.updateUserById(input.userId, {',
      'const writer = admin.auth.admin.updateUserById;\n  const updatePromise = writer(input.userId, {'
    );
    expect(rules(COMPLETION, mutated)).toContain('APPROVED_MODULE_PRIMITIVE_ALIAS');
  });

  it('a create-user primitive appearing in a module whose purpose excludes it', () => {
    const mutated = mutate(
      MAINTENANCE,
      'export async function updateAuthUserEmail(',
      'export async function provisionExtra(admin: SupabaseClient) { return admin.auth.admin.createUser({ email: "x", password: "y" }); }\nexport async function updateAuthUserEmail('
    );
    expect(rules(MAINTENANCE, mutated)).toContain('APPROVED_MODULE_FORBIDDEN_PRIMITIVE');
  });

  it('the password policy removed from account creation', () => {
    const mutated = mutate(
      PROVISIONING,
      'const policyError = firstPasswordPolicyError(input.password);',
      'const policyError = null;'
    );
    expect(rules(PROVISIONING, mutated)).toContain('APPROVED_MODULE_POLICY_MISSING');
  });

  it('the password policy removed from the private writer', () => {
    const source = readFileSync(COMPLETION, 'utf8');
    const mutated = source.replace(/firstPasswordPolicyError\(/g, 'someOtherCheck(');
    expect(mutated).not.toContain('firstPasswordPolicyError(');
    expect(rules(COMPLETION, mutated)).toContain('APPROVED_MODULE_POLICY_MISSING');
  });
});
