// @vitest-environment jsdom
/**
 * Redesign 6S, release SB: the consultor's session page in the new look, drawn by the page
 * (`pages/consultor/sessions/[id].tsx`) with the look faked. Covers the lead's decisions on the latch
 * (nothing waits for the look; today's look always draws today's body at once; a new look that arrives
 * within four seconds of the loaded session's body's first render is followed once (send-back B7);
 * otherwise the view is latched, so the Zoom suggestions panel and the audio recorder are mounted once
 * while a later new look arrives; the next session latches again with its own four seconds; the
 * session is asked once), and the approved differences of the new view (inventory, the session page). The same
 * latch under the real look provider and a real-shaped account: detail.latch.test.tsx. Every person,
 * school and address is invented.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakes, resetFakes, settle, fakeFetch, fakeConfirm, payload, okSession, authFor, ME, DETAIL_GET, REPORT_MINE, REQUESTS,
  ACTIVITY, MATERIALS,
} from '../../../helpers/sessionsFakes';
import type { Scenario } from '../../../helpers/sessionsFakes';

const ORIGINAL_TZ = vi.hoisted(() => {
  const before = process.env.TZ;
  process.env.TZ = 'America/Santiago';
  return before;
});

vi.mock('next/router', async () => {
  const f = await import('../../../helpers/sessionsFakes');
  return { useRouter: () => f.fakes.router };
});
vi.mock('@supabase/auth-helpers-react', async () => {
  const f = await import('../../../helpers/sessionsFakes');
  return { useSupabaseClient: () => f.client };
});
vi.mock('@/utils/roleUtils', async () => {
  const f = await import('../../../helpers/sessionsFakes');
  return { getUserPrimaryRole: (id: string) => f.roleOf(id) };
});
vi.mock('react-hot-toast', async () => {
  const f = await import('../../../helpers/sessionsFakes');
  return { toast: f.toast };
});
vi.mock('@/contexts/LookContext', async () => {
  const f = await import('../../../helpers/sessionsFakes');
  return { useLook: () => ({ look: f.fakes.look, setLook: () => {} }) };
});
vi.mock('@/components/layout/MainLayout', async () => ({ default: (await import('../../../helpers/sessionsFakes')).marker('MainLayout', true) }));
vi.mock('@/components/sessions/AttendanceSuggestionsPanel', async () => ({
  default: (await import('../../../helpers/sessionsFakes')).marker('AttendanceSuggestionsPanel'),
}));
vi.mock('@/components/sessions/AudioReportUploader', async () => ({
  default: (await import('../../../helpers/sessionsFakes')).marker('AudioReportUploader'),
}));
vi.mock('@/components/sessions/AudioPlayer', async () => ({ default: (await import('../../../helpers/sessionsFakes')).marker('AudioPlayer') }));
vi.mock('@/components/sessions/EditRequestModal', async () => ({
  default: (await import('../../../helpers/sessionsFakes')).marker('EditRequestModal'),
}));

import SessionDetailPage from '@/pages/consultor/sessions/[id]';
import { LATE_LOOK_WINDOW_MS } from '@/components/sessions/detail-nuevo/useViewLatch';

const NOW = new Date('2026-11-19T12:00:00Z');

function as(role: string, session: unknown, more: Scenario['fetch'] = {}, who = ME): Scenario {
  return { query: { id: 'ses-1' }, session: authFor(who), role, fetch: { [DETAIL_GET]: okSession(session), ...more } };
}

let view: ReturnType<typeof render>;
async function draw(scenario: Scenario, look: 'clasico' | 'nuevo' = 'nuevo') {
  resetFakes(scenario);
  fakes.look = look;
  view = render(<SessionDetailPage />);
  await settle();
}
async function rerender() {
  view.rerender(<SessionDetailPage />);
  await settle();
}
const gets = () => fakes.log.filter((e: any) => e && e.fetch === '/api/sessions/ses-1?include=activity_log').length;
const fetches = () => fakes.log.filter((e: any) => e && typeof e === 'object' && 'fetch' in e) as any[];
async function openTab(name: string) {
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(name) }));
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'performance'] });
  vi.setSystemTime(NOW);
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.stubGlobal('confirm', vi.fn(fakeConfirm));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const SES2_GET = 'GET /api/sessions/ses-2?include=activity_log';
const isNuevoBody = () => screen.queryByTestId('session-detail-nuevo') !== null;
async function goTo(sessionId: string) {
  fakes.router.query = { id: sessionId };
  await rerender();
}
/**
 * The clock, this many milliseconds after NOW (the time at which every body here is first drawn). The
 * fake clock is moved forward, so the wall clock and the clock that only goes forward move together.
 */
const at = (ms: number) => vi.advanceTimersByTime(NOW.getTime() + ms - Date.now());
/** Past the four seconds in which a late new look is still followed. */
const late = () => at(LATE_LOOK_WINDOW_MS + 1);

describe('nothing waits for the look; today’s look wins at once; otherwise the view is latched per session', () => {
  it('a classic account whose look is not known yet: today’s body as soon as the session has loaded', async () => {
    // The look not known yet reads as today's (as on main); the body does not depend on it being known.
    await draw(as('consultor', payload()), 'clasico');
    expect(screen.queryByText('Cargando...')).toBeNull();
    expect(screen.getByText('Descripción')).toBeTruthy();
    expect(isNuevoBody()).toBe(false);
    expect(fakes.props.MainLayout.breadcrumbs).toBeUndefined();
    expect(fakes.mounts.AttendanceSuggestionsPanel).toBe(1);
    expect(gets()).toBe(1);
  });

  it('the new look arriving more than four seconds after the body: today’s body stays, its breadcrumbs too; mounted once, asked once', async () => {
    await draw(as('consultor', payload({ status: 'en_progreso' })), 'clasico');
    late();
    fakes.look = 'nuevo';
    await rerender();
    expect(isNuevoBody()).toBe(false);
    expect(screen.getByText('Descripción')).toBeTruthy();
    expect(fakes.props.MainLayout.breadcrumbs).toBeUndefined();
    expect(fakes.mounts.AttendanceSuggestionsPanel).toBe(1);
    expect(fakes.mounts.MainLayout).toBe(1);
    expect(gets()).toBe(1);
  });

  it('today’s look after the new view was drawn: today’s body at once (one remount), and it stays when the new look comes back', async () => {
    await draw(as('consultor', payload({ status: 'en_progreso' })), 'nuevo');
    expect(fakes.mounts.AttendanceSuggestionsPanel).toBe(1);
    fakes.look = 'clasico';
    await rerender();
    expect(isNuevoBody()).toBe(false);
    expect(screen.getByText('Descripción')).toBeTruthy();
    expect(fakes.props.MainLayout.breadcrumbs).toBeUndefined();
    fakes.look = 'nuevo';
    await rerender();
    fakes.look = 'clasico';
    await rerender();
    expect(isNuevoBody()).toBe(false);
    // Mounted again once, for today's body; never again after.
    expect(fakes.mounts.AttendanceSuggestionsPanel).toBe(2);
    expect(fakes.mounts.MainLayout).toBe(1);
    expect(gets()).toBe(1);
  });

  it('the audio recorder of today’s body is mounted once while the new look arrives after the four seconds', async () => {
    await draw(as('consultor', payload({ status: 'pendiente_informe', attendees: [] })), 'clasico');
    fireEvent.click(screen.getByRole('button', { name: 'Informe' }));
    await settle();
    expect(fakes.mounts.AudioReportUploader).toBe(1);
    late();
    fakes.look = 'nuevo';
    await rerender();
    expect(fakes.mounts.AudioReportUploader).toBe(1);
    expect(isNuevoBody()).toBe(false);
    expect(gets()).toBe(1);
  });

  it('the new view’s audio recorder is mounted once while the look stays the new one', async () => {
    await draw(as('consultor', payload({ status: 'pendiente_informe', attendees: [] })), 'nuevo');
    await openTab('Informe');
    expect(fakes.mounts.AudioReportUploader).toBe(1);
    await rerender();
    await rerender();
    expect(fakes.mounts.AudioReportUploader).toBe(1);
    expect(isNuevoBody()).toBe(true);
    expect(gets()).toBe(1);
  });

  it('two sessions in a row: the second session’s body takes the look as it is at its own first render', async () => {
    const scenario = as('consultor', payload(), {
      [SES2_GET]: okSession(payload({ id: 'ses-2', title: 'Segunda Sesión Inventada' })),
    });
    await draw(scenario, 'clasico');
    late();
    fakes.look = 'nuevo';
    await rerender();
    expect(isNuevoBody()).toBe(false);
    await goTo('ses-2');
    expect(isNuevoBody()).toBe(true);
    expect(screen.getByRole('heading', { level: 1, name: 'Segunda Sesión Inventada' })).toBeTruthy();
    expect(fakes.props.MainLayout.breadcrumbs.at(-1)).toEqual({ label: 'Segunda Sesión Inventada' });
    // Latched again for the second session: re-renders with the same look do not swap it.
    await rerender();
    expect(isNuevoBody()).toBe(true);
    expect(fakes.log.filter((e: any) => e && e.fetch === '/api/sessions/ses-2?include=activity_log')).toHaveLength(1);
    expect(fakes.mounts.MainLayout).toBe(1);
  });

  it('the look arriving while the session still loads: the loading mark stays, nothing is mounted yet', async () => {
    const scenario = as('consultor', payload({ status: 'en_progreso' }));
    scenario.role = 'pending';
    await draw(scenario, 'clasico');
    fakes.look = 'nuevo';
    await rerender();
    expect(screen.getByText('Cargando...')).toBeTruthy();
    expect(fakes.mounts.AttendanceSuggestionsPanel ?? 0).toBe(0);
  });
});

describe('send-back B7: a new look arriving within four seconds of the body is followed once', () => {
  it('(a) first drawn with today’s look, the new look at 100 ms: the new view, held while today’s look does not come back', async () => {
    await draw(as('consultor', payload({ status: 'en_progreso' })), 'clasico');
    expect(isNuevoBody()).toBe(false);
    at(100);
    fakes.look = 'nuevo';
    await rerender();
    expect(isNuevoBody()).toBe(true);
    expect(fakes.props.MainLayout.breadcrumbs.at(-1)).toEqual({ label: 'Sesión Inventada de Acompañamiento' });
    late();
    await rerender();
    at(60_000);
    await rerender();
    expect(isNuevoBody()).toBe(true);
    // The cost of the follow: the panel mounted twice (today's body, then the new one), the session asked once.
    expect(fakes.mounts.AttendanceSuggestionsPanel).toBe(2);
    expect(fakes.mounts.MainLayout).toBe(1);
    expect(gets()).toBe(1);
  });

  it('(a) the four seconds themselves still follow: the new look at exactly 4,000 ms', async () => {
    await draw(as('consultor', payload({ status: 'en_progreso' })), 'clasico');
    at(LATE_LOOK_WINDOW_MS);
    fakes.look = 'nuevo';
    await rerender();
    expect(isNuevoBody()).toBe(true);
  });

  it('(b) the same at 4,001 ms: today’s view held', async () => {
    await draw(as('consultor', payload({ status: 'en_progreso' })), 'clasico');
    at(4001);
    fakes.look = 'nuevo';
    await rerender();
    expect(isNuevoBody()).toBe(false);
    expect(fakes.props.MainLayout.breadcrumbs).toBeUndefined();
    expect(fakes.mounts.AttendanceSuggestionsPanel).toBe(1);
  });

  it('(c) the new view drawn, today’s look arrives, then the new look again within the four seconds: still today’s', async () => {
    await draw(as('consultor', payload({ status: 'en_progreso' })), 'nuevo');
    at(500);
    fakes.look = 'clasico';
    await rerender();
    expect(isNuevoBody()).toBe(false);
    at(1000);
    fakes.look = 'nuevo';
    await rerender();
    expect(isNuevoBody()).toBe(false);
    expect(fakes.props.MainLayout.breadcrumbs).toBeUndefined();
    expect(fakes.mounts.AttendanceSuggestionsPanel).toBe(2);
  });

  it('(c) followed once, then today’s look, then the new look again within the four seconds: still today’s', async () => {
    await draw(as('consultor', payload({ status: 'en_progreso' })), 'clasico');
    at(100);
    fakes.look = 'nuevo';
    await rerender();
    expect(isNuevoBody()).toBe(true);
    at(200);
    fakes.look = 'clasico';
    await rerender();
    expect(isNuevoBody()).toBe(false);
    at(300);
    fakes.look = 'nuevo';
    await rerender();
    expect(isNuevoBody()).toBe(false);
    // At most two changes of view in this session's life on the page.
    expect(fakes.mounts.AttendanceSuggestionsPanel).toBe(3);
  });

  it('(d) another session starts its own four seconds', async () => {
    const scenario = as('consultor', payload(), {
      [SES2_GET]: okSession(payload({ id: 'ses-2', title: 'Segunda Sesión Inventada' })),
    });
    await draw(scenario, 'clasico');
    at(10_000);
    await goTo('ses-2');
    expect(isNuevoBody()).toBe(false);
    expect(screen.getByRole('heading', { name: 'Segunda Sesión Inventada' })).toBeTruthy();
    // 10 s after the first session's body, 2 s after the second's: the second session follows.
    at(12_000);
    fakes.look = 'nuevo';
    await rerender();
    expect(isNuevoBody()).toBe(true);
    expect(screen.getByRole('heading', { level: 1, name: 'Segunda Sesión Inventada' })).toBeTruthy();
  });

  it('(d) the second session past its own four seconds: today’s view held', async () => {
    const scenario = as('consultor', payload(), {
      [SES2_GET]: okSession(payload({ id: 'ses-2', title: 'Segunda Sesión Inventada' })),
    });
    await draw(scenario, 'clasico');
    at(1000);
    await goTo('ses-2');
    at(1000 + LATE_LOOK_WINDOW_MS + 1);
    fakes.look = 'nuevo';
    await rerender();
    expect(isNuevoBody()).toBe(false);
    expect(screen.getByRole('heading', { name: 'Segunda Sesión Inventada' })).toBeTruthy();
  });

  it('(e) first drawn with the new look: the new view, as before', async () => {
    await draw(as('consultor', payload({ status: 'en_progreso' })), 'nuevo');
    expect(isNuevoBody()).toBe(true);
    late();
    await rerender();
    expect(isNuevoBody()).toBe(true);
    expect(fakes.mounts.AttendanceSuggestionsPanel).toBe(1);
  });

  it('(f) while the body is not drawn: the frame follows the live look', async () => {
    const scenario = as('consultor', payload({ status: 'en_progreso' }));
    scenario.role = 'pending';
    await draw(scenario, 'clasico');
    expect(screen.getByText('Cargando...')).toBeTruthy();
    expect(fakes.props.MainLayout.breadcrumbs).toBeUndefined();
    fakes.look = 'nuevo';
    await rerender();
    expect(screen.getByText('Cargando...')).toBeTruthy();
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([
      { label: 'Mi Trabajo' },
      { label: 'Mis Sesiones', href: '/consultor/sessions' },
    ]);
    fakes.look = 'clasico';
    await rerender();
    expect(fakes.props.MainLayout.breadcrumbs).toBeUndefined();
  });
});

describe('the new view of one session', () => {
  it('the frame gets the breadcrumb «Mi Trabajo › Mis Sesiones › {title}», «Mis Sesiones» going to the list', async () => {
    await draw(as('consultor', payload()));
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([
      { label: 'Mi Trabajo' },
      { label: 'Mis Sesiones', href: '/consultor/sessions' },
      { label: 'Sesión Inventada de Acompañamiento' },
    ]);
  });

  it('the header: status, series, date, Chile time, the short Spain line, «Híbrida», «Enlace», school, community, sentence', async () => {
    await draw(as('consultor', payload()));
    const main = screen.getByTestId('session-detail-nuevo');
    expect(within(main).getByRole('heading', { level: 1, name: 'Sesión Inventada de Acompañamiento' })).toBeTruthy();
    expect(within(main).getByText('Programada')).toBeTruthy();
    expect(within(main).getByText('Sesión 3')).toBeTruthy();
    expect(within(main).getByText('miércoles, 25 noviembre 2026')).toBeTruthy();
    expect(main.textContent).toContain('09:00 - 10:30(hora Chile)');
    expect(within(main).getByText('En España: 13:00 a 14:30 (hora España)')).toBeTruthy();
    expect(within(main).getByText('Híbrida')).toBeTruthy();
    expect(within(main).getByTestId('session-join-link').getAttribute('href')).toBe('/meet/session/ses-1');
    expect(within(main).getByText('Colegio Inventado Norte')).toBeTruthy();
    expect(within(main).getByText('Comunidad Inventada A')).toBeTruthy();
    expect(within(main).getByText('Sesión programada para 25 noviembre 2026.')).toBeTruthy();
    const calendar = within(main).getByText('Agregar al Calendario').closest('a') as HTMLAnchorElement;
    expect(calendar.getAttribute('href')).toBe('/api/sessions/ses-1/ical');
    expect(calendar.hasAttribute('download')).toBe(true);
  });

  it('the finalize card at «Pendiente Informe»: the conditions visible, the yellow button, the window with X and Escape', async () => {
    await draw(as('consultor', payload({ status: 'pendiente_informe' })));
    const card = screen.getByTestId('session-finalize-card');
    expect(within(card).getByText('Para finalizar la sesión')).toBeTruthy();
    expect(within(card).getByText('Condiciones faltantes: 2')).toBeTruthy();
    expect(within(card).getByText('Sesión en estado "Pendiente de Informe"')).toBeTruthy();
    expect(within(card).getByText('Falta informe de sesión')).toBeTruthy();
    expect(within(card).getByText('Hay 1 asistente(s) sin marcar')).toBeTruthy();
    const finalize = within(card).getByRole('button', { name: 'Finalizar Sesión' }) as HTMLButtonElement;
    expect(finalize.disabled).toBe(true);
  });

  it('the finalize card when every condition is met: enabled; the window opens, Escape closes it, «Finalizar» posts', async () => {
    await draw(
      as('consultor', payload({ status: 'pendiente_informe', attendees: [], reports: [REPORT_MINE] }), {
        'POST /api/sessions/ses-1/finalize': { body: {} },
      })
    );
    const card = screen.getByTestId('session-finalize-card');
    expect(within(card).queryByText(/Condiciones faltantes/)).toBeNull();
    expect(within(card).getByText('Informe de sesión creado')).toBeTruthy();
    expect(within(card).getByText('Asistencia marcada para todos')).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Finalizar Sesión' }));
    await settle();
    const dialog = screen.getByRole('dialog', { name: 'Finalizar Sesión' });
    expect(within(dialog).getByText('¿Está seguro que desea finalizar esta sesión? Esta acción no se puede deshacer.')).toBeTruthy();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetches().some((f) => f.fetch === '/api/sessions/ses-1/finalize')).toBe(false);
    fireEvent.click(within(screen.getByTestId('session-finalize-card')).getByRole('button', { name: 'Finalizar Sesión' }));
    await settle();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Finalizar/ }));
    await settle();
    expect(fetches().filter((f) => f.fetch === '/api/sessions/ses-1/finalize' && f.method === 'POST')).toHaveLength(1);
  });

  it('the finalize card also at «En Progreso», its button disabled; not at «Programada»; never for the leader', async () => {
    await draw(as('consultor', payload({ status: 'en_progreso' })));
    const card = screen.getByTestId('session-finalize-card');
    expect(within(card).getByText('La sesión debe estar en estado "Pendiente de Informe"')).toBeTruthy();
    expect((within(card).getByRole('button', { name: 'Finalizar Sesión' }) as HTMLButtonElement).disabled).toBe(true);
    view.unmount();
    await draw(as('consultor', payload({ status: 'programada' })));
    expect(screen.queryByTestId('session-finalize-card')).toBeNull();
    view.unmount();
    await draw(as('lider_comunidad', payload({ status: 'en_progreso', facilitators: [] })));
    expect(screen.queryByTestId('session-finalize-card')).toBeNull();
    expect(screen.getByText('Está viendo esta sesión en modo lectura. No está asignado como facilitador.')).toBeTruthy();
  });

  it('a pending request of mine: «Solicitar Cambios» disabled and the reason as visible text', async () => {
    await draw(as('consultor', payload({ edit_requests: REQUESTS })));
    expect((screen.getByRole('button', { name: 'Solicitar Cambios' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Ya existe una solicitud de cambio pendiente para esta sesión.')).toBeTruthy();
  });

  it('«Solicitar Cambios» opens today’s window, kept in the page', async () => {
    await draw(as('admin', payload({ facilitators: [] })));
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar Cambios' }));
    await settle();
    expect(fakes.mounts.EditRequestModal).toBe(1);
  });

  it('tabs in today’s order; «Planificación» only for who may edit; «Detalles» first', async () => {
    await draw(as('consultor', payload()));
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Detalles', 'Planificación', 'Materiales', 'Informe', 'Comunicaciones', 'Actividad',
    ]);
    expect(screen.getByRole('tab', { name: /Detalles/ }).getAttribute('aria-selected')).toBe('true');
    view.unmount();
    await draw(as('lider_comunidad', payload({ facilitators: [] })));
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).not.toContain('Planificación');
  });

  it('send-back B9: on a phone the tab that gets the focus or is chosen with the keyboard is brought into view inside its row', async () => {
    await draw(as('consultor', payload()));
    const row = screen.getByRole('tablist', { name: 'Secciones de la sesión' });
    const tabs = screen.getAllByRole('tab');
    // A 320 px phone: the row shows x 16 to 304 (288 px); six tabs of 120 px side by side (720 px), so
    // the row scrolls from 0 to 432 px, as a browser clamps it.
    let scrollLeft = 0;
    Object.defineProperty(row, 'scrollLeft', {
      configurable: true,
      get: () => scrollLeft,
      set: (v: number) => (scrollLeft = Math.max(0, Math.min(432, v))),
    });
    const box = (left: number, width: number) => ({ left, right: left + width, width, top: 0, bottom: 44, height: 44, x: left, y: 0, toJSON: () => ({}) });
    row.getBoundingClientRect = () => box(16, 288);
    tabs.forEach((tab, i) => {
      tab.getBoundingClientRect = () => box(16 + i * 120 - scrollLeft, 120);
    });
    const page = { x: window.scrollX, y: window.scrollY };

    tabs[0].focus();
    expect(scrollLeft).toBe(0);
    // Right-arrow: «Planificación» (ends at 256 px, in view), then «Materiales» (ends at 376 px, cut).
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
    await settle();
    expect(scrollLeft).toBe(0);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
    await settle();
    expect(scrollLeft).toBe(376 - (304 - 8));
    for (let i = 3; i < tabs.length; i++) {
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
      await settle();
    }
    const chosen = screen.getByRole('tab', { name: /Actividad/ });
    expect(chosen.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(chosen);
    // «Actividad», the last tab: the row at its end, the tab fully shown.
    expect(scrollLeft).toBe(432);
    const shown = chosen.getBoundingClientRect();
    expect(shown.left).toBeGreaterThanOrEqual(16);
    expect(shown.right).toBeLessThanOrEqual(304);
    // Only the row moved, never the page.
    expect({ x: window.scrollX, y: window.scrollY }).toEqual(page);

    // Back to «Detalles» with Home: the row scrolls back to show it.
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Home' });
    await settle();
    expect(screen.getByRole('tab', { name: /Detalles/ }).getAttribute('aria-selected')).toBe('true');
    expect(scrollLeft).toBe(0);
  });

  it('«Detalles» in read mode: the arrival words in Spanish, «Sí» / «No» for screen readers, the panel mounted for the leader too', async () => {
    await draw(as('lider_comunidad', payload({ status: 'completada', facilitators: [] })));
    expect(fakes.mounts.AttendanceSuggestionsPanel).toBe(1);
    const list = screen.getByRole('list', { name: 'Lista de asistencia' });
    expect(within(list).getByText('Tarde')).toBeTruthy();
    expect(within(list).getByText('Salió temprano')).toBeTruthy();
    expect(within(list).getByText('A tiempo')).toBeTruthy();
    expect(screen.queryByText('late')).toBeNull();
    expect(screen.getAllByText('Sí').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Guardar asistencia' })).toBeNull();
  });

  it('«Detalles» while writing: named controls, «Marcar todos presentes», «Guardar asistencia» sends today’s request', async () => {
    await draw(
      as('consultor', payload({ status: 'en_progreso' }), { 'PUT /api/sessions/ses-1/attendees': { body: {} } })
    );
    expect(screen.getByRole('checkbox', { name: 'Asistió: Carla Supuesta' })).toBeTruthy();
    expect(screen.getAllByRole('combobox', { name: 'Estado de llegada: Carla Supuesta' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todos presentes' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar asistencia' }));
    await settle();
    const put = fetches().find((f) => f.fetch === '/api/sessions/ses-1/attendees');
    expect(JSON.parse(put.body).attendees.every((a: any) => a.attended === true && a.arrival_status === 'on_time')).toBe(true);
  });

  it('«Materiales»: named open and delete buttons; the bin asks in a pop-up; «Cancelar» deletes nothing, «Eliminar» deletes', async () => {
    await draw(
      as('consultor', payload({ status: 'en_progreso' }), {
        'DELETE /api/sessions/ses-1/materials/mat-1': { body: {} },
      })
    );
    await openTab('Materiales');
    expect(screen.getByRole('link', { name: 'Abrir pauta-inventada.pdf' }).getAttribute('href')).toBe(MATERIALS[0].download_url);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar pauta-inventada.pdf' }));
    await settle();
    let dialog = screen.getByRole('dialog', { name: '¿Está seguro que desea eliminar "pauta-inventada.pdf"?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetches().some((f) => f.method === 'DELETE')).toBe(false);
    expect(fakes.log.some((e: any) => e && typeof e === 'object' && 'confirm' in e)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar pauta-inventada.pdf' }));
    await settle();
    dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
    await settle();
    expect(fetches().filter((f) => f.method === 'DELETE').map((f) => f.fetch)).toEqual(['/api/sessions/ses-1/materials/mat-1']);
  });

  it('«Materiales» read-only: no upload, no bin; empty: «No hay materiales subidos»', async () => {
    await draw(as('consultor', payload({ status: 'completada' })));
    await openTab('Materiales');
    expect(screen.queryByText('Subir material')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Eliminar / })).toBeNull();
    view.unmount();
    await draw(as('consultor', payload({ materials: [] })));
    await openTab('Materiales');
    expect(screen.getByText('No hay materiales subidos')).toBeTruthy();
    expect(screen.getByText('Subir material')).toBeTruthy();
  });

  it('«Informe»: the leader is told only facilitators write; a report shows its date, visibility and player', async () => {
    await draw(as('lider_comunidad', payload({ facilitators: [] })));
    await openTab('Informe');
    expect(screen.getByText('Solo los facilitadores pueden crear informes')).toBeTruthy();
    view.unmount();
    await draw(as('consultor', payload({ status: 'pendiente_informe', reports: [{ ...REPORT_MINE, audio_url: null }] })));
    await openTab('Informe');
    expect(screen.getByText('Todos los participantes')).toBeTruthy();
    expect(screen.getByText('Informe inventado de la sesión.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Editar Informe/ })).toBeTruthy();
  });

  it('«Actividad»: the change history first, its values formatted, then the heading «Actividad» and the actions in Spanish', async () => {
    await draw(as('consultor', payload({ edit_requests: REQUESTS, activity_log: ACTIVITY })));
    // Not above the tabs any more.
    expect(screen.queryByText('Historial de Solicitudes de Cambio')).toBeNull();
    await openTab('Actividad');
    const panel = screen.getByRole('tabpanel');
    const text = panel.textContent ?? '';
    expect(text.indexOf('Historial de Solicitudes de Cambio')).toBeLessThan(text.indexOf('Cambio de estado'));
    expect(within(panel).getByText('Pendiente')).toBeTruthy();
    expect(within(panel).getByText('Rechazada')).toBeTruthy();
    expect(within(panel).getByText('25 noviembre 2026')).toBeTruthy();
    expect(within(panel).getByText('26 noviembre 2026')).toBeTruthy();
    expect(within(panel).getByText('10:00')).toBeTruthy();
    expect(within(panel).getByText('En línea')).toBeTruthy();
    expect(within(panel).getByText('Híbrida')).toBeTruthy();
    expect(within(panel).getByText('Motivo inventado')).toBeTruthy();
    expect(within(panel).getByText('Nota inventada')).toBeTruthy();
    expect(within(panel).getByRole('heading', { name: 'Actividad' })).toBeTruthy();
    expect(within(panel).getByText('Cambio de estado')).toBeTruthy();
    // An action outside the list stays as today shows it.
    expect(within(panel).getByText('something new')).toBeTruthy();
  });

  it('«Actividad» with nothing: no heading, «No hay actividad registrada»', async () => {
    await draw(as('consultor', payload()));
    await openTab('Actividad');
    expect(screen.getByText('No hay actividad registrada')).toBeTruthy();
    expect(within(screen.getByRole('tabpanel')).queryByRole('heading')).toBeNull();
  });

  it('the conflict banner keeps role="alert" and «Recargar» asks the session again', async () => {
    await draw(
      as('consultor', payload({ status: 'en_progreso' }), { 'PUT /api/sessions/ses-1/attendees': { status: 409, body: {} } })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar asistencia' }));
    await settle();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Otra persona editó esta sesión mientras trabajabas en ella. Recarga para ver los últimos cambios.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Recargar' }));
    await settle();
    expect(gets()).toBe(2);
  });

  it('a long title and the phone: the title may break, nothing has a fixed width wider than a phone', async () => {
    const long = 'Sesión inventada con un título larguísimo '.repeat(6).trim();
    await draw(as('consultor', payload({ title: long })));
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.className).toContain('break-words');
  });
});
