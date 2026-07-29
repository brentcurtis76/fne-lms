/**
 * Shared fixture loading + scoring for the sanitizer suites.
 *
 * The same JSON files are consumed by the Node suites here and by the Python
 * NER spike (scripts/spikes/ner/), so Node-only and Node+NER recall are
 * measured on identical inputs and land in one table.
 *
 * Not a test file itself — vitest only collects *.test.ts.
 */
import mustCatchJson from './fixtures/must-catch.json';
import adversarialJson from './fixtures/adversarial.json';
import { sanitize } from '../../../lib/zoom/sanitizer';

export type FixtureCase = {
  id: string;
  description: string;
  category?: string;
  attendees: string[];
  text: string;
  mustRedact: string[];
  mustPreserve: string[];
  expectedPersonCount?: number;
};

export type FixtureSuite = {
  suite: string;
  blocking: boolean;
  description: string;
  categories?: Record<string, string>;
  cases: FixtureCase[];
};

export const mustCatchSuite = mustCatchJson as FixtureSuite;
export const adversarialSuite = adversarialJson as FixtureSuite;

export type CaseScore = {
  id: string;
  category: string;
  /** mustRedact entries that no longer appear in the sanitized text. */
  caught: string[];
  /** mustRedact entries still present — a leak. */
  missed: string[];
  /** mustPreserve entries still present, as intended. */
  preserved: string[];
  /** mustPreserve entries that were redacted anyway — over-redaction. */
  overRedacted: string[];
  sanitizedText: string;
  status: 'sanitized' | 'flagged';
  personCount: number;
};

/**
 * A mention counts as caught when its exact surface string is gone from the
 * sanitized output. Substring, not token match: if "Martina Rojas" survives in
 * any form the mention leaked.
 */
export function scoreCase(fixture: FixtureCase): CaseScore {
  const result = sanitize(fixture.text, fixture.attendees);
  const caught: string[] = [];
  const missed: string[] = [];

  for (const mention of fixture.mustRedact) {
    if (result.sanitizedText.includes(mention)) {
      missed.push(mention);
    } else {
      caught.push(mention);
    }
  }

  const preserved: string[] = [];
  const overRedacted: string[] = [];
  for (const keep of fixture.mustPreserve) {
    if (result.sanitizedText.includes(keep)) {
      preserved.push(keep);
    } else {
      overRedacted.push(keep);
    }
  }

  return {
    id: fixture.id,
    category: fixture.category ?? 'explicit-reference',
    caught,
    missed,
    preserved,
    overRedacted,
    sanitizedText: result.sanitizedText,
    status: result.status,
    personCount: result.metrics.personCount,
  };
}

export type RecallReport = {
  totalMentions: number;
  caughtMentions: number;
  recall: number;
  byCategory: Record<string, { total: number; caught: number; recall: number }>;
  missed: Array<{ id: string; category: string; mention: string }>;
  overRedacted: Array<{ id: string; mention: string }>;
};

export function scoreSuite(suite: FixtureSuite): RecallReport {
  const byCategory: RecallReport['byCategory'] = {};
  const missed: RecallReport['missed'] = [];
  const overRedacted: RecallReport['overRedacted'] = [];
  let totalMentions = 0;
  let caughtMentions = 0;

  for (const fixture of suite.cases) {
    const score = scoreCase(fixture);
    const bucket = (byCategory[score.category] ??= { total: 0, caught: 0, recall: 0 });

    totalMentions += fixture.mustRedact.length;
    caughtMentions += score.caught.length;
    bucket.total += fixture.mustRedact.length;
    bucket.caught += score.caught.length;

    for (const mention of score.missed) {
      missed.push({ id: score.id, category: score.category, mention });
    }
    for (const mention of score.overRedacted) {
      overRedacted.push({ id: score.id, mention });
    }
  }

  for (const bucket of Object.values(byCategory)) {
    bucket.recall = bucket.total === 0 ? 1 : bucket.caught / bucket.total;
  }

  return {
    totalMentions,
    caughtMentions,
    recall: totalMentions === 0 ? 1 : caughtMentions / totalMentions,
    byCategory,
    missed,
    overRedacted,
  };
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
