/**
 * Invented sessions for the list's tests in both looks (redesign 6S, release SB). Today is
 * 2026-11-19 (a Thursday) in Chile; its week runs from Monday 16 to Sunday 22 November.
 */
import { ME, OTHER, authFor } from './sessionsFakes';
import type { Scenario } from './sessionsFakes';

export const NOW = new Date('2026-11-19T12:00:00Z');

export function row(over: Record<string, unknown> = {}) {
  return {
    id: 'ses-x',
    title: 'Sesión inventada',
    session_date: '2026-11-19',
    start_time: '15:00:00',
    end_time: '16:00:00',
    modality: 'presencial',
    status: 'programada',
    school_id: 1,
    schools: { name: 'Colegio Inventado Norte' },
    growth_communities: { name: 'Comunidad Inventada A' },
    session_facilitators: [{ user_id: ME }],
    recurrence_group_id: null,
    session_number: null,
    ...over,
  };
}

export const ROWS = [
  row({ id: 's-hoy', title: 'Hoy inventada', session_date: '2026-11-19', status: 'en_progreso' }),
  row({ id: 's-lunes', title: 'Lunes inventada', session_date: '2026-11-16', status: 'pendiente_informe', recurrence_group_id: 'serie-1', session_number: 2 }),
  row({ id: 's-domingo', title: 'Domingo inventada', session_date: '2026-11-22', start_time: '09:00:00' }),
  row({ id: 's-proxima-2', title: 'Próxima tardía', session_date: '2026-12-10' }),
  row({ id: 's-proxima-1', title: 'Próxima temprana', session_date: '2026-11-23', modality: 'hibrida' }),
  row({ id: 's-pasada-1', title: 'Pasada reciente', session_date: '2026-11-15', status: 'cancelada' }),
  row({ id: 's-pasada-2', title: 'Pasada antigua', session_date: '2026-10-01', status: 'completada' }),
  row({ id: 's-otra', title: 'Otra inventada', session_date: '2026-11-20', status: 'pendiente_informe', session_facilitators: [{ user_id: OTHER }], schools: { name: 'Escuela Inventada Sur' }, school_id: 2 }),
];

export const LEDGER = [{ session_id: 's-pasada-1', status: 'penalizada', admin_override: true }];

export function sessionsAddress(params: Record<string, string> = {}, page = 1) {
  const q = new URLSearchParams({ page: String(page), limit: '20' });
  for (const [k, v] of Object.entries(params)) q.append(k, v);
  return `GET /api/sessions?${q.toString()}`;
}

export function listScenario(over: Partial<Scenario> = {}, rows: unknown[] = ROWS, total = rows.length): Scenario {
  return {
    pathname: '/consultor/sessions',
    session: authFor(ME),
    role: 'consultor',
    ledger: LEDGER,
    fetch: { [sessionsAddress()]: { body: { data: { sessions: rows, total } } } },
    ...over,
  };
}
