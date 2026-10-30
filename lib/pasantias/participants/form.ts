/**
 * The coordinator page's draft models (browser-safe).
 *
 * A draft holds exactly what the inputs show — strings, '' for "not chosen" —
 * so nothing is ever pre-filled: dates and focus start on "Sin indicar", no
 * dietary box ticked (FIRST §5, §6). School funding (F01) has its own draft:
 * "Selecciona…" until the school saves it, then the saved answers — never a
 * guessed default.
 */
import type { ProgramId } from '../cohort-public';
import { displayRut } from './rut';
import {
  FUNDING_SOURCES,
  type DietaryCode,
  type FocusCode,
  type FundingSource,
  type IntakeParticipant,
  type ParticipantFields,
  type SchoolFunding,
} from './types';
import { MESSAGES, validateParticipantFields, type FieldErrors } from './validation';

/* ------------------------------------------------------------ participant */

export interface ParticipantDraft {
  firstNames: string;
  lastNames: string;
  rut: string;
  passportNumber: string;
  arrivalDate: string;
  departureDate: string;
  /** '' = Sin indicar; a level; or 'todos' (F04). */
  focus: '' | FocusCode;
  dietaryRestrictions: DietaryCode[];
  dietaryOther: string;
}

export function emptyDraft(): ParticipantDraft {
  return {
    firstNames: '',
    lastNames: '',
    rut: '',
    passportNumber: '',
    arrivalDate: '',
    departureDate: '',
    focus: '',
    dietaryRestrictions: [],
    dietaryOther: '',
  };
}

export function draftFromParticipant(participant: IntakeParticipant): ParticipantDraft {
  return {
    firstNames: participant.firstNames,
    lastNames: participant.lastNames,
    rut: displayRut(participant.rut),
    passportNumber: participant.passportNumber ?? '',
    arrivalDate: participant.arrivalDate ?? '',
    departureDate: participant.departureDate ?? '',
    focus: participant.focus ?? '',
    dietaryRestrictions: [...participant.dietaryRestrictions],
    dietaryOther: participant.dietaryOther ?? '',
  };
}

/** The request form of a draft: blanks become null, nothing is defaulted. */
export function draftToRequestFields(draft: ParticipantDraft): Record<string, unknown> {
  return {
    firstNames: draft.firstNames,
    lastNames: draft.lastNames,
    rut: draft.rut,
    passportNumber: draft.passportNumber.trim() === '' ? null : draft.passportNumber,
    arrivalDate: draft.arrivalDate === '' ? null : draft.arrivalDate,
    departureDate: draft.departureDate === '' ? null : draft.departureDate,
    focus: draft.focus === '' ? null : draft.focus,
    dietaryRestrictions: draft.dietaryRestrictions,
    dietaryOther: draft.dietaryRestrictions.includes('otra') ? draft.dietaryOther : null,
  };
}

export function validateDraft(
  draft: ParticipantDraft,
  programId: ProgramId
): { value: ParticipantFields | null; errors: FieldErrors } {
  return validateParticipantFields(draftToRequestFields(draft), programId);
}

function sameFields(a: ParticipantFields, b: ParticipantFields): boolean {
  return (
    a.firstNames === b.firstNames &&
    a.lastNames === b.lastNames &&
    a.rut === b.rut &&
    a.passportNumber === b.passportNumber &&
    a.arrivalDate === b.arrivalDate &&
    a.departureDate === b.departureDate &&
    a.focus === b.focus &&
    a.dietaryRestrictions.join(',') === b.dietaryRestrictions.join(',') &&
    a.dietaryOther === b.dietaryOther
  );
}

/**
 * Whether the stored row already holds what this draft would save. Decides,
 * after a replayed create or a STALE update, whether the coordinator's intent
 * is already saved or still needs to be applied (plan r2). Compares the
 * EFFECTIVE focus, so 'todos' matches a stored 'todos' (F04).
 */
export function draftMatchesParticipant(
  draft: ParticipantDraft,
  participant: IntakeParticipant,
  programId: ProgramId
): boolean {
  const { value } = validateDraft(draft, programId);
  if (!value) return false;
  return sameFields(value, {
    firstNames: participant.firstNames,
    lastNames: participant.lastNames,
    rut: participant.rut,
    passportNumber: participant.passportNumber,
    arrivalDate: participant.arrivalDate,
    departureDate: participant.departureDate,
    focus: participant.focus,
    dietaryRestrictions: participant.dietaryRestrictions,
    dietaryOther: participant.dietaryOther,
  });
}

export function draftsEqual(a: ParticipantDraft, b: ParticipantDraft): boolean {
  return (
    a.firstNames === b.firstNames &&
    a.lastNames === b.lastNames &&
    a.rut === b.rut &&
    a.passportNumber === b.passportNumber &&
    a.arrivalDate === b.arrivalDate &&
    a.departureDate === b.departureDate &&
    a.focus === b.focus &&
    a.dietaryRestrictions.join(',') === b.dietaryRestrictions.join(',') &&
    a.dietaryOther === b.dietaryOther
  );
}

/* ------------------------------------------------------- school funding (F01) */

export interface SchoolDraft {
  /** Pasajes. '' = "Selecciona…". */
  flightsFunding: '' | FundingSource;
  /** Estadía. */
  lodgingFunding: '' | FundingSource;
}

/** The saved answers, or both on "Selecciona…" when nothing is saved — never a default. */
export function schoolDraftFromFunding(funding: SchoolFunding | null): SchoolDraft {
  return funding
    ? { flightsFunding: funding.flightsFunding, lodgingFunding: funding.lodgingFunding }
    : { flightsFunding: '', lodgingFunding: '' };
}

export function schoolDraftsEqual(a: SchoolDraft, b: SchoolDraft): boolean {
  return a.flightsFunding === b.flightsFunding && a.lodgingFunding === b.lodgingFunding;
}

/** Field errors keyed `flightsFunding` / `lodgingFunding`; empty when both are chosen. */
export function validateSchoolDraft(draft: SchoolDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!(FUNDING_SOURCES as readonly string[]).includes(draft.flightsFunding)) {
    errors.flightsFunding = MESSAGES.flightsFundingRequired;
  }
  if (!(FUNDING_SOURCES as readonly string[]).includes(draft.lodgingFunding)) {
    errors.lodgingFunding = MESSAGES.lodgingFundingRequired;
  }
  return errors;
}

/** Whether the saved funding already holds exactly this draft (replay/STALE handling). */
export function schoolDraftMatchesFunding(draft: SchoolDraft, funding: SchoolFunding | null): boolean {
  return (
    funding !== null &&
    draft.flightsFunding === funding.flightsFunding &&
    draft.lodgingFunding === funding.lodgingFunding
  );
}
