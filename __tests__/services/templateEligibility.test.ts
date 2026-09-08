// @vitest-environment node
/**
 * PROC-CONTAIN-01 (A-01) — single template eligibility policy for every
 * automatic assessment-assignment path.
 */
import { describe, it, expect } from 'vitest';
import {
  ELIGIBLE_TEMPLATE_STATUS,
  applyEligibleTemplateFilter,
  classifyTemplate,
  isEligibleTemplate,
  selectCurrentSnapshot,
} from '../../lib/services/assessment-builder/templateEligibility';

const SNAP_OLD = { id: 'snap-old', version: '1.0', created_at: '2026-01-01T00:00:00Z' };
const SNAP_NEW = { id: 'snap-new', version: '1.1', created_at: '2026-03-01T00:00:00Z' };

describe('templateEligibility', () => {
  it('pins the eligible status to published', () => {
    expect(ELIGIBLE_TEMPLATE_STATUS).toBe('published');
  });

  describe('isEligibleTemplate', () => {
    it('accepts a published template with is_archived = false', () => {
      expect(isEligibleTemplate({ status: 'published', is_archived: false })).toBe(true);
    });

    it('rejects an archived template even though archiving keeps status = published', () => {
      expect(isEligibleTemplate({ status: 'published', is_archived: true })).toBe(false);
    });

    it('rejects draft and archived statuses', () => {
      expect(isEligibleTemplate({ status: 'draft', is_archived: false })).toBe(false);
      expect(isEligibleTemplate({ status: 'archived', is_archived: false })).toBe(false);
    });

    it('fails closed when is_archived is missing or null', () => {
      expect(isEligibleTemplate({ status: 'published' })).toBe(false);
      expect(isEligibleTemplate({ status: 'published', is_archived: null })).toBe(false);
    });
  });

  describe('applyEligibleTemplateFilter', () => {
    it('applies status = published AND is_archived = false to the query builder', () => {
      const calls: Array<[string, unknown]> = [];
      const builder = {
        eq(column: string, value: unknown) {
          calls.push([column, value]);
          return builder;
        },
      };

      const returned = applyEligibleTemplateFilter(builder);

      expect(returned).toBe(builder);
      expect(calls).toEqual([
        ['status', 'published'],
        ['is_archived', false],
      ]);
    });
  });

  describe('selectCurrentSnapshot', () => {
    it('returns null for no snapshots', () => {
      expect(selectCurrentSnapshot(undefined)).toBeNull();
      expect(selectCurrentSnapshot(null)).toBeNull();
      expect(selectCurrentSnapshot([])).toBeNull();
    });

    it('picks the most recently created snapshot regardless of array order', () => {
      expect(selectCurrentSnapshot([SNAP_OLD, SNAP_NEW])?.id).toBe('snap-new');
      expect(selectCurrentSnapshot([SNAP_NEW, SNAP_OLD])?.id).toBe('snap-new');
    });

    it('keeps the earlier array position on ties and ranks missing dates lowest', () => {
      const tieA = { id: 'a', created_at: '2026-02-01T00:00:00Z' };
      const tieB = { id: 'b', created_at: '2026-02-01T00:00:00Z' };
      expect(selectCurrentSnapshot([tieA, tieB])?.id).toBe('a');
      expect(selectCurrentSnapshot([{ id: 'undated' }, SNAP_OLD])?.id).toBe('snap-old');
    });
  });

  describe('classifyTemplate', () => {
    it('classifies an archived template as ineligible/archived even when it has snapshots', () => {
      const result = classifyTemplate({
        id: 't', name: 'QA Test Template', status: 'published', is_archived: true,
        assessment_template_snapshots: [SNAP_NEW],
      });
      expect(result).toEqual({ kind: 'ineligible', reason: 'archived' });
    });

    it('classifies a draft template as ineligible/not_published', () => {
      const result = classifyTemplate({
        id: 't', name: 'Borrador', status: 'draft', is_archived: false,
        assessment_template_snapshots: [SNAP_NEW],
      });
      expect(result).toEqual({ kind: 'ineligible', reason: 'not_published' });
    });

    it('classifies a published, active template without snapshots as misconfigured/snapshot_missing', () => {
      const result = classifyTemplate({
        id: 't', name: 'Sin snapshot', status: 'published', is_archived: false,
        assessment_template_snapshots: [],
      });
      expect(result).toEqual({ kind: 'misconfigured', reason: 'snapshot_missing' });
    });

    it('returns the current snapshot for an eligible template', () => {
      const result = classifyTemplate({
        id: 't', name: 'Vigente', status: 'published', is_archived: false,
        assessment_template_snapshots: [SNAP_OLD, SNAP_NEW],
      });
      expect(result).toEqual({ kind: 'eligible', snapshot: SNAP_NEW });
    });
  });
});
