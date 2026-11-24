import React from 'react';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button, Field, Input, Select } from '../../ui/kit';
import type { SessionCreate, SessionCreateDecisions } from '../../../hooks/useSessionCreate';
import { CREATE_FIELD_IDS } from '../sessionCreateChecks';
import { FieldMessage } from './SectionNuevo';
import { FIELD_ROW, ROW_FIELD } from './fieldRow';

/**
 * «Configuración de recurrencia» in the new look's form (redesign 6, release SB), drawn only while
 * «Serie recurrente» is chosen (the page's `showRecurrence`). Today's fields, words and decisions,
 * each asked where today's markup asks it; approved: the box is grey with a black left edge (no
 * blue), the custom date rows are named «Fecha {n}», checks 11 and 12 sit under their fields.
 */
export function RecurrenceNuevo({
  sessionCreate,
  decisions,
  countMessage,
  customDatesMessage,
}: {
  sessionCreate: SessionCreate;
  decisions: SessionCreateDecisions;
  countMessage?: string;
  customDatesMessage?: string;
}) {
  const {
    recurrenceFrequency,
    recurrenceCount,
    customDates,
    previewDates,
    handleAddCustomDate,
    handleRemoveCustomDate,
    handleFrequencyChange,
    handleCountChange,
    handleCustomDateInput,
  } = sessionCreate;
  const { customDateEarliest, showRecurrenceCount, showCustomDates, canRemoveCustomDate, showPreview, previewRow } = decisions;
  const customLabelId = 'create-session-custom-dates-label';
  const customMessageId = 'create-session-custom-dates-error';

  return (
    <div
      className="grid min-w-0 gap-4 rounded-r border-l-[3px] border-brand_primary bg-gray-50 px-4 py-[14px]"
      data-testid="session-create-nuevo-recurrence"
    >
      <h3 className="text-sm font-semibold text-brand_primary">Configuración de recurrencia</h3>

      <div className={`${FIELD_ROW} grid-cols-[minmax(0,1fr)] sm:grid-cols-2`}>
        <Field label="Frecuencia" controlId="create-session-frequency" className={ROW_FIELD}>
          <Select value={recurrenceFrequency} onChange={handleFrequencyChange}>
            <option value="weekly">Semanal</option>
            <option value="biweekly">Quincenal</option>
            <option value="monthly">Mensual</option>
            <option value="custom">Fechas personalizadas</option>
          </Select>
        </Field>

        {showRecurrenceCount() && (
          <Field label="Número de sesiones (2-52)" error={countMessage} className={ROW_FIELD}>
            <Input
              id={CREATE_FIELD_IDS.recurrenceCount}
              type="number"
              min={2}
              max={52}
              value={recurrenceCount}
              onChange={handleCountChange}
              className="scroll-mt-24"
            />
          </Field>
        )}
      </div>

      {showCustomDates() && (
        <div role="group" aria-labelledby={customLabelId} className="grid min-w-0 gap-2">
          <span id={customLabelId} className="text-[0.8125rem] font-semibold text-brand_primary">
            Fechas personalizadas
          </span>
          <div className="grid gap-2">
            {customDates.map((date, index) => (
              <div key={index} className="flex min-w-0 items-center gap-2">
                <Input
                  id={index === 0 ? CREATE_FIELD_IDS.customDates : `create-session-custom-date-${index}`}
                  type="date"
                  value={date}
                  onChange={(e) => handleCustomDateInput(index, e)}
                  min={customDateEarliest[index]}
                  aria-label={`Fecha ${index + 1}`}
                  aria-invalid={customDatesMessage && !date ? true : undefined}
                  aria-describedby={customDatesMessage ? customMessageId : undefined}
                  className="min-w-0 max-w-[220px] scroll-mt-24"
                />
                {canRemoveCustomDate() && (
                  <Button
                    variant="quiet"
                    iconOnly
                    aria-label="Eliminar fecha"
                    onClick={() => handleRemoveCustomDate(index)}
                    className="flex-none"
                  >
                    <X aria-hidden="true" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <div>
            <Button variant="outline" size="sm" onClick={handleAddCustomDate}>
              <Plus aria-hidden="true" />
              Agregar fecha
            </Button>
          </div>
          {customDatesMessage && <FieldMessage id={customMessageId}>{customDatesMessage}</FieldMessage>}
        </div>
      )}

      {showPreview() && (
        <div className="min-w-0 rounded border border-brand_primary/[0.12] bg-white p-3">
          <h4 className="mb-2 text-[0.8125rem] font-semibold text-brand_primary">
            Vista previa ({previewDates.length} sesiones)
          </h4>
          <ol className="grid max-h-48 gap-1 overflow-y-auto">
            {previewDates.map((date, index) => {
              const { parsedDate, isWeekend } = previewRow(date);

              return (
                <li
                  key={index}
                  className={
                    isWeekend
                      ? 'flex flex-wrap items-center gap-x-[14px] gap-y-1 rounded bg-amber-100 px-[10px] py-[6px] text-sm text-amber-800'
                      : 'flex flex-wrap items-center gap-x-[14px] gap-y-1 rounded bg-gray-50 px-[10px] py-[6px] text-sm text-brand_primary'
                  }
                >
                  <b className="min-w-[5.5em] font-semibold">Sesión {index + 1}</b>
                  <span className="flex-auto">{format(parsedDate, 'EEEE, dd MMMM yyyy', { locale: es })}</span>
                  {isWeekend && (
                    <span className="inline-flex items-center gap-[5px] text-xs font-semibold">
                      <AlertTriangle aria-hidden="true" size={14} />
                      Fin de semana
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
