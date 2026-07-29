// @vitest-environment node
/**
 * Regression suite for the `calculateNoticeHours` timezone bug (Z1a / plan §10).
 *
 * `session_date` + `start_time` are Chile wall-clock. The old implementation
 * built the instant with `new Date(\`${date}T${time}\`)`, which resolves in
 * SERVER-local time — on Vercel (UTC) that shifted every session start 3–4 h
 * earlier and could flip a cancellation across the 48 h / 336 h clause
 * boundaries, i.e. charge a school for hours it cancelled in time.
 *
 * Every case below pins `cancelledAt` to an absolute UTC instant and asserts
 * the Chile-anchored result, so the expectations are identical under
 * TZ=UTC, TZ=America/Santiago and TZ=Europe/Madrid. The cases marked
 * "FAILS ON THE OLD CODE" are chosen so the naive server-local parse lands on
 * the other side of the clause boundary when the process TZ is not Chile.
 *
 * tzdata anchors verified against @date-fns/tz (IANA, never hardcoded rules):
 *   2026-03-10 09:00 Chile = 2026-03-10T12:00:00Z  (CLST, UTC-3)
 *   2026-06-10 09:00 Chile = 2026-06-10T13:00:00Z  (CLT,  UTC-4)
 *   DST fall-back between 2026-04-04 and 2026-04-05.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateNoticeHours,
  evaluateCancellationClause,
} from '../../../lib/services/hour-tracking';

const SUMMER_SESSION_DATE = '2026-03-10'; // Chile UTC-3
const WINTER_SESSION_DATE = '2026-06-10'; // Chile UTC-4
const START_TIME = '09:00:00';

describe('calculateNoticeHours — Chile wall-clock anchoring', () => {
  it('anchors the session start in America/Santiago, not the server TZ (summer, UTC-3)', () => {
    // 09:00 Chile on 2026-03-10 is 12:00Z; exactly 48 h earlier is 2026-03-08T12:00:00Z
    const hours = calculateNoticeHours(
      SUMMER_SESSION_DATE,
      START_TIME,
      new Date('2026-03-08T12:00:00.000Z')
    );
    expect(hours).toBe(48);
  });

  it('anchors the session start in America/Santiago, not the server TZ (winter, UTC-4)', () => {
    // 09:00 Chile on 2026-06-10 is 13:00Z; exactly 48 h earlier is 2026-06-08T13:00:00Z
    const hours = calculateNoticeHours(
      WINTER_SESSION_DATE,
      START_TIME,
      new Date('2026-06-08T13:00:00.000Z')
    );
    expect(hours).toBe(48);
  });

  it('returns fractional hours', () => {
    const hours = calculateNoticeHours(
      SUMMER_SESSION_DATE,
      START_TIME,
      new Date('2026-03-08T11:30:00.000Z')
    );
    expect(hours).toBe(48.5);
  });

  it('floors at 0 when the session already started', () => {
    const hours = calculateNoticeHours(
      SUMMER_SESSION_DATE,
      START_TIME,
      new Date('2026-03-11T00:00:00.000Z')
    );
    expect(hours).toBe(0);
  });

  it('accepts HH:MM as well as HH:MM:SS (cancel.ts passes "00:00")', () => {
    // 00:00 Chile on 2026-03-10 is 2026-03-10T03:00:00Z
    const hours = calculateNoticeHours(
      SUMMER_SESSION_DATE,
      '00:00',
      new Date('2026-03-10T02:00:00.000Z')
    );
    expect(hours).toBe(1);
  });

  it('measures elapsed instants across a DST transition, not wall-clock arithmetic', () => {
    // Session 2026-04-05 09:00 Chile = 13:00Z (after fall-back, UTC-4).
    // 2026-04-03 09:00 Chile = 12:00Z (still UTC-3) — the same wall-clock time
    // two days earlier is 49 real hours away, not 48.
    const hours = calculateNoticeHours(
      '2026-04-05',
      START_TIME,
      new Date('2026-04-03T12:00:00.000Z')
    );
    expect(hours).toBe(49);
  });

  it('rejects malformed date/time instead of silently producing NaN', () => {
    // Old behaviour: Invalid Date → NaN → every `noticeHours >= N` comparison
    // false → session penalised. Failing loudly is the safer contract.
    expect(() => calculateNoticeHours('10-03-2026', START_TIME)).toThrow();
    expect(() => calculateNoticeHours(SUMMER_SESSION_DATE, '9am')).toThrow();
  });
});

describe('cancellation clause boundaries — 48 h (online)', () => {
  const clauseFor = (cancelledAt: string) =>
    evaluateCancellationClause(
      'online',
      'school',
      calculateNoticeHours(SUMMER_SESSION_DATE, START_TIME, new Date(cancelledAt))
    );

  it('exactly 48 h notice → clause 1 (devuelta, consultant not paid)', () => {
    // FAILS ON THE OLD CODE under TZ=UTC: naive parse gives 09:00Z → 45 h → clause 2.
    const result = clauseFor('2026-03-08T12:00:00.000Z');
    expect(result.clause).toBe('clause_1');
    expect(result.ledger_status).toBe('devuelta');
    expect(result.consultant_paid).toBe(false);
  });

  it('1 ms under 48 h notice → clause 2 (penalizada, consultant paid)', () => {
    const result = clauseFor('2026-03-08T12:00:00.001Z');
    expect(result.clause).toBe('clause_2');
    expect(result.ledger_status).toBe('penalizada');
    expect(result.consultant_paid).toBe(true);
  });

  it('47 h 59 m notice → clause 2', () => {
    expect(clauseFor('2026-03-08T12:01:00.000Z').clause).toBe('clause_2');
  });

  it('48 h 1 m notice → clause 1', () => {
    expect(clauseFor('2026-03-08T11:59:00.000Z').clause).toBe('clause_1');
  });

  it('holds the same boundary in Chilean winter (UTC-4)', () => {
    // FAILS ON THE OLD CODE under TZ=UTC: naive parse gives 09:00Z → 44 h → clause 2.
    const result = evaluateCancellationClause(
      'online',
      'school',
      calculateNoticeHours(
        WINTER_SESSION_DATE,
        START_TIME,
        new Date('2026-06-08T13:00:00.000Z')
      )
    );
    expect(result.clause).toBe('clause_1');
  });
});

describe('cancellation clause boundaries — 336 h / 2 weeks (presencial)', () => {
  const clauseFor = (cancelledAt: string, modality: 'presencial' | 'hibrida' = 'presencial') =>
    evaluateCancellationClause(
      modality,
      'school',
      calculateNoticeHours(SUMMER_SESSION_DATE, START_TIME, new Date(cancelledAt))
    );

  // 336 h before 2026-03-10T12:00:00Z is 2026-02-24T12:00:00Z
  it('exactly 336 h notice → clause 3 (devuelta, consultant not paid)', () => {
    // FAILS ON THE OLD CODE under TZ=UTC: naive parse gives 09:00Z → 333 h → clause 4.
    const result = clauseFor('2026-02-24T12:00:00.000Z');
    expect(result.clause).toBe('clause_3');
    expect(result.ledger_status).toBe('devuelta');
    expect(result.consultant_paid).toBe(false);
  });

  it('1 ms under 336 h notice → clause 4 (penalizada, consultant paid)', () => {
    const result = clauseFor('2026-02-24T12:00:00.001Z');
    expect(result.clause).toBe('clause_4');
    expect(result.ledger_status).toBe('penalizada');
    expect(result.consultant_paid).toBe(true);
  });

  it('applies the presencial boundary to hibrida sessions too', () => {
    expect(clauseFor('2026-02-24T12:00:00.000Z', 'hibrida').clause).toBe('clause_3');
    expect(clauseFor('2026-02-24T12:00:00.001Z', 'hibrida').clause).toBe('clause_4');
  });

  it('the 48 h mark is NOT enough for a presencial session', () => {
    expect(clauseFor('2026-03-08T12:00:00.000Z').clause).toBe('clause_4');
  });
});
