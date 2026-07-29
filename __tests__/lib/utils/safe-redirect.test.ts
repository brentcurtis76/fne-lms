// @vitest-environment node
/**
 * Open-redirect guard for the post-login `?next=` round-trip.
 *
 * Inputs are written the way the Next.js router hands them over — already
 * percent-decoded once — because that is what `pages/login.tsx` passes in.
 * A value that survives this function gets navigated to, so the rejection
 * cases are the point of the file.
 */
import { describe, it, expect } from 'vitest';
import { resolveSafeInternalPath } from '../../../lib/utils/safe-redirect';

describe('resolveSafeInternalPath — accepted internal paths', () => {
  const accepted = [
    '/',
    '/dashboard',
    '/meet/session/3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22',
    '/consultor/sessions/3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22',
    '/admin/sessions?x=1',
    '/school/completion-status?school_id=7&tab=resumen',
    '/admin/growth-communities/abc/members',
    '/profile#datos',
    // Encoded characters inside a segment stay encoded — still one path.
    '/admin/reports/informe%20anual',
  ];

  it.each(accepted)('accepts %s unchanged', (path) => {
    expect(resolveSafeInternalPath(path)).toBe(path);
  });
});

describe('resolveSafeInternalPath — rejected values', () => {
  const rejected: Array<[string, unknown]> = [
    ['protocol-relative', '//evil.com'],
    ['protocol-relative with path', '//evil.com/meet/session/abc'],
    ['backslash protocol-relative', '/\\evil.com'],
    ['backslash anywhere', '/dashboard\\..\\evil'],
    ['absolute https URL', 'https://evil.com'],
    ['absolute http URL', 'http://evil.com/dashboard'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['scheme-looking value that starts with a slash-free host', 'evil.com/dashboard'],
    ['relative path without a leading slash', 'dashboard'],
    ['empty string', ''],
    ['tab-smuggled protocol-relative', '/\t/evil.com'],
    ['newline-smuggled protocol-relative', '/\n/evil.com'],
    ['carriage return', '/dashboard\r/evil'],
    ['null byte', '/dashboard\u0000'],
    ['undefined', undefined],
    ['null', null],
    ['number', 42],
    ['array (repeated ?next= param)', ['/dashboard', '//evil.com']],
    ['object', { pathname: '/dashboard' }],
  ];

  it.each(rejected)('rejects %s', (_label, value) => {
    expect(resolveSafeInternalPath(value)).toBeNull();
  });

  it('rejects the decoded form of an encoded protocol-relative URL', () => {
    // `/login?next=%2F%2Fevil.com` — the router decodes it once before the
    // value ever reaches this guard, so `//evil.com` is what must be caught.
    expect(resolveSafeInternalPath(decodeURIComponent('%2F%2Fevil.com'))).toBeNull();
  });

  it('rejects the decoded form of an encoded absolute URL', () => {
    expect(resolveSafeInternalPath(decodeURIComponent('https%3A%2F%2Fevil.com'))).toBeNull();
  });

  it('still accepts a legitimately encoded internal path after decoding', () => {
    const decoded = decodeURIComponent('%2Fmeet%2Fsession%2Fabc');
    expect(decoded).toBe('/meet/session/abc');
    expect(resolveSafeInternalPath(decoded)).toBe('/meet/session/abc');
  });
});
