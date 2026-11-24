// @vitest-environment jsdom
/**
 * Redesign 6S, release SB: the new look's words of the consultor's session screens
 * (`components/sessions/sessionTextNuevo.ts`). The list row's helper words are compared with today's
 * `getStatusHelperText` of `hooks/useSessionDetail.ts`, read from the hook itself.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ROW_HELPER_TEXT, rowHelperText, arrivalText, activityText, modalityText, requestValueText, finalizeChecklist, agendaGroups, weekAround,
  statusTone, FINALIZE_MET,
} from '@/components/sessions/sessionTextNuevo';
import type { SessionStatus } from '@/lib/types/consultor-sessions.types';

vi.mock('next/router', () => ({ useRouter: () => ({ isReady: false, query: {}, push: () => {} }) }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => ({ auth: {} }) }));
vi.mock('react-hot-toast', () => ({ toast: { error: () => {}, success: () => {} } }));
vi.mock('@/utils/roleUtils', () => ({ getUserPrimaryRole: () => Promise.resolve(null) }));

import { useSessionDetail } from '@/hooks/useSessionDetail';

const STATUSES: SessionStatus[] = ['borrador', 'pendiente_aprobacion', 'programada', 'en_progreso', 'pendiente_informe', 'completada', 'cancelada'];

describe('the list row’s helper words', () => {
  it('equal today’s status helper text for «En Progreso» and «Pendiente Informe», and nothing for the others', () => {
    const { result } = renderHook(() => useSessionDetail());
    expect(Object.keys(ROW_HELPER_TEXT).sort()).toEqual(['en_progreso', 'pendiente_informe']);
    for (const status of ['en_progreso', 'pendiente_informe'] as SessionStatus[]) {
      expect(rowHelperText(status)).toBe(result.current.getStatusHelperText(status));
    }
    for (const status of STATUSES.filter((s) => s !== 'en_progreso' && s !== 'pendiente_informe')) {
      expect(rowHelperText(status)).toBeNull();
    }
  });
});

describe('the approved words', () => {
  it('arrival in Spanish; unknown keys as today; none «—»', () => {
    expect(arrivalText('on_time')).toBe('A tiempo');
    expect(arrivalText('late')).toBe('Tarde');
    expect(arrivalText('left_early')).toBe('Salió temprano');
    expect(arrivalText('very_late')).toBe('very late');
    expect(arrivalText(null)).toBe('—');
  });

  it('every activity action of the type in Spanish; an unknown one as today', () => {
    const actions = [
      'created', 'viewed', 'edited', 'status_changed', 'materials_uploaded', 'materials_deleted', 'report_filed', 'report_updated',
      'attendance_recorded', 'attendance_updated', 'communication_added', 'edit_requested', 'edit_approved', 'edit_rejected',
      'edit_approval_blocked', 'facilitators_updated', 'cancelled', 'finalized',
    ];
    for (const a of actions) expect(activityText(a)).not.toBe(a.replace(/_/g, ' '));
    expect(activityText('status_changed')).toBe('Cambio de estado');
    expect(activityText('algo_nuevo')).toBe('algo nuevo');
  });

  it('«Híbrida» with its accent', () => {
    expect(modalityText('hibrida')).toBe('Híbrida');
    expect(modalityText('presencial')).toBe('Presencial');
    expect(modalityText('online')).toBe('Online');
    expect(modalityText('otra')).toBe('otra');
  });

  it('history values formatted; what cannot be read stays raw', () => {
    expect(requestValueText('session_date', '2026-11-13')).toBe('13 noviembre 2026');
    expect(requestValueText('start_time', '09:30:00')).toBe('09:30');
    expect(requestValueText('modality', 'online')).toBe('En línea');
    expect(requestValueText('modality', 'hibrida')).toBe('Híbrida');
    expect(requestValueText('session_date', 'mañana')).toBe('mañana');
    expect(requestValueText('title', 42)).toBe('42');
    expect(requestValueText('end_time', null)).toBe('null');
  });

  it('a status tone for every status', () => {
    for (const s of STATUSES) expect(['neutral', 'warning', 'info', 'success', 'error']).toContain(statusTone(s));
  });
});

describe('the finalize checklist reads today’s reasons', () => {
  it('all unmet, in today’s words', () => {
    const items = finalizeChecklist(['La sesión debe estar en estado "Pendiente de Informe"', 'Falta informe de sesión', 'Hay 2 asistente(s) sin marcar']);
    expect(items.map((i) => [i.met, i.text])).toEqual([
      [false, 'La sesión debe estar en estado "Pendiente de Informe"'],
      [false, 'Falta informe de sesión'],
      [false, 'Hay 2 asistente(s) sin marcar'],
    ]);
  });
  it('all met, in the new words', () => {
    expect(finalizeChecklist([]).map((i) => i.text)).toEqual([FINALIZE_MET.status, FINALIZE_MET.report, FINALIZE_MET.attendance]);
  });
});

describe('the agenda groups', () => {
  it('the week runs Monday to Sunday', () => {
    expect(weekAround('2026-11-19')).toEqual({ monday: '2026-11-16', sunday: '2026-11-22' });
    expect(weekAround('2026-11-16')).toEqual({ monday: '2026-11-16', sunday: '2026-11-22' });
    expect(weekAround('2026-11-22')).toEqual({ monday: '2026-11-16', sunday: '2026-11-22' });
    expect(weekAround('2026-03-01')).toEqual({ monday: '2026-02-23', sunday: '2026-03-01' });
  });
  it('this week and later ones ascending, past ones newest first, empty groups left out', () => {
    const r = (id: string, d: string, t = '10:00:00') => ({ id, session_date: d, start_time: t });
    const groups = agendaGroups([r('a', '2026-11-01'), r('b', '2026-11-20', '11:00:00'), r('c', '2026-11-20', '09:00:00'), r('d', '2026-10-01')], '2026-11-19');
    expect(groups.map((g) => [g.title, g.rows.map((x) => x.id)])).toEqual([
      ['Esta semana', ['c', 'b']],
      ['Pasadas', ['a', 'd']],
    ]);
  });
});
