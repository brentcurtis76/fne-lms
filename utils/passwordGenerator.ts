/**
 * Password generation and validation for user provisioning.
 *
 * This module is now a thin, compatibility-preserving front for the two shared
 * modules that own the behaviour:
 *
 *   - `lib/auth/password-policy`     — the single definition of the rule
 *   - `lib/auth/password-generator`  — CSPRNG generation, unbiased selection
 *
 * What used to live here and is gone on purpose:
 *
 *   - `Math.random()` in `generatePassword`, `generateBulkPasswords` and the
 *     shuffle. Non-cryptographic and state-recoverable — every temporary
 *     credential the platform ever issued came out of it.
 *   - `generateMemorablePassword`, which built credentials out of the user's
 *     own first name, last name and the current year (`JuanPere4372026!`).
 *     That is a guessable password derived from public information; it was
 *     removed rather than adapted, because there is no version of "derive the
 *     credential from the person's name" that is safe.
 *   - `PasswordRequirements` as a per-call-site knob. A configurable policy is
 *     how the codebase ended up with five different policies; the policy is now
 *     fixed and shared.
 *   - `calculatePasswordStrength` / `getPasswordStrengthLabel`, which had no
 *     callers and scored on rules the platform does not enforce.
 */
import {
  PASSWORD_POLICY,
  validatePasswordPolicy,
  type PasswordPolicyResult,
} from '../lib/auth/password-policy';
import {
  GENERATED_PASSWORD_LENGTH,
  generateCompliantPassword,
  generateCompliantPasswords,
  type GeneratePasswordOptions,
} from '../lib/auth/password-generator';

export { PASSWORD_POLICY, GENERATED_PASSWORD_LENGTH };
export type { GeneratePasswordOptions };

/**
 * A policy-compliant password from the CSPRNG.
 *
 * `options.length` is the only remaining dial, and it is clamped to the policy
 * floor — a caller can ask for a longer credential, never a weaker one.
 */
export function generatePassword(options: GeneratePasswordOptions = {}): string {
  return generateCompliantPassword(options);
}

/** `count` distinct policy-compliant passwords. Uniqueness is per batch. */
export function generateBulkPasswords(
  count: number,
  options: GeneratePasswordOptions = {}
): string[] {
  return generateCompliantPasswords(count, options);
}

/**
 * The shared policy check. Kept under its historical name so existing server
 * call sites read unchanged; the rule itself now comes from one place.
 */
export function validatePassword(password: unknown): PasswordPolicyResult {
  return validatePasswordPolicy(password);
}
