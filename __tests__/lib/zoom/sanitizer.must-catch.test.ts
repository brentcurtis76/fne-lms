/**
 * BLOCKING suite — plan §12/§15/§41.
 *
 * Explicit student references. The bar is 100% and it is enforced the ordinary
 * way: every mention is a normal assertion, so a miss is a failing test and a
 * red build. There is no threshold to tune here — the repo's student-PII rule
 * is absolute, and a sanitizer miss is a defect to fix, never an accepted rate.
 *
 * **What the 100% now certifies (Z0B-2r1, Sol R1 finding ④).** Until this round the
 * gate scored DISAPPEARANCE: a mention counted as caught when its exact surface
 * string was gone from the output. That accepts `"[persona 1] Rojas"` — "Martina
 * Rojas" has indeed disappeared, and a surname is still in the text headed for a
 * third-party model. The gate certified less than the invariant it was there to
 * protect.
 *
 * Scoring now requires FULL COVERAGE (`scoreCase` in `sanitizerFixtures.ts`):
 * every occurrence of the mention in the raw text lies entirely inside a replaced
 * character range, no fragment of it survives as a standalone word, and the mention
 * actually occurs in the fixture's source. The mutation test at the bottom proves
 * the new rule rejects the exact output the old one accepted.
 */
import { describe, expect, it } from 'vitest';
import { sanitize, type SanitizeResult } from '../../../lib/zoom/sanitizer';
import { legacyDisappearanceMissed, mustCatchSuite, scoreCase } from './sanitizerFixtures';

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

    if (fixture.mustRedact.length > 0) {
      it('covers each reference WHOLLY with a neutral token — no partial redaction', () => {
        // Character-level: the mention's span in the raw text must be entirely
        // inside what the sanitizer replaced. This is the assertion that rejects
        // "[persona 1] Rojas".
        expect(score.uncovered).toEqual([]);
      });

      it('leaves no name fragment readable anywhere in the output', () => {
        // Adjacent to the token or three sentences later — either way it names.
        expect(score.residuals).toEqual([]);
      });

      it('references a mention that actually occurs in its own source text', () => {
        // Under disappearance scoring a typo in `mustRedact` scored as caught
        // forever, silently retiring the case it was meant to protect.
        expect(score.notInSource).toEqual([]);
      });
    }

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
    const leaks = mustCatchSuite.cases.flatMap((fixture) => {
      const score = scoreCase(fixture);
      return [
        ...score.uncovered.map(
          (u) =>
            `${fixture.id}: "${u.mention}" only ${u.coveredChars}/${u.mentionChars} chars redacted at ${u.at}`
        ),
        ...score.residuals.map((r) => `${fixture.id}: fragment "${r.fragment}" survives — …${r.context}…`),
        ...score.notInSource.map((m) => `${fixture.id}: "${m}" is not in the fixture text`),
      ];
    });
    expect(leaks).toEqual([]);
  });

  it('reports the suite size the gate actually covers', () => {
    const mentions = mustCatchSuite.cases.reduce((n, c) => n + c.mustRedact.length, 0);
    // Surfaced rather than asserted tightly, so growth is visible in CI output.
    // eslint-disable-next-line no-console
    console.log(`must-catch: ${mustCatchSuite.cases.length} cases, ${mentions} mentions, 100% required`);
    expect(mustCatchSuite.cases.length).toBeGreaterThanOrEqual(63);
  });
});

/**
 * FAIL-ON-MUTANT — the evidence that the gate's semantics changed.
 *
 * A gate is only as strong as what it rejects, so this drives the scorer with a
 * sanitizer deliberately broken in the exact way Sol described: each multi-word
 * redaction keeps its neutral token but stops one word short, emitting
 * `"[persona 1] Rojas"`. The suite must fail on that, and the pre-fix rule must be
 * shown to have accepted it — otherwise the fix is unfalsifiable.
 */
describe('must-catch gate — fail-on-mutant', () => {
  /**
   * Shrinks every multi-token redaction to its FIRST word: the token lands, the
   * surname survives beside it. Detection offsets are shrunk to match, so the
   * mutant is internally consistent and the coverage check is not being handed a
   * contradiction.
   */
  function partialRedactionMutant(text: string, attendees: string[]): SanitizeResult {
    const real = sanitize(text, attendees);

    const detections = real.detections.map((d) => {
      if (d.action !== 'redacted') return d;
      const space = d.surface.indexOf(' ');
      if (space === -1) return d;
      return { ...d, end: d.start + space, surface: d.surface.slice(0, space) };
    });

    let mutated = text;
    for (const d of [...detections].filter((x) => x.action === 'redacted').sort((a, b) => b.start - a.start)) {
      mutated = mutated.slice(0, d.start) + (d.token ?? '[persona 1]') + mutated.slice(d.end);
    }

    return { ...real, sanitizedText: mutated, detections };
  }

  /** A multi-word case, so the mutant has something to truncate. */
  const multiWordCases = mustCatchSuite.cases.filter((c) =>
    c.mustRedact.some((m) => m.trim().includes(' '))
  );

  it('the suite contains multi-word mentions for the mutant to break', () => {
    expect(multiWordCases.length).toBeGreaterThanOrEqual(15);
  });

  it('mc-01 under the mutant emits exactly the output Sol described', () => {
    const fixture = mustCatchSuite.cases.find((c) => c.id === 'mc-01');
    expect(fixture).toBeDefined();
    const mutated = partialRedactionMutant(fixture!.text, fixture!.attendees);
    // "…la estudiante [persona 1] Rojas ha mejorado…"
    expect(mutated.sanitizedText).toMatch(/\[persona \d+\] Rojas/);
    expect(mutated.sanitizedText).not.toContain('Martina Rojas');
  });

  it('the PRE-FIX rule ACCEPTS the mutant — the gap Sol found', () => {
    const fixture = mustCatchSuite.cases.find((c) => c.id === 'mc-01')!;
    // Disappearance scoring: "Martina Rojas" is gone, so zero misses. 100%.
    expect(legacyDisappearanceMissed(fixture, partialRedactionMutant)).toEqual([]);
  });

  it('the CURRENT rule REJECTS the mutant, naming the shortfall', () => {
    const fixture = mustCatchSuite.cases.find((c) => c.id === 'mc-01')!;
    const score = scoreCase(fixture, partialRedactionMutant);

    expect(score.missed).toContain('Martina Rojas');
    expect(score.uncovered).toHaveLength(1);
    expect(score.uncovered[0]).toMatchObject({
      mention: 'Martina Rojas',
      coveredChars: 'Martina'.length,
      // Name characters, so the space between the two words is not counted.
      mentionChars: 'Martina'.length + 'Rojas'.length,
    });
    expect(score.residuals.map((r) => r.fragment)).toContain('Rojas');
  });

  it('rejects the mutant across EVERY multi-word case, not just the exemplar', () => {
    const survivors = multiWordCases.filter(
      (fixture) => scoreCase(fixture, partialRedactionMutant).missed.length === 0
    );
    expect(survivors.map((c) => c.id)).toEqual([]);
  });

  it('and the aggregate suite assertion goes red under the mutant', () => {
    // Mirrors the "leaks nothing across the whole suite" assertion above, so the
    // proof is about the gate as it is actually written, not a paraphrase.
    const leaks = mustCatchSuite.cases.flatMap((fixture) => {
      const score = scoreCase(fixture, partialRedactionMutant);
      return [
        ...score.uncovered.map((u) => `${fixture.id}: ${u.mention}`),
        ...score.residuals.map((r) => `${fixture.id}: ${r.fragment}`),
      ];
    });
    expect(leaks.length).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(`fail-on-mutant: partial-redaction mutant produces ${leaks.length} blocking leak(s)`);
  });

  /**
   * The particle exemption is the one place coverage is not character-exact, so it
   * gets its own bounds. It exists because es-CL compound surnames carry connectives
   * the sanitizer legitimately leaves in place — "[persona 1] de los [persona 2]"
   * names nobody — and it must not be reachable by anything that does name someone.
   */
  describe('connective-particle exemption', () => {
    const CASE = {
      id: 'synthetic-particles',
      description: 'compound surname with connectives',
      attendees: ['Camila Fuentes'],
      text: 'El caso de María de los Ángeles Tapia se derivó a evaluación externa.',
      mustRedact: ['María de los Ángeles Tapia'],
      mustPreserve: [],
    };

    it('accepts an output where only the connectives survive', () => {
      const score = scoreCase(CASE);
      expect(score.sanitizedText).toContain('de los');
      expect(score.missed).toEqual([]);
      expect(score.uncovered).toEqual([]);
      // Every name word is gone.
      for (const word of ['María', 'Ángeles', 'Tapia']) {
        expect(score.sanitizedText).not.toContain(word);
      }
    });

    it('still rejects a surviving surname in the same construction', () => {
      // The exemption must not generalize from "de los" to "Tapia".
      const surnameLeak = (text: string, attendees: string[]): SanitizeResult => {
        const real = sanitize(text, attendees);
        const tapiaAt = text.indexOf('Tapia');
        return {
          ...real,
          // Un-redact "Tapia" only, leaving everything else as the real sanitizer had it.
          sanitizedText: real.sanitizedText.replace(/\[persona 2\]/, 'Tapia'),
          detections: real.detections.map((d) =>
            d.start === tapiaAt || (d.start < tapiaAt && d.end > tapiaAt)
              ? { ...d, start: tapiaAt, end: tapiaAt }
              : d
          ),
        };
      };
      const score = scoreCase(CASE, surnameLeak);
      expect(score.missed).toEqual(['María de los Ángeles Tapia']);
      expect(score.residuals.map((r) => r.fragment)).toContain('Tapia');
    });
  });

  it('a fixture whose mention is not in its own text also goes red', () => {
    // The second silent-pass mode: disappearance scoring counts a typo'd mention
    // as caught, permanently.
    const broken = {
      ...mustCatchSuite.cases[0],
      id: 'synthetic-typo',
      mustRedact: ['Martina Rojaas'],
    };
    expect(legacyDisappearanceMissed(broken)).toEqual([]);
    expect(scoreCase(broken).notInSource).toEqual(['Martina Rojaas']);
    expect(scoreCase(broken).missed).toEqual(['Martina Rojaas']);
  });
});
