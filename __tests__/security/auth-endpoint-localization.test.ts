// @vitest-environment node
/**
 * H — every user-visible authentication response is Chilean Spanish.
 *
 * THE FINDING. The new authentication endpoints answered in English:
 * "Unauthorized", "New password is required", "Password change not required for
 * this user", "Failed to update password", "Method not allowed". CLAUDE.md says
 * UI and all user-facing copy is es-CL, and these strings reach toasts — the
 * `/change-password` page renders `result.error` directly.
 *
 * A per-endpoint assertion catches the ones a test happens to drive. This walks
 * the SOURCE of every authentication endpoint and every message constant, so a
 * string added tomorrow on a path no test reaches is caught too.
 *
 * WHAT IT DOES NOT CLAIM. It cannot prove a sentence is good Spanish. It proves
 * that no user-visible literal is one of the English phrases this codebase has
 * actually shipped, and that the shared message tables are Spanish throughout.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMPLETION_MESSAGES } from '../../lib/auth/password-completion';
import { ADMIN_RESET_MESSAGES } from '../../lib/auth/admin-password-reset';
import { DELIVERY_MESSAGES, DELIVERY_SUCCESS_MESSAGE } from '../../lib/email/invitations';
import { RECOVERY_MESSAGES } from '../../pages/reset-password';

const ROOT = join(__dirname, '..', '..');

/** Every endpoint this branch touched that can answer a browser. */
const AUTH_ENDPOINTS = [
  'pages/api/auth/recovery-complete.ts',
  'pages/api/auth/recovery-request.ts',
  'pages/api/auth/force-password-change.ts',
  'pages/api/auth/change-password.ts',
  'pages/api/auth/password-change-state.ts',
  'pages/api/admin/reset-password.ts',
];

/**
 * The English this repository has actually shipped in a user-visible response.
 * Matched as whole phrases so an identifier or a log prefix does not trip it.
 */
const SHIPPED_ENGLISH = [
  'Method not allowed',
  'Unauthorized',
  'Authentication required',
  'New password is required',
  'Password change not required for this user',
  'Failed to update password',
  'Internal server error',
  'Missing required fields',
  'School context missing',
  'An unexpected error occurred',
  'Password reset successfully',
  'User not found',
];

/**
 * Pull the string literals that are sent to a caller: the values of `error:` and
 * `message:` properties in a response body.
 */
function userVisibleLiterals(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const out: string[] = [];
  const pattern = /\b(?:error|message)\s*:\s*(['"])([^'"\n]*)\1/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code)) !== null) out.push(match[2]);

  // `sendAuthError(res, '...', 4xx)` and `sendMeetingError(res, 4xx, 'CODE', '...')`
  const helper = /send(?:Auth|Meeting)Error\s*\(([\s\S]*?)\)\s*;/g;
  while ((match = helper.exec(code)) !== null) {
    const args = match[1];
    const literals = args.match(/(['"])[^'"\n]*\1/g) ?? [];
    for (const literal of literals) out.push(literal.slice(1, -1));
  }
  return out;
}

/**
 * Words that appear in English response copy and not in Spanish. The check is
 * deliberately a NEGATIVE one: "does this sentence contain English?" is decidable
 * from a word list, while "is this good Chilean Spanish?" is not — and claiming
 * the latter would be the kind of overstatement this round exists to remove.
 */
const ENGLISH_ONLY = [
  'allowed', 'required', 'invalid', 'missing', 'failed', 'unauthorized',
  'authentication', 'internal', 'server error', 'not found', 'unexpected',
  'password change', 'this user', 'the ', ' is ', ' not ', ' for ', ' with ',
];

function englishMarkers(text: string): string[] {
  const lowered = ` ${text.toLowerCase()} `;
  return ENGLISH_ONLY.filter((word) => lowered.includes(word));
}

describe('the authentication endpoints answer in Chilean Spanish', () => {
  for (const file of AUTH_ENDPOINTS) {
    it(`${file} contains no shipped English response copy`, () => {
      const source = readFileSync(join(ROOT, file), 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

      for (const english of SHIPPED_ENGLISH) {
        expect(code, `${file} still answers "${english}"`).not.toContain(`'${english}`);
        expect(code, `${file} still answers "${english}"`).not.toContain(`"${english}`);
      }
    });

    it(`${file} has its user-visible literals in Spanish`, () => {
      const literals = userVisibleLiterals(readFileSync(join(ROOT, file), 'utf8'))
        // Machine-readable codes and header values are not copy.
        .filter((s) => s.length > 12 && !/^[A-Z0-9_]+$/.test(s) && !s.includes('/'));

      for (const literal of literals) {
        expect(englishMarkers(literal), `${file}: "${literal}" reads as English`).toEqual([]);
      }
    });
  }

  it('finds literals to check — the extraction is not silently empty', () => {
    const all = AUTH_ENDPOINTS.flatMap((f) =>
      userVisibleLiterals(readFileSync(join(ROOT, f), 'utf8'))
    );
    expect(all.length).toBeGreaterThan(10);
  });
});

describe('the shared message tables', () => {
  const tables: Array<[string, Record<string, string>]> = [
    ['COMPLETION_MESSAGES', COMPLETION_MESSAGES as unknown as Record<string, string>],
    ['ADMIN_RESET_MESSAGES', ADMIN_RESET_MESSAGES as unknown as Record<string, string>],
    ['DELIVERY_MESSAGES', DELIVERY_MESSAGES as unknown as Record<string, string>],
    ['RECOVERY_MESSAGES', RECOVERY_MESSAGES as unknown as Record<string, string>],
  ];

  for (const [name, table] of tables) {
    it(`${name} is Spanish throughout`, () => {
      const values = Object.values(table);
      expect(values.length).toBeGreaterThan(3);
      for (const value of values) {
        expect(englishMarkers(value), `${name}: "${value}" reads as English`).toEqual([]);
      }
      // And at least most of them carry an unambiguous Spanish marker, so the
      // negative check above cannot pass on an empty or ASCII-only table.
      const accented = values.filter((v) => /[áéíóúñÁÉÍÓÚÑ¿¡]/.test(v));
      expect(accented.length).toBeGreaterThan(values.length / 2);
    });
  }

  it('DELIVERY_SUCCESS_MESSAGE is Spanish too', () => {
    expect(/[áéíóúñ]/.test(DELIVERY_SUCCESS_MESSAGE)).toBe(true);
    expect(englishMarkers(DELIVERY_SUCCESS_MESSAGE)).toEqual([]);
  });
});

describe('the specific strings the review named', () => {
  it.each([
    ['a missing password', COMPLETION_MESSAGES.passwordRequired, 'New password is required'],
    ['an unauthenticated caller', COMPLETION_MESSAGES.notAuthenticated, 'Unauthorized'],
    [
      'a forced change that is not required',
      COMPLETION_MESSAGES.changeNotRequired,
      'Password change not required for this user',
    ],
    ['an update failure', COMPLETION_MESSAGES.updateFailed, 'Failed to update password'],
  ])('%s no longer answers in English', (_label, actual, english) => {
    expect(actual).not.toBe(english);
    expect(englishMarkers(actual)).toEqual([]);
  });
});
