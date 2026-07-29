/**
 * Precision guard.
 *
 * Recall is only half the contract. A sanitizer that redacts aggressively hits
 * 100% recall trivially and produces a minuta nobody can read, so this suite
 * runs realistic name-free session speech through the sanitizer and asserts
 * nothing is touched.
 *
 * This is what stops the tempting "fix" for the sentence-initial misses in the
 * adversarial suite: redacting every unrecognized capitalized sentence opener
 * would raise adversarial recall and wreck these paragraphs. The measured cost
 * of that variant is recorded in docs/planning/zoom-spike-results.md §3.
 */
import { describe, expect, it } from 'vitest';
import { sanitize } from '../../../lib/zoom/sanitizer';
import precision from './fixtures/precision.json';

const suite = precision as {
  attendees: string[];
  paragraphs: string[];
};

describe('sanitizer — precision on name-free session speech', () => {
  it('has a corpus to measure against', () => {
    expect(suite.paragraphs.length).toBeGreaterThan(10);
  });

  it.each(suite.paragraphs.map((text, index) => [index, text] as const))(
    'leaves paragraph %i untouched',
    (_index, text) => {
      expect(sanitize(text, suite.attendees).sanitizedText).toBe(text);
    }
  );

  it('produces zero redactions across the whole corpus', () => {
    const joined = suite.paragraphs.join('\n\n');
    const result = sanitize(joined, suite.attendees);

    expect(result.metrics.redactionCount).toBe(0);
    expect(result.metrics.personCount).toBe(0);
    expect(result.sanitizedText).toBe(joined);
  });

  it('does not flag ordinary consulting speech', () => {
    const result = sanitize(suite.paragraphs.join('\n\n'), suite.attendees);
    expect(result.status).toBe('sanitized');
  });
});
