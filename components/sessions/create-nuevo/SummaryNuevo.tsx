import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge, Card } from '../../ui/kit';
import type { SessionCreate, SessionCreateDecisions } from '../../../hooks/useSessionCreate';
import { MODALITY_LABELS, datesRange, decimalComma, hoursBetween, isWeekendDate } from './createNuevoText';
import { SECTION_TITLE } from './SectionNuevo';

const TERM = 'mt-[10px] font-mont text-[0.625rem] font-bold uppercase tracking-[0.14em] text-gray-600 first:mt-0';
const VALUE = 'text-sm text-brand_primary [overflow-wrap:anywhere]';

/**
 * What the summary card and the confirmation pop-up both say about the form (redesign 6, release SB,
 * approved: «Resumen»). Read from the hook's state; it decides nothing the form does.
 */
export function summaryFacts(sessionCreate: SessionCreate) {
  const { schools, communities, formData, isRecurring, previewDates } = sessionCreate;
  const dates = isRecurring ? previewDates : formData.session_date ? [formData.session_date] : [];
  return {
    schoolName: schools.find((s) => s.id === formData.school_id)?.name,
    communityName: communities.find((c) => c.id === formData.growth_community_id)?.name,
    dates,
    dateTerm: dates.length > 1 ? 'Fechas' : 'Fecha',
    dateText: datesRange(dates),
    sessions: isRecurring ? previewDates.length : 1,
    hasTimes: Boolean(formData.start_time && formData.end_time),
  };
}

/**
 * The «Resumen» card of the new look's form: the right column from 1,024 px, the last card on a phone.
 * It holds the form's buttons (`children`), drawn by the page.
 *
 * Send-back B10, point 4: the frame's floating note («¿Encontraste un problema? ¡Cuéntanos!» and its
 * round button) covers the lowest 132 px of the window at its right. From 1,024 px the card is at most
 * the window's height less 20rem tall (never under 18rem), and only its list scrolls inside it, so the
 * buttons end above the note both at the page's top (the card starts about 158 px down) and while
 * the card rides along (72 px down). Point 5: the column is 344 px wide, so «Programar serie (52
 * sesiones)» (about 290 px) stays on one line.
 */
export function SummaryNuevo({
  sessionCreate,
  decisions,
  children,
}: {
  sessionCreate: SessionCreate;
  decisions: SessionCreateDecisions;
  children: React.ReactNode;
}) {
  const { formData, facilitators, consultants, selectedHourTypeKey, selectedContratoId, availableHours, availableHoursLoading } =
    sessionCreate;
  const { spainTimePreview, zoomManagedAvailable, showMeetingFields, showSeriesCountInButtons } = decisions;
  const facts = summaryFacts(sessionCreate);
  const weekends = facts.dates.filter(isWeekendDate).length;
  const withHours = Boolean(selectedHourTypeKey && selectedContratoId);
  const perSession = hoursBetween(formData.start_time, formData.end_time);
  const total = perSession * facts.sessions;
  const overBudget = withHours && !availableHoursLoading && availableHours !== null && total > availableHours;

  return (
    <Card className="min-w-0 lg:sticky lg:top-[72px]" data-testid="session-create-nuevo-summary">
      <aside
        aria-labelledby="create-session-summary-title"
        className="grid min-w-0 gap-4 p-4 sm:p-5 lg:max-h-[max(18rem,calc(100vh-20rem))] lg:grid-rows-[auto_minmax(0,1fr)_auto]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="create-session-summary-title" className={SECTION_TITLE}>
            Resumen
          </h2>
          {showSeriesCountInButtons() && (
            <Badge tone="neutral" plain>
              Serie recurrente
            </Badge>
          )}
        </div>

        <dl className="grid min-h-0 grid-cols-[minmax(0,1fr)] content-start gap-[2px] lg:overflow-y-auto">
          <dt className={TERM}>Colegio</dt>
          <dd className={VALUE}>{facts.schoolName || '—'}</dd>
          <dt className={TERM}>Comunidad</dt>
          <dd className={VALUE}>{facts.communityName || '—'}</dd>
          <dt className={TERM}>Consultores</dt>
          <dd className={VALUE}>
            {facilitators.length === 0
              ? '—'
              : facilitators.map((f) => {
                  const person = consultants.find((c) => c.id === f.user_id);
                  if (!person) return null;
                  return (
                    <span key={f.user_id} className="block">
                      {person.first_name} {person.last_name}
                      {f.is_lead && <span className="text-gray-600"> · principal</span>}
                    </span>
                  );
                })}
          </dd>
          <dt className={TERM}>{facts.dateTerm}</dt>
          <dd className={VALUE}>
            {facts.dateText}
            {weekends > 0 && (
              <span className="mt-[2px] flex items-center gap-[5px] text-xs font-semibold text-amber-800">
                <AlertTriangle aria-hidden="true" size={13} />
                {weekends} en fin de semana
              </span>
            )}
          </dd>
          <dt className={TERM}>Sesiones</dt>
          <dd className="text-xl font-extrabold text-brand_primary">{facts.sessions}</dd>
          <dt className={TERM}>Horario</dt>
          <dd className={VALUE}>
            {facts.hasTimes ? (
              <>
                {formData.start_time} a {formData.end_time} <span className="text-gray-600">(hora Chile)</span>
              </>
            ) : (
              '—'
            )}
            {spainTimePreview && <span className="block text-gray-600">{spainTimePreview}</span>}
          </dd>
          <dt className={TERM}>Modalidad</dt>
          <dd className={VALUE}>
            {MODALITY_LABELS[formData.modality]}
            {showMeetingFields && zoomManagedAvailable && formData.is_zoom_managed && (
              <span className="text-gray-600"> · Zoom</span>
            )}
          </dd>
          <dt className={TERM}>Horas</dt>
          <dd className={VALUE}>
            {withHours && perSession > 0 ? (
              <>
                {decimalComma(perSession)} h por sesión · {decimalComma(total)} h en total
              </>
            ) : withHours ? (
              '—'
            ) : (
              'Sin seguimiento de horas'
            )}
            {overBudget && (
              <span className="block text-xs font-semibold text-amber-800">
                Más de lo disponible en este tipo ({decimalComma(Math.max(availableHours as number, 0))} h)
              </span>
            )}
          </dd>
        </dl>

        <div className="grid gap-[10px] border-t border-brand_primary/[0.12] pt-4 [&>*]:w-full [&>*]:whitespace-normal [&>*]:text-center">
          {children}
        </div>
      </aside>
    </Card>
  );
}
