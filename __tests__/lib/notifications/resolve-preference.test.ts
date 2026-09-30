import { describe, expect, it } from 'vitest';
import { getCatalogEntry } from '../../../lib/notifications/catalog';
import { resolveEmailPreference } from '../../../lib/notifications/resolve-preference';

// Catalog facts the table below relies on; if the catalog changes, this fails first.
describe('catalog entries used by the precedence table', () => {
  it('matches the approved categories, defaults and the one mandatory event', () => {
    expect(getCatalogEntry('session_cancelled')).toMatchObject({ category: 'sessions', emailDefault: 'immediate', mandatory: true });
    expect(getCatalogEntry('licitacion_published')).toMatchObject({ category: 'licitaciones', emailDefault: 'immediate', mandatory: false });
    expect(getCatalogEntry('new_feedback')).toMatchObject({ category: 'qa_support', emailDefault: 'digest', mandatory: false });
    expect(getCatalogEntry('system_update')).toMatchObject({ category: 'system', emailDefault: 'off', mandatory: false });
    expect(getCatalogEntry('meeting_finalized')).toMatchObject({ category: 'community', emailDefault: 'immediate', mandatory: false });
    expect(getCatalogEntry('not_a_catalog_event')).toBeUndefined();
  });
});

describe('resolveEmailPreference — D1 precedence for a mapped event', () => {
  it.each([
    // mandatory: nothing disables it
    { eventType: 'session_cancelled', categoryMode: 'off', legacySuppressed: true, mode: 'immediate', reason: 'mandatory' },
    { eventType: 'session_cancelled', categoryMode: 'digest', legacySuppressed: false, mode: 'immediate', reason: 'mandatory' },
    { eventType: 'session_cancelled', categoryMode: null, legacySuppressed: true, mode: 'immediate', reason: 'mandatory' },
    // a non-default category mode beats the legacy row and the catalog default
    { eventType: 'licitacion_published', categoryMode: 'immediate', legacySuppressed: true, mode: 'immediate', reason: 'category_mode' },
    { eventType: 'licitacion_published', categoryMode: 'digest', legacySuppressed: true, mode: 'digest', reason: 'category_mode' },
    { eventType: 'licitacion_published', categoryMode: 'off', legacySuppressed: false, mode: 'off', reason: 'category_mode' },
    { eventType: 'system_update', categoryMode: 'immediate', legacySuppressed: false, mode: 'immediate', reason: 'category_mode' },
    { eventType: 'new_feedback', categoryMode: 'off', legacySuppressed: false, mode: 'off', reason: 'category_mode' },
    // default re-applies the legacy suppression, else the catalog default
    { eventType: 'licitacion_published', categoryMode: 'default', legacySuppressed: true, mode: 'off', reason: 'legacy_suppressed' },
    { eventType: 'licitacion_published', categoryMode: 'default', legacySuppressed: false, mode: 'immediate', reason: 'catalog_default' },
    // no category row: legacy, then catalog immediate / digest / off
    { eventType: 'licitacion_published', categoryMode: null, legacySuppressed: true, mode: 'off', reason: 'legacy_suppressed' },
    { eventType: 'licitacion_published', categoryMode: null, legacySuppressed: false, mode: 'immediate', reason: 'catalog_default' },
    { eventType: 'new_feedback', categoryMode: null, legacySuppressed: false, mode: 'digest', reason: 'catalog_default' },
    { eventType: 'system_update', categoryMode: null, legacySuppressed: false, mode: 'off', reason: 'catalog_default' },
    { eventType: 'system_update', categoryMode: 'default', legacySuppressed: false, mode: 'off', reason: 'catalog_default' },
  ])(
    '$eventType with category=$categoryMode legacyFalse=$legacySuppressed → $mode ($reason)',
    ({ eventType, categoryMode, legacySuppressed, mode, reason }) => {
      expect(resolveEmailPreference({ eventType, categoryMode, legacySuppressed })).toEqual({ mode, reason });
    }
  );
});

describe('resolveEmailPreference — D2 legacy rows, as the caller counts them', () => {
  it('an exact legacy false row suppresses an ordinary mapped event', () => {
    expect(resolveEmailPreference({ eventType: 'assignment_created', categoryMode: null, legacySuppressed: true })).toEqual({
      mode: 'off',
      reason: 'legacy_suppressed',
    });
  });

  it('with no counted legacy row (unrelated false row or no row) the catalog default applies', () => {
    expect(resolveEmailPreference({ eventType: 'assignment_created', categoryMode: null, legacySuppressed: false })).toEqual({
      mode: 'immediate',
      reason: 'catalog_default',
    });
  });

  it('meeting summary: any-false suppresses unless a non-default community mode overrides it; default restores it', () => {
    const meeting = (categoryMode: unknown) =>
      resolveEmailPreference({ eventType: 'meeting_finalized', categoryMode, legacySuppressed: true }).mode;
    expect(meeting(null)).toBe('off');
    expect(meeting('default')).toBe('off');
    expect(meeting('immediate')).toBe('immediate');
    expect(meeting('digest')).toBe('digest');
    expect(meeting('off')).toBe('off');
  });
});

describe('resolveEmailPreference — D4 negative cases', () => {
  it('a failed preference read suppresses a non-mandatory email, whatever the stored values say', () => {
    for (const categoryMode of [null, 'immediate', 'digest', 'default']) {
      expect(
        resolveEmailPreference({ eventType: 'licitacion_published', categoryMode, legacySuppressed: false, lookupFailed: true })
      ).toEqual({ mode: 'off', reason: 'preference_unavailable' });
    }
    expect(
      resolveEmailPreference({ eventType: 'not_a_catalog_event', categoryMode: null, legacySuppressed: false, lookupFailed: true })
    ).toEqual({ mode: 'off', reason: 'preference_unavailable' });
  });

  it('a failed preference read cannot disable the mandatory event', () => {
    expect(
      resolveEmailPreference({ eventType: 'session_cancelled', categoryMode: null, legacySuppressed: false, lookupFailed: true })
    ).toEqual({ mode: 'immediate', reason: 'mandatory' });
  });

  it('an unmapped event keeps the legacy rule and gets no catalog default or category override', () => {
    for (const eventType of ['not_a_catalog_event', null, undefined, '', 'toString', '__proto__']) {
      expect(resolveEmailPreference({ eventType, categoryMode: 'off', legacySuppressed: false })).toEqual({
        mode: 'immediate',
        reason: 'unmapped_event',
      });
      expect(resolveEmailPreference({ eventType, categoryMode: 'immediate', legacySuppressed: true })).toEqual({
        mode: 'off',
        reason: 'legacy_suppressed',
      });
    }
  });

  it.each(['weekly', 'IMMEDIATE', 'Off', ' off', '', 1, true, {}, ['immediate']])(
    'an invalid stored mode %j is ignored, so it neither opts in over a legacy false nor over a catalog off',
    (categoryMode) => {
      expect(resolveEmailPreference({ eventType: 'licitacion_published', categoryMode, legacySuppressed: true })).toEqual({
        mode: 'off',
        reason: 'legacy_suppressed',
      });
      expect(resolveEmailPreference({ eventType: 'system_update', categoryMode, legacySuppressed: false })).toEqual({
        mode: 'off',
        reason: 'catalog_default',
      });
    }
  );
});
