// @vitest-environment node
/**
 * The controlled test transport, and the two things that must be true about it.
 *
 * It exists so the mandatory e2e can open the link that was ACTUALLY placed in
 * the invitation message, rather than minting a different one through the admin
 * API and testing a URL nobody receives.
 *
 * Because it writes message bodies — which carry live recovery credentials — to
 * a file, the interesting assertions are the refusals.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureOutboundEmail, outboxPath } from '../../../lib/email/outbox';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'outbox-test-'));
  file = join(dir, 'outbox.jsonl');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe('it is off unless deliberately turned on', () => {
  it('is inert when E2E_MAIL_OUTBOX is unset — the state of every environment but the e2e job', () => {
    expect(outboxPath()).toBeNull();
    captureOutboundEmail({ to: 'a@example.com', subject: 's', html: '<a href="x">x</a>' });
    expect(existsSync(file)).toBe(false);
  });
});

describe('it CANNOT turn itself on in production', () => {
  it('refuses when VERCEL_ENV is production, even with the variable set', () => {
    vi.stubEnv('E2E_MAIL_OUTBOX', file);
    vi.stubEnv('VERCEL_ENV', 'production');

    expect(outboxPath()).toBeNull();
    captureOutboundEmail({ to: 'a@example.com', subject: 's', html: '<a href="x">x</a>' });
    expect(existsSync(file)).toBe(false);
  });

  it('refuses on any Vercel deployment at all', () => {
    // VERCEL is set by the platform. A deployment cannot claim not to be one.
    vi.stubEnv('E2E_MAIL_OUTBOX', file);
    vi.stubEnv('VERCEL', '1');

    expect(outboxPath()).toBeNull();
    expect(existsSync(file)).toBe(false);
  });

  it('refuses on a preview deployment too', () => {
    vi.stubEnv('E2E_MAIL_OUTBOX', file);
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(outboxPath()).toBeNull();
  });
});

describe('when it is on', () => {
  beforeEach(() => {
    vi.stubEnv('E2E_MAIL_OUTBOX', file);
    // The e2e serves a PRODUCTION BUILD on a local machine, so NODE_ENV alone
    // cannot be the veto — VERCEL_ENV is.
    vi.stubEnv('NODE_ENV', 'production');
  });

  it('appends one JSON line per message', () => {
    captureOutboundEmail({ to: 'uno@example.com', subject: 'Activa tu acceso', html: '<a href="u1">1</a>' });
    captureOutboundEmail({ to: 'dos@example.com', subject: 'Otra cosa', html: '<a href="u2">2</a>' });

    const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      to: 'uno@example.com',
      subject: 'Activa tu acceso',
      html: '<a href="u1">1</a>',
    });
    expect(lines[1].to).toBe('dos@example.com');
  });

  it('records the HTML, which is where the e2e finds the real link', () => {
    const url = 'https://genera.example.org/reset-password?token_hash=abc&type=recovery';
    captureOutboundEmail({ to: 'uno@example.com', subject: 's', html: `<a href="${url}">Ir</a>` });
    expect(readFileSync(file, 'utf8')).toContain(url);
  });

  it('never throws when the path is unwritable — a test artefact must not fail a send', () => {
    vi.stubEnv('E2E_MAIL_OUTBOX', join(dir, 'no', 'such', 'dir', 'outbox.jsonl'));
    expect(() =>
      captureOutboundEmail({ to: 'a@example.com', subject: 's', html: '<a>x</a>' })
    ).not.toThrow();
  });
});
