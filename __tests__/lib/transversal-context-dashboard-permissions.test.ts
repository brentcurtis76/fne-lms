// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getTransversalContextDashboardCapabilities,
  type TransversalContextDashboardCapabilities,
  type TransversalContextDashboardCapabilitiesInput,
  type TransversalContextDashboardRoleRow,
} from '../../lib/permissions/transversal-context-dashboard';

type Flags = TransversalContextDashboardCapabilities;
type Row = TransversalContextDashboardRoleRow;

const CALLER = 'caller-0001';
const OTHER_USER = 'caller-0002';
const OWN_SCHOOL = 7;
const FOREIGN_SCHOOL = 42;
const THIRD_SCHOOL = 99;

const DENIED: Flags = {
  isAdmin: false,
  canSelectSchool: false,
  canReadSchool: false,
  canWriteSchool: false,
  canReadRestrictedContext: false,
};
const ADMIN_AT_SCHOOL: Flags = {
  isAdmin: true,
  canSelectSchool: true,
  canReadSchool: true,
  canWriteSchool: true,
  canReadRestrictedContext: true,
};
const ADMIN_NO_SCHOOL: Flags = {
  isAdmin: true,
  canSelectSchool: true,
  canReadSchool: false,
  canWriteSchool: false,
  canReadRestrictedContext: false,
};
const CONSULTOR_AT_SCHOOL: Flags = {
  isAdmin: false,
  canSelectSchool: true,
  canReadSchool: true,
  canWriteSchool: false,
  canReadRestrictedContext: false,
};
const SELECTOR_ONLY: Flags = {
  isAdmin: false,
  canSelectSchool: true,
  canReadSchool: false,
  canWriteSchool: false,
  canReadRestrictedContext: false,
};
const DIRECTIVO_AT_OWN: Flags = {
  isAdmin: false,
  canSelectSchool: false,
  canReadSchool: true,
  canWriteSchool: true,
  canReadRestrictedContext: true,
};
const MIXED_CONSULTOR_DIRECTIVO_AT_OWN: Flags = {
  isAdmin: false,
  canSelectSchool: true,
  canReadSchool: true,
  canWriteSchool: true,
  canReadRestrictedContext: true,
};

function role(roleType: string, schoolId: number | null = null, overrides: Partial<Row> = {}): Row {
  return { user_id: CALLER, role_type: roleType, school_id: schoolId, is_active: true, ...overrides };
}

function decide(
  roles: readonly Row[] | null | undefined,
  selectedSchoolId: number | null | undefined,
  extra: Partial<TransversalContextDashboardCapabilitiesInput> = {}
): Flags {
  return getTransversalContextDashboardCapabilities({ callerId: CALLER, roles, selectedSchoolId, ...extra });
}

function malformedRow(value: Record<string, unknown>): Row {
  return value as unknown as Row;
}

type Case = [label: string, roles: Row[], selectedSchoolId: number | null | undefined, expected: Flags];

describe('DCAP-01 single-role truth table', () => {
  const cases: Case[] = [
    ['admin at own school', [role('admin')], OWN_SCHOOL, ADMIN_AT_SCHOOL],
    ['admin at foreign school', [role('admin')], FOREIGN_SCHOOL, ADMIN_AT_SCHOOL],
    ['admin with school_id at another school', [role('admin', OWN_SCHOOL)], FOREIGN_SCHOOL, ADMIN_AT_SCHOOL],
    ['admin without selection (null)', [role('admin')], null, ADMIN_NO_SCHOOL],
    ['admin without selection (undefined)', [role('admin')], undefined, ADMIN_NO_SCHOOL],
    ['consultor at own school', [role('consultor', OWN_SCHOOL)], OWN_SCHOOL, CONSULTOR_AT_SCHOOL],
    ['consultor at foreign school', [role('consultor', OWN_SCHOOL)], FOREIGN_SCHOOL, CONSULTOR_AT_SCHOOL],
    ['consultor without school_id at any school', [role('consultor')], FOREIGN_SCHOOL, CONSULTOR_AT_SCHOOL],
    ['consultor without selection', [role('consultor')], null, SELECTOR_ONLY],
    ['directivo at own school', [role('equipo_directivo', OWN_SCHOOL)], OWN_SCHOOL, DIRECTIVO_AT_OWN],
    ['directivo at foreign school', [role('equipo_directivo', OWN_SCHOOL)], FOREIGN_SCHOOL, DENIED],
    ['directivo without selection', [role('equipo_directivo', OWN_SCHOOL)], null, DENIED],
    ['directivo without selection (undefined)', [role('equipo_directivo', OWN_SCHOOL)], undefined, DENIED],
  ];

  it.each(cases)('%s', (_label, roles, selectedSchoolId, expected) => {
    expect(decide(roles, selectedSchoolId)).toStrictEqual(expected);
  });

  it('returns exactly the five capability flags', () => {
    expect(Object.keys(decide([role('admin')], OWN_SCHOOL)).sort()).toEqual([
      'canReadRestrictedContext',
      'canReadSchool',
      'canSelectSchool',
      'canWriteSchool',
      'isAdmin',
    ]);
  });

  const otherKnownRoles = [
    'lider_generacion',
    'lider_comunidad',
    'supervisor_de_red',
    'community_manager',
    'docente',
    'encargado_licitacion',
  ];

  it.each(otherKnownRoles)('known role %s grants nothing at own, foreign or missing school', (roleType) => {
    const roles = [role(roleType, OWN_SCHOOL)];
    expect(decide(roles, OWN_SCHOOL)).toStrictEqual(DENIED);
    expect(decide(roles, FOREIGN_SCHOOL)).toStrictEqual(DENIED);
    expect(decide(roles, null)).toStrictEqual(DENIED);
  });

  it('all six other known roles together still grant nothing', () => {
    const roles = otherKnownRoles.map((roleType) => role(roleType, OWN_SCHOOL));
    expect(decide(roles, OWN_SCHOOL)).toStrictEqual(DENIED);
    expect(decide(roles, null)).toStrictEqual(DENIED);
  });

  it.each(['superadmin', 'Admin', 'CONSULTOR', ' equipo_directivo', 'equipo-directivo', 'asesor', ''])(
    'unknown role %j grants nothing',
    (roleType) => {
      expect(decide([role(roleType, OWN_SCHOOL)], OWN_SCHOOL)).toStrictEqual(DENIED);
      expect(decide([role(roleType, OWN_SCHOOL)], null)).toStrictEqual(DENIED);
    }
  );

  it('no roles and no caller grant nothing', () => {
    expect(decide([], OWN_SCHOOL)).toStrictEqual(DENIED);
    expect(decide([], null)).toStrictEqual(DENIED);
    expect(decide([role('admin')], OWN_SCHOOL, { callerId: null })).toStrictEqual(DENIED);
    expect(decide([role('admin')], null, { callerId: undefined })).toStrictEqual(DENIED);
  });
});

describe('DCAP-02 mixed roles', () => {
  const consultor = role('consultor');
  const directivoOwn = role('equipo_directivo', OWN_SCHOOL);
  const admin = role('admin');

  const cases: Case[] = [
    ['consultor+directivo at own school', [consultor, directivoOwn], OWN_SCHOOL, MIXED_CONSULTOR_DIRECTIVO_AT_OWN],
    ['consultor+directivo at foreign school', [consultor, directivoOwn], FOREIGN_SCHOOL, CONSULTOR_AT_SCHOOL],
    ['consultor+directivo without selection', [consultor, directivoOwn], null, SELECTOR_ONLY],
    ['directivo+consultor (reversed) at own school', [directivoOwn, consultor], OWN_SCHOOL, MIXED_CONSULTOR_DIRECTIVO_AT_OWN],
    ['directivo+consultor (reversed) at foreign school', [directivoOwn, consultor], FOREIGN_SCHOOL, CONSULTOR_AT_SCHOOL],
    ['admin+directivo at own school', [admin, directivoOwn], OWN_SCHOOL, ADMIN_AT_SCHOOL],
    ['admin+directivo at foreign school', [admin, directivoOwn], FOREIGN_SCHOOL, ADMIN_AT_SCHOOL],
    ['directivo+admin (reversed) at foreign school', [directivoOwn, admin], FOREIGN_SCHOOL, ADMIN_AT_SCHOOL],
    ['admin+directivo without selection', [admin, directivoOwn], null, ADMIN_NO_SCHOOL],
    ['admin+consultor at foreign school', [admin, consultor], FOREIGN_SCHOOL, ADMIN_AT_SCHOOL],
    ['consultor+admin (reversed) at foreign school', [consultor, admin], FOREIGN_SCHOOL, ADMIN_AT_SCHOOL],
    ['admin+consultor without selection', [admin, consultor], null, ADMIN_NO_SCHOOL],
    [
      'duplicated consultor and directivo rows at own school',
      [consultor, directivoOwn, consultor, directivoOwn],
      OWN_SCHOOL,
      MIXED_CONSULTOR_DIRECTIVO_AT_OWN,
    ],
    ['duplicated directivo rows at foreign school', [directivoOwn, directivoOwn], FOREIGN_SCHOOL, DENIED],
    ['duplicated admin rows without selection', [admin, admin], null, ADMIN_NO_SCHOOL],
  ];

  it.each(cases)('%s', (_label, roles, selectedSchoolId, expected) => {
    expect(decide(roles, selectedSchoolId)).toStrictEqual(expected);
  });

  it('counts every matching directivo row, not only the first', () => {
    const roles = [
      role('equipo_directivo', OWN_SCHOOL),
      role('equipo_directivo', FOREIGN_SCHOOL),
      role('equipo_directivo', THIRD_SCHOOL),
    ];
    expect(decide(roles, OWN_SCHOOL)).toStrictEqual(DIRECTIVO_AT_OWN);
    expect(decide(roles, FOREIGN_SCHOOL)).toStrictEqual(DIRECTIVO_AT_OWN);
    expect(decide(roles, THIRD_SCHOOL)).toStrictEqual(DIRECTIVO_AT_OWN);
    expect(decide(roles, 100)).toStrictEqual(DENIED);
    expect(decide(roles, null)).toStrictEqual(DENIED);
  });

  it('a directivo row without school_id does not hide a later matching row', () => {
    const roles = [role('equipo_directivo', null), role('equipo_directivo', FOREIGN_SCHOOL)];
    expect(decide(roles, FOREIGN_SCHOOL)).toStrictEqual(DIRECTIVO_AT_OWN);
    expect(decide(roles, OWN_SCHOOL)).toStrictEqual(DENIED);
  });

  it('pure consultor selects schools but is never admin, writer or restricted reader', () => {
    for (const selected of [OWN_SCHOOL, FOREIGN_SCHOOL, THIRD_SCHOOL]) {
      expect(decide([role('consultor', OWN_SCHOOL)], selected)).toStrictEqual(CONSULTOR_AT_SCHOOL);
    }
    const noSchool = decide([role('consultor')], null);
    expect(noSchool.canSelectSchool).toBe(true);
    expect(noSchool.isAdmin).toBe(false);
  });
});

describe('DCAP-03 fail closed on non-authoritative data', () => {
  const privilegedRows = [role('admin'), role('consultor'), role('equipo_directivo', OWN_SCHOOL)];

  it('positive controls: each privileged row grants when authoritative', () => {
    expect(decide([privilegedRows[0]], OWN_SCHOOL)).toStrictEqual(ADMIN_AT_SCHOOL);
    expect(decide([privilegedRows[1]], OWN_SCHOOL)).toStrictEqual(CONSULTOR_AT_SCHOOL);
    expect(decide([privilegedRows[2]], OWN_SCHOOL)).toStrictEqual(DIRECTIVO_AT_OWN);
    expect(decide([role('admin', null, { from_cache: false })], OWN_SCHOOL)).toStrictEqual(ADMIN_AT_SCHOOL);
    expect(decide([role('admin')], OWN_SCHOOL, { rolesError: false })).toStrictEqual(ADMIN_AT_SCHOOL);
  });

  const variants: Array<[label: string, mutate: (row: Row) => Row]> = [
    ['belongs to another user', (row) => ({ ...row, user_id: OTHER_USER })],
    ['user_id differs only by whitespace', (row) => ({ ...row, user_id: `${CALLER} ` })],
    ['user_id differs only by case', (row) => ({ ...row, user_id: CALLER.toUpperCase() })],
    ['is inactive', (row) => ({ ...row, is_active: false })],
    [
      'has no is_active marker',
      (row) => malformedRow({ user_id: row.user_id, role_type: row.role_type, school_id: row.school_id }),
    ],
    ['has a string is_active marker', (row) => malformedRow({ ...row, is_active: 'true' })],
    ['has a numeric is_active marker', (row) => malformedRow({ ...row, is_active: 1 })],
    ['is cached', (row) => ({ ...row, from_cache: true })],
    ['has a malformed from_cache marker', (row) => malformedRow({ ...row, from_cache: 'true' })],
  ];

  it.each(variants)('admin/consultor/directivo row that %s grants nothing', (_label, mutate) => {
    for (const row of privilegedRows) {
      const roles = [mutate(row)];
      expect(decide(roles, OWN_SCHOOL)).toStrictEqual(DENIED);
      expect(decide(roles, FOREIGN_SCHOOL)).toStrictEqual(DENIED);
      expect(decide(roles, null)).toStrictEqual(DENIED);
    }
  });

  it('rolesError denies all even with otherwise granting rows', () => {
    expect(decide(privilegedRows, OWN_SCHOOL, { rolesError: true })).toStrictEqual(DENIED);
    expect(decide(privilegedRows, null, { rolesError: true })).toStrictEqual(DENIED);
    const malformedError = { rolesError: 'true' as unknown as boolean };
    expect(decide(privilegedRows, OWN_SCHOOL, malformedError)).toStrictEqual(DENIED);
  });

  it('missing, null or empty roles deny all', () => {
    expect(decide(null, OWN_SCHOOL)).toStrictEqual(DENIED);
    expect(decide(undefined, OWN_SCHOOL)).toStrictEqual(DENIED);
    expect(decide([], OWN_SCHOOL)).toStrictEqual(DENIED);
    const arrayLike = { length: 1, 0: role('admin') } as unknown as Row[];
    expect(decide(arrayLike, OWN_SCHOOL)).toStrictEqual(DENIED);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['blank string', '   '],
    ['number', 1],
  ])('caller %s denies all even when rows carry that user_id', (_label, callerId) => {
    const castCaller = callerId as unknown as string;
    const roles = privilegedRows.map((row) => malformedRow({ ...row, user_id: callerId }));
    expect(decide(roles, OWN_SCHOOL, { callerId: castCaller })).toStrictEqual(DENIED);
    expect(decide(roles, null, { callerId: castCaller })).toStrictEqual(DENIED);
  });

  it('missing or non-object input denies all', () => {
    const call = getTransversalContextDashboardCapabilities as (input: unknown) => Flags;
    expect(call(null)).toStrictEqual(DENIED);
    expect(call(undefined)).toStrictEqual(DENIED);
    expect(call('admin')).toStrictEqual(DENIED);
  });

  it('invalid privileged rows mixed with a valid unrelated row do not bypass filtering', () => {
    const invalidPrivileged = [
      role('admin', null, { user_id: OTHER_USER }),
      role('consultor', null, { from_cache: true }),
      role('equipo_directivo', OWN_SCHOOL, { is_active: false }),
      malformedRow({ user_id: CALLER, role_type: 'admin', school_id: null }),
    ];
    const validUnrelated = role('docente', OWN_SCHOOL);
    expect(decide([...invalidPrivileged, validUnrelated], OWN_SCHOOL)).toStrictEqual(DENIED);
    expect(decide([validUnrelated, ...invalidPrivileged], null)).toStrictEqual(DENIED);

    const validForeignDirectivo = role('equipo_directivo', FOREIGN_SCHOOL);
    expect(decide([...invalidPrivileged, validForeignDirectivo], OWN_SCHOOL)).toStrictEqual(DENIED);
    expect(decide([...invalidPrivileged, validForeignDirectivo], FOREIGN_SCHOOL)).toStrictEqual(DIRECTIVO_AT_OWN);
  });

  it('another user admin row does not elevate the caller directivo or consultor row', () => {
    const roles = [
      role('admin', null, { user_id: OTHER_USER }),
      role('equipo_directivo', OWN_SCHOOL),
      role('consultor', null, { is_active: false }),
    ];
    expect(decide(roles, OWN_SCHOOL)).toStrictEqual(DIRECTIVO_AT_OWN);
    expect(decide(roles, FOREIGN_SCHOOL)).toStrictEqual(DENIED);
    expect(decide(roles, null)).toStrictEqual(DENIED);
  });

  it('junk role entries grant nothing and do not break valid rows', () => {
    const junk = [null, undefined, 'admin', 7, [CALLER, 'admin']] as unknown as Row[];
    expect(decide(junk, OWN_SCHOOL)).toStrictEqual(DENIED);
    expect(decide([...junk, role('consultor')], OWN_SCHOOL)).toStrictEqual(CONSULTOR_AT_SCHOOL);
  });
});

describe('DCAP-04 school id validation and purity', () => {
  const invalidSelections: Array<[label: string, value: unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['zero', 0],
    ['negative zero', -0],
    ['negative integer', -OWN_SCHOOL],
    ['fraction', 7.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
    ['numeric string', '7'],
    ['padded numeric string', ' 7 '],
    ['empty string', ''],
    ['boolean', true],
    ['array', [OWN_SCHOOL]],
    ['object', { id: OWN_SCHOOL }],
  ];

  it.each(invalidSelections)('invalid selected school %s: school flags false, role flags kept', (_label, value) => {
    const selected = value as number;
    expect(decide([role('admin')], selected)).toStrictEqual(ADMIN_NO_SCHOOL);
    expect(decide([role('consultor')], selected)).toStrictEqual(SELECTOR_ONLY);
    expect(decide([role('equipo_directivo', OWN_SCHOOL)], selected)).toStrictEqual(DENIED);
    expect(decide([role('consultor'), role('equipo_directivo', OWN_SCHOOL)], selected)).toStrictEqual(SELECTOR_ONLY);
    expect(decide([role('admin'), role('equipo_directivo', OWN_SCHOOL)], selected)).toStrictEqual(ADMIN_NO_SCHOOL);
  });

  const invalidDirectivoIds: Array<[label: string, rowSchoolId: unknown, selected: unknown]> = [
    ['string row id vs numeric selection', '7', OWN_SCHOOL],
    ['null row id', null, OWN_SCHOOL],
    ['NaN row id', Number.NaN, OWN_SCHOOL],
    ['fraction row id vs its floor', 7.5, OWN_SCHOOL],
    ['zero on both sides', 0, 0],
    ['negative on both sides', -OWN_SCHOOL, -OWN_SCHOOL],
    ['fraction on both sides', 7.5, 7.5],
    ['unsafe integer on both sides', Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1],
    ['Infinity on both sides', Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    ['string on both sides', '7', '7'],
  ];

  it.each(invalidDirectivoIds)('directivo with %s cannot match or authorize', (_label, rowSchoolId, selected) => {
    const directivo = malformedRow({ ...role('equipo_directivo'), school_id: rowSchoolId });
    const selectedSchoolId = selected as number;
    expect(decide([directivo], selectedSchoolId)).toStrictEqual(DENIED);
  });

  it('invalid directivo id alongside consultor keeps read-only consultor access', () => {
    const directivo = malformedRow({ ...role('equipo_directivo'), school_id: '7' });
    expect(decide([role('consultor'), directivo], OWN_SCHOOL)).toStrictEqual(CONSULTOR_AT_SCHOOL);
  });

  it.each([
    ['minimum id', 1],
    ['maximum safe integer id', Number.MAX_SAFE_INTEGER],
  ])('valid boundary %s is accepted', (_label, schoolId) => {
    expect(decide([role('equipo_directivo', schoolId)], schoolId)).toStrictEqual(DIRECTIVO_AT_OWN);
    expect(decide([role('admin')], schoolId)).toStrictEqual(ADMIN_AT_SCHOOL);
    expect(decide([role('consultor')], schoolId)).toStrictEqual(CONSULTOR_AT_SCHOOL);
  });

  it('adjacent school ids do not match', () => {
    expect(decide([role('equipo_directivo', 1)], 2)).toStrictEqual(DENIED);
    expect(decide([role('equipo_directivo', Number.MAX_SAFE_INTEGER - 1)], Number.MAX_SAFE_INTEGER)).toStrictEqual(
      DENIED
    );
  });

  it('frozen inputs are not mutated and repeated calls do not keep stale decisions', () => {
    const roles = Object.freeze([
      Object.freeze(role('consultor')),
      Object.freeze(role('equipo_directivo', OWN_SCHOOL)),
    ]);
    const call = (selectedSchoolId: number | null) =>
      getTransversalContextDashboardCapabilities(Object.freeze({ callerId: CALLER, roles, selectedSchoolId }));

    expect(call(OWN_SCHOOL)).toStrictEqual(MIXED_CONSULTOR_DIRECTIVO_AT_OWN);
    expect(call(FOREIGN_SCHOOL)).toStrictEqual(CONSULTOR_AT_SCHOOL);
    expect(call(null)).toStrictEqual(SELECTOR_ONLY);
    expect(call(OWN_SCHOOL)).toStrictEqual(MIXED_CONSULTOR_DIRECTIVO_AT_OWN);
    expect(roles).toStrictEqual([role('consultor'), role('equipo_directivo', OWN_SCHOOL)]);

    const directivoOnly = [role('equipo_directivo', OWN_SCHOOL)];
    expect(decide(directivoOnly, OWN_SCHOOL)).toStrictEqual(DIRECTIVO_AT_OWN);
    expect(decide(directivoOnly, FOREIGN_SCHOOL)).toStrictEqual(DENIED);
    expect(decide(directivoOnly, null)).toStrictEqual(DENIED);
    expect(decide(directivoOnly, OWN_SCHOOL)).toStrictEqual(DIRECTIVO_AT_OWN);
  });

  it('does not mutate unfrozen inputs', () => {
    const input: TransversalContextDashboardCapabilitiesInput = {
      callerId: CALLER,
      roles: [role('admin'), role('equipo_directivo', OWN_SCHOOL, { from_cache: false })],
      selectedSchoolId: OWN_SCHOOL,
      rolesError: false,
    };
    const snapshot = structuredClone(input);
    getTransversalContextDashboardCapabilities(input);
    expect(input).toStrictEqual(snapshot);
  });

  it('mutating a returned result cannot contaminate later decisions', () => {
    const allTrue = { ...ADMIN_AT_SCHOOL };
    const allFalse = { ...DENIED };

    const denied = decide([role('equipo_directivo', OWN_SCHOOL)], FOREIGN_SCHOOL);
    expect(denied).toStrictEqual(DENIED);
    Object.assign(denied, allTrue);
    expect(decide([role('equipo_directivo', OWN_SCHOOL)], FOREIGN_SCHOOL)).toStrictEqual(DENIED);

    const earlyDenied = decide([role('admin')], OWN_SCHOOL, { callerId: null });
    Object.assign(earlyDenied, allTrue);
    expect(decide([role('admin')], OWN_SCHOOL, { rolesError: true })).toStrictEqual(DENIED);
    expect(decide([], null)).toStrictEqual(DENIED);

    const granted = decide([role('admin')], OWN_SCHOOL);
    Object.assign(granted, allFalse);
    expect(decide([role('admin')], OWN_SCHOOL)).toStrictEqual(ADMIN_AT_SCHOOL);
    expect(decide([role('admin')], OWN_SCHOOL)).not.toBe(decide([role('admin')], OWN_SCHOOL));
  });
});

describe('DCAP-05 dormant module surface', () => {
  it('exposes only the capability function at runtime', async () => {
    const mod = await import('../../lib/permissions/transversal-context-dashboard');
    expect(Object.keys(mod)).toEqual(['getTransversalContextDashboardCapabilities']);
  });

  it('module source has no imports or ambient runtime dependencies', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/permissions/transversal-context-dashboard.ts'), 'utf8');
    const forbidden = [
      /^\s*import\s/m,
      /\brequire\(/,
      /\bfetch\(/,
      /\bprocess\./,
      /\bglobalThis\b/,
      /\bwindow\b/,
      /\bdocument\b/,
      /\blocalStorage\b/,
      /\bDate\b/,
      /Math\.random/,
      /\bexport\s+default\b/,
    ];
    for (const pattern of forbidden) {
      expect(source).not.toMatch(pattern);
    }
  });
});
