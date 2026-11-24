import React from 'react';
import { Button, Notice, Select, Spinner } from '../../ui/kit';
import { cx } from '../../ui/kit/cx';
import type { SessionCreate, SessionCreateDecisions } from '../../../hooks/useSessionCreate';
import { CREATE_FIELD_IDS } from '../sessionCreateChecks';
import { FieldMessage } from './SectionNuevo';

const ROLE_OPTION = cx(
  'min-h-[44px] px-3 text-xs font-semibold transition-colors motion-reduce:transition-none sm:min-h-[32px]',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand_accent'
);

/**
 * «Consultor(es) asignados» in the new look's form (redesign 6, release SB), drawn only while a
 * school is chosen (the page's `showConsultants`). Every state and word of today's block, each under
 * the hook's own decision, asked where today's markup asks it: loading, the error box with
 * «Reintentar», the empty box, one row per chosen consultant, the selector. Approved changes: the role
 * is a labelled two-option switch («Tipo de consultor de {nombre}»), «Consultor principal» is a radio,
 * «Quitar» stays inside its row at every width; checks 9 and 10 are shown under the block.
 */
export function ConsultantsNuevo({
  sessionCreate,
  decisions,
  messages,
}: {
  sessionCreate: SessionCreate;
  decisions: SessionCreateDecisions;
  /** The failed checks placed here (9 and 10), from the last press. */
  messages: string[];
}) {
  const {
    consultantsError,
    facilitators,
    handleRemoveFacilitator,
    handleToggleLead,
    handleToggleRole,
    retryConsultants,
    handleConsultantSelect,
  } = sessionCreate;
  const {
    showConsultantsLoading,
    showConsultantsError,
    showConsultantsEmpty,
    showFacilitators,
    consultantOf,
    facilitatorRoleLabel,
    showConsultantSelector,
    consultantSelectorDisabled,
    selectableConsultants,
  } = decisions;
  const labelId = `${CREATE_FIELD_IDS.consultants}-label`;
  const messageId = `${CREATE_FIELD_IDS.consultants}-error`;

  return (
    <div
      id={CREATE_FIELD_IDS.consultants}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={messages.length > 0 ? messageId : undefined}
      tabIndex={-1}
      className="grid min-w-0 scroll-mt-24 gap-[6px] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent"
    >
      <span id={labelId} className="text-[0.8125rem] font-semibold text-brand_primary">
        Consultor(es) asignados{' '}
        <span aria-hidden="true" className="text-red-600">
          *
        </span>
      </span>
      <span className="text-xs text-gray-600">Debe asignar al menos un consultor antes de crear la sesión.</span>

      {showConsultantsLoading() && (
        <Spinner size="sm" label="Cargando consultores..." />
      )}

      {showConsultantsError() && (
        <Notice tone="error">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0">
              <strong className="font-semibold">Error al cargar consultores</strong>
              <br />
              {consultantsError}
            </p>
            <Button variant="outline" size="sm" onClick={retryConsultants}>
              Reintentar
            </Button>
          </div>
        </Notice>
      )}

      {showConsultantsEmpty() && (
        <Notice tone="warning">
          No hay consultores disponibles para este colegio. Verifique que existan usuarios con rol activo de consultor.
        </Notice>
      )}

      {showFacilitators() && (
        <ul className="divide-y divide-brand_primary/[0.12] rounded border border-brand_primary/[0.12] bg-gray-50">
          {facilitators.map((facilitator) => {
            const consultant = consultantOf(facilitator);
            if (!consultant) return null;
            const name = `${consultant.first_name} ${consultant.last_name}`;
            const role = facilitatorRoleLabel(facilitator);

            return (
              <li
                key={facilitator.user_id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-[10px] text-sm"
              >
                <span className="grid min-w-0 flex-[1_1_180px]">
                  <b className="truncate font-semibold text-brand_primary">
                    {consultant.first_name} {consultant.last_name}
                  </b>
                  <span className="truncate text-gray-600">{consultant.email}</span>
                </span>

                <span className="flex min-w-0 max-w-full flex-wrap items-center gap-x-[14px] gap-y-2">
                  <span
                    role="group"
                    aria-label={`Tipo de consultor de ${name}`}
                    className="inline-flex overflow-hidden rounded border border-brand_primary/[0.24] bg-white"
                  >
                    {(['Externo', 'Interno'] as const).map((option) => {
                      const chosen = role === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={chosen}
                          onClick={() => {
                            if (!chosen) handleToggleRole(facilitator.user_id);
                          }}
                          className={cx(
                            ROLE_OPTION,
                            chosen ? 'bg-brand_primary text-white' : 'bg-white text-brand_primary hover:bg-gray-100'
                          )}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </span>

                  <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-brand_primary sm:min-h-0">
                    <input
                      type="radio"
                      name="create-session-lead"
                      checked={facilitator.is_lead}
                      onChange={() => handleToggleLead(facilitator.user_id)}
                      className="h-[18px] w-[18px] flex-none cursor-pointer accent-brand_primary"
                    />
                    Consultor principal
                  </label>

                  <button
                    type="button"
                    onClick={() => handleRemoveFacilitator(facilitator.user_id)}
                    aria-label={`Quitar consultor ${consultant.first_name} ${consultant.last_name}`}
                    className={cx(ROLE_OPTION, 'rounded-full text-red-600 hover:bg-red-100')}
                  >
                    Quitar
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {showConsultantSelector() && (
        <Select
          onChange={handleConsultantSelect}
          disabled={consultantSelectorDisabled()}
          aria-labelledby={labelId}
          aria-invalid={messages.length > 0 ? true : undefined}
        >
          <option value="">Agregar consultor...</option>
          {selectableConsultants().map((consultant) => (
            <option key={consultant.id} value={consultant.id}>
              {consultant.first_name} {consultant.last_name} ({consultant.email})
            </option>
          ))}
        </Select>
      )}

      {messages.length > 0 && (
        <span id={messageId} className="grid gap-1">
          {messages.map((message) => (
            <FieldMessage key={message}>{message}</FieldMessage>
          ))}
        </span>
      )}
    </div>
  );
}
