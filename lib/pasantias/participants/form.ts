/**
 * The coordinator form's draft model (browser-safe).
 *
 * A draft holds exactly what the inputs show — strings, '' for "not chosen" —
 * so nothing is ever pre-filled: funding starts on "Selecciona…", dates and
 * focus on "Sin indicar", no dietary box ticked (FIRST §5, §6).
 */
import type { ProgramId } from '../cohort-public';
import { displayRut } from './rut';
import type {
  DietaryCode,
  FocusCode,
  FundingSource,
  IntakeParticipant,
  ParticipantFields,
} from './types';
import { validateParticipantFields, type FieldErrors } from './validation';

export interface ParticipantDraft {
  firstNames: string;
  lastNames: string;
  rut: string;
  passportNumber: string;
  flightsFunding: '' | FundingSource;
  lodgingFunding: '' | FundingSource;
  arrivalDate: string;
  departureDate: string;
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
    flightsFunding: '',
    lodgingFunding: '',
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
    flightsFunding: participant.flightsFunding,
    lodgingFunding: participant.lodgingFunding,
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
    flightsFunding: draft.flightsFunding === '' ? null : draft.flightsFunding,
    lodgingFunding: draft.lodgingFunding === '' ? null : draft.lodgingFunding,
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
    a.flightsFunding === b.flightsFunding &&
    a.lodgingFunding === b.lodgingFunding &&
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
 * is already saved or still needs to be applied (plan r2).
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
    flightsFunding: participant.flightsFunding,
    lodgingFunding: participant.lodgingFunding,
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
    a.flightsFunding === b.flightsFunding &&
    a.lodgingFunding === b.lodgingFunding &&
    a.arrivalDate === b.arrivalDate &&
    a.departureDate === b.departureDate &&
    a.focus === b.focus &&
    a.dietaryRestrictions.join(',') === b.dietaryRestrictions.join(',') &&
    a.dietaryOther === b.dietaryOther
  );
}
