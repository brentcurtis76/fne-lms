// @vitest-environment node
/**
 * S5 — the shared password policy, and the proof that every entry point speaks it.
 *
 * The defect this replaces was not "the policy is too weak"; it was that there
 * were five different policies. The admin reset modal accepted six characters
 * with no character classes, and the recovery page accepted the same — so an
 * administrator could set a temporary credential that the platform would then
 * reject when the user tried to replace it with something similar.
 */
import { describe, it, expect } from 'vitest';
import {
  PASSWORD_POLICY,
  PASSWORD_POLICY_SUMMARY,
  PASSWORD_RULES,
  firstPasswordPolicyError,
  validatePasswordPolicy,
} from '../../../lib/auth/password-policy';

const VALID = 'Sintetica2026';

describe('PASSWORD_POLICY — the baseline', () => {
  it('is the established product baseline', () => {
    expect(PASSWORD_POLICY).toEqual({
      minLength: 8,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
    });
  });

  it('is frozen — no call site can mutate the shared rule', () => {
    expect(Object.isFrozen(PASSWORD_POLICY)).toBe(true);
  });
});

describe('validatePasswordPolicy', () => {
  it('accepts a password meeting every requirement', () => {
    expect(validatePasswordPolicy(VALID)).toEqual({ valid: true, errors: [] });
  });

  it('accepts exactly the minimum length', () => {
    expect(validatePasswordPolicy('Abcdefg1').valid).toBe(true);
  });

  it('rejects one character below the minimum', () => {
    const result = validatePasswordPolicy('Abcdef1');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('La contraseña debe tener al menos 8 caracteres');
  });

  it('rejects a password with no uppercase letter', () => {
    const result = validatePasswordPolicy('sintetica2026');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('La contraseña debe contener al menos una letra mayúscula');
  });

  it('rejects a password with no lowercase letter', () => {
    const result = validatePasswordPolicy('SINTETICA2026');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('La contraseña debe contener al menos una letra minúscula');
  });

  it('rejects a password with no number', () => {
    const result = validatePasswordPolicy('SinteticaSegura');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('La contraseña debe contener al menos un número');
  });

  it('accepts exactly the maximum length and rejects one over', () => {
    const atMax = `Aa1${'x'.repeat(PASSWORD_POLICY.maxLength - 3)}`;
    expect(atMax).toHaveLength(PASSWORD_POLICY.maxLength);
    expect(validatePasswordPolicy(atMax).valid).toBe(true);

    const overMax = `${atMax}x`;
    const result = validatePasswordPolicy(overMax);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('La contraseña no puede superar los 128 caracteres');
  });

  it('reports every violation at once, so a form can list them', () => {
    const result = validatePasswordPolicy('abc');
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3); // length, uppercase, number
  });

  // Every caller reads this out of a JSON body, so non-strings are real input.
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 12345678],
    ['an object', { password: VALID }],
    ['an array', [VALID]],
    ['the empty string', ''],
  ])('rejects %s without throwing', (_label, input) => {
    const result = validatePasswordPolicy(input as unknown);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['La contraseña es obligatoria']);
  });

  // The exact bypass the old per-call-site validators allowed.
  it('rejects the six-character passwords the reset modal and recovery page used to accept', () => {
    for (const weak of ['abc123', 'Abc12', 'temp01', '123456']) {
      expect(validatePasswordPolicy(weak).valid).toBe(false);
    }
  });
});

describe('firstPasswordPolicyError', () => {
  it('returns null for a compliant password', () => {
    expect(firstPasswordPolicyError(VALID)).toBeNull();
  });

  it('returns the length failure before the character-class failures', () => {
    expect(firstPasswordPolicyError('abc')).toBe(
      'La contraseña debe tener al menos 8 caracteres'
    );
  });
});

describe('PASSWORD_RULES — the UI checklist', () => {
  it('covers exactly the enforced requirements, in display order', () => {
    expect(PASSWORD_RULES.map((rule) => rule.id)).toEqual([
      'length',
      'uppercase',
      'lowercase',
      'number',
    ]);
  });

  it('every rule passes for a compliant password', () => {
    for (const rule of PASSWORD_RULES) {
      expect(rule.test(VALID)).toBe(true);
    }
  });

  // The client checklist and the server gate must not be able to disagree:
  // if every rule says "met", the server must agree, and vice versa.
  it.each([
    'Sintetica2026',
    'Abcdefg1',
    'abc',
    'SINTETICA2026',
    'sintetica2026',
    'SinteticaSegura',
  ])('agrees with the server gate for %s', (candidate) => {
    const allRulesMet = PASSWORD_RULES.every((rule) => rule.test(candidate));
    expect(allRulesMet).toBe(validatePasswordPolicy(candidate).valid);
  });

  it('all user-facing copy is es-CL', () => {
    for (const rule of PASSWORD_RULES) {
      expect(rule.label).toMatch(/^Al menos /);
    }
    expect(PASSWORD_POLICY_SUMMARY).toContain('La contraseña debe tener al menos 8 caracteres');
  });
});
