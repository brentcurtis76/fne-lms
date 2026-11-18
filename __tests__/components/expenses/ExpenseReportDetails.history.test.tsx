// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { opArgs, type RecordedRequest } from '../../helpers/recordingSupabase';

/**
 * F7e S5 (GENERA fixes): a report's detail shows its history («Historial»),
 * read from public.expense_report_events with the person's own session, the
 * names through get_profile_cards. Synthetic people only.
 */

const fake = vi.hoisted(() => ({ ref: null as any }));
vi.mock('@supabase/auth-helpers-react', async () => {
  const { createRecordingSupabase } = await import('../../helpers/recordingSupabase');
  fake.ref = createRecordingSupabase();
  return { useSupabaseClient: () => fake.ref.client };
});
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { toast, default: toast };
});
vi.mock('../../../lib/expenseReportExport', () => ({ ExpenseReportExporter: {} }));

(globalThis as any).React = React;

// Loads the fake client even while the component does not use it yet
import '@supabase/auth-helpers-react';
import ExpenseReportDetails from '../../../components/expenses/ExpenseReportDetails';

const h = fake.ref.state as {
  requests: RecordedRequest[];
  respond: (req: RecordedRequest, terminal: string) => { data: unknown; error: unknown };
};

const AUTHOR = 'f7e-consultor-1';
const ADMIN = 'f7e-admin-2';
const REPORT = {
  id: 'r-1', report_name: 'Viaje a Valparaíso', start_date: '2026-11-01', end_date: '2026-11-10', status: 'approved' as const,
  total_amount: 5000, submitted_by: AUTHOR, created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-14T10:00:00Z',
  profiles: { first_name: 'Carla', last_name: 'Prueba', email: 'carla@f7e.test.local' },
  expense_items: [],
};
const EVENTS = [
  { id: 'e1', report_id: 'r-1', event: 'submitted', actor_id: AUTHOR, comment: null, created_at: '2026-11-11T12:00:00Z' },
  { id: 'e2', report_id: 'r-1', event: 'rejected', actor_id: ADMIN, comment: 'Falta la boleta del taxi', created_at: '2026-11-12T12:00:00Z' },
  { id: 'e3', report_id: 'r-1', event: 'resubmitted', actor_id: AUTHOR, comment: null, created_at: '2026-11-13T12:00:00Z' },
  { id: 'e4', report_id: 'r-1', event: 'approved', actor_id: null, comment: null, created_at: '2026-11-14T12:00:00Z' },
];
const CARDS = [
  { id: AUTHOR, first_name: 'Carla', last_name: 'Prueba', avatar_url: null },
  { id: ADMIN, first_name: 'Andrés', last_name: 'Revisor', avatar_url: null },
];
const day = (iso: string) => new Date(iso).toLocaleDateString('es-CL');

function database({ events = EVENTS, eventsError = false }: { events?: unknown[]; eventsError?: boolean } = {}) {
  h.respond = (req) => {
    if (req.target === 'expense_report_events') {
      return eventsError ? { data: null, error: { code: '42501', message: 'permission denied' } } : { data: events, error: null };
    }
    if (req.kind === 'rpc' && req.target === 'get_profile_cards') {
      const ids = (req.args as { p_ids: string[] }).p_ids;
      return { data: CARDS.filter((c) => ids.includes(c.id)), error: null };
    }
    return { data: null, error: null };
  };
}

const mount = () =>
  render(
    <ExpenseReportDetails report={REPORT} isOpen onClose={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} currentUser={{ id: AUTHOR }} />
  );

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  h.requests.length = 0;
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('F7e S5 the report\'s detail shows its history', () => {
  it('lists the events in order under «Historial», each with who and when', async () => {
    database();
    mount();
    const section = await screen.findByTestId('expense-history');
    expect(section.textContent).toContain('Historial');
    const lines = Array.from(section.querySelectorAll('li')).map((li) => li.textContent);
    expect(lines).toEqual([
      `Enviado — Carla Prueba, ${day('2026-11-11T12:00:00Z')}`,
      `Rechazado: Falta la boleta del taxi — Andrés Revisor, ${day('2026-11-12T12:00:00Z')}`,
      `Reenviado — Carla Prueba, ${day('2026-11-13T12:00:00Z')}`,
      `Aprobado — Equipo GENERA, ${day('2026-11-14T12:00:00Z')}`,
    ]);
  });

  it('reads the history with the person\'s own session, ordered by date, and the names in one call', async () => {
    database();
    mount();
    await screen.findByTestId('expense-history');
    const read = h.requests.find((r) => r.target === 'expense_report_events')!;
    expect(opArgs(read, 'eq')).toEqual(['report_id', 'r-1']);
    expect(opArgs(read, 'order')).toEqual(['created_at', { ascending: true }]);
    const cardCalls = h.requests.filter((r) => r.kind === 'rpc' && r.target === 'get_profile_cards');
    expect(cardCalls).toHaveLength(1);
    expect((cardCalls[0].args as { p_ids: string[] }).p_ids.sort()).toEqual([ADMIN, AUTHOR].sort());
  });

  it('«Reabierto» is shown for a reopened report; an unknown person is «Equipo GENERA»', async () => {
    database({ events: [{ id: 'e9', report_id: 'r-1', event: 'reopened', actor_id: 'f7e-unknown', comment: null, created_at: '2026-11-15T12:00:00Z' }] });
    mount();
    const section = await screen.findByTestId('expense-history');
    expect(Array.from(section.querySelectorAll('li')).map((li) => li.textContent)).toEqual([
      `Reabierto — Equipo GENERA, ${day('2026-11-15T12:00:00Z')}`,
    ]);
  });

  it('no events: no section', async () => {
    database({ events: [] });
    mount();
    await waitFor(() => expect(h.requests.some((r) => r.target === 'expense_report_events')).toBe(true));
    expect(screen.queryByTestId('expense-history')).toBeNull();
    expect(screen.getByText('Viaje a Valparaíso')).toBeTruthy();
  });

  it('a read error: no section, the error is logged, the rest of the detail works', async () => {
    database({ eventsError: true });
    mount();
    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(screen.queryByTestId('expense-history')).toBeNull();
    expect(screen.getByText('Viaje a Valparaíso')).toBeTruthy();
    expect(screen.getByText('Estado y Fechas')).toBeTruthy();
  });
});
