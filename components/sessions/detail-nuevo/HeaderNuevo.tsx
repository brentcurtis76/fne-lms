import React from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, CalendarPlus, CheckCircle2, Circle, Clock, Edit, ExternalLink, Link2, MapPin, Users } from 'lucide-react';
import { Badge, Button, Card, Notice, buttonClasses } from '../../ui/kit';
import { formatTime, getModalityIcon } from '../../../lib/utils/session-ui-helpers';
import { formatSessionRangeForConsultant } from '../../../lib/utils/session-timezone';
import type { SessionWithRelations } from '../../../lib/types/consultor-sessions.types';
import type { SessionDetail, SessionDetailDecisions } from '../../../hooks/useSessionDetail';
import { finalizeChecklist, modalityText, statusTone } from '../sessionTextNuevo';

export const H3 = 'font-mont text-[0.8125rem] font-bold uppercase tracking-[0.1em] text-brand_primary';

/**
 * The head of one session in the new look: status, series, title, when, where, the status sentence,
 * the actions, and the finalize card at its right (under it on a phone). Every condition is today's,
 * from `decide()`, except the one approved difference: the finalize card also appears at «En Progreso»
 * (its button disabled, as `canFinalizeSession()` then says).
 */
export default function HeaderNuevo({
  detail,
  decisions,
  session,
}: {
  detail: SessionDetail;
  decisions: SessionDetailDecisions;
  session: SessionWithRelations;
}) {
  const { hasPendingEditRequest, canEdit, openEditRequest, openFinalize } = detail;
  const {
    badge,
    helperText,
    finalizeCheck,
    seriesNumberShown,
    showCalendarLink,
    showEditRequestButton,
    showFinalizeButton,
    showJoinLink,
    isPendingReport,
  } = decisions;
  // Approved (13 Nov): the card and its disabled button also while the session is «En Progreso».
  const showFinalizeCard = showFinalizeButton || (canEdit && session.status === 'en_progreso');
  const spain = formatSessionRangeForConsultant(session.session_date, session.start_time, session.end_time);
  const pending = showEditRequestButton && hasPendingEditRequest();

  return (
    <Card>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(session.status)}>{badge.label}</Badge>
          {seriesNumberShown && (
            <span className="flex min-w-0 items-center gap-1 text-sm text-gray-600">
              <Link2 className="h-4 w-4" aria-hidden="true" />
              <span className="min-w-0 [overflow-wrap:anywhere]">Sesión {session.session_number}</span>
            </span>
          )}
        </div>
        <h1 className="break-words [overflow-wrap:anywhere] text-2xl font-extrabold text-brand_primary sm:text-3xl">{session.title}</h1>

        <ul className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-2 text-sm text-gray-700 md:grid-cols-2">
          <li className="flex items-start gap-2">
            <Calendar className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{format(parseISO(session.session_date), 'EEEE, dd MMMM yyyy', { locale: es })}</span>
          </li>
          <li className="flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
            <span className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5 [overflow-wrap:anywhere]">
              <span>
                {formatTime(session.start_time)} - {formatTime(session.end_time)}
                <span className="ml-1 text-xs text-gray-600">(hora Chile)</span>
              </span>
              {spain && <span className="text-xs text-gray-600">En España: {spain}</span>}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex-none">{getModalityIcon(session.modality)}</span>
            <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-0 [overflow-wrap:anywhere]">{modalityText(session.modality)}</span>
              {showJoinLink && (
                <a
                  href={session.join_path as string}
                  data-testid="session-join-link"
                  className="inline-flex items-center gap-1 font-semibold text-brand_primary underline underline-offset-2 hover:text-gray-700"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Enlace
                </a>
              )}
            </span>
          </li>
          {session.schools && (
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{session.schools.name}</span>
            </li>
          )}
          {session.growth_communities && (
            <li className="flex items-start gap-2 md:col-span-2">
              <Users className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{session.growth_communities.name}</span>
            </li>
          )}
        </ul>

        {helperText && (
          <Notice tone={isPendingReport() ? 'warning' : 'neutral'} role="note" className="[overflow-wrap:anywhere]">
            {helperText}
          </Notice>
        )}

        {(showCalendarLink || showEditRequestButton) && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2 [&>*]:max-w-full [&>*]:whitespace-normal [&>*]:text-center">
              {showCalendarLink && (
                <a href={`/api/sessions/${session.id}/ical`} download className={buttonClasses({ variant: 'outline' })}>
                  <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                  Agregar al Calendario
                </a>
              )}
              {showEditRequestButton && (
                <Button variant="outline" onClick={openEditRequest} disabled={hasPendingEditRequest()}>
                  <Edit className="h-4 w-4" aria-hidden="true" />
                  Solicitar Cambios
                </Button>
              )}
            </div>
            {pending && (
              <p className="text-sm text-gray-600 [overflow-wrap:anywhere]">Ya existe una solicitud de cambio pendiente para esta sesión.</p>
            )}
          </div>
        )}
      </div>

      {showFinalizeCard && (
        <aside
          aria-labelledby="session-finalize-title"
          className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 [overflow-wrap:anywhere] [&>button]:whitespace-normal [&>button]:text-center"
          data-testid="session-finalize-card"
        >
          <h2 id="session-finalize-title" className={H3}>
            Para finalizar la sesión
          </h2>
          {finalizeCheck.reasons.length > 0 && (
            <p className="text-sm text-gray-600">Condiciones faltantes: {finalizeCheck.reasons.length}</p>
          )}
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5 text-sm">
            {finalizeChecklist(finalizeCheck.reasons).map((item) => (
              <li key={item.key} className={`flex items-start gap-2 ${item.met ? 'text-brand_primary' : 'text-gray-700'}`}>
                {item.met ? (
                  <CheckCircle2 className="mt-px h-4 w-4 flex-none text-green-600" aria-hidden="true" />
                ) : (
                  <Circle className="mt-px h-4 w-4 flex-none text-gray-500" aria-hidden="true" />
                )}
                <span className="min-w-0">{item.text}</span>
              </li>
            ))}
          </ul>
          <Button variant="primary" onClick={openFinalize} disabled={!finalizeCheck.can} className="w-full">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Finalizar Sesión
          </Button>
        </aside>
      )}
      </div>
    </Card>
  );
}
