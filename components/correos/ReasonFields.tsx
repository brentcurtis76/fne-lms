import React from 'react';
import { Field, Input, Radio, Textarea } from '../ui/kit';
import { LEGAL_BASES, LEGAL_BASIS_LABELS, MAX_NOTE_LENGTH, type LegalBasis } from '../../lib/correos/reason';

export interface ReasonValue {
  /** Empty until the admin chooses: nothing is pre-chosen. */
  legal_basis: LegalBasis | '';
  basis_note: string;
  consent_notice_version: string;
}

export const EMPTY_REASON: ReasonValue = { legal_basis: '', basis_note: '', consent_notice_version: '' };

/** Whether the admin has stated the reason (the route checks again). */
export function reasonComplete(value: ReasonValue, { versionFromForm = true } = {}): boolean {
  if (!value.legal_basis || !value.basis_note.trim()) return false;
  if (value.legal_basis === 'consent_form' && versionFromForm && !value.consent_notice_version.trim()) return false;
  return true;
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
}: {
  value: ReasonValue;
  onChange: (value: ReasonValue) => void;
  idPrefix: string;
  allowed?: readonly LegalBasis[];
  versionFromForm?: boolean;
  basisHelp?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field label="¿De dónde viene el permiso para escribirles?" group required help={basisHelp}>
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
      <Field label="Nota sobre el permiso" required help="Cómo y cuándo lo dieron. Queda guardada junto a cada persona.">
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
        <Field label="Versión del aviso de privacidad que aceptaron" required>
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
