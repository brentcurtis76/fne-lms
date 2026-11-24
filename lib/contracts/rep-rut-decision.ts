/**
 * F22e: the one decision on the legal representative's RUT in the contract form.
 *
 * Whether the value may pass, and what may be written into clientes.rut_representante.
 * Pure: no React, no Supabase. The form gathers the inputs (and reads the stored value
 * afresh when `freshReadNeeded` says so) and follows the answer.
 *
 * The rules (brief F22e section 3, coordinator send-back 3):
 *  - new-client: required, valid (validateRut), not the filler. The typed value is written.
 *  - existing-client (an existing client chosen for a new contract or draft): only the
 *    filler as the STORED value, or a failed read, refuses. Empty, null, spaces or an
 *    absent value pass. This form never writes that client's representative's RUT.
 *  - edit (a contract that is not a draft): the edit rule. A changed value may not be the
 *    filler unless the stored one already is, and a changed non-empty value must be valid.
 *    The form's value is written, as before.
 *  - promote (a draft being turned into a contract): the edit rule, then the stored check
 *    of existing-client. Written: the form's own usable value; otherwise a usable fresh
 *    value; otherwise the column is left out. Never the filler, never an emptier value.
 */
import { isFillerRut, validateRut } from '../../utils/rutValidation';

export type RepRutContext = 'new-client' | 'existing-client' | 'edit' | 'promote';

/** The fresh read of the client's stored value. `answered` with `undefined` means the reply had no such column. */
export type FreshRead =
  | { state: 'not-needed' }
  | { state: 'pending' }
  | { state: 'failed' }
  | { state: 'answered'; value: string | null | undefined };

export interface RepRutInput {
  context: RepRutContext;
  /** The value in the form's field now. */
  form: string | null | undefined;
  /** The client's stored value as the form holds it (undefined: the form does not hold it). Ignored for new-client. */
  held?: string | null | undefined;
  fresh: FreshRead;
}

/**
 * missing / invalid / filler: the value in the field. client-filler: the client's stored
 * value is the filler, or it could not be read.
 */
export type RepRutRefusal = 'missing' | 'invalid' | 'filler' | 'client-filler';

export type RepRutWrite = { kind: 'value'; value: string } | { kind: 'left-out' };

export interface RepRutDecision {
  allow: boolean;
  refusal?: RepRutRefusal;
  /** What may be written into clientes.rut_representante (meaningful only when allowed). */
  write: RepRutWrite;
  /** What the form's field holds afterwards. */
  formValue: string;
}

/** A value that may stand as a representative's RUT: not blank after trim and not the filler. */
export function isUsableRepRut(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '' && !isFillerRut(value);
}

/**
 * Whether the client's stored value must be read afresh before deciding: the form holds no
 * value for it, or holds the filler (which may be stale). A non-filler held value is used as is.
 */
export function freshReadNeeded(held: string | null | undefined): boolean {
  return held === undefined || isFillerRut(held);
}

const LEFT_OUT: RepRutWrite = { kind: 'left-out' };

function refuse(refusal: RepRutRefusal, formValue: string): RepRutDecision {
  return { allow: false, refusal, write: LEFT_OUT, formValue };
}

/** The stored check: the filler as the stored value, or a failed read, refuses. Pending decides on the held value. */
function storedRefuses(held: string | null | undefined, fresh: FreshRead): boolean {
  if (fresh.state === 'failed') return true;
  const stored = fresh.state === 'answered' && fresh.value !== undefined ? fresh.value : held;
  return isFillerRut(stored);
}

/** The edit rule on the field's value against the stored value the form holds. */
function editRefusal(form: string, held: string | null | undefined): RepRutRefusal | undefined {
  const stored = held ?? '';
  if (form === stored) return undefined;
  const typed = form.trim();
  if (isFillerRut(typed)) return isFillerRut(stored) ? undefined : 'filler';
  if (typed !== '' && !validateRut(typed)) return 'invalid';
  return undefined;
}

export function decideRepRut({ context, form, held, fresh }: RepRutInput): RepRutDecision {
  const formValue = form ?? '';

  if (context === 'new-client') {
    const typed = formValue.trim();
    if (typed === '') return refuse('missing', formValue);
    if (isFillerRut(typed)) return refuse('filler', formValue);
    if (!validateRut(typed)) return refuse('invalid', formValue);
    return { allow: true, write: { kind: 'value', value: formValue }, formValue };
  }

  if (context === 'existing-client') {
    if (storedRefuses(held, fresh)) return refuse('client-filler', formValue);
    return { allow: true, write: LEFT_OUT, formValue };
  }

  const edited = editRefusal(formValue, held);
  if (edited) return refuse(edited, formValue);

  if (context === 'edit') {
    return { allow: true, write: { kind: 'value', value: formValue }, formValue };
  }

  // promote
  if (storedRefuses(held, fresh)) return refuse('client-filler', formValue);
  if (isUsableRepRut(formValue)) return { allow: true, write: { kind: 'value', value: formValue }, formValue };
  const freshValue = fresh.state === 'answered' ? fresh.value : undefined;
  if (isUsableRepRut(freshValue)) return { allow: true, write: { kind: 'value', value: freshValue }, formValue: freshValue };
  // Nothing usable: nothing is written over the stored value, and the filler is not kept in the form.
  return { allow: true, write: LEFT_OUT, formValue: isFillerRut(formValue) ? '' : formValue };
}
