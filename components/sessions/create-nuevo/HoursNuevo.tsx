import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Field, Notice, Select, Spinner } from '../../ui/kit';
import type { SessionCreate, SessionCreateDecisions } from '../../../hooks/useSessionCreate';
import { decimalComma } from './createNuevoText';
import { FIELD_ROW, ROW_FIELD_WITH_HELP } from './fieldRow';

/**
 * Section 6 «Horas y contrato» of the new look's form (redesign 6, release SB). Today's lines, selects
 * and hours chip, each under the hook's own decision and asked where today's markup asks it; approved:
 * the rule said up front («Elija ambos para registrar las horas, o deje los dos vacíos.»), the chip
 * drawn as the shared notice piece, the hours with a decimal comma, and the server's refusal of a
 * half-chosen pair (`pairRefusal`) under the two selects, both of them marked as wrong.
 */
export function HoursNuevo({
  sessionCreate,
  decisions,
  pairRefusal = null,
}: {
  sessionCreate: SessionCreate;
  decisions: SessionCreateDecisions;
  pairRefusal?: string | null;
}) {
  const {
    hourTypes,
    contratos,
    selectedHourTypeKey,
    selectedContratoId,
    availableHours,
    availableHoursLoading,
    handleHourTypeChange,
    handleContratoChange,
  } = sessionCreate;
  const {
    showHourTypesLoading,
    showHourTypesError,
    showHourTypeSelects,
    contratoSelectDisabled,
    showNoContratos,
    showHoursChip,
    hasHoursBucket,
    hoursLevel,
  } = decisions;
  const refusal = pairRefusal
    ? { 'aria-invalid': true as const, 'aria-describedby': 'hour-pair-refusal' }
    : {};

  return (
    <>
      {showHourTypesLoading && <Spinner size="sm" label="Cargando tipos de hora..." />}
      {showHourTypesError && (
        <Notice tone="warning">
          No se pudieron cargar los tipos de hora. La sesión puede crearse sin seguimiento de horas.
        </Notice>
      )}
      {showHourTypeSelects && (
        <>
          <p className="text-[0.8125rem] text-gray-600">Elija ambos para registrar las horas, o deje los dos vacíos.</p>
          <div className={`${FIELD_ROW} grid-cols-[minmax(0,1fr)] md:grid-cols-2`}>
            <Field label="Tipo de Hora" className={ROW_FIELD_WITH_HELP}>
              <Select id="hour-type-select" value={selectedHourTypeKey} onChange={handleHourTypeChange} {...refusal}>
                <option value="">Seleccione tipo de hora</option>
                {hourTypes.map((ht) => (
                  <option key={ht.key} value={ht.key}>
                    {ht.display_name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Contrato"
              help={showNoContratos() ? 'No hay contratos activos para este colegio.' : undefined}
              className={ROW_FIELD_WITH_HELP}
            >
              <Select
                id="contrato-select"
                value={selectedContratoId}
                onChange={handleContratoChange}
                disabled={contratoSelectDisabled()}
                {...refusal}
              >
                <option value="">Seleccione un contrato</option>
                {contratos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {pairRefusal && (
            <p
              id="hour-pair-refusal"
              className="flex items-center gap-1.5 text-xs text-red-600"
              data-testid="session-create-nuevo-pair-refusal"
            >
              <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 flex-none" />
              {pairRefusal}
            </p>
          )}
        </>
      )}

      {showHoursChip && (
        <div data-testid="session-create-nuevo-hours">
          {availableHoursLoading ? (
            <Notice tone="neutral" icon={<Spinner size="sm" className="mt-px" />}>
              Cargando horas disponibles...
            </Notice>
          ) : hasHoursBucket() ? (
            (() => {
              const hours = availableHours as number;
              const { isExhausted, isWarning } = hoursLevel(hours);
              if (isExhausted) {
                return <Notice tone="error" role="status">Sin horas disponibles en este tipo (se registrará como sobrepresupuesto)</Notice>;
              }
              if (isWarning) {
                return (
                  <Notice tone="warning">
                    <b className="font-semibold">{decimalComma(hours)}</b> horas disponibles en este tipo — ¡Quedan menos del 25%!
                  </Notice>
                );
              }
              return (
                <Notice tone="success">
                  <b className="font-semibold">{decimalComma(hours)}</b> horas disponibles en este tipo
                </Notice>
              );
            })()
          ) : (
            <Notice tone="warning">No hay asignación de horas para este tipo en el contrato seleccionado</Notice>
          )}
        </div>
      )}
    </>
  );
}
