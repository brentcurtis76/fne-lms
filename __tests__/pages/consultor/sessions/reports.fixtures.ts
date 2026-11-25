/**
 * Invented data for «Reportes de Sesiones» (`/consultor/sessions/reports`) in both looks (redesign 6S,
 * release SC). The clock is fixed at NOW, so the default «Desde» (90 days before) and «Hasta» are known.
 * Every person, school and address here is invented.
 */
import type { Scenario } from '../../../helpers/sessionsFakes';

export const NOW = new Date('2026-11-20T15:00:00Z');
export const FROM = '2026-08-22';
export const TO = '2026-11-20';
export const USER = 'consultor-inventado';
export const authOf = (id: string) => ({ access_token: `synthetic-token-${id}`, user: { id, email: `${id}@example.invalid` } });

export function analyticsAddress(params: Record<string, string> = {}) {
  const p = new URLSearchParams();
  p.append('date_from', params.date_from ?? FROM);
  p.append('date_to', params.date_to ?? TO);
  if (params.school_id) p.append('school_id', params.school_id);
  if (params.consultant_id) p.append('consultant_id', params.consultant_id);
  return `GET /api/sessions/reports/analytics?${p.toString()}`;
}

export const DATA = {
  kpis: {
    total_sessions: 21,
    completed_sessions: 7,
    cancelled_sessions: 3,
    completion_rate: 33,
    total_hours_scheduled: 42,
    total_hours_actual: 30,
    avg_attendance_rate: 81,
    sessions_pending_report: 1,
    upcoming_sessions: 7,
  },
  status_distribution: [
    { status: 'completada', count: 7 },
    { status: 'programada', count: 7 },
    { status: 'cancelada', count: 3 },
  ],
  modality_distribution: [
    { modality: 'presencial', count: 12 },
    { modality: 'online', count: 6 },
    { modality: 'hibrida', count: 3 },
  ],
  sessions_by_month: [
    { month: '2026-09', total: 8, completed: 4, cancelled: 1 },
    { month: '2026-10', total: 13, completed: 3, cancelled: 2 },
  ],
  sessions_by_school: [
    { school_id: 7, school_name: 'Colegio Inventado Norte', total: 12, completed: 5 },
    { school_id: 8, school_name: 'Escuela Ficticia Sur', total: 9, completed: 2 },
  ],
  attendance_trends: [
    { month: '2026-09', avg_attendance_rate: 80, total_expected: 10, total_attended: 8 },
    { month: '2026-10', avg_attendance_rate: 82, total_expected: 11, total_attended: 9 },
  ],
  top_consultants: [
    { user_id: 'con-a', name: 'Rosa Inventada', sessions_led: 9, avg_attendance: 80 },
    { user_id: 'con-b', name: 'Pablo Supuesto', sessions_led: 5, avg_attendance: 70 },
  ],
  recent_sessions: [
    { id: 'ses-a', title: 'Taller inventado de convivencia', session_date: '2026-11-10', status: 'completada', school_name: 'Colegio Inventado Norte', gc_name: 'Comunidad Inventada A', attendance_rate: 90 },
    { id: 'ses-b', title: 'Observación ficticia de aula', session_date: '2026-11-18', status: 'programada', school_name: 'Escuela Ficticia Sur', gc_name: 'Comunidad Ficticia B', attendance_rate: null },
  ],
};

export const EMPTY = {
  ...DATA,
  kpis: { ...DATA.kpis, total_sessions: 0 },
  status_distribution: [],
  modality_distribution: [],
  sessions_by_month: [],
  sessions_by_school: [],
  attendance_trends: [],
  top_consultants: [],
  recent_sessions: [],
};

export function reportsScenario(over: Partial<Scenario> = {}, data: unknown = DATA): Scenario {
  return {
    pathname: '/consultor/sessions/reports',
    session: authOf(USER),
    role: 'consultor',
    fetch: {
      [analyticsAddress()]: { body: { data } },
      [analyticsAddress({ school_id: '7' })]: { body: { data } },
      [analyticsAddress({ date_from: '2020-01-01' })]: { body: { data } },
      [analyticsAddress({ date_from: '2020-01-01', date_to: '2020-01-31' })]: { body: { data: EMPTY } },
      [analyticsAddress({ school_id: '7', consultant_id: 'con-a' })]: { body: { data } },
    },
    ...over,
  };
}
