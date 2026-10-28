import React from 'react';
import type { ProgramId } from '../../lib/pasantias/cohort-public';
import { storedDateLabel } from '../../lib/pasantias/participants/dates';
import { displayRut } from '../../lib/pasantias/participants/rut';
import {
  DIETARY_LABELS,
  FOCUS_LABELS,
  FUNDING_LABELS,
  type IntakeParticipant,
} from '../../lib/pasantias/participants/types';

export function dietarySummary(participant: Pick<IntakeParticipant, 'dietaryRestrictions' | 'dietaryOther'>): string {
  if (participant.dietaryRestrictions.length === 0) return 'Sin indicar';
  return participant.dietaryRestrictions
    .map((code) =>
      code === 'otra' && participant.dietaryOther ? `Otra: ${participant.dietaryOther}` : DIETARY_LABELS[code]
    )
    .join(' · ');
}

/** The saved roster: one card per person, newest last. */
export default function ParticipantList({
  participants,
  program,
  editingId,
  disabled,
  onEdit,
}: {
  participants: IntakeParticipant[];
  program: ProgramId;
  editingId: string | null;
  disabled: boolean;
  onEdit: (participant: IntakeParticipant) => void;
}) {
  if (participants.length === 0) {
    return (
      <p data-testid="intake-list-empty" className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-700">
        Aún no hay personas guardadas en esta nómina.
      </p>
    );
  }

  return (
    <ol className="space-y-3" data-testid="intake-list">
      {participants.map((participant, index) => {
        const editing = editingId === participant.id;
        return (
          <li
            key={participant.id}
            data-testid={`intake-row-${participant.id}`}
            className={`rounded-lg border p-4 ${editing ? 'border-brand_accent ring-2 ring-brand_accent/60' : 'border-gray-200'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-600">Persona {index + 1}</p>
                <p className="font-mont text-base font-semibold" data-testid="intake-row-name">
                  {participant.firstNames} {participant.lastNames}
                </p>
                <p className="text-sm text-gray-700">RUT {displayRut(participant.rut)}</p>
              </div>
              <button
                type="button"
                data-testid={`intake-edit-${participant.id}`}
                onClick={() => onEdit(participant)}
                disabled={disabled || editing}
                aria-label={`Editar ficha de ${participant.firstNames} ${participant.lastNames}`}
                className="min-h-[40px] shrink-0 rounded-md border border-brand_primary px-3 py-1.5 text-sm font-semibold hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {editing ? 'Editando' : 'Editar'}
              </button>
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              <div>
                <dt className="inline text-gray-600">Pasajes: </dt>
                <dd className="inline">{FUNDING_LABELS[participant.flightsFunding]}</dd>
              </div>
              <div>
                <dt className="inline text-gray-600">Alojamiento: </dt>
                <dd className="inline">{FUNDING_LABELS[participant.lodgingFunding]}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="inline text-gray-600">Llegada: </dt>
                <dd className="inline">{storedDateLabel(program, 'arrival', participant.arrivalDate)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="inline text-gray-600">Regreso: </dt>
                <dd className="inline">{storedDateLabel(program, 'departure', participant.departureDate)}</dd>
              </div>
              <div>
                <dt className="inline text-gray-600">Pasaporte: </dt>
                <dd className="inline">{participant.passportNumber ?? 'Sin indicar'}</dd>
              </div>
              <div>
                <dt className="inline text-gray-600">Foco: </dt>
                <dd className="inline">{participant.focus ? FOCUS_LABELS[participant.focus] : 'Sin indicar'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="inline text-gray-600">Alimentación: </dt>
                <dd className="inline">{dietarySummary(participant)}</dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ol>
  );
}
