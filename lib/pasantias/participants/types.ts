/**
 * PASANT-PARTICIPANT-INTAKE — shared vocabulary for the participant roster
 * ("nómina") a school coordinator fills in through a private link.
 *
 * Browser-safe: no Node built-ins, no Supabase. The value sets that the table
 * CHECKs pin (funding, focus, the five dietary codes) are mirrored here exactly
 * as `docs/plan/evidence/pasant-intake/db-contract.md` §2 freezes them; the
 * date option sets are deliberately NOT in the database (FIRST-B3) and live in
 * `./dates`.
 */
import type { ProgramId } from '../cohort-public';

export type { ProgramId };

/** The only cohort the intake tables accept (`_identity_check`). */
export const INTAKE_COHORT = 'enero-2027';

/** Hard cap per roster, enforced by the participant-save RPC (`roster_full`). */
export const ROSTER_MAX_PARTICIPANTS = 60;

export const FUNDING_SOURCES = ['sep', 'colegio'] as const;
export type FundingSource = (typeof FUNDING_SOURCES)[number];

export const FUNDING_LABELS: Record<FundingSource, string> = {
  sep: 'Costo SEP',
  colegio: 'Costo Colegio',
};

/** The four existing levels (the DB-01 `focus` column CHECK). */
export const FOCUS_LEVELS = ['infantil', 'primer_ciclo', 'segundo_ciclo', 'tercer_ciclo'] as const;

/**
 * F04: every focus a coordinator can choose, in display order — the four
 * levels, then `todos` ("all four levels") last. `todos` is stored as the
 * corrections focus side table's `all_levels = true` with the DB-01 `focus`
 * column NULL (db-contract-corrections-01 §2, invariant I2). Blank
 * ("Sin indicar") stays optional and is `null`, never a code.
 */
export const FOCUS_CODES = [...FOCUS_LEVELS, 'todos'] as const;
export type FocusCode = (typeof FOCUS_CODES)[number];

export const FOCUS_LABELS: Record<FocusCode, string> = {
  infantil: 'Infantil',
  primer_ciclo: 'Primer Ciclo',
  segundo_ciclo: 'Segundo Ciclo',
  tercer_ciclo: 'Tercer Ciclo',
  todos: 'Todos',
};

/**
 * Stored order. The RPC requires the array sorted in C (code-point) order and
 * distinct; for these ASCII codes that is exactly this list and JS's default
 * `sort()`.
 */
export const DIETARY_CODES = ['otra', 'sin_gluten', 'sin_lactosa', 'vegano', 'vegetariano'] as const;
export type DietaryCode = (typeof DIETARY_CODES)[number];

/** Display order: the common options first, "Otra" (which opens a detail field) last. */
export const DIETARY_DISPLAY_ORDER: readonly DietaryCode[] = [
  'vegetariano',
  'vegano',
  'sin_gluten',
  'sin_lactosa',
  'otra',
];

export const DIETARY_LABELS: Record<DietaryCode, string> = {
  vegetariano: 'Vegetariano',
  vegano: 'Vegano',
  sin_gluten: 'Sin Gluten',
  sin_lactosa: 'Sin Lactosa',
  otra: 'Otra restricción',
};

export const VALID_DAYS_OPTIONS = [30, 60, 90, 120] as const;
export type ValidDays = (typeof VALID_DAYS_OPTIONS)[number];
export const DEFAULT_VALID_DAYS: ValidDays = 90;

export type RosterStatus = 'open' | 'submitted';

/** What the admin and coordinator screens show; "reopened" is open + an earlier send. */
export type RosterDisplayStatus = 'open' | 'submitted' | 'reopened';

export function rosterDisplayStatus(roster: {
  status: RosterStatus;
  lastSubmittedAt: string | null;
}): RosterDisplayStatus {
  if (roster.status === 'submitted') return 'submitted';
  return roster.lastSubmittedAt ? 'reopened' : 'open';
}

/** Participant data as the API returns it (camelCase, never the token hash). */
export interface IntakeParticipant {
  id: string;
  version: number;
  firstNames: string;
  lastNames: string;
  /** Stored form `12345678-5`. */
  rut: string;
  passportNumber: string | null;
  /** ISO `YYYY-MM-DD` or null ("Sin indicar"). */
  arrivalDate: string | null;
  departureDate: string | null;
  /** Effective focus: `todos` when all four levels, a level, or null ("Sin indicar"). */
  focus: FocusCode | null;
  dietaryRestrictions: DietaryCode[];
  dietaryOther: string | null;
  updatedAt: string;
}

/**
 * F01: funding is answered once per roster (one school × one program — what a
 * link reaches), never per person and never shared across programs
 * (FIRST corrections §3.0). `null` on a roster means not saved yet.
 */
export interface SchoolFunding {
  /** Pasajes. */
  flightsFunding: FundingSource;
  /** Estadía. */
  lodgingFunding: FundingSource;
  version: number;
}

/** The admin detail view adds the acknowledgement evidence. */
export interface AdminIntakeParticipant extends IntakeParticipant {
  createdAt: string;
  acknowledgedAt: string;
  noticeVersion: string;
}

/** The roster as the coordinator sees it. */
export interface CoordinatorRoster {
  schoolName: string;
  program: ProgramId;
  programName: string;
  status: RosterStatus;
  version: number;
  submittedAt: string | null;
  lastSubmittedAt: string | null;
  expiresAt: string;
  /** "Datos del colegio" — present on every roster in every response (C4). */
  schoolFunding: SchoolFunding | null;
}

/** The roster as the admin sees it. */
export interface AdminRoster extends CoordinatorRoster {
  id: string;
  cohort: string;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  participantCount: number;
}

/** The participant fields a save carries, in request (camelCase) form. No funding (F01). */
export interface ParticipantFields {
  firstNames: string;
  lastNames: string;
  rut: string;
  passportNumber: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  focus: FocusCode | null;
  dietaryRestrictions: DietaryCode[];
  dietaryOther: string | null;
}

/** Machine codes every intake endpoint may answer with. */
export type IntakeErrorCode =
  | 'LINK_UNAVAILABLE'
  | 'VALIDATION'
  | 'DUPLICATE_RUT'
  | 'ROSTER_FULL'
  | 'STALE'
  | 'NOT_FOUND'
  | 'EMPTY_ROSTER'
  | 'SCHOOL_DATA_MISSING'
  | 'PAYLOAD_TOO_LARGE'
  | 'METHOD_NOT_ALLOWED'
  | 'UNAVAILABLE'
  | 'INTERNAL';
