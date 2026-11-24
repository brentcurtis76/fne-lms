import React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, CalendarPlus, CheckCircle, ChevronDown, ChevronUp, Eye, Link2, XCircle } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  Checkbox,
  ConfirmDialog,
  Dialog,
  Field,
  PageHeader,
  Select,
  Spinner,
  Textarea,
  buttonClasses,
} from '../../ui/kit';
import SessionStartControl from '../SessionStartControl';
import { getStatusBadge } from '../../../lib/utils/session-ui-helpers';
import { managedMeetingIsReady, managedMeetingIsUnavailable } from '../../../lib/utils/managed-meeting-readiness';
import { buildSessionJoinPath } from '../../../lib/utils/session-disclosure';
import type { SessionStatus, SessionWithRelations } from '../../../lib/types/consultor-sessions.types';
import type { SessionMeetingPublicStatus } from '../../../lib/zoom/db-types';
import { statusTone } from '../sessionTextNuevo';
import { H2, LABEL, PAGE, TOUCH, TOUCH_TEXT, WRAP } from './adminNuevoStyles';

/**
 * «Detalle de Sesión» of the admin (`/admin/sessions/[id]`) in the new look (redesign 6S, release SC),
 * drawn only for an account that chose it. It draws the page's own state and calls the page's own
 * handlers, in today's order and with today's words: the same requests, conditions and toasts. The
 * differences of form: a `PageHeader`; the two browser questions become the kit's `ConfirmDialog`
 * (the same question as its title, «Confirmar» / «Cancelar»; the «yes» calls the page's
 * `…Confirmed` core, the very calls today's handler makes after its `confirm()`); the two cancel
 * pop-ups become the kit's `Dialog` (Escape, X and «Cerrar» close; the focus stays inside and goes
 * back to the button that opened it). The hours panel and the start control are today's pieces.
 */

export interface SeriesSessionItemNuevo {
  id: string;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: SessionStatus;
  session_number: number | null;
}

type EditFacilitator = { user_id: string; facilitator_role: 'consultor_externo' | 'equipo_interno'; is_lead: boolean };
type Consultant = { id: string; first_name: string; last_name: string; email: string };

export interface AdminSessionDetailNuevoProps {
  session: SessionWithRelations;
  /**
   * The session id the address names (`null` while it names none). While the page still shows the
   * previous session after the address has moved on, a question cannot be opened or confirmed.
   */
  routeSessionId: string | null;
  /**
   * The place of the hours panel in this view. The page renders the panel once for both views and
   * moves it here (components/sessions/admin-nuevo/keptNode), so a change of view does not mount it
   * again.
   */
  hoursPanelPlace: (place: HTMLElement | null) => void;
  managedMeetingStatus: SessionMeetingPublicStatus | null;
  managedMeetingStatusLoading: boolean;
  managedMeetingStatusError: boolean;
  actionInProgress: boolean;
  showCancelModal: boolean;
  setShowCancelModal: (open: boolean) => void;
  cancellationReason: string;
  setCancellationReason: (value: string) => void;
  seriesSessions: SeriesSessionItemNuevo[];
  seriesStats: Record<SessionStatus, number> | null;
  seriesTotalSessions: number;
  seriesLoading: boolean;
  showSeriesPanel: boolean;
  setShowSeriesPanel: (open: boolean) => void;
  showSeriesCancelModal: boolean;
  setShowSeriesCancelModal: (open: boolean) => void;
  seriesCancellationReason: string;
  setSeriesCancellationReason: (value: string) => void;
  editingFacilitators: boolean;
  editFacilitators: EditFacilitator[];
  availableConsultants: Consultant[];
  loadingConsultants: boolean;
  savingFacilitators: boolean;
  /** The approval itself, after the «yes» (today's handler minus its browser question). */
  handleApproveConfirmed: () => void;
  /** The start itself, after the «yes» (today's handler minus its browser question). */
  handleStartSessionConfirmed: () => void;
  handleCancelSubmit: () => void;
  handleSeriesCancelSubmit: () => void;
  handleStartEditFacilitators: () => void;
  handleCancelEditFacilitators: () => void;
  handleAddEditFacilitator: (consultantId: string) => void;
  handleRemoveEditFacilitator: (consultantId: string) => void;
  handleToggleEditFacilitatorLead: (consultantId: string) => void;
  handleSaveFacilitators: () => void;
  /** «Ver» on a series line: what today's line does. */
  openSession: (sessionId: string) => void;
  formatDate(dateString: string): string;
  formatTime(timeString: string): string;
}

const APPROVE_QUESTION = '¿Está seguro que desea aprobar esta sesión?';
const START_QUESTION = '¿Está seguro que desea iniciar esta sesión?';

function StatusBadge({ status }: { status: SessionStatus }) {
  return <Badge tone={statusTone(status)}>{getStatusBadge(status).label}</Badge>;
}

function Detail({ title, wide = false, children }: { title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`grid min-w-0 gap-1 ${wide ? 'md:col-span-2' : ''}`}>
      <h3 className={LABEL}>{title}</h3>
      {children}
    </div>
  );
}

function SeriesBand(props: AdminSessionDetailNuevoProps) {
  const {
    session,
    seriesSessions,
    seriesStats,
    seriesTotalSessions,
    seriesLoading,
    showSeriesPanel,
    setShowSeriesPanel,
    setShowSeriesCancelModal,
    actionInProgress,
    openSession,
  } = props;
  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 rounded border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Link2 className="h-4 w-4 flex-none text-gray-600" aria-hidden="true" />
          <span className="text-sm font-semibold text-brand_primary">
            Serie de sesiones — Sesión {session.session_number}
            {seriesTotalSessions > 0 && ` de ${seriesTotalSessions}`}
          </span>
        </div>
        <Button
          variant="quiet"
          onClick={() => setShowSeriesPanel(!showSeriesPanel)}
          aria-expanded={showSeriesPanel}
          aria-label={showSeriesPanel ? 'Ocultar sesiones de la serie' : 'Ver todas las sesiones de la serie'}
          className={`self-start ${WRAP}`}
        >
          <span className={TOUCH_TEXT}>Ver todas las sesiones de la serie</span>
          {showSeriesPanel ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
        </Button>
      </div>

      {showSeriesPanel && (
        <div className="grid gap-4 rounded border border-gray-200 p-4" role="region" aria-label="Sesiones de la serie">
          {seriesLoading ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : (
            <>
              {seriesStats && (
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(seriesStats) as [SessionStatus, number][])
                    .filter(([, count]) => count > 0)
                    .map(([status, count]) => {
                      const badge = getStatusBadge(status);
                      const label =
                        status === 'borrador' && count > 1
                          ? 'Borradores'
                          : badge.label + (count > 1 && !badge.label.endsWith('n') ? 's' : '');
                      return (
                        <Badge key={status} tone={statusTone(status)} plain>
                          {count} {label}
                        </Badge>
                      );
                    })}
                </div>
              )}

              <div className="grid gap-2">
                {seriesSessions.length === 0 ? (
                  <p className="py-4 text-center text-gray-600">No se encontraron sesiones en esta serie.</p>
                ) : (
                  seriesSessions.map((s) => (
                    <div
                      key={s.id}
                      className={`flex flex-col gap-2 rounded border p-3 sm:flex-row sm:items-center sm:justify-between ${
                        s.id === session.id ? 'border-brand_accent bg-brand_accent/10' : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-sm font-semibold text-brand_primary">Sesión {s.session_number}</span>
                        {s.id === session.id && (
                          <Badge tone="accent" plain>
                            Actual
                          </Badge>
                        )}
                        <span className="text-sm text-gray-600">
                          {format(new Date(s.session_date + 'T12:00:00'), 'dd MMM yyyy', { locale: es })}
                        </span>
                        <span className="text-sm text-gray-600">
                          {s.start_time.substring(0, 5)} - {s.end_time.substring(0, 5)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={s.status} />
                        <Button variant="quiet" onClick={() => openSession(s.id)} className={TOUCH}>
                          <Eye aria-hidden="true" />
                          <span>Ver</span>
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-end border-t border-gray-200 pt-3">
                <Button variant="danger" onClick={() => setShowSeriesCancelModal(true)} disabled={actionInProgress} className={WRAP}>
                  <XCircle aria-hidden="true" />
                  <span className={TOUCH_TEXT}>Cancelar sesiones futuras</span>
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Consultants(props: AdminSessionDetailNuevoProps) {
  const {
    session,
    editingFacilitators,
    editFacilitators,
    availableConsultants,
    loadingConsultants,
    savingFacilitators,
    handleStartEditFacilitators,
    handleCancelEditFacilitators,
    handleAddEditFacilitator,
    handleRemoveEditFacilitator,
    handleToggleEditFacilitatorLead,
    handleSaveFacilitators,
  } = props;
  return (
    <div className="grid gap-4 border-t border-gray-200 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={H2}>Consultores</h2>
        {session.status !== 'completada' && session.status !== 'cancelada' && !editingFacilitators && (
          <Button variant="outline" onClick={() => handleStartEditFacilitators()} className={TOUCH}>
            Editar consultores
          </Button>
        )}
      </div>

      {!editingFacilitators ? (
        session.facilitators.length > 0 ? (
          <div className="grid gap-2">
            {session.facilitators.map((facilitator) => {
              const profile = facilitator.profiles;
              const displayName = profile
                ? `${profile.first_name} ${profile.last_name}`.trim() || profile.email || facilitator.user_id
                : facilitator.user_id;
              return (
                <div key={facilitator.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-gray-50 p-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="break-words font-semibold text-brand_primary">{displayName}</span>
                    {facilitator.is_lead && (
                      <Badge tone="accent" plain>
                        Consultor principal
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm capitalize text-gray-600">{facilitator.facilitator_role.replace(/_/g, ' ')}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm italic text-gray-600">Sin consultores asignados</p>
        )
      ) : (
        <div className="grid gap-4 rounded border border-gray-200 bg-gray-50 p-4">
          <div className="grid gap-3">
            <h3 className={LABEL}>Consultores actuales</h3>
            <div className="grid gap-2">
              {editFacilitators.length > 0 ? (
                editFacilitators.map((facilitator) => {
                  const consultant = availableConsultants.find((c) => c.id === facilitator.user_id);
                  const displayName = consultant ? `${consultant.first_name} ${consultant.last_name}` : facilitator.user_id;
                  return (
                    <div
                      key={facilitator.user_id}
                      className="flex flex-col gap-2 rounded border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="break-words font-semibold text-brand_primary">{displayName}</div>
                        {consultant && <div className="break-words text-sm text-gray-600">{consultant.email}</div>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center max-sm:min-h-[44px]">
                          <Checkbox
                            label="Consultor principal"
                            checked={facilitator.is_lead}
                            onChange={() => handleToggleEditFacilitatorLead(facilitator.user_id)}
                          />
                        </span>
                        <Button variant="danger-outline" onClick={() => handleRemoveEditFacilitator(facilitator.user_id)} className={TOUCH}>
                          Quitar
                        </Button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-gray-600">No hay consultores añadidos</p>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            {loadingConsultants ? (
              <>
                <h3 className={LABEL}>Añadir consultor</h3>
                <div className="flex items-center gap-2 rounded border border-gray-200 bg-white p-3">
                  <Spinner size="sm" />
                  <span className="text-sm text-gray-600">Cargando consultores...</span>
                </div>
              </>
            ) : (
              <Field label="Añadir consultor">
                <Select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddEditFacilitator(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  disabled={availableConsultants.length === 0}
                  className={TOUCH}
                >
                  <option value="">Seleccionar consultor...</option>
                  {availableConsultants
                    .filter((c) => !editFacilitators.find((f) => f.user_id === c.id))
                    .map((consultant) => (
                      <option key={consultant.id} value={consultant.id}>
                        {consultant.first_name} {consultant.last_name} ({consultant.email})
                      </option>
                    ))}
                </Select>
              </Field>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => handleCancelEditFacilitators()} disabled={savingFacilitators} className={TOUCH}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => handleSaveFacilitators()}
              disabled={savingFacilitators || editFacilitators.length === 0}
              className={TOUCH}
            >
              {savingFacilitators ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One of the two cancel pop-ups: the same title, sentence, box and buttons as today's. */
function CancelDialog({
  open,
  onClose,
  title,
  sentence,
  reason,
  setReason,
  confirmText,
  onConfirm,
  actionInProgress,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sentence: string;
  reason: string;
  setReason: (value: string) => void;
  confirmText: string;
  onConfirm: () => void;
  actionInProgress: boolean;
  testId: string;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      data-testid={testId}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={actionInProgress} className={WRAP}>
            <span className={TOUCH_TEXT}>Cerrar</span>
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={actionInProgress || !reason.trim()} className={WRAP}>
            <span className={TOUCH_TEXT}>{confirmText}</span>
          </Button>
        </>
      }
    >
      <p>{sentence}</p>
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={4}
        placeholder="Razón de cancelación..."
        aria-label={title}
      />
    </Dialog>
  );
}

export default function AdminSessionDetailNuevo(props: AdminSessionDetailNuevoProps) {
  const {
    session,
    routeSessionId,
    hoursPanelPlace,
    managedMeetingStatus,
    managedMeetingStatusLoading,
    managedMeetingStatusError,
    actionInProgress,
    showCancelModal,
    setShowCancelModal,
    cancellationReason,
    setCancellationReason,
    showSeriesCancelModal,
    setShowSeriesCancelModal,
    seriesCancellationReason,
    setSeriesCancellationReason,
    handleApproveConfirmed,
    handleStartSessionConfirmed,
    handleCancelSubmit,
    handleSeriesCancelSubmit,
    formatDate,
    formatTime,
  } = props;
  // The two questions of today's `window.confirm()`, asked in the page. Each remembers the session it
  // was opened for (its id, or `null` while closed): it shows, and its «yes» acts, only while that is
  // still the session shown and the one the address names. When the address names another session,
  // both close.
  const [askApprove, setAskApprove] = React.useState<string | null>(null);
  const [askStart, setAskStart] = React.useState<string | null>(null);
  React.useEffect(() => {
    setAskApprove(null);
    setAskStart(null);
  }, [routeSessionId]);
  const shownAndAddressed = routeSessionId !== null && routeSessionId === session.id ? session.id : null;
  const approveOpen = askApprove !== null && askApprove === shownAndAddressed;
  const startOpen = askStart !== null && askStart === shownAndAddressed;

  return (
    <div className={PAGE} data-testid="admin-session-detail-nuevo">
      <PageHeader
        icon={<Calendar className="h-6 w-6" />}
        title="Detalle de Sesión"
        description={<span className="break-words">{session.title}</span>}
      />

      <Card>
        <CardBody className="grid gap-6">
          {session.recurrence_group_id && session.session_number && <SeriesBand {...props} />}

          {/* Status and actions, in today's order */}
          <div className="flex flex-col gap-3 border-b border-gray-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <StatusBadge status={session.status} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-end">
              {(['programada', 'en_progreso', 'pendiente_informe'] as string[]).includes(session.status) && (
                <a href={`/api/sessions/${session.id}/ical`} download className={`${buttonClasses({ variant: 'outline' })} ${TOUCH}`}>
                  <CalendarPlus aria-hidden="true" />
                  Agregar al Calendario
                </a>
              )}

              {session.recurrence_group_id && (
                <a
                  href={`/api/sessions/series/${session.recurrence_group_id}/ical`}
                  download
                  className={`${buttonClasses({ variant: 'outline' })} ${TOUCH}`}
                >
                  <CalendarPlus aria-hidden="true" />
                  Exportar Serie
                </a>
              )}

              {(session.status === 'borrador' || session.status === 'pendiente_aprobacion') && (
                <Button variant="primary" onClick={() => setAskApprove(session.id)} disabled={actionInProgress} className={TOUCH}>
                  <CheckCircle aria-hidden="true" />
                  Aprobar
                </Button>
              )}

              {session.status === 'programada' && (
                // Today's start control; on a phone its button is 44 px high.
                <div className="max-sm:[&_button]:h-11">
                  <SessionStartControl
                    isManagedZoom={session.is_zoom_managed === true}
                    meetingStatus={managedMeetingStatus}
                    meetingStatusLoading={managedMeetingStatusLoading}
                    meetingStatusError={managedMeetingStatusError}
                    actionInProgress={actionInProgress}
                    onStart={() => setAskStart(session.id)}
                  />
                </div>
              )}

              {session.status === 'en_progreso' && session.is_zoom_managed === true && managedMeetingIsReady(managedMeetingStatus) && (
                <a
                  href={buildSessionJoinPath(session.id)}
                  data-testid="session-zoom-entry-button"
                  className={`${buttonClasses({ variant: 'primary' })} ${TOUCH}`}
                >
                  <Link2 aria-hidden="true" />
                  Ir a Zoom
                </a>
              )}

              {session.status !== 'completada' && session.status !== 'cancelada' && (
                <Button variant="danger" onClick={() => setShowCancelModal(true)} disabled={actionInProgress} className={TOUCH}>
                  <XCircle aria-hidden="true" />
                  Cancelar
                </Button>
              )}
            </div>
          </div>

          {/* Session details, in today's order */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Detail title="Título">
              <p className="break-words text-lg font-semibold text-brand_primary">{session.title}</p>
            </Detail>
            <Detail title="Modalidad">
              <p className="capitalize text-brand_primary">{session.modality}</p>
            </Detail>
            <Detail title="Fecha">
              <p className="text-brand_primary">{formatDate(session.session_date)}</p>
            </Detail>
            <Detail title="Horario">
              <p className="text-brand_primary">
                {formatTime(session.start_time)} - {formatTime(session.end_time)}
                <span className="ml-1 text-xs text-gray-600">(hora Chile)</span> ({session.scheduled_duration_minutes} min)
              </p>
            </Detail>
            {session.location && (
              <Detail title="Ubicación">
                <p className="break-words text-brand_primary">{session.location}</p>
              </Detail>
            )}

            {session.is_zoom_managed && managedMeetingIsUnavailable(managedMeetingStatus) ? (
              <Detail title="Reunión Zoom">
                <p className="text-red-600" role="alert">
                  La reunión terminó o fue cancelada. Cancela o reprograma la sesión.
                </p>
              </Detail>
            ) : session.is_zoom_managed && !managedMeetingIsReady(managedMeetingStatus) ? (
              <Detail title="Reunión Zoom">
                <p className="text-amber-700" role="status">
                  {managedMeetingStatusError ? 'No se pudo verificar el estado de Zoom. Reintentando…' : 'Preparando la reunión Zoom…'}
                </p>
              </Detail>
            ) : session.has_meeting && session.join_path ? (
              <Detail title="Enlace de reunión">
                {/* Through the platform's own page, as today: the raw link is never drawn. */}
                <a
                  href={session.join_path}
                  data-testid="session-join-link"
                  className="inline-flex items-center font-semibold text-brand_primary underline decoration-brand_accent decoration-2 underline-offset-4 max-sm:min-h-[44px]"
                >
                  {session.is_zoom_managed ? 'Unirse a la reunión Zoom' : 'Abrir reunión'}
                </a>
              </Detail>
            ) : null}

            {session.description && (
              <Detail title="Descripción" wide>
                <p className="break-words text-brand_primary">{session.description}</p>
              </Detail>
            )}
            {session.objectives && (
              <Detail title="Objetivos" wide>
                <p className="break-words text-brand_primary">{session.objectives}</p>
              </Detail>
            )}
            {session.cancellation_reason && (
              <Detail title="Razón de cancelación" wide>
                <p className="break-words text-red-600">{session.cancellation_reason}</p>
              </Detail>
            )}
          </div>

          <Consultants {...props} />

          <div ref={hoursPanelPlace} style={{ display: 'contents' }} />
        </CardBody>
      </Card>

      <CancelDialog
        open={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancelar Sesión"
        sentence="Por favor, ingrese la razón de la cancelación:"
        reason={cancellationReason}
        setReason={setCancellationReason}
        confirmText="Confirmar Cancelación"
        onConfirm={handleCancelSubmit}
        actionInProgress={actionInProgress}
        testId="admin-session-cancel-dialog"
      />
      <CancelDialog
        open={showSeriesCancelModal}
        onClose={() => setShowSeriesCancelModal(false)}
        title="Cancelar Sesiones Futuras de la Serie"
        sentence="Esto cancelará todas las sesiones futuras de esta serie que aún no estén completadas o canceladas. Por favor, ingrese la razón de la cancelación:"
        reason={seriesCancellationReason}
        setReason={setSeriesCancellationReason}
        confirmText="Confirmar Cancelación de Serie"
        onConfirm={handleSeriesCancelSubmit}
        actionInProgress={actionInProgress}
        testId="admin-series-cancel-dialog"
      />

      <ConfirmDialog
        open={approveOpen}
        title={APPROVE_QUESTION}
        onCancel={() => setAskApprove(null)}
        onConfirm={() => {
          const target = askApprove;
          setAskApprove(null);
          if (target === null || target !== shownAndAddressed) return;
          handleApproveConfirmed();
        }}
        data-testid="admin-session-approve-question"
      />
      <ConfirmDialog
        open={startOpen}
        title={START_QUESTION}
        onCancel={() => setAskStart(null)}
        onConfirm={() => {
          const target = askStart;
          setAskStart(null);
          if (target === null || target !== shownAndAddressed) return;
          handleStartSessionConfirmed();
        }}
        data-testid="admin-session-start-question"
      />
    </div>
  );
}
