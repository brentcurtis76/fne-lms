// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  LEGAL_IDENTITY,
  PRIVACY_NOTICE_UPDATED_AT,
  PRIVACY_NOTICE_UPDATED_LABEL,
  PRIVACY_NOTICE_VERSION,
} from '../../../lib/legal/privacy-notice';

describe('privacy notice versioning', () => {
  it('exposes a non-empty version string consent records can cite', () => {
    expect(PRIVACY_NOTICE_VERSION.trim()).not.toBe('');
    expect(PRIVACY_NOTICE_VERSION).toMatch(/^\d{4}-\d{2}-v\d+$/);
  });

  it('keeps the ratified version string (Appendix A-13)', () => {
    expect(PRIVACY_NOTICE_VERSION).toBe('2026-07-v1');
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

  it('carries no leftover pending placeholder', () => {
    for (const [field, value] of Object.entries(LEGAL_IDENTITY)) {
      expect(value, field).not.toMatch(/PENDIENTE|\[|TODO/i);
    }
  });

  it('distinguishes the nombre de fantasía from the legal entity', () => {
    expect(LEGAL_IDENTITY.brandName.trim()).not.toBe('');
    expect(LEGAL_IDENTITY.legalName.trim()).not.toBe('');
    expect(LEGAL_IDENTITY.brandName).not.toBe(LEGAL_IDENTITY.legalName);
  });

  it('holds the controller identity approved in Appendix A-10', () => {
    expect(LEGAL_IDENTITY.brandName).toBe('Fundación Nueva Educación');
    expect(LEGAL_IDENTITY.legalName).toBe('Fundación Instituto Relacional');
    expect(LEGAL_IDENTITY.taxId).toBe('RUT 65.166.503-5');
    expect(LEGAL_IDENTITY.streetAddress).toBe('Carlos Silva Vildósola 10448');
    expect(LEGAL_IDENTITY.city).toBe('La Reina, Santiago');
    expect(LEGAL_IDENTITY.country).toBe('Chile');
  });

  it('carries a contact address for data-subject requests', () => {
    expect(LEGAL_IDENTITY.contactEmail).toContain('@');
  });
});
