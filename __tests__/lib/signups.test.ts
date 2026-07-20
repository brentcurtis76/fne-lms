// @vitest-environment node
/**
 * lib/signups — pure helpers: the fill-only-if-safe generation contract
 * (deriveGenerationOutcome) and source-membership guard.
 */
import { describe, it, expect } from 'vitest';
import {
  GENERAL_SIGNUP_SOURCE,
  GENERATION_WARNINGS,
  SIGNUP_SOURCES,
  TRACTOR_SIGNUP_SOURCE,
  deriveGenerationOutcome,
  isKnownSignupSource,
} from '../../lib/signups';

const GEN_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER_GEN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SCHOOL_ID = 55;

const validResolution = { generationId: GEN_ID, warning: null };

describe('deriveGenerationOutcome — contract table', () => {
  it('no generation on the signup → nothing to write, no warning', () => {
    expect(deriveGenerationOutcome({ generationId: null, warning: null }, null, SCHOOL_ID)).toEqual({
      writeGenerationId: null,
      generation: { applied: false, warning: null },
    });
  });

  it('stale generation (resolution failed) → warning carried through, nothing written', () => {
    const resolution = { generationId: null, warning: GENERATION_WARNINGS.stale };
    expect(deriveGenerationOutcome(resolution, null, SCHOOL_ID)).toEqual({
      writeGenerationId: null,
      generation: { applied: false, warning: GENERATION_WARNINGS.stale },
    });
  });

  it('new user → generation written, applied', () => {
    expect(deriveGenerationOutcome(validResolution, null, SCHOOL_ID)).toEqual({
      writeGenerationId: GEN_ID,
      generation: { applied: true, warning: null },
    });
  });

  it('existing profile, same school, generation empty → backfilled', () => {
    const profile = { school_id: SCHOOL_ID, generation_id: null };
    expect(deriveGenerationOutcome(validResolution, profile, SCHOOL_ID)).toEqual({
      writeGenerationId: GEN_ID,
      generation: { applied: true, warning: null },
    });
  });

  it('existing profile with school as a string id still matches', () => {
    const profile = { school_id: String(SCHOOL_ID), generation_id: null };
    expect(deriveGenerationOutcome(validResolution, profile, SCHOOL_ID)).toEqual({
      writeGenerationId: GEN_ID,
      generation: { applied: true, warning: null },
    });
  });

  it('existing profile without school (being backfilled) → generation follows', () => {
    const profile = { school_id: null, generation_id: null };
    expect(deriveGenerationOutcome(validResolution, profile, SCHOOL_ID)).toEqual({
      writeGenerationId: GEN_ID,
      generation: { applied: true, warning: null },
    });
  });

  it('existing profile already carrying the same generation → applied, nothing written', () => {
    const profile = { school_id: SCHOOL_ID, generation_id: GEN_ID };
    expect(deriveGenerationOutcome(validResolution, profile, SCHOOL_ID)).toEqual({
      writeGenerationId: null,
      generation: { applied: true, warning: null },
    });
  });

  it('existing profile with a different generation → untouched, warning', () => {
    const profile = { school_id: SCHOOL_ID, generation_id: OTHER_GEN_ID };
    expect(deriveGenerationOutcome(validResolution, profile, SCHOOL_ID)).toEqual({
      writeGenerationId: null,
      generation: { applied: false, warning: GENERATION_WARNINGS.differentGeneration },
    });
  });

  it('existing profile in another school → untouched, cross-school warning', () => {
    const profile = { school_id: 77, generation_id: null };
    expect(deriveGenerationOutcome(validResolution, profile, SCHOOL_ID)).toEqual({
      writeGenerationId: null,
      generation: { applied: false, warning: GENERATION_WARNINGS.crossSchool },
    });
  });
});

describe('isKnownSignupSource', () => {
  it('accepts every member of SIGNUP_SOURCES (membership is derived, not re-enumerated)', () => {
    for (const source of SIGNUP_SOURCES) {
      expect(isKnownSignupSource(source)).toBe(true);
    }
    expect(isKnownSignupSource(TRACTOR_SIGNUP_SOURCE)).toBe(true);
    expect(isKnownSignupSource(GENERAL_SIGNUP_SOURCE)).toBe(true);
  });

  it('rejects unknown values, null, and non-strings', () => {
    expect(isKnownSignupSource('otra_cosa')).toBe(false);
    expect(isKnownSignupSource(null)).toBe(false);
    expect(isKnownSignupSource(undefined)).toBe(false);
    expect(isKnownSignupSource(42)).toBe(false);
  });
});
