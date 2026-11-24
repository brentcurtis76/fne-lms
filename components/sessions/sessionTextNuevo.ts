/**
 * The words the NEW look of the consultor's session screens says where today's look says something
 * else (redesign 6S, release SB). Each one was approved with the mock-ups (inventory
 * `docs/plan/redesign/inventory/06-sesiones.md`, «Approved changes» of the session page and of the
 * list). Today's look keeps its own words: the shared helpers (`lib/utils/session-ui-helpers.tsx`)
 * are not changed. Pure functions, no React.
 */
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { SessionStatus } from '../../lib/types/consultor-sessions.types';
import type { BadgeTone } from '../ui/kit';

/** Arrival status in read mode, in Spanish (today: the stored key with spaces, «on time»). */
export const ARRIVAL_NUEVO: Readonly<Record<string, string>> = {
  on_time: 'A tiempo',
  late: 'Tarde',
  left_early: 'Salió temprano',
};

/** The arrival word of a stored status; an unknown key is shown as today shows it; none is «—». */
export function arrivalText(status: string | null | undefined): string {
  if (!status) return '—';
  return ARRIVAL_NUEVO[status] ?? status.replace(/_/g, ' ');
}

/** The activity log's actions, in Spanish (today: the stored key with spaces). */
export const ACTIVITY_NUEVO: Readonly<Record<string, string>> = {
  created: 'Sesión creada',
  viewed: 'Sesión vista',
  edited: 'Sesión editada',
  status_changed: 'Cambio de estado',
  materials_uploaded: 'Material subido',
  materials_deleted: 'Material eliminado',
  report_filed: 'Informe registrado',
  report_updated: 'Informe actualizado',
  attendance_recorded: 'Asistencia registrada',
  attendance_updated: 'Asistencia actualizada',
  communication_added: 'Comunicación agregada',
  edit_requested: 'Cambio solicitado',
  edit_approved: 'Cambio aprobado',
  edit_rejected: 'Cambio rechazado',
  edit_approval_blocked: 'Aprobación de cambio bloqueada',
  facilitators_updated: 'Facilitadores actualizados',
  cancelled: 'Sesión cancelada',
  finalized: 'Sesión finalizada',
};

/** One activity's action; an action not in the list is shown as today shows it. */
export function activityText(action: string): string {
  return ACTIVITY_NUEVO[action] ?? action.replace(/_/g, ' ');
}

/** The modality of the session page's header, «Híbrida» with its accent (today «hibrida», capitalised). */
const MODALITY_NUEVO: Readonly<Record<string, string>> = {
  presencial: 'Presencial',
  online: 'Online',
  hibrida: 'Híbrida',
};

export function modalityText(modality: string): string {
  return MODALITY_NUEVO[modality] ?? modality;
}

/**
 * The words of the session page's status sentence for the two statuses a list row of «Mis Sesiones»
 * explains (approved: «using today's status helper words»). They equal what `getStatusHelperText` of
 * `hooks/useSessionDetail.ts` says for these statuses (a test compares them).
 */
export const ROW_HELPER_TEXT: Readonly<Partial<Record<SessionStatus, string>>> = {
  en_progreso: 'Sesión en curso.',
  pendiente_informe: 'Sesión finalizada. Debe completar el informe y la asistencia.',
};

/** What a row of the consultant's own sessions says it needs, or `null`. */
export function rowHelperText(status: SessionStatus): string | null {
  return ROW_HELPER_TEXT[status] ?? null;
}

/** The tone of a status pill in the new look (the label stays today's, from `getStatusBadge`). */
export function statusTone(status: SessionStatus): BadgeTone {
  switch (status) {
    case 'pendiente_aprobacion':
    case 'pendiente_informe':
      return 'warning';
    case 'en_progreso':
      return 'info';
    case 'completada':
      return 'success';
    case 'cancelada':
      return 'error';
    default:
      return 'neutral';
  }
}

/** The modality words of today's change-request window (EditRequestModal), used in the history. */
const REQUEST_MODALITY: Readonly<Record<string, string>> = {
  presencial: 'Presencial',
  online: 'En línea',
  hibrida: 'Híbrida',
};

/**
 * A value of the change-request history, formatted (approved: dates «13 noviembre 2026», times HH:MM,
 * modality words) instead of the raw stored value. Anything it cannot read is shown raw, as today.
 */
export function requestValueText(field: string, value: unknown): string {
  const raw = String(value);
  if (typeof value !== 'string') return raw;
  if (field === 'session_date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    try {
      return format(parseISO(value), 'dd MMMM yyyy', { locale: es });
    } catch {
      return raw;
    }
  }
  if ((field === 'start_time' || field === 'end_time') && /^\d{2}:\d{2}/.test(value)) return value.substring(0, 5);
  if (field === 'modality') return REQUEST_MODALITY[value] ?? raw;
  return raw;
}

/** The finalize card's three conditions: today's unmet words (from `canFinalizeSession`) and the met ones. */
export const FINALIZE_STATUS_UNMET = 'La sesión debe estar en estado "Pendiente de Informe"';
export const FINALIZE_REPORT_UNMET = 'Falta informe de sesión';
export const FINALIZE_MET = {
  status: 'Sesión en estado "Pendiente de Informe"',
  report: 'Informe de sesión creado',
  attendance: 'Asistencia marcada para todos',
} as const;

export interface FinalizeItem {
  key: 'status' | 'report' | 'attendance';
  met: boolean;
  text: string;
}

/**
 * The checklist, read from today's answer of `canFinalizeSession()` (its reasons, in its order), so the
 * card asks nothing of its own: a reason present is an unmet line with today's words, a reason absent a
 * met line with the new words.
 */
export function finalizeChecklist(reasons: readonly string[]): FinalizeItem[] {
  const attendanceReason = reasons.find((r) => r !== FINALIZE_STATUS_UNMET && r !== FINALIZE_REPORT_UNMET && r.startsWith('Hay '));
  return [
    reasons.includes(FINALIZE_STATUS_UNMET)
      ? { key: 'status', met: false, text: FINALIZE_STATUS_UNMET }
      : { key: 'status', met: true, text: FINALIZE_MET.status },
    reasons.includes(FINALIZE_REPORT_UNMET)
      ? { key: 'report', met: false, text: FINALIZE_REPORT_UNMET }
      : { key: 'report', met: true, text: FINALIZE_MET.report },
    attendanceReason
      ? { key: 'attendance', met: false, text: attendanceReason }
      : { key: 'attendance', met: true, text: FINALIZE_MET.attendance },
  ];
}

/** The list's time groups (approved): this week ascending, later ones ascending, past ones newest first. */
export type AgendaGroupId = 'semana' | 'proximas' | 'pasadas';
export const AGENDA_GROUP_TITLE: Readonly<Record<AgendaGroupId, string>> = {
  semana: 'Esta semana',
  proximas: 'Próximas',
  pasadas: 'Pasadas',
};

/** Monday and Sunday ("YYYY-MM-DD") of the week holding a calendar day ("YYYY-MM-DD"). */
export function weekAround(day: string): { monday: string; sunday: string } {
  const [y, m, d] = day.split('-').map(Number);
  const noon = Date.UTC(y, m - 1, d, 12);
  const back = (new Date(noon).getUTCDay() + 6) % 7;
  const iso = (ms: number) => new Date(ms).toISOString().substring(0, 10);
  return { monday: iso(noon - back * 86400000), sunday: iso(noon + (6 - back) * 86400000) };
}

/**
 * The rows of one list in their groups. `today` is today's date in Chile (`todayInChile`), so the
 * week is Chile's week whatever the machine's time zone. Empty groups are left out.
 */
export function agendaGroups<T extends { session_date: string; start_time: string }>(
  rows: readonly T[],
  today: string
): { id: AgendaGroupId; title: string; rows: T[] }[] {
  const { monday, sunday } = weekAround(today);
  const when = (row: T) => `${row.session_date} ${row.start_time}`;
  const ascending = (a: T, b: T) => (when(a) < when(b) ? -1 : when(a) > when(b) ? 1 : 0);
  const groups: { id: AgendaGroupId; rows: T[] }[] = [
    { id: 'semana', rows: rows.filter((r) => r.session_date >= monday && r.session_date <= sunday).sort(ascending) },
    { id: 'proximas', rows: rows.filter((r) => r.session_date > sunday).sort(ascending) },
    { id: 'pasadas', rows: rows.filter((r) => r.session_date < monday).sort((a, b) => ascending(b, a)) },
  ];
  return groups.filter((g) => g.rows.length > 0).map((g) => ({ ...g, title: AGENDA_GROUP_TITLE[g.id] }));
}
