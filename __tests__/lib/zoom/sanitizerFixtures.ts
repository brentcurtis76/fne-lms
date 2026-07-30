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
import { sanitize, type SanitizeResult } from '../../../lib/zoom/sanitizer';

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

export type Residual = {
  mention: string;
  /** The surviving name fragment. */
  fragment: string;
  /** ~40 characters of sanitized output around it, so a failure is readable. */
  context: string;
};

export type Uncovered = {
  mention: string;
  /** Offset of the occurrence in the RAW text. */
  at: number;
  /** How much of the mention's span the sanitizer actually replaced. */
  coveredChars: number;
  mentionChars: number;
};

export type CaseScore = {
  id: string;
  category: string;
  /** mustRedact entries fully covered by a neutral token at every occurrence. */
  caught: string[];
  /** mustRedact entries that failed coverage or left a residual — a leak. */
  missed: string[];
  /** Per-occurrence coverage failures, with the shortfall. */
  uncovered: Uncovered[];
  /** Name fragments of a redacted mention still readable in the output. */
  residuals: Residual[];
  /** mustRedact entries absent from the fixture's own source text. */
  notInSource: string[];
  /** mustPreserve entries still present, as intended. */
  preserved: string[];
  /** mustPreserve entries that were redacted anyway — over-redaction. */
  overRedacted: string[];
  sanitizedText: string;
  status: 'sanitized' | 'flagged';
  personCount: number;
};

/** Merged, ascending `[start, end)` ranges the sanitizer replaced with a token. */
function redactedRanges(result: SanitizeResult): Array<[number, number]> {
  const ranges = result.detections
    .filter((d) => d.action === 'redacted')
    .map((d) => [d.start, d.end] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** How many characters of `[start, end)` fall inside a redacted range. */
function coveredChars(ranges: Array<[number, number]>, start: number, end: number): number {
  let covered = 0;
  for (const [rs, re] of ranges) {
    const lo = Math.max(rs, start);
    const hi = Math.min(re, end);
    if (hi > lo) covered += hi - lo;
  }
  return covered;
}

/** Every start offset at which `needle` occurs in `haystack`. */
function occurrences(haystack: string, needle: string): number[] {
  const found: number[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return found;
    found.push(at);
    from = at + 1;
  }
}

/**
 * Spanish connectives that appear INSIDE es-CL compound surnames — "María de los
 * Ángeles Tapia", "Sebastián de la Fuente Ossa". They carry no identity: an output
 * of `"[persona 1] de los [persona 2]"` names nobody, and demanding that the
 * particles themselves fall inside a replaced range would fail a case where every
 * name token was in fact redacted.
 *
 * This is the one place the coverage rule is deliberately not character-exact, and
 * it is narrow by construction: the list is closed, and every member is a
 * function word that cannot be a given name or surname in es-CL. "Rojas" is not on
 * it, so `"[persona 1] Rojas"` still fails.
 */
const CONNECTIVE_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'dos']);

/** `[offset, word]` for every word of a mention, offsets relative to the mention. */
function wordSpans(mention: string): Array<{ at: number; word: string }> {
  const spans: Array<{ at: number; word: string }> = [];
  const re = /[\p{L}\p{N}]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(mention)) !== null) spans.push({ at: m.index, word: m[0] });
  return spans;
}

/** The name-bearing words of a mention: everything that is not a connective. */
function nameWords(mention: string): Array<{ at: number; word: string }> {
  return wordSpans(mention).filter(({ word }) => !CONNECTIVE_PARTICLES.has(word.toLowerCase()));
}

/** Word-ish pieces of a mention, long enough to be a name rather than a particle. */
function fragmentsOf(mention: string): string[] {
  return nameWords(mention)
    .map(({ word }) => word)
    .filter((piece) => piece.length >= 3);
}

/** Matches `fragment` only as a whole word, so "Sol" does not match "Solange". */
function containsWord(text: string, fragment: string): boolean {
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(text);
}

/**
 * Scores one fixture. **This is the blocking gate's semantics, and Sol R1 finding
 * ④ is that they used to be weaker than the invariant they certified.**
 *
 * The old rule was disappearance: a mention counted as caught when its exact
 * surface string was gone from the output. That passes `"[persona 1] Rojas"` — the
 * full string "Martina Rojas" is indeed gone, and a surname is still sitting in the
 * text destined for a third-party model. A 100% score meant "no mention survives
 * verbatim", not "no student is identifiable", and the second is the actual §12
 * invariant.
 *
 * Three checks replace it, and a mention is caught only if it passes all three:
 *
 *  1. **Coverage.** Every NAME WORD of every occurrence of the mention in the RAW
 *     text must lie ENTIRELY inside the character ranges the sanitizer replaced.
 *     Computed from `detections[].start/end`, so it is exact rather than inferred
 *     from the output string. A partial redaction reports the shortfall in
 *     characters. This is what kills `"[persona 1] Rojas"`: 12 name characters in
 *     the mention, 7 of them redacted. Connective particles inside es-CL compound
 *     surnames are exempt — see `CONNECTIVE_PARTICLES` for why, and note that the
 *     exemption cannot reach a surname.
 *  2. **No forbidden residual.** No fragment of the mention (given name, surname)
 *     may survive as a standalone word anywhere in the output — not adjacent to the
 *     token, not in a later sentence. A fragment that also belongs to an attendee or
 *     to a `mustPreserve` entry is exempt, because keeping the attendee readable is
 *     the point (§12: "X plantea…"), and coverage already proves the redacted span
 *     itself was whole.
 *  3. **Present in source.** A mention that does not occur in the fixture's own
 *     text is a broken fixture, not a pass. Under disappearance scoring a typo in
 *     `mustRedact` scored as caught forever, silently retiring a case.
 *
 * `sanitizeFn` is injectable so a mutation test can drive the scorer with a
 * deliberately broken sanitizer and prove the gate rejects it.
 */
export function scoreCase(
  fixture: FixtureCase,
  sanitizeFn: (text: string, attendees: string[]) => SanitizeResult = sanitize
): CaseScore {
  const result = sanitizeFn(fixture.text, fixture.attendees);
  const ranges = redactedRanges(result);

  /** Fragments that may legitimately survive: attendee and must-preserve material. */
  const allowedFragments = new Set(
    [...fixture.attendees, ...fixture.mustPreserve].flatMap((entry) => fragmentsOf(entry))
  );

  const caught: string[] = [];
  const missed: string[] = [];
  const uncovered: Uncovered[] = [];
  const residuals: Residual[] = [];
  const notInSource: string[] = [];

  for (const mention of fixture.mustRedact) {
    const at = occurrences(fixture.text, mention);
    if (at.length === 0) {
      notInSource.push(mention);
      missed.push(mention);
      continue;
    }

    let ok = true;
    const words = nameWords(mention);
    /** Characters that must be covered: the name words, not the connectives. */
    const nameChars = words.reduce((n, w) => n + w.word.length, 0);

    for (const start of at) {
      // Every NAME word of this occurrence must be wholly inside a replaced range.
      // Particles are exempt (see CONNECTIVE_PARTICLES); a surname is not.
      const covered = words.reduce(
        (n, w) => n + coveredChars(ranges, start + w.at, start + w.at + w.word.length),
        0
      );
      if (covered < nameChars) {
        uncovered.push({ mention, at: start, coveredChars: covered, mentionChars: nameChars });
        ok = false;
      }
    }

    for (const fragment of fragmentsOf(mention)) {
      if (allowedFragments.has(fragment)) continue;
      if (!containsWord(result.sanitizedText, fragment)) continue;
      const idx = result.sanitizedText.search(
        new RegExp(
          `(?<![\\p{L}\\p{N}])${fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`,
          'u'
        )
      );
      residuals.push({
        mention,
        fragment,
        context: result.sanitizedText.slice(Math.max(0, idx - 20), idx + fragment.length + 20),
      });
      ok = false;
    }

    if (ok) caught.push(mention);
    else missed.push(mention);
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
    uncovered,
    residuals,
    notInSource,
    preserved,
    overRedacted,
    sanitizedText: result.sanitizedText,
    status: result.status,
    personCount: result.metrics.personCount,
  };
}

/**
 * The PRE-FIX scoring rule, kept solely so the mutation test can demonstrate that
 * it accepts a partial leak. Never used by a gate.
 */
export function legacyDisappearanceMissed(
  fixture: FixtureCase,
  sanitizeFn: (text: string, attendees: string[]) => SanitizeResult = sanitize
): string[] {
  const result = sanitizeFn(fixture.text, fixture.attendees);
  return fixture.mustRedact.filter((mention) => result.sanitizedText.includes(mention));
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
