/**
 * The password policy. One definition, every entry point.
 *
 * Before this module the same rule was written five times — the forced-change
 * page, `/api/auth/change-password`, `/api/auth/force-password-change`,
 * `utils/passwordGenerator`, and the admin reset modal — and the five did not
 * agree: the reset modal and the recovery page accepted six characters with no
 * character-class requirement at all, so an administrator could hand out a
 * temporary credential the platform would refuse the user's own replacement of.
 * Two more entry points (`/api/admin/create-user`, the bulk importer's global
 * password) had no server-side rule whatsoever.
 *
 * Rules of the road:
 *
 *   - This is the ONLY place the rule lives. Anything that accepts a password
 *     calls `validatePasswordPolicy` (server) and renders `PASSWORD_RULES`
 *     (client). Do not re-implement either.
 *   - Client-side checking is a usability affordance, never the boundary. Every
 *     endpoint the application controls re-validates server-side.
 *   - Messages are the user-facing surface, so they are es-CL. Everything else
 *     in this file is English, per the project language split.
 *
 * NOT enforced here, because the application does not own it: Supabase Auth
 * applies its own minimum length and (when enabled) HaveIBeenPwned leaked-password
 * checking at the GoTrue layer. Those are dashboard settings; see
 * `docs/runbooks/auth-security.md`. A password accepted here can still be
 * rejected there, which is why the call sites surface GoTrue's failure rather
 * than swallowing it.
 */

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
}

/**
 * The product baseline. `maxLength` exists so a pathological input cannot be
 * pushed through bcrypt; 128 is far above any realistic passphrase and well
 * inside GoTrue's own limit.
 */
export const PASSWORD_POLICY: Readonly<PasswordPolicy> = Object.freeze({
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
});

/**
 * The rule list, in the order the UI shows it. `test` powers the live
 * checkmarks on the change-password form; `label` is the copy.
 */
export const PASSWORD_RULES: ReadonlyArray<{
  id: 'length' | 'uppercase' | 'lowercase' | 'number';
  label: string;
  test: (password: string) => boolean;
}> = Object.freeze([
  {
    id: 'length',
    label: `Al menos ${PASSWORD_POLICY.minLength} caracteres`,
    test: (password: string) => password.length >= PASSWORD_POLICY.minLength,
  },
  {
    id: 'uppercase',
    label: 'Al menos una letra mayúscula',
    test: (password: string) => /[A-Z]/.test(password),
  },
  {
    id: 'lowercase',
    label: 'Al menos una letra minúscula',
    test: (password: string) => /[a-z]/.test(password),
  },
  {
    id: 'number',
    label: 'Al menos un número',
    test: (password: string) => /[0-9]/.test(password),
  },
]);

export interface PasswordPolicyResult {
  valid: boolean;
  /** es-CL, ordered: length, then character classes. Empty when valid. */
  errors: string[];
}

/**
 * The single server-side gate.
 *
 * Accepts `unknown` on purpose: every caller reads the value out of a request
 * body, so "not a string at all" is a real input and has to produce a policy
 * failure rather than a TypeError.
 */
export function validatePasswordPolicy(password: unknown): PasswordPolicyResult {
  const errors: string[] = [];

  if (typeof password !== 'string' || password.length === 0) {
    return { valid: false, errors: ['La contraseña es obligatoria'] };
  }

  if (password.length < PASSWORD_POLICY.minLength) {
    errors.push(`La contraseña debe tener al menos ${PASSWORD_POLICY.minLength} caracteres`);
  }

  if (password.length > PASSWORD_POLICY.maxLength) {
    errors.push(`La contraseña no puede superar los ${PASSWORD_POLICY.maxLength} caracteres`);
  }

  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('La contraseña debe contener al menos una letra mayúscula');
  }

  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('La contraseña debe contener al menos una letra minúscula');
  }

  if (PASSWORD_POLICY.requireNumber && !/[0-9]/.test(password)) {
    errors.push('La contraseña debe contener al menos un número');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * The first failure, or null. For endpoints that answer with a single message.
 */
export function firstPasswordPolicyError(password: unknown): string | null {
  const { valid, errors } = validatePasswordPolicy(password);
  return valid ? null : errors[0];
}

/**
 * One line summarising the whole policy — for a 400 body or a form hint that
 * has room for a sentence rather than a list.
 */
export const PASSWORD_POLICY_SUMMARY =
  `La contraseña debe tener al menos ${PASSWORD_POLICY.minLength} caracteres e incluir ` +
  'una letra mayúscula, una letra minúscula y un número.';
