// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  LEGAL_IDENTITY,
  LEGAL_IDENTITY_PENDING,
  PRIVACY_NOTICE_UPDATED_AT,
  PRIVACY_NOTICE_UPDATED_LABEL,
  PRIVACY_NOTICE_VERSION,
} from '../../../lib/legal/privacy-notice';

describe('privacy notice versioning', () => {
  it('exposes a non-empty version string consent records can cite', () => {
    expect(PRIVACY_NOTICE_VERSION.trim()).not.toBe('');
    expect(PRIVACY_NOTICE_VERSION).toMatch(/^\d{4}-\d{2}-v\d+$/);
  });

  it('publishes an ISO date-only publication date', () => {
    expect(PRIVACY_NOTICE_UPDATED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('keeps the es-CL label in sync with the ISO date', () => {
    const [year, month, day] = PRIVACY_NOTICE_UPDATED_AT.split('-');
    expect(PRIVACY_NOTICE_UPDATED_LABEL).toBe(`${day}-${month}-${year}`);
  });

  it('dates the version consistently with the version string prefix', () => {
    expect(PRIVACY_NOTICE_UPDATED_AT.startsWith(PRIVACY_NOTICE_VERSION.slice(0, 7))).toBe(true);
  });
});

describe('LEGAL_IDENTITY', () => {
  it('has no silently empty field', () => {
    for (const [field, value] of Object.entries(LEGAL_IDENTITY)) {
      expect(typeof value, field).toBe('string');
      expect(value.trim(), field).not.toBe('');
    }
  });

  it('marks fields awaiting Appendix A-10 with the pending sentinel', () => {
    expect(LEGAL_IDENTITY.taxId).toBe(LEGAL_IDENTITY_PENDING);
    expect(LEGAL_IDENTITY.streetAddress).toBe(LEGAL_IDENTITY_PENDING);
  });

  it('carries the controller name and a contact address already approved', () => {
    expect(LEGAL_IDENTITY.legalName).toBe('Fundación Nueva Educación');
    expect(LEGAL_IDENTITY.contactEmail).toContain('@');
    expect(LEGAL_IDENTITY.contactEmail).not.toBe(LEGAL_IDENTITY_PENDING);
  });
});
