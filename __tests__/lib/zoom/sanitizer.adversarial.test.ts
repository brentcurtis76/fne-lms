/**
 * MONITORING suite — plan §12/§15/§41.
 *
 * Deliberately NOT a gate. Recall is computed and reported as a number; no
 * threshold is asserted, because this suite exists to track how the Node-only
 * layer degrades on transcription noise, not to block a build on it. The plan's
 * ≥90% Node-only figure is a target to watch, and the same fixtures are scored
 * against the optional NER layer in scripts/spikes/ner/ so both numbers come
 * from identical inputs.
 *
 * Deliberate misses live in these fixtures. A suite the sanitizer always passes
 * would measure nothing.
 */
import { describe, expect, it } from 'vitest';
import { sanitize } from '../../../lib/zoom/sanitizer';
import { adversarialSuite, formatPercent, scoreSuite } from './sanitizerFixtures';

describe('sanitizer — adversarial suite (monitoring, no threshold asserted)', () => {
  const report = scoreSuite(adversarialSuite);

  it('reports Node-only recall', () => {
    const lines = [
      '',
      '  ── Sanitizer adversarial recall (Node-only layer) ──',
      `  overall: ${formatPercent(report.recall)} (${report.caughtMentions}/${report.totalMentions} mentions)`,
      ...Object.entries(report.byCategory).map(
        ([category, bucket]) =>
          `    ${category.padEnd(24)} ${formatPercent(bucket.recall).padStart(6)} (${bucket.caught}/${bucket.total})`
      ),
      report.missed.length > 0 ? `  missed (${report.missed.length}):` : '  missed: none',
      ...report.missed.map((entry) => `    ${entry.id} [${entry.category}] "${entry.mention}"`),
      report.overRedacted.length > 0
        ? `  over-redacted (${report.overRedacted.length}):`
        : '  over-redacted: none',
      ...report.overRedacted.map((entry) => `    ${entry.id} "${entry.mention}"`),
      '',
    ];
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));

    // The only assertions here are structural: the measurement ran and produced
    // a number in range. Recall itself is reported, never gated.
    expect(report.totalMentions).toBeGreaterThan(0);
    expect(report.recall).toBeGreaterThanOrEqual(0);
    expect(report.recall).toBeLessThanOrEqual(1);
  });

  it('covers every declared adversarial category', () => {
    const declared = Object.keys(adversarialSuite.categories ?? {});
    expect(declared.length).toBeGreaterThan(0);
    for (const category of declared) {
      expect(report.byCategory[category]?.total ?? 0).toBeGreaterThan(0);
    }
  });

  it('never emits a partially redacted mention', () => {
    // Whatever recall turns out to be, a redaction that fires must replace the
    // whole span — a half-redacted name is worse than a clean miss because it
    // reads as sanitized.
    for (const fixture of adversarialSuite.cases) {
      const result = sanitize(fixture.text, fixture.attendees);
      expect(result.sanitizedText).not.toMatch(/\[persona\s*\]/);
      expect(result.sanitizedText).not.toMatch(/\[persona \d+\]\w/);
    }
  });
});
