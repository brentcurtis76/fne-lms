import React from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Activity } from 'lucide-react';
import { Badge, Card } from '../../ui/kit';
import type { BadgeTone } from '../../ui/kit';
import type { SessionEditRequest, SessionWithRelations } from '../../../lib/types/consultor-sessions.types';
import type { SessionDetailDecisions } from '../../../hooks/useSessionDetail';
import { activityText, requestValueText } from '../sessionTextNuevo';
import { H3 } from './HeaderNuevo';

const REQUEST_TONE: Record<string, BadgeTone> = { pending: 'warning', approved: 'success', rejected: 'error' };

/**
 * «Actividad» in the new look. Approved: the change-request history (today above the tabs) comes first
 * here, with its values formatted; the heading «Actividad» over the entries when the history is shown;
 * the actions in Spanish. The same requests and entries as today, under today's conditions
 * (`showEditRequests`, `hasActivity()`), with today's labels (`editRequestStatusLabel`,
 * `editRequestFieldLabel`, `showReviewNotes`).
 */
export default function ActivityNuevo({ decisions, session }: { decisions: SessionDetailDecisions; session: SessionWithRelations }) {
  const { showEditRequests, editRequestStatusLabel, editRequestFieldLabel, showReviewNotes, hasActivity } = decisions;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {showEditRequests && (
        <section className="grid gap-2" aria-labelledby="session-requests-title">
          <h3 id="session-requests-title" className={H3}>
            Historial de Solicitudes de Cambio
          </h3>
          <Card className="divide-y divide-gray-200">
            {(session.edit_requests as SessionEditRequest[]).map((request) => (
              <div key={request.id} className="grid gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={REQUEST_TONE[request.status] ?? 'error'}>{editRequestStatusLabel(request)}</Badge>
                  <span className="text-sm text-gray-600">
                    {format(parseISO(request.created_at), 'dd MMM yyyy, HH:mm', { locale: es })}
                  </span>
                </div>
                <ul className="grid gap-0.5 text-sm text-gray-700">
                  {Object.keys(request.changes).map((field) => {
                    const change = request.changes[field];
                    return (
                      <li key={field} className="break-words">
                        <span className="font-medium">{editRequestFieldLabel(field)}:</span>{' '}
                        <del className="text-red-600">{requestValueText(field, change.old)}</del> →{' '}
                        <ins className="no-underline font-medium text-brand_primary">{requestValueText(field, change.new)}</ins>
                      </li>
                    );
                  })}
                </ul>
                {request.reason && (
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Razón:</span> {request.reason}
                  </p>
                )}
                {showReviewNotes(request) && (
                  <p className="rounded bg-gray-50 p-2 text-sm text-gray-600">
                    <span className="font-medium">Nota del revisor:</span> {request.review_notes}
                  </p>
                )}
              </div>
            ))}
          </Card>
        </section>
      )}

      <section className="grid gap-2">
        {showEditRequests && <h3 className={H3}>Actividad</h3>}
        {hasActivity() ? (
          <Card className="divide-y divide-gray-200">
            {(session.activity_log ?? []).map((log) => (
              <div key={log.id} className="flex items-start gap-3 p-4">
                <Activity className="mt-0.5 h-4 w-4 flex-none text-gray-500" aria-hidden="true" />
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-sm">
                    <span className="font-semibold text-brand_primary">
                      {log.profiles?.first_name} {log.profiles?.last_name}
                    </span>{' '}
                    <span className="text-gray-700">{activityText(log.action)}</span>
                  </span>
                  <span className="text-xs text-gray-600">{format(parseISO(log.created_at), 'dd MMM yyyy HH:mm', { locale: es })}</span>
                </div>
              </div>
            ))}
          </Card>
        ) : (
          <div className="py-6 text-center text-gray-600">No hay actividad registrada</div>
        )}
      </section>
    </div>
  );
}
