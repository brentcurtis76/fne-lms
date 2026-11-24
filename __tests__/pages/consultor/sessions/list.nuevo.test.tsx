// @vitest-environment jsdom
/**
 * Redesign 6S, release SB: «Mis Sesiones» in the new look, drawn by the page
 * (`pages/consultor/sessions/index.tsx`) with the look faked. The approved differences (inventory, the
 * list): two tabs with counts; agenda rows that are links, reachable by keyboard and named «Ver detalles
 * de {title}», grouped «Esta semana» / «Próximas» / «Pasadas», «Hoy» on today's rows; «Otras…» rows
 * not dimmed; own «Pendiente Informe» / «En Progreso» rows saying what they need in today's helper
 * words; «Exportar Calendario» in the header; «Cargar más» an outline button. Every person, school and
 * address is invented.
 */
import React from 'react';
import { act, fireEvent, render, screen, within, cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, resetFakes, settle, fakeFetch, authFor } from '../../../helpers/sessionsFakes';
import type { Scenario } from '../../../helpers/sessionsFakes';
import { NOW, ROWS, row, listScenario, sessionsAddress } from '../../../helpers/sessionsListFixtures';
import { buttonClasses } from '@/components/ui/kit';

const ORIGINAL_TZ = vi.hoisted(() => {
  const before = process.env.TZ;
  process.env.TZ = 'UTC';
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
vi.mock('@/components/tutorials/HelpButton', async () => ({ default: (await import('../../../helpers/sessionsFakes')).marker('HelpButton') }));

import ConsultorSessionsPage from '@/pages/consultor/sessions/index';

async function draw(scenario: Scenario, look: 'clasico' | 'nuevo' = 'nuevo') {
  cleanup();
  resetFakes(scenario);
  fakes.look = look;
  const view = render(<ConsultorSessionsPage />);
  await settle();
  return view;
}
const pushes = () => fakes.log.filter((e: any) => e && typeof e === 'object' && 'router.push' in e).map((e: any) => e['router.push']);
const panel = () => screen.getByRole('tabpanel');
const rowTitles = (within_: HTMLElement) =>
  Array.from(within_.querySelectorAll('a[aria-label^="Ver detalles de "]')).map((a) => a.getAttribute('aria-label')!.slice('Ver detalles de '.length));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('arriving', () => {
  it('a classic account whose look is not known yet: today’s body as soon as the list has loaded, nothing waits', async () => {
    // The look not known yet reads as today's (as on main): the body is drawn when the hook's loading ends.
    await draw(listScenario(), 'clasico');
    expect(screen.queryByText('Cargando...')).toBeNull();
    expect(screen.getByText('Total Sesiones')).toBeTruthy();
    expect(screen.queryByTestId('sessions-list-nuevo')).toBeNull();
    expect(fakes.props.MainLayout.breadcrumbs).toBeUndefined();
  });

  it('while the list loads: today’s loading mark in both looks, whatever the look', async () => {
    const pending = listScenario();
    pending.role = 'pending';
    await draw(pending, 'clasico');
    expect(screen.getByText('Cargando...')).toBeTruthy();
    await draw(pending, 'nuevo');
    expect(screen.getByText('Cargando...')).toBeTruthy();
    expect(screen.queryByTestId('sessions-list-nuevo')).toBeNull();
  });

  it('the list follows the live look, as Mi Panel does: a look arriving later swaps the view, the frame stays', async () => {
    const view = await draw(listScenario(), 'clasico');
    expect(screen.getByText('Total Sesiones')).toBeTruthy();
    fakes.look = 'nuevo';
    view.rerender(<ConsultorSessionsPage />);
    await settle();
    expect(screen.getByTestId('sessions-list-nuevo')).toBeTruthy();
    fakes.look = 'clasico';
    view.rerender(<ConsultorSessionsPage />);
    await settle();
    expect(screen.queryByTestId('sessions-list-nuevo')).toBeNull();
    expect(fakes.mounts.MainLayout).toBe(1);
    expect(fakes.log.filter((e: any) => e && typeof e === 'object' && 'fetch' in e)).toHaveLength(1);
  });

  it('the frame’s breadcrumb «Mi Trabajo › Mis Sesiones»; the header: title, line, help, «Exportar Calendario»', async () => {
    await draw(listScenario());
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([{ label: 'Mi Trabajo' }, { label: 'Mis Sesiones' }]);
    expect(screen.getByRole('heading', { level: 1, name: 'Mis Sesiones' })).toBeTruthy();
    expect(screen.getByText('Vista de sesiones de consultoría asignadas')).toBeTruthy();
    expect(fakes.props.HelpButton.sectionId).toBe('mis-sesiones');
    const exportLink = screen.getByText('Exportar Calendario').closest('a') as HTMLAnchorElement;
    expect(exportLink.getAttribute('href')).toBe('/api/sessions/ical?');
    expect(exportLink.hasAttribute('download')).toBe(true);
    expect(exportLink.className).toBe(buttonClasses({ variant: 'outline' }));
    expect(exportLink.closest('header')).toBeTruthy();
  });

  it('the three numbers', async () => {
    await draw(listScenario({}, ROWS, 42));
    expect(screen.getByText('Total Sesiones').nextElementSibling?.textContent).toBe('42');
    expect(screen.getByText('Informes Pendientes').nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText('Próxima Sesión').nextElementSibling?.textContent).toBe('Hoy a las 15:00');
  });
});

describe('the two tabs', () => {
  it('«Mis Sesiones» and «Otras Sesiones en Mis Colegios», each with its count; mine first', async () => {
    await draw(listScenario());
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Mis Sesiones 7', 'Otras Sesiones en Mis Colegios 1']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(rowTitles(panel())).not.toContain('Otra inventada');
    fireEvent.click(tabs[1]);
    await settle();
    expect(rowTitles(panel())).toEqual(['Otra inventada']);
  });

  it('the empty sentences', async () => {
    // None of mine, one other: the list opens on «Otras…» (B6); «Mis Sesiones» says it has none.
    await draw(listScenario({}, [row({ id: 's-otra', title: 'Otra inventada', session_facilitators: [{ user_id: 'nadie' }] })]));
    expect(rowTitles(panel())).toEqual(['Otra inventada']);
    fireEvent.click(screen.getAllByRole('tab')[0]);
    await settle();
    expect(within(panel()).getByText('No está asignado como facilitador en ninguna sesión')).toBeTruthy();
    await draw(listScenario({}, [row()]));
    fireEvent.click(screen.getAllByRole('tab')[1]);
    await settle();
    expect(within(panel()).getByText('No hay otras sesiones en sus colegios asignados')).toBeTruthy();
  });
});

describe('the rows', () => {
  it('grouped «Esta semana» (ascending), «Próximas» (ascending), «Pasadas» (newest first)', async () => {
    await draw(listScenario());
    const groups = Array.from(panel().querySelectorAll('section')).map((section) => ({
      title: section.querySelector('h3')!.firstChild!.textContent,
      rows: rowTitles(section as HTMLElement),
    }));
    expect(groups).toEqual([
      { title: 'Esta semana', rows: ['Lunes inventada', 'Hoy inventada', 'Domingo inventada'] },
      { title: 'Próximas', rows: ['Próxima temprana', 'Próxima tardía'] },
      { title: 'Pasadas', rows: ['Pasada reciente', 'Pasada antigua'] },
    ]);
  });

  it('a row is a real link named «Ver detalles de {title}»; a click goes where today’s card goes', async () => {
    await draw(listScenario());
    const link = screen.getByRole('link', { name: 'Ver detalles de Hoy inventada' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/consultor/sessions/s-hoy');
    link.focus();
    expect(document.activeElement).toBe(link);
    fireEvent.click(link);
    await settle();
    expect(pushes()).toEqual([['/consultor/sessions/s-hoy']]);
    // A click that asks for a new tab is left to the browser.
    fireEvent.click(link, { ctrlKey: true });
    await settle();
    expect(pushes()).toHaveLength(1);
  });

  it('what a row shows: date mark with «Hoy», title, series, times, modality, status, ledger outcome, school, community', async () => {
    await draw(listScenario());
    const today = screen.getByRole('link', { name: 'Ver detalles de Hoy inventada' });
    expect(today.textContent).toContain('Hoy');
    expect(today.textContent).toContain('15:00 - 16:00(Chile)');
    expect(within(today).getByText('En Progreso')).toBeTruthy();
    expect(within(today).getByText('Colegio Inventado Norte')).toBeTruthy();
    expect(within(today).getByText('Comunidad Inventada A')).toBeTruthy();
    const monday = screen.getByRole('link', { name: 'Ver detalles de Lunes inventada' });
    expect(monday.textContent).toMatch(/^lun16nov/);
    expect(within(monday).getByText('#2')).toBeTruthy();
    const cancelled = screen.getByRole('link', { name: 'Ver detalles de Pasada reciente' });
    expect(within(cancelled).getByText('Cancelada')).toBeTruthy();
    expect(within(cancelled).getByText('Penalizada')).toBeTruthy();
    expect(within(cancelled).getByText('Admin')).toBeTruthy();
  });

  it('own «En Progreso» and «Pendiente Informe» rows say what they need in today’s words; others’ rows do not', async () => {
    await draw(listScenario());
    expect(within(screen.getByRole('link', { name: 'Ver detalles de Hoy inventada' })).getByText('Sesión en curso.')).toBeTruthy();
    expect(
      within(screen.getByRole('link', { name: 'Ver detalles de Lunes inventada' })).getByText(
        'Sesión finalizada. Debe completar el informe y la asistencia.'
      )
    ).toBeTruthy();
    fireEvent.click(screen.getAllByRole('tab')[1]);
    await settle();
    const other = screen.getByRole('link', { name: 'Ver detalles de Otra inventada' });
    expect(other.textContent).not.toContain('Debe completar');
    // Not dimmed any more.
    expect(other.className).not.toMatch(/opacity/);
  });
});

describe('export, more, filters', () => {
  it('«Exportar Calendario» only while sessions are loaded; «Cargar más» an outline button while loaded < total', async () => {
    await draw(listScenario({}, [], 0));
    expect(screen.queryByText('Exportar Calendario')).toBeNull();
    expect(screen.queryByText('Cargar más')).toBeNull();
    await draw(listScenario({}, ROWS, 30));
    const more = screen.getByRole('button', { name: 'Cargar más' });
    expect(more.className).toBe(buttonClasses({ variant: 'outline' }));
  });

  it('the filters carry today’s labels and options and the export address follows them', async () => {
    const scenario = listScenario({ query: { status: 'programada' } });
    scenario.fetch![sessionsAddress({ status: 'programada' })] = { body: { data: { sessions: ROWS, total: ROWS.length } } };
    await draw(scenario);
    const status = screen.getByLabelText('Filtrar por estado') as HTMLSelectElement;
    expect(status.value).toBe('programada');
    expect(Array.from(status.options).map((o) => o.textContent)).toEqual([
      'Todos', 'Borrador', 'Pendiente Aprobación', 'Programada', 'En Progreso', 'Pendiente Informe', 'Completada', 'Cancelada',
    ]);
    expect(screen.getByLabelText('Filtrar por colegio')).toBeTruthy();
    expect(screen.getByLabelText('Fecha desde')).toBeTruthy();
    expect(screen.getByLabelText('Fecha hasta')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeTruthy();
    expect(screen.getByText('Exportar Calendario').closest('a')!.getAttribute('href')).toBe('/api/sessions/ical?status=programada');
  });
});

// ── B6: the by-sight check of the new list. ──

const tabs = () => screen.getAllByRole('tab');
const selectedTab = () => tabs().find((t) => t.getAttribute('aria-selected') === 'true')?.textContent ?? null;
const ADMIN = () => listScenario({ role: 'admin', session: authFor('admin-inventado') });

describe('B6 1: the tab the list opens on', () => {
  it('admin-like data (none of mine, some others) opens on «Otras Sesiones en Mis Colegios»', async () => {
    await draw(ADMIN());
    expect(selectedTab()).toBe(`Otras Sesiones en Mis Colegios ${ROWS.length}`);
    expect(rowTitles(panel())).toHaveLength(ROWS.length);
  });

  it('data with some of mine opens on «Mis Sesiones»', async () => {
    await draw(listScenario());
    expect(selectedTab()).toBe('Mis Sesiones 7');
  });

  it('both empty opens on «Mis Sesiones» with its empty sentence', async () => {
    await draw(listScenario({}, [], 0));
    expect(selectedTab()).toBe('Mis Sesiones 0');
    expect(within(panel()).getByText('No está asignado como facilitador en ninguna sesión')).toBeTruthy();
  });

  it('after the person presses a tab, new data does not move them', async () => {
    const scenario = ADMIN();
    const othersOnly = ROWS.slice(0, 3);
    scenario.fetch![sessionsAddress({ status: 'programada' })] = { body: { data: { sessions: othersOnly, total: 3 } } };
    await draw(scenario);
    expect(selectedTab()).toMatch(/^Otras/);
    fireEvent.click(tabs()[0]);
    await settle();
    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'programada' } });
    await settle();
    expect(tabs()[1].textContent).toBe('Otras Sesiones en Mis Colegios 3');
    expect(selectedTab()).toBe('Mis Sesiones 0');
  });

  it('decided once: a later filter change that empties «Mis Sesiones» does not move the person', async () => {
    const scenario = listScenario();
    scenario.fetch![sessionsAddress({ status: 'pendiente_informe' })] = {
      body: { data: { sessions: [ROWS[ROWS.length - 1]], total: 1 } },
    };
    await draw(scenario);
    expect(selectedTab()).toBe('Mis Sesiones 7');
    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'pendiente_informe' } });
    await settle();
    expect(tabs()[1].textContent).toBe('Otras Sesiones en Mis Colegios 1');
    expect(selectedTab()).toBe('Mis Sesiones 0');
  });

  it('data that arrives in two steps does not flash: no tab and no panel until the answer, then «Otras…»', async () => {
    let answer: (value: unknown) => void = () => {};
    const late = new Promise((resolve) => {
      answer = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: any) => (url.startsWith('/api/sessions?') ? late : fakeFetch(url, init)))
    );
    await draw(ADMIN());
    // The view is drawn while the sessions' first answer is pending.
    expect(screen.getByTestId('sessions-list-nuevo')).toBeTruthy();
    expect(selectedTab()).toBeNull();
    expect(screen.queryByRole('tabpanel')).toBeNull();
    expect(screen.queryByText('No está asignado como facilitador en ninguna sesión')).toBeNull();
    answer({ ok: true, status: 200, json: () => Promise.resolve({ data: { sessions: ROWS, total: ROWS.length } }) });
    await settle();
    expect(selectedTab()).toBe(`Otras Sesiones en Mis Colegios ${ROWS.length}`);
    expect(rowTitles(panel())).toHaveLength(ROWS.length);
  });

  it('a tab pressed before the answer is kept when the answer comes', async () => {
    let answer: (value: unknown) => void = () => {};
    const late = new Promise((resolve) => {
      answer = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: any) => (url.startsWith('/api/sessions?') ? late : fakeFetch(url, init)))
    );
    await draw(ADMIN());
    fireEvent.click(tabs()[0]);
    await settle();
    answer({ ok: true, status: 200, json: () => Promise.resolve({ data: { sessions: ROWS, total: ROWS.length } }) });
    await settle();
    expect(selectedTab()).toBe('Mis Sesiones 0');
  });
});

/**
 * Send-back B8: the four seconds and the opening tab against presses and late answers, on fake timers
 * (the clock and the timeouts are moved by hand; nothing really waits). A tab pressed after the answer
 * and kept through a filter change is proved above: «after the person presses a tab, new data does not
 * move them».
 */
describe('B8: the opening tab on fake timers', () => {
  let answer: (value: unknown) => void = () => {};
  /** The sessions' first answer stays pending until `answer` is called; every other call as before. */
  function pendingFirstAnswer() {
    const late = new Promise((resolve) => {
      answer = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: any) => (url.startsWith('/api/sessions?') ? late : fakeFetch(url, init)))
    );
  }
  /** As `settle`, with the timeouts faked: pending promises and due timeouts run, the clock does not move. */
  async function flush() {
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    }
  }
  async function wait(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
    await flush();
  }
  async function drawFaked(scenario: Scenario) {
    cleanup();
    resetFakes(scenario);
    fakes.look = 'nuevo';
    render(<ConsultorSessionsPage />);
    await flush();
  }
  const sessionsAnswer = () => ({ ok: true, status: 200, json: () => Promise.resolve({ data: { sessions: ROWS, total: ROWS.length } }) });

  beforeEach(() => {
    // The outer fake clock fakes only `Date`; installed again here with the timeouts as well. The test
    // runner's own timers were started before, so they are cleared by the real `clearTimeout`.
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldClearNativeTimers: true });
    vi.setSystemTime(NOW);
    pendingFirstAnswer();
  });

  it('(a) no answer for 4,000 ms: «Mis Sesiones»; an answer arriving later with only «Otras…» rows does not move it', async () => {
    await drawFaked(ADMIN());
    expect(screen.getByTestId('sessions-list-nuevo')).toBeTruthy();
    await wait(3999);
    expect(selectedTab()).toBeNull();
    expect(screen.queryByRole('tabpanel')).toBeNull();
    await wait(1);
    expect(selectedTab()).toBe('Mis Sesiones 0');
    answer(sessionsAnswer());
    await flush();
    expect(tabs()[1].textContent).toBe(`Otras Sesiones en Mis Colegios ${ROWS.length}`);
    expect(selectedTab()).toBe('Mis Sesiones 0');
    expect(within(panel()).getByText('No está asignado como facilitador en ninguna sesión')).toBeTruthy();
  });

  it('(b) a tab pressed while the first answer is pending is kept through the four seconds and the answer', async () => {
    // With these rows the list would open on «Mis Sesiones», and so would the four seconds' fallback.
    await drawFaked(listScenario());
    expect(selectedTab()).toBeNull();
    fireEvent.click(tabs()[1]);
    await flush();
    expect(selectedTab()).toMatch(/^Otras/);
    await wait(4000);
    expect(selectedTab()).toMatch(/^Otras/);
    answer(sessionsAnswer());
    await flush();
    expect(tabs().map((t) => t.textContent)).toEqual(['Mis Sesiones 7', 'Otras Sesiones en Mis Colegios 1']);
    expect(selectedTab()).toBe('Otras Sesiones en Mis Colegios 1');
  });
});

describe('B6 2: on a phone the tab row wraps (class level; the widths themselves are judged in pictures)', () => {
  it('the row may wrap and each tab may break its words below 640 px; from 640 px the kit’s row as before', async () => {
    await draw(listScenario());
    const row_ = screen.getByRole('tablist');
    expect(row_.className.split(' ')).toContain('max-sm:flex-wrap');
    for (const tab of tabs()) {
      expect(tab.className.split(' ').filter((c) => c.startsWith('max-sm:'))).toEqual(['max-sm:max-w-full', 'max-sm:whitespace-normal']);
    }
    expect(row_.className.split(' ').filter((c) => c.startsWith('max-sm:'))).toEqual(['max-sm:flex-wrap']);
    expect(tabs().map((t) => t.textContent)).toEqual(['Mis Sesiones 7', 'Otras Sesiones en Mis Colegios 1']);
  });
});

describe('B6 3: the year in the date mark', () => {
  it('a row of another year shows the four-digit year; a row of this year looks as before', async () => {
    await draw(
      listScenario({}, [
        row({ id: 's-2030', title: 'Futura inventada', session_date: '2030-04-02' }),
        row({ id: 's-2025', title: 'Antigua inventada', session_date: '2025-10-01', status: 'completada' }),
        row({ id: 's-este', title: 'Este año inventada', session_date: '2026-11-16' }),
      ])
    );
    const mark = (title: string) =>
      screen.getByRole('link', { name: `Ver detalles de ${title}` }).querySelector('[aria-hidden="true"]')!.textContent;
    expect(mark('Futura inventada')).toBe('mar02abr203015:00');
    expect(mark('Antigua inventada')).toBe('mié01oct202515:00');
    expect(mark('Este año inventada')).toBe('lun16nov15:00');
  });
});
