/**
 * BLOCKING suite — plan §12/§15/§41.
 *
 * Explicit student references. The bar is 100% and it is enforced the ordinary
 * way: every mention is a normal assertion, so a miss is a failing test and a
 * red build. There is no threshold to tune here — the repo's student-PII rule
 * is absolute, and a sanitizer miss is a defect to fix, never an accepted rate.
 */
import { describe, expect, it } from 'vitest';
import { mustCatchSuite, scoreCase } from './sanitizerFixtures';

describe('sanitizer — must-catch suite (blocking, 100% required)', () => {
  it('has fixtures to run', () => {
    expect(mustCatchSuite.cases.length).toBeGreaterThan(0);
    expect(mustCatchSuite.blocking).toBe(true);
  });

  describe.each(mustCatchSuite.cases.map((c) => [c.id, c] as const))('%s', (_id, fixture) => {
    const score = scoreCase(fixture);

    it(`redacts every student reference (${fixture.description})`, () => {
      expect(score.missed).toEqual([]);
    });

    if (fixture.mustPreserve.length > 0) {
      it('preserves attendee and institution names', () => {
        expect(score.overRedacted).toEqual([]);
      });
    }

    it('emits a neutral token for each redaction', () => {
      if (fixture.mustRedact.length > 0) {
        expect(score.sanitizedText).toMatch(/\[persona \d+\]/);
      }
    });

    if (typeof fixture.expectedPersonCount === 'number') {
      it('assigns one stable number per person', () => {
        expect(score.personCount).toBe(fixture.expectedPersonCount);
      });
    }
  });

  it('leaks nothing across the whole suite', () => {
    const leaks = mustCatchSuite.cases.flatMap((fixture) =>
      scoreCase(fixture).missed.map((mention) => `${fixture.id}: ${mention}`)
    );
    expect(leaks).toEqual([]);
  });
});
