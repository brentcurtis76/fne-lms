import React from 'react';
import { Field, Input, Radio, Textarea } from '../ui/kit';
import { LEGAL_BASES, LEGAL_BASIS_LABELS, MAX_NOTE_LENGTH, REASON_MESSAGES, type LegalBasis } from '../../lib/correos/reason';

export interface ReasonValue {
  /** Empty until the admin chooses: nothing is pre-chosen. */
  legal_basis: LegalBasis | '';
  basis_note: string;
  consent_notice_version: string;
}

export const EMPTY_REASON: ReasonValue = { legal_basis: '', basis_note: '', consent_notice_version: '' };

/** What is missing from the reason, field by field, in the words the route uses. Empty: nothing is missing. */
export interface ReasonProblems {
  basis?: string;
  note?: string;
  version?: string;
}

export function reasonProblems(value: ReasonValue, { versionFromForm = true } = {}): ReasonProblems {
  const problems: ReasonProblems = {};
  if (!value.legal_basis) problems.basis = REASON_MESSAGES.basis;
  if (!value.basis_note.trim()) problems.note = REASON_MESSAGES.note;
  if (value.legal_basis === 'consent_form' && versionFromForm && !value.consent_notice_version.trim()) {
    problems.version = REASON_MESSAGES.version;
  }
  return problems;
}

/** Every missing part of the reason in one message, in the order of the fields; null when nothing is missing. */
export function reasonMessage(value: ReasonValue, options: { versionFromForm?: boolean } = {}): string | null {
  const problems = reasonProblems(value, options);
  const parts = [problems.basis, problems.note, problems.version].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

/** The id of the first control of the reason that needs the admin, to move the focus there. */
export function firstReasonControl(value: ReasonValue, idPrefix: string, options: { versionFromForm?: boolean; allowed?: readonly LegalBasis[] } = {}): string | null {
  const problems = reasonProblems(value, options);
  if (problems.basis) return `${idPrefix}-motivo-${(options.allowed ?? LEGAL_BASES)[0]}`;
  if (problems.note) return `${idPrefix}-nota`;
  if (problems.version) return `${idPrefix}-version`;
  return null;
}

/** Whether the admin has stated the reason (the route checks again). */
export function reasonComplete(value: ReasonValue, options: { versionFromForm?: boolean } = {}): boolean {
  return reasonMessage(value, options) === null;
}

/** Moves the focus to a control by id and brings it into view (after the error has been drawn). */
export function focusControl(id: string | null) {
  if (!id || typeof document === 'undefined') return;
  window.setTimeout(() => {
    const element = document.getElementById(id);
    if (!element) return;
    if (typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'center' });
    element.focus({ preventScroll: true });
  }, 0);
}

/**
 * «¿De dónde viene el permiso?»: the legal basis (no option chosen at first), the note, and, for a consent form,
 * the notice version. `allowed` narrows the bases; `versionFromForm={false}` when each row carries its own version.
 */
export function ReasonFields({
  value,
  onChange,
  idPrefix,
  allowed = LEGAL_BASES,
  versionFromForm = true,
  basisHelp,
  showErrors = false,
}: {
  value: ReasonValue;
  onChange: (value: ReasonValue) => void;
  idPrefix: string;
  allowed?: readonly LegalBasis[];
  versionFromForm?: boolean;
  basisHelp?: React.ReactNode;
  /** After a refused attempt: each missing part says so next to its field. */
  showErrors?: boolean;
}) {
  const problems = showErrors ? reasonProblems(value, { versionFromForm }) : {};
  return (
    <div className="flex flex-col gap-4">
      <Field label="¿De dónde viene el permiso para escribirles?" group required help={basisHelp} error={problems.basis}>
        {allowed.map((basis) => (
          <Radio
            key={basis}
            id={`${idPrefix}-motivo-${basis}`}
            name={`${idPrefix}-motivo`}
            value={basis}
            label={LEGAL_BASIS_LABELS[basis]}
            checked={value.legal_basis === basis}
            onChange={() => onChange({ ...value, legal_basis: basis })}
            data-testid={`${idPrefix}-motivo-${basis}`}
          />
        ))}
      </Field>
      <Field label="Nota sobre el permiso" required help="Cómo y cuándo lo dieron. Queda guardada junto a cada persona." error={problems.note}>
        <Textarea
          id={`${idPrefix}-nota`}
          rows={3}
          maxLength={MAX_NOTE_LENGTH}
          value={value.basis_note}
          onChange={(event) => onChange({ ...value, basis_note: event.currentTarget.value })}
          data-testid={`${idPrefix}-nota`}
        />
      </Field>
      {value.legal_basis === 'consent_form' && versionFromForm ? (
        <Field label="Versión del aviso de privacidad que aceptaron" required error={problems.version}>
          <Input
            id={`${idPrefix}-version`}
            maxLength={100}
            value={value.consent_notice_version}
            onChange={(event) => onChange({ ...value, consent_notice_version: event.currentTarget.value })}
            data-testid={`${idPrefix}-version`}
          />
        </Field>
      ) : null}
    </div>
  );
}

/** The reason as the routes read it. */
export function reasonBody(value: ReasonValue) {
  return {
    legal_basis: value.legal_basis,
    basis_note: value.basis_note,
    consent_notice_version: value.consent_notice_version || null,
  };
}
