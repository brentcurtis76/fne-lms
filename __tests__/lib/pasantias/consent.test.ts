// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  CONSENT_MARKETING_TEXT,
  CONSENT_PROCESSING_TEXT,
  PRIVACY_POLICY_LINK_LABEL,
  PRIVACY_POLICY_PATH,
} from '../../../lib/pasantias/consent';

describe('split consent copy (D-12)', () => {
  it('exports two non-empty sentences', () => {
    expect(CONSENT_PROCESSING_TEXT.trim()).not.toBe('');
    expect(CONSENT_MARKETING_TEXT.trim()).not.toBe('');
  });

  it('keeps the two purposes textually distinct', () => {
    expect(CONSENT_PROCESSING_TEXT).not.toBe(CONSENT_MARKETING_TEXT);
    expect(CONSENT_PROCESSING_TEXT).not.toContain(CONSENT_MARKETING_TEXT);
    expect(CONSENT_MARKETING_TEXT).not.toContain(CONSENT_PROCESSING_TEXT);
  });

  it('marks the marketing sentence as optional', () => {
    expect(CONSENT_MARKETING_TEXT.toLowerCase()).toContain('opcional');
  });

  it('does not present the required processing consent as optional', () => {
    expect(CONSENT_PROCESSING_TEXT.toLowerCase()).not.toContain('opcional');
  });

  it('scopes processing consent to answering the request and sending the program', () => {
    const text = CONSENT_PROCESSING_TEXT.toLowerCase();
    expect(text).toContain('responder');
    expect(text).toContain('programa');
  });

  it('scopes the marketing sentence to receiving news, not to this request', () => {
    const text = CONSENT_MARKETING_TEXT.toLowerCase();
    expect(text).toContain('novedades');
    expect(text).not.toContain('responder');
  });

  it('links the processing sentence to the privacy notice', () => {
    expect(CONSENT_PROCESSING_TEXT).toContain(PRIVACY_POLICY_LINK_LABEL);
    expect(PRIVACY_POLICY_PATH).toBe('/privacidad');
  });
});
