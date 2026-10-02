// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * N2-01: the page-load deadline checker names each reminder's occurrence. The
 * real `checkAndFireDeadlineReminders` reads an in-memory licitaciones fake;
 * `triggerNotification` is observed, and each payload is keyed with the real
 * catalog and the service's own key derivation. Synthetic only.
 */
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
});

import type { SupabaseClient } from '@supabase/supabase-js';
import NotificationService from '../../lib/notificationService';
import { checkAndFireDeadlineReminders } from '../../lib/licitacionDeadlineChecker';

const LICITACION_ID = '0b7c2c1e-5d1a-4c6e-9f00-0000000000e1';
const RECIPIENT = '11111111-1111-4111-8111-111111111111';
const DATE_FIELDS = ['fecha_limite_solicitud_bases', 'fecha_limite_consultas', 'fecha_limite_propuestas', 'fecha_limite_evaluacion'] as const;

type Row = Record<string, unknown>;
let licitaciones: Row[];
let fetchError: { message: string } | null;
let sent: Array<{ event: string; data: Record<string, unknown> }>;

const fakeClient = () =>
  ({
    from: (table: string) => ({
      select: () => ({
        in: async () =>
          table === 'licitaciones'
            ? { data: fetchError ? null : licitaciones, error: fetchError }
            : { data: [{ id: 7, name: 'Escuela Sintética' }], error: null },
      }),
    }),
  }) as unknown as SupabaseClient;

const licitacion = (estado: string, dates: Partial<Record<(typeof DATE_FIELDS)[number], string | null>>): Row => ({
  id: LICITACION_ID,
  numero_licitacion: 'LIC-SINT-001',
  school_id: 7,
  estado,
  fecha_limite_solicitud_bases: null,
  fecha_limite_consultas: null,
  fecha_inicio_propuestas: null,
  fecha_limite_propuestas: null,
  fecha_limite_evaluacion: null,
  ...dates,
});

/** One page load on the given Santiago afternoon; returns the keys of what it sent. */
async function pageLoad(day: string) {
  vi.setSystemTime(new Date(`${day}T18:00:00Z`));
  const from = sent.length;
  const fired = await checkAndFireDeadlineReminders(fakeClient());
  const batch = sent.slice(from);
  expect(fired).toBe(batch.length);
  return batch.map(({ event, data }) => ({
    event,
    data,
    occurrence: NotificationService.resolveOccurrence(event, data),
    key: NotificationService.generateIdempotencyKey(event, NotificationService.resolveOccurrence(event, data), RECIPIENT),
  }));
}

beforeEach(() => {
  licitaciones = [];
  fetchError = null;
  sent = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.spyOn(NotificationService, 'triggerNotification').mockImplementation(async (event, data) => {
    sent.push({ event, data });
    return { success: true, notificationsCreated: 1 };
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('D2 · each genuine deadline reminder is its own occurrence; a rerun is a retry', () => {
  it('D2: the evaluación reminder the day before and the day of one deadline get two keys; page-load reruns keep theirs', async () => {
    licitaciones = [licitacion('evaluacion_pendiente', { fecha_limite_evaluacion: '2026-10-02' })];

    const [dayBefore] = await pageLoad('2026-10-01');
    const [dayBeforeRerun] = await pageLoad('2026-10-01');
    const [dayOf] = await pageLoad('2026-10-02');
    const [dayOfRerun] = await pageLoad('2026-10-02');

    expect([dayBefore.event, dayOf.event]).toEqual(['licitacion_evaluacion_deadline_1d', 'licitacion_evaluacion_deadline_1d']);
    expect([dayBefore.data.reminder, dayOf.data.reminder]).toEqual(['1d', 'today']);
    expect(dayBeforeRerun.key).toBe(dayBefore.key);
    expect(dayOfRerun.key).toBe(dayOf.key);
    expect(dayOf.key).not.toBe(dayBefore.key);
  });

  it('D2: a moved deadline is a new occurrence of the same reminder phase', async () => {
    licitaciones = [licitacion('propuestas_pendientes', { fecha_limite_propuestas: '2026-10-02' })];
    const [original] = await pageLoad('2026-10-01');
    licitaciones = [licitacion('propuestas_pendientes', { fecha_limite_propuestas: '2026-10-09' })];
    const [moved] = await pageLoad('2026-10-08');

    expect([original.event, moved.event]).toEqual(['licitacion_propuestas_deadline_1d', 'licitacion_propuestas_deadline_1d']);
    expect([original.data.deadline_date, moved.data.deadline_date]).toEqual(['2026-10-02', '2026-10-09']);
    expect(moved.key).not.toBe(original.key);
  });
});

describe('D3 · the real producer payload always names its occurrence', () => {
  it.each([
    ['recepcion_bases_pendiente', { fecha_limite_solicitud_bases: 'D', fecha_limite_consultas: 'D' }, ['licitacion_bases_deadline', 'licitacion_consultas_deadline']],
    ['propuestas_pendientes', { fecha_limite_propuestas: 'D' }, ['licitacion_propuestas_deadline']],
    ['evaluacion_pendiente', { fecha_limite_evaluacion: 'D' }, ['licitacion_evaluacion_deadline_1d']],
  ])('D3: every %s reminder carries the deadline date and phase, so it is identified, never keyed per call', async (estado, dates, todayEvents) => {
    const at = (day: string) => licitacion(estado, Object.fromEntries(Object.keys(dates).map((f) => [f, day])));
    licitaciones = [at('2026-10-01')];
    const today = await pageLoad('2026-10-01');
    licitaciones = [at('2026-10-02')];
    const tomorrow = await pageLoad('2026-10-01');

    expect(today.map((s) => s.event)).toEqual(todayEvents);
    expect(tomorrow).toHaveLength(todayEvents.length);
    for (const [reminder, batch, date] of [['today', today, '2026-10-01'], ['1d', tomorrow, '2026-10-02']] as const) {
      for (const s of batch) {
        expect(s.data).toMatchObject({ licitacion_id: LICITACION_ID, deadline_date: date, reminder });
        expect(s.occurrence).toBe(`record:${LICITACION_ID}:${date}:${reminder}`);
      }
    }
  });

  it('D3: a licitación with no deadline today or tomorrow, or an unset date, sends nothing', async () => {
    licitaciones = [
      licitacion('evaluacion_pendiente', { fecha_limite_evaluacion: null }),
      licitacion('propuestas_pendientes', { fecha_limite_propuestas: '2026-10-05' }),
      licitacion('contrato_pendiente', { fecha_limite_evaluacion: '2026-10-01' }),
    ];
    expect(await pageLoad('2026-10-01')).toEqual([]);
  });

  it('D3: a failed licitaciones read sends nothing and reports zero', async () => {
    fetchError = { message: 'permission denied' };
    licitaciones = [licitacion('evaluacion_pendiente', { fecha_limite_evaluacion: '2026-10-01' })];
    expect(await checkAndFireDeadlineReminders(fakeClient())).toBe(0);
    expect(sent).toEqual([]);
  });

  it('D3: a trigger that throws is not counted and the next reminder is still sent with its identity', async () => {
    licitaciones = [licitacion('recepcion_bases_pendiente', { fecha_limite_solicitud_bases: '2026-10-01', fecha_limite_consultas: '2026-10-01' })];
    vi.mocked(NotificationService.triggerNotification).mockRejectedValueOnce(new Error('transient'));
    vi.setSystemTime(new Date('2026-10-01T18:00:00Z'));

    expect(await checkAndFireDeadlineReminders(fakeClient())).toBe(1);
    expect(NotificationService.triggerNotification).toHaveBeenCalledTimes(2);
    expect(sent).toEqual([
      { event: 'licitacion_consultas_deadline', data: expect.objectContaining({ deadline_date: '2026-10-01', reminder: 'today' }) },
    ]);
  });
});
