// @vitest-environment node
/**
 * Browser helpers: the fragment token reader, the idempotency key with its
 * old-browser fallback (FIRST N6), and the draft model that keeps the form
 * from ever pre-filling an answer.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newClientRequestId, readTokenFromHash } from '../../../../lib/pasantias/participants/client';
import {
  draftFromParticipant,
  draftMatchesParticipant,
  draftToRequestFields,
  draftsEqual,
  emptyDraft,
} from '../../../../lib/pasantias/participants/form';
import type { IntakeParticipant } from '../../../../lib/pasantias/participants/types';

const TOKEN = 'b'.repeat(40) + '_-9';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readTokenFromHash', () => {
  it('reads k from the fragment', () => {
    expect(readTokenFromHash(`#k=${TOKEN}`)).toBe(TOKEN);
    expect(readTokenFromHash(`#x=1&k=${TOKEN}`)).toBe(TOKEN);
  });

  it.each(['', '#', '#k=', '#k=short', `#k=${TOKEN}A`, `#token=${TOKEN}`])('returns null for %j', (hash) => {
    expect(readTokenFromHash(hash)).toBeNull();
  });
});

describe('newClientRequestId', () => {
  it('is a v4 UUID', () => {
    expect(newClientRequestId()).toMatch(UUID_V4);
  });

  it('falls back to getRandomValues when randomUUID is missing', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      },
    });
    expect(newClientRequestId()).toMatch(UUID_V4);
  });

  it('still answers a v4-shaped id with no Web Crypto at all', () => {
    vi.stubGlobal('crypto', undefined);
    expect(newClientRequestId()).toMatch(UUID_V4);
  });
});

const STORED: IntakeParticipant = {
  id: '11111111-2222-4333-8444-555555555555',
  version: 2,
  firstNames: 'Ana',
  lastNames: 'Sintética',
  rut: '12345678-5',
  passportNumber: null,
  flightsFunding: 'sep',
  lodgingFunding: 'colegio',
  arrivalDate: '2027-01-17',
  departureDate: null,
  focus: 'infantil',
  dietaryRestrictions: ['otra', 'vegano'],
  dietaryOther: 'Sin frutos secos',
  updatedAt: '2026-10-27T12:00:00Z',
};

describe('draft model', () => {
  it('starts empty: no funding, no date, no focus, nothing ticked', () => {
    expect(emptyDraft()).toEqual({
      firstNames: '',
      lastNames: '',
      rut: '',
      passportNumber: '',
      flightsFunding: '',
      lodgingFunding: '',
      arrivalDate: '',
      departureDate: '',
      focus: '',
      dietaryRestrictions: [],
      dietaryOther: '',
    });
  });

  it('sends blanks as null and never sends a detail without "Otra"', () => {
    const body = draftToRequestFields({ ...emptyDraft(), dietaryOther: 'oculto' });
    expect(body).toMatchObject({
      passportNumber: null,
      flightsFunding: null,
      lodgingFunding: null,
      arrivalDate: null,
      departureDate: null,
      focus: null,
      dietaryRestrictions: [],
      dietaryOther: null,
    });
  });

  it('recognises a stored row that already holds the draft, and one that does not', () => {
    const draft = draftFromParticipant(STORED);
    expect(draft.rut).toBe('12.345.678-5');
    expect(draftMatchesParticipant(draft, STORED, 'inspira')).toBe(true);
    expect(draftMatchesParticipant({ ...draft, lastNames: 'Otra' }, STORED, 'inspira')).toBe(false);
    expect(draftsEqual(draft, draftFromParticipant(STORED))).toBe(true);
  });
});
