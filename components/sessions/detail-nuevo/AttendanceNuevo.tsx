import React from 'react';
import { Check, CheckCircle2, Save, X } from 'lucide-react';
import { Badge, Button } from '../../ui/kit';
import type { SessionWithRelations } from '../../../lib/types/consultor-sessions.types';
import type { SessionDetail, SessionDetailDecisions } from '../../../hooks/useSessionDetail';
import { arrivalText } from '../sessionTextNuevo';
import { H3 } from './HeaderNuevo';

const CONTROL =
  'rounded border border-gray-300 bg-white px-3 py-2 text-sm text-brand_primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent';

/** Read mode's «attended» mark: a tick, a cross or «—», with the words for screen readers. */
function AttendedMark({ attended }: { attended: boolean | null }) {
  if (attended === true) {
    return (
      <span className="inline-flex items-center text-green-600">
        <Check className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Sí</span>
      </span>
    );
  }
  if (attended === false) {
    return (
      <span className="inline-flex items-center text-red-600">
        <X className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">No</span>
      </span>
    );
  }
  return <span className="text-gray-500">—</span>;
}

/**
 * «Asistencia» in the new look: today's buttons, counts, rows (from `md` up) and phone cards (named
 * «Lista de asistencia»), with today's conditions (`canChange()`, `readMode()` per cell). Approved: the
 * arrival words in Spanish in read mode, «Guardar asistencia» black, labels on the controls.
 */
export default function AttendanceNuevo({
  detail,
  decisions,
  session,
}: {
  detail: SessionDetail;
  decisions: SessionDetailDecisions;
  session: SessionWithRelations;
}) {
  const { savingAttendance, handleAttendanceChange, handleMarkAllPresent, handleSaveAttendance } = detail;
  const { canChange, readMode, attendeeCount, presentCount, absentCount, unmarkedCount, attendanceOf, attendeeName } = decisions;

  return (
    <section className="grid gap-3" aria-labelledby="session-attendance-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="session-attendance-title" className={H3}>
          Asistencia ({attendeeCount()})
        </h3>
        {canChange() && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleMarkAllPresent}>
              Marcar todos presentes
            </Button>
            <Button variant="default" size="sm" onClick={handleSaveAttendance} disabled={savingAttendance}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {savingAttendance ? 'Guardando...' : 'Guardar asistencia'}
            </Button>
          </div>
        )}
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1 text-green-600">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Presentes: {presentCount()}
        </span>
        <span className="inline-flex items-center gap-1 text-red-600">
          <X className="h-4 w-4" aria-hidden="true" />
          Ausentes: {absentCount()}
        </span>
        <span className="text-gray-700">Sin marcar: {unmarkedCount()}</span>
      </p>

      {/* From md up: one row per person */}
      <div className="hidden overflow-x-auto rounded-lg border border-gray-200 md:block">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Nombre</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-700">Esperado</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-700">Asistió</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Estado de llegada</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Notas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {session.attendees.map((attendee) => {
              const attData = attendanceOf(attendee.user_id);
              const fullName = attendeeName(attendee);
              return (
                <tr key={attendee.id} className={attendee.attended === null ? 'bg-yellow-50' : ''}>
                  <td className="px-4 py-2 font-medium text-brand_primary">{fullName}</td>
                  <td className="px-4 py-2 text-center">
                    {attendee.expected ? (
                      <span className="inline-flex text-green-600">
                        <Check className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">Esperado</span>
                      </span>
                    ) : (
                      <span className="inline-flex text-gray-500">
                        <X className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">No esperado</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {readMode() ? (
                      <AttendedMark attended={attendee.attended} />
                    ) : (
                      <input
                        type="checkbox"
                        checked={attData?.attended || false}
                        onChange={(e) => handleAttendanceChange(attendee.user_id, 'attended', e.target.checked)}
                        aria-label={`Asistió: ${fullName}`}
                        className="h-4 w-4 accent-brand_primary"
                      />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {readMode() ? (
                      <span className="text-gray-700">{arrivalText(attendee.arrival_status)}</span>
                    ) : (
                      <select
                        value={attData?.arrival_status || ''}
                        onChange={(e) => handleAttendanceChange(attendee.user_id, 'arrival_status', e.target.value || null)}
                        aria-label={`Estado de llegada: ${fullName}`}
                        className={CONTROL}
                      >
                        <option value="">—</option>
                        <option value="on_time">A tiempo</option>
                        <option value="late">Tarde</option>
                        <option value="left_early">Salió temprano</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {readMode() ? (
                      <span className="text-gray-700">{attendee.notes || '—'}</span>
                    ) : (
                      <input
                        type="text"
                        value={attData?.notes || ''}
                        onChange={(e) => handleAttendanceChange(attendee.user_id, 'notes', e.target.value || null)}
                        placeholder="Notas opcionales"
                        aria-label={`Notas: ${fullName}`}
                        className={`w-full ${CONTROL}`}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phone: one card per person */}
      <ul className="grid gap-3 md:hidden" role="list" aria-label="Lista de asistencia">
        {session.attendees.map((attendee) => {
          const attData = attendanceOf(attendee.user_id);
          const fullName = attendeeName(attendee);
          return (
            <li
              key={attendee.id}
              className={`grid gap-3 rounded-lg border p-4 ${attendee.attended === null ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200 bg-white'}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="min-w-0 break-words font-semibold text-brand_primary">{fullName}</h4>
                <Badge tone={attendee.expected ? 'success' : 'neutral'} plain>
                  {attendee.expected ? 'Esperado' : 'No esperado'}
                </Badge>
              </div>

              <label className="flex min-h-[44px] items-center gap-2 text-sm font-medium text-gray-700">
                {readMode() ? (
                  <AttendedMark attended={attendee.attended} />
                ) : (
                  <input
                    type="checkbox"
                    checked={attData?.attended || false}
                    onChange={(e) => handleAttendanceChange(attendee.user_id, 'attended', e.target.checked)}
                    className="h-5 w-5 accent-brand_primary"
                  />
                )}
                <span>Asistió</span>
              </label>

              <div className="grid gap-1">
                <span className="text-sm font-medium text-gray-700">Estado de llegada</span>
                {readMode() ? (
                  <span className="text-sm text-gray-700">{arrivalText(attendee.arrival_status)}</span>
                ) : (
                  <select
                    value={attData?.arrival_status || ''}
                    onChange={(e) => handleAttendanceChange(attendee.user_id, 'arrival_status', e.target.value || null)}
                    aria-label={`Estado de llegada: ${fullName}`}
                    className={`min-h-[44px] w-full ${CONTROL}`}
                  >
                    <option value="">—</option>
                    <option value="on_time">A tiempo</option>
                    <option value="late">Tarde</option>
                    <option value="left_early">Salió temprano</option>
                  </select>
                )}
              </div>

              <div className="grid gap-1">
                <span className="text-sm font-medium text-gray-700">Notas</span>
                {readMode() ? (
                  <span className="text-sm text-gray-700">{attendee.notes || '—'}</span>
                ) : (
                  <input
                    type="text"
                    value={attData?.notes || ''}
                    onChange={(e) => handleAttendanceChange(attendee.user_id, 'notes', e.target.value || null)}
                    placeholder="Notas opcionales"
                    aria-label={`Notas: ${fullName}`}
                    className={`min-h-[44px] w-full ${CONTROL}`}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
