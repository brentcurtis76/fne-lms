// @vitest-environment node
/**
 * PASANT-PARTICIPANT-INTAKE-CORRECTIONS — F01 school funding and F04 Todos at
 * the library boundary (FIRST corrections §4, §8; db-contract-corrections-01).
 *
 * Also the app-side static proofs the DB contract depends on (its §8.1–§8.2):
 * - A1/C2: no intake app source names the DB-01 participant save, so nothing
 *   can send per-person funding through it;
 * - A2: no intake app source writes either new table directly — they are
 *   written only by the corrections RPCs.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  schoolDraftFromFunding,
  schoolDraftMatchesFunding,
  schoolDraftsEqual,
  validateSchoolDraft,
} from '../../../../lib/pasantias/participants/form';
import { ADMIN_ROSTER_SELECT } from '../../../../lib/pasantias/participants/admin';
import {
  ADMIN_PARTICIPANT_COLUMNS,
  PARTICIPANT_COLUMNS,
  SAVE_RPC,
  FUNDING_RPC,
  saveArgs,
  schoolFundingFromEmbed,
  toAdminRoster,
  toParticipant,
  toSchoolFunding,
} from '../../../../lib/pasantias/participants/server';
import { MESSAGES, validateSchoolFundingBody } from '../../../../lib/pasantias/participants/validation';

const ROOT = join(__dirname, '..', '..', '..', '..');

describe('validateSchoolFundingBody', () => {
  it('accepts a first save (expected null) and an edit (expected the saved version)', () => {
    expect(validateSchoolFundingBody({ flightsFunding: 'sep', lodgingFunding: 'colegio', expectedFundingVersion: null })).toEqual({
      ok: true,
      value: { flightsFunding: 'sep', lodgingFunding: 'colegio', expectedFundingVersion: null },
    });
    expect(validateSchoolFundingBody({ flightsFunding: 'colegio', lodgingFunding: 'colegio', expectedFundingVersion: 3 })).toEqual({
      ok: true,
      value: { flightsFunding: 'colegio', lodgingFunding: 'colegio', expectedFundingVersion: 3 },
    });
  });

  // A4: an invalid funding version is refused (422) before any RPC call.
  it.each([
    ['missing', {}],
    ['zero', { expectedFundingVersion: 0 }],
    ['negative', { expectedFundingVersion: -1 }],
    ['fractional', { expectedFundingVersion: 1.5 }],
    ['a string', { expectedFundingVersion: '1' }],
    ['a boolean', { expectedFundingVersion: true }],
  ])('refuses an expectedFundingVersion that is %s', (_label, version) => {
    const result = validateSchoolFundingBody({ flightsFunding: 'sep', lodgingFunding: 'sep', ...version });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errors.expectedFundingVersion).toBe(MESSAGES.requestInvalid);
  });

  it.each(['rosterId', 'program', 'school', 'acknowledged', 'participantId'])(
    'a body naming %j is refused whole (unknown key)',
    (key) => {
      const result = validateSchoolFundingBody({
        flightsFunding: 'sep',
        lodgingFunding: 'sep',
        expectedFundingVersion: null,
        [key]: 'x',
      });
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.unknownKeys).toBe(true);
    }
  );

  it('refuses non-object bodies and exact-case violations', () => {
    for (const body of [null, 'x', [], 1]) expect(validateSchoolFundingBody(body).ok).toBe(false);
    const upper = validateSchoolFundingBody({ flightsFunding: 'sep', lodgingFunding: 'Colegio', expectedFundingVersion: null });
    expect(upper.ok === false && upper.errors.lodgingFunding).toBe(MESSAGES.lodgingFundingRequired);
  });
});

describe('school draft model', () => {
  it('is never pre-filled: nothing saved → both on "Selecciona…"', () => {
    expect(schoolDraftFromFunding(null)).toEqual({ flightsFunding: '', lodgingFunding: '' });
    expect(validateSchoolDraft(schoolDraftFromFunding(null))).toEqual({
      flightsFunding: MESSAGES.flightsFundingRequired,
      lodgingFunding: MESSAGES.lodgingFundingRequired,
    });
  });

  it('shows the saved answers once saved, and compares exactly', () => {
    const saved = { flightsFunding: 'sep' as const, lodgingFunding: 'colegio' as const, version: 2 };
    const draft = schoolDraftFromFunding(saved);
    expect(draft).toEqual({ flightsFunding: 'sep', lodgingFunding: 'colegio' });
    expect(validateSchoolDraft(draft)).toEqual({});
    expect(schoolDraftMatchesFunding(draft, saved)).toBe(true);
    expect(schoolDraftMatchesFunding({ ...draft, lodgingFunding: 'sep' }, saved)).toBe(false);
    expect(schoolDraftMatchesFunding(draft, null)).toBe(false);
    expect(schoolDraftsEqual(draft, { flightsFunding: 'sep', lodgingFunding: 'colegio' })).toBe(true);
  });
});

describe('server mappers', () => {
  const row = { flights_funding: 'sep', lodging_funding: 'colegio', version: 4 };

  it('maps a funding row, and refuses anything that is not exactly one', () => {
    expect(toSchoolFunding(row)).toEqual({ flightsFunding: 'sep', lodgingFunding: 'colegio', version: 4 });
    expect(toSchoolFunding(null)).toBeNull();
    expect(toSchoolFunding({ flights_funding: 'SEP', lodging_funding: 'colegio', version: 1 })).toBeNull();
  });

  it('handles the admin embed as an object, an array or null', () => {
    expect(schoolFundingFromEmbed(row)).toEqual({ flightsFunding: 'sep', lodgingFunding: 'colegio', version: 4 });
    expect(schoolFundingFromEmbed([row])).toEqual({ flightsFunding: 'sep', lodgingFunding: 'colegio', version: 4 });
    expect(schoolFundingFromEmbed([])).toBeNull();
    expect(schoolFundingFromEmbed(null)).toBeNull();
    const base = { id: 'r', program: 'inspira', participants: [{ count: 0 }] };
    expect(toAdminRoster({ ...base, school_funding: row }).schoolFunding?.version).toBe(4);
    expect(toAdminRoster({ ...base, school_funding: [row] }).schoolFunding?.version).toBe(4);
    expect(toAdminRoster({ ...base, school_funding: null }).schoolFunding).toBeNull();
  });

  it('derives the effective focus: all_levels → todos, else the DB-01 column', () => {
    const participant = { id: 'p', version: 1, focus: null };
    expect(toParticipant(participant, true).focus).toBe('todos');
    expect(toParticipant({ ...participant, focus: 'infantil' }, false).focus).toBe('infantil');
    expect(toParticipant(participant, false).focus).toBeNull();
    expect(toParticipant({ ...participant, flights_funding: 'sep' }, false)).not.toHaveProperty('flightsFunding');
  });

  it('participant column lists never select the copied funding columns (C2)', () => {
    for (const columns of [PARTICIPANT_COLUMNS, ADMIN_PARTICIPANT_COLUMNS]) {
      expect(columns).not.toMatch(/funding/);
      expect(columns).not.toMatch(/token_hash/);
    }
    expect(ADMIN_ROSTER_SELECT).toContain('school_funding:pasantias_nomina_school_funding(');
    expect(ADMIN_ROSTER_SELECT).not.toMatch(/token_hash/);
  });

  it('the participant save is the corrections RPC with exactly fourteen named arguments, no funding', () => {
    expect(SAVE_RPC).toBe('pasantias_nomina_save_participant');
    expect(FUNDING_RPC).toBe('pasantias_nomina_save_school_funding');
    const args = saveArgs(
      'h'.repeat(64),
      { kind: 'create', clientRequestId: '0f8fad5b-d9cb-469f-a165-70867728950e' },
      {
        firstNames: 'Ana',
        lastNames: 'Sintetica',
        rut: '12345678-5',
        passportNumber: null,
        arrivalDate: null,
        departureDate: null,
        focus: 'todos',
        dietaryRestrictions: [],
        dietaryOther: null,
      },
      'v'
    );
    expect(Object.keys(args).sort()).toEqual(
      [
        'p_token_hash',
        'p_participant_id',
        'p_expected_version',
        'p_client_request_id',
        'p_first_names',
        'p_last_names',
        'p_rut',
        'p_passport_number',
        'p_arrival_date',
        'p_departure_date',
        'p_focus',
        'p_dietary_restrictions',
        'p_dietary_other',
        'p_notice_version',
      ].sort()
    );
    expect(args.p_focus).toBe('todos');
  });
});

/* ------------------------------------------------------- static app scans */

const APP_ROOTS = [
  'lib/pasantias/participants',
  'pages/api/pasantias/participants',
  'pages/api/admin/pasantia-participants',
  'components/pasantias-intake',
  'pages/pasantias/nomina.tsx',
  'pages/admin/pasantia-participants.tsx',
];

function appSources(): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = [];
  const walk = (absolute: string) => {
    if (statSync(absolute).isDirectory()) {
      for (const name of readdirSync(absolute)) walk(join(absolute, name));
    } else if (/\.(ts|tsx)$/.test(absolute)) {
      out.push({ path: relative(ROOT, absolute), source: readFileSync(absolute, 'utf8') });
    }
  };
  for (const root of APP_ROOTS) walk(join(ROOT, root));
  return out;
}

describe('static scans of the intake app source', () => {
  const sources = appSources();

  it('finds the intake app files it is meant to scan', () => {
    const paths = sources.map((s) => s.path);
    for (const expected of [
      'lib/pasantias/participants/server.ts',
      'pages/api/pasantias/participants/school.ts',
      'pages/pasantias/nomina.tsx',
      'components/pasantias-intake/SchoolDataForm.tsx',
    ]) {
      expect(paths).toContain(expected);
    }
  });

  // A1 / C2: the DB-01 participant save (which would accept per-person funding)
  // has no app caller — not even a mention.
  it('no intake app source names the DB-01 participant save', () => {
    const oldSave = ['pasantias', 'intake', 'save', 'participant'].join('_');
    const offenders = sources.filter((s) => s.source.includes(oldSave)).map((s) => s.path);
    expect(offenders).toEqual([]);
  });

  // A2: the two corrections tables are written only by their RPCs.
  it('no intake app source writes either new table directly', () => {
    const tableRefs = [
      "'pasantias_nomina_school_funding'",
      "'pasantias_nomina_participant_focus'",
      'SCHOOL_FUNDING_TABLE',
      'PARTICIPANT_FOCUS_TABLE',
    ];
    const offenders: string[] = [];
    for (const { path, source } of sources) {
      for (const ref of tableRefs) {
        let index = source.indexOf(`.from(${ref})`);
        while (index !== -1) {
          const end = source.indexOf(';', index);
          const chain = source.slice(index, end === -1 ? undefined : end);
          if (/\.(insert|update|upsert|delete)\(/.test(chain)) offenders.push(`${path}: ${ref}`);
          index = source.indexOf(`.from(${ref})`, index + 1);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the new table names appear only in the server data layer and the admin select embed', () => {
    const where = sources
      .filter((s) => /pasantias_nomina_(school_funding|participant_focus)\b/.test(s.source.replace(/pasantias_nomina_save_\w+/g, '')))
      .map((s) => s.path)
      .sort();
    expect(where).toEqual(['lib/pasantias/participants/admin.ts', 'lib/pasantias/participants/server.ts']);
  });
});
