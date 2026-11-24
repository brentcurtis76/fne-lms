// @vitest-environment jsdom
/**
 * Redesign 6, release SB: the new look's form «Programar Sesión» (`components/sessions/SessionCreateNuevo.tsx`),
 * drawn by `pages/admin/sessions/create.tsx` when `useLook()` answers `nuevo` (scenarios sb.md, Part D).
 *
 * The real page and the real hook are rendered; everything outside the page is faked
 * (`sessionCreateFakes.tsx`). The cases hold: the arrival in the frame (loading and refusal inside it);
 * today's fields, names, ids, testids and words; the three approved behaviour changes (all the checks
 * at once with no toast and no request; Enter opens the pop-up, a text area makes a line, every other
 * button is `type="button"`; the drafts notice only when the creation was answered ok and read and the
 * approval then failed); the server's refusal of a half-chosen hours pair under the two selects; the
 * consultants block; the look swapping under a filled form. Invented data only.
 */
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/router', async () => (await import('./sessionCreateFakes')).routerModule());
vi.mock('next/link', async () => (await import('./sessionCreateFakes')).linkModule());
vi.mock('@supabase/auth-helpers-react', async () => (await import('./sessionCreateFakes')).authHelpersModule());
vi.mock('@/utils/roleUtils', async (importOriginal) =>
  (await import('./sessionCreateFakes')).roleUtilsModule(await importOriginal())
);
vi.mock('react-hot-toast', async () => (await import('./sessionCreateFakes')).toastModule());
vi.mock('@/contexts/LookContext', async () => (await import('./sessionCreateFakes')).lookModule());
vi.mock('@/components/layout/MainLayout', async () => (await import('./sessionCreateFakes')).layoutModule());
vi.mock('@/components/layout/FunctionalPageHeader', async () => (await import('./sessionCreateFakes')).headerModule());

import SessionCreatePage from '@/pages/admin/sessions/create';
import { admin, fakes, installGlobals, router, settle, takeLog, type Scenario } from './sessionCreateFakes';
import { HOUR_TRACKING_PAIR_ERROR_ES } from '@/lib/services/hour-tracking';
import { HOUR_PAIR_REFUSAL } from '@/components/sessions/create-nuevo/createNuevoText';

const NOON = new Date('2026-11-19T15:00:00Z');

let view: ReturnType<typeof render>;
async function draw(scenario: Scenario, look: 'clasico' | 'nuevo' = 'nuevo') {
  fakes.scenario = scenario;
  fakes.look = look;
  view = render(<SessionCreatePage />);
  await settle();
}

const $ = (selector: string) => document.querySelector(selector) as HTMLElement | null;
const field = (name: string) => $(`[name="${name}"]`);
async function change(element: Element | null | undefined, value: string) {
  if (!element) throw new Error('nothing to change');
  fireEvent.change(element, { target: { value } });
  await settle();
}
async function click(element: Element | null | undefined) {
  if (!element) throw new Error('nothing to click');
  fireEvent.click(element);
  await settle();
}
const form = () => $('[data-testid="session-create-nuevo-form"]') as HTMLFormElement;
const consultantSelect = () => screen.queryByText('Agregar consultor...')?.closest('select');
const buttonStarting = (text: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim().startsWith(text)) ?? null;
const scheduleButton = () => buttonStarting('Programar', form());
const draftButton = () => buttonStarting('Guardar', form());
const dialog = () => $('[data-testid="session-create-nuevo-confirm"]');
const checksBox = () => $('[data-testid="session-create-nuevo-checks"]');
const checksListed = () => Array.from(checksBox()?.querySelectorAll('li a') ?? []).map((a) => a.textContent);
const draftsNotice = () => $('[data-testid="session-create-nuevo-drafts-left"]');
const pairRefusal = () => $('[data-testid="session-create-nuevo-pair-refusal"]');
/** «Programar sesión», then the pop-up's own «Programar sesión». */
async function confirmSchedule() {
  await click(scheduleButton());
  await click(Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent === 'Programar sesión'));
}
const layoutProps = () => JSON.parse($('[data-marker="MainLayout"]')?.getAttribute('data-props') ?? 'null');
const requests = (entries: unknown[]) =>
  entries.filter((e: any) => e && typeof e === 'object' && 'fetch' in e && e.method === 'POST');
const toasts = (entries: unknown[]) =>
  entries.filter((e: any) => e && typeof e === 'object' && ('toast.error' in e || 'toast.success' in e));

async function fillValid() {
  await change(field('school_id'), '7');
  await change(field('growth_community_id'), 'com-7a');
  await change(field('title'), 'Taller Inventado de Prueba');
  await change(field('session_date'), '2026-12-01');
  await change(consultantSelect(), 'u-c1');
  await change(field('location'), 'Sala Inventada 1');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
  installGlobals();
  process.env.NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS = 'true';
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS;
});

describe('arrival in the frame', () => {
  it('loading: placeholders inside the frame with the breadcrumbs (today: a bare spinner)', async () => {
    await draw(admin({ sessions: ['pending'] }));
    expect($('[data-testid="session-create-nuevo-loading"]')).not.toBeNull();
    expect(screen.getByText('Cargando...')).toBeTruthy();
    expect(layoutProps().breadcrumbs).toEqual([{ label: 'Sesiones', href: '/admin/sessions' }, { label: 'Programar Sesión' }]);
  });

  it('loading in today\'s look: today\'s spinner, no frame', async () => {
    await draw(admin({ sessions: ['pending'] }), 'clasico');
    expect($('[data-marker="MainLayout"]')).toBeNull();
    expect($('.animate-spin')).not.toBeNull();
  });

  it('not admin: «Acceso Denegado» inside the frame, then sent to /dashboard as today', async () => {
    await draw(admin({ role: 'consultor' }));
    const denied = $('[data-testid="session-create-nuevo-denied"]');
    expect(denied).not.toBeNull();
    expect(within(denied!).getByText('Acceso Denegado')).toBeTruthy();
    expect(within(denied!).getByText('No tiene permisos para acceder a esta página.')).toBeTruthy();
    expect(within($('[data-marker="MainLayout"]')!).getByText('Acceso Denegado')).toBeTruthy();
    expect(takeLog()).toContainEqual({ 'router.push': '/dashboard' });
  });

  it('no session: sent to /login as today', async () => {
    await draw(admin({ session: null }));
    expect(takeLog()).toContainEqual({ 'router.push': '/login' });
  });

  it('the form: title, sub-title, six numbered cards, «Resumen» with its three buttons', async () => {
    await draw(admin());
    expect(screen.getByRole('heading', { level: 1, name: 'Programar Sesión' })).toBeTruthy();
    expect(screen.getByText('Crear una nueva sesión de consultoría para una comunidad de crecimiento')).toBeTruthy();
    expect(screen.getByText('* Campos obligatorios')).toBeTruthy();
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.replace(/\s+/g, ' ').trim());
    expect(titles).toEqual([
      '1Colegio y consultores',
      '2Datos de la sesión',
      '3Fecha y hora',
      '4Tipo de sesión',
      '5Modalidad *',
      '6Horas y contrato',
      'Resumen',
    ]);
    const summary = $('[data-testid="session-create-nuevo-summary"]')!;
    const buttons = Array.from(summary.querySelectorAll('button, a')).map((b) => b.textContent?.trim());
    expect(buttons).toEqual(['Programar sesión', 'Guardar borrador', 'Cancelar']);
    const cancel = within(summary).getByText('Cancelar').closest('a');
    expect(cancel?.getAttribute('href')).toBe('/admin/sessions');
    expect(layoutProps()).toMatchObject({ currentPage: 'sessions', pageTitle: '', isAdmin: true });
    // Nothing asked beyond today's arrival: no POST.
    expect(requests(takeLog())).toEqual([]);
  });
});

describe("today's fields, names, ids and words", () => {
  it('every field with its label, placeholder, default and name', async () => {
    await draw(admin());
    const label = (name: string) => {
      const control = field(name)!;
      return document.querySelector(`label[for="${control.id}"]`)?.textContent?.replace(/\s+/g, ' ').trim();
    };
    expect(label('school_id')).toBe('Colegio*');
    expect(label('growth_community_id')).toBe('Comunidad de Crecimiento*');
    expect((field('growth_community_id') as HTMLSelectElement).disabled).toBe(true);
    expect(label('title')).toBe('Título de la Sesión*');
    expect(field('title')?.getAttribute('maxLength')).toBe('200');
    expect(field('title')?.getAttribute('placeholder')).toBe('Ej: Sesión de planificación trimestral');
    expect(label('description')).toBe('Descripción');
    expect(field('description')?.tagName).toBe('TEXTAREA');
    expect(label('objectives')).toBe('Objetivos');
    expect(field('objectives')?.tagName).toBe('TEXTAREA');
    expect(label('session_date')).toBe('Fecha*');
    expect(field('session_date')?.getAttribute('min')).toBe('2026-11-19');
    expect(label('start_time')).toBe('Hora de inicio (hora Chile)*');
    expect((field('start_time') as HTMLInputElement).value).toBe('09:00');
    expect(label('end_time')).toBe('Hora de término (hora Chile)*');
    expect((field('end_time') as HTMLInputElement).value).toBe('10:00');
    expect(label('location')).toBe('Ubicación*');
    expect(field('location')?.getAttribute('placeholder')).toBe('Ej: Sala de profesores');
    expect($('#hour-type-select')).not.toBeNull();
    expect($('#contrato-select')).not.toBeNull();
    expect(Array.from(($('#hour-type-select') as HTMLSelectElement).options).map((o) => o.text)).toEqual([
      'Seleccione tipo de hora',
      'Asesoría directiva',
      'Taller',
    ]);
    expect(screen.getByText('Elija ambos para registrar las horas, o deje los dos vacíos.')).toBeTruthy();
    const modality = Array.from(document.querySelectorAll('input[name="modality"]')).map((i) =>
      i.closest('label')?.textContent?.trim()
    );
    expect(modality).toEqual(['Presencial', 'Online', 'Híbrida']);
    expect($('[data-testid="create-session-spain-preview"]')).toBeNull();
    await change(field('session_date'), '2026-12-01');
    expect($('[data-testid="create-session-spain-preview"]')?.textContent).toMatch(/^En España: /);
  });

  it('school → community → consultants: today\'s words, rows, one lead, the role switch, «Quitar»', async () => {
    await draw(admin());
    await change(field('school_id'), '7');
    expect(screen.getByText('Debe asignar al menos un consultor antes de crear la sesión.')).toBeTruthy();
    expect(Array.from((field('growth_community_id') as HTMLSelectElement).options).map((o) => o.text)).toEqual([
      'Seleccione una comunidad',
      'Comunidad Inventada Alfa',
      'Comunidad Inventada Beta',
    ]);
    takeLog();
    await change(consultantSelect(), 'u-c1');
    await change(consultantSelect(), 'u-c2');
    expect(takeLog()).toEqual([{ 'toast.success': 'Facilitador agregado' }, { 'toast.success': 'Facilitador agregado' }]);
    const leads = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="create-session-lead"]'));
    expect(leads.map((r) => r.type)).toEqual(['radio', 'radio']);
    expect(leads.map((r) => r.checked)).toEqual([true, false]);
    await click(leads[1]);
    expect(leads.map((r) => r.checked)).toEqual([false, true]);

    const roleOf = screen.getByRole('group', { name: 'Tipo de consultor de Ana Inventada' });
    const [externo, interno] = within(roleOf).getAllByRole('button');
    expect([externo.textContent, interno.textContent]).toEqual(['Externo', 'Interno']);
    expect(externo.getAttribute('aria-pressed')).toBe('true');
    await click(interno);
    expect(interno.getAttribute('aria-pressed')).toBe('true');
    await click(interno);
    expect(interno.getAttribute('aria-pressed')).toBe('true');
    await click(externo);
    expect(externo.getAttribute('aria-pressed')).toBe('true');

    await click($('button[aria-label="Quitar consultor Bruno Ficticio"]'));
    expect($('button[aria-label="Quitar consultor Bruno Ficticio"]')).toBeNull();
    // The lead removed: no lead left, the save refused with today's words (in the box, no toast).
    takeLog();
    await click(scheduleButton());
    expect(checksListed()).toContain('Debe haber exactamente un facilitador principal');
    expect(toasts(takeLog())).toEqual([]);
  });

  it('the consultants error box with «Reintentar» (refetches) and the empty box', async () => {
    await draw(admin({ fetch: { 'GET /api/admin/consultants?school_id=7': [{ status: 500, body: { error: 'Error inesperado' } }, { body: { data: { consultants: [] } } }] } }));
    await change(field('school_id'), '7');
    expect(screen.getByText('Error al cargar consultores')).toBeTruthy();
    expect(screen.getByText('Error inesperado')).toBeTruthy();
    expect(consultantSelect()).toBeFalsy();
    takeLog();
    await click(buttonStarting('Reintentar'));
    expect(takeLog().filter((e: any) => e?.fetch)).toEqual([
      expect.objectContaining({ fetch: '/api/admin/consultants?school_id=7' }),
    ]);
    expect(
      screen.getByText('No hay consultores disponibles para este colegio. Verifique que existan usuarios con rol activo de consultor.')
    ).toBeTruthy();
  });

  it('modality: link fields, provider, the Zoom box and its help; «Presencial» clears them', async () => {
    await draw(admin());
    await click($('input[name="modality"][value="online"]'));
    expect(field('location')).toBeNull();
    expect(Array.from((field('meeting_provider') as HTMLSelectElement).options).map((o) => o.text)).toEqual([
      'Auto-detectar',
      'Zoom',
      'Google Meet',
      'Microsoft Teams',
      'Otro',
    ]);
    await change(field('meeting_link'), 'https://zoom.us/j/123');
    expect((field('meeting_provider') as HTMLSelectElement).value).toBe('zoom');
    await click($('[data-testid="session-zoom-managed"]'));
    expect($('[data-testid="session-zoom-managed-help"]')?.textContent).toBe(
      'GENERA crea la reunión y su enlace cuando se apruebe la sesión.'
    );
    expect(field('meeting_link')).toBeNull();
    expect(screen.getByText('· Zoom')).toBeTruthy();
    await click($('input[name="modality"][value="presencial"]'));
    expect($('[data-testid="session-zoom-managed"]')).toBeNull();
    await click($('input[name="modality"][value="hibrida"]'));
    expect((field('meeting_link') as HTMLInputElement).value).toBe('');
    expect((($('[data-testid="session-zoom-managed"]') as HTMLInputElement) ?? {}).checked).toBe(false);
  });

  it('series: the grey box, «Vista previa», weekend marks, the count in the buttons and the summary', async () => {
    await draw(admin());
    await change(field('session_date'), '2026-12-05'); // a Saturday
    await click(screen.getByText('Serie recurrente').closest('label')!.querySelector('input'));
    const box = $('[data-testid="session-create-nuevo-recurrence"]')!;
    expect(box.className).not.toMatch(/blue/);
    expect(within(box).getByText('Configuración de recurrencia')).toBeTruthy();
    expect(within(box).getByText('Vista previa (4 sesiones)')).toBeTruthy();
    expect(within(box).getAllByText('Fin de semana')).toHaveLength(4);
    expect(within(box).getByText('Sesión 1')).toBeTruthy();
    expect(scheduleButton()?.textContent).toBe('Programar serie (4 sesiones)');
    expect(draftButton()?.textContent).toBe('Guardar serie como borrador (4 sesiones)');
    const summary = $('[data-testid="session-create-nuevo-summary"]')!;
    expect(within(summary).getByText('Fechas')).toBeTruthy();
    expect(within(summary).getByText('4 en fin de semana')).toBeTruthy();
    expect(within(summary).getByText('Serie recurrente')).toBeTruthy();

    await change(within(box).getByText('Semanal').closest('select'), 'custom');
    expect(within(box).getByLabelText('Fecha 1')).toBeTruthy();
    expect(within(box).queryByLabelText('Eliminar fecha')).toBeNull();
    await click(buttonStarting('Agregar fecha', box));
    expect(within(box).getByLabelText('Fecha 2')).toBeTruthy();
    expect(within(box).getAllByLabelText('Eliminar fecha')).toHaveLength(2);
    expect((within(box).getByLabelText('Fecha 1') as HTMLInputElement).min).toBe('2026-11-19');
  });

  it('hours: the chip as a notice with a decimal comma; the summary\'s hours and the over-budget line', async () => {
    await draw(admin());
    await change(field('school_id'), '7');
    await change($('#hour-type-select'), 'taller');
    await change($('#contrato-select'), 'ctr-7');
    expect(screen.getByText('horas disponibles en este tipo', { exact: false }).textContent).toBe(
      '42,5 horas disponibles en este tipo'
    );
    const summary = $('[data-testid="session-create-nuevo-summary"]')!;
    expect(within(summary).getByText('1,0 h por sesión · 1,0 h en total')).toBeTruthy();
    await change($('#hour-type-select'), 'asesoria_directiva');
    expect(screen.getByText('— ¡Quedan menos del 25%!', { exact: false }).textContent).toBe(
      '2,5 horas disponibles en este tipo — ¡Quedan menos del 25%!'
    );
    await change(field('end_time'), '13:00');
    expect(within(summary).getByText('4,0 h por sesión · 4,0 h en total')).toBeTruthy();
    expect(within(summary).getByText('Más de lo disponible en este tipo (2,5 h)')).toBeTruthy();
    await change($('#hour-type-select'), '');
    expect(within(summary).getByText('Sin seguimiento de horas')).toBeTruthy();
    await change(field('school_id'), '9');
    expect(screen.getByText('No hay contratos activos para este colegio.')).toBeTruthy();
  });
});

describe('approved change 2: all the checks at once', () => {
  it('an empty form: no toast, no request, a box listing every failed check in order, each beside its field', async () => {
    await draw(admin());
    takeLog();
    await click(scheduleButton());
    const asked = takeLog();
    expect(toasts(asked)).toEqual([]);
    expect(requests(asked)).toEqual([]);
    expect(asked.filter((e: any) => e && typeof e === 'object' && 'confirm' in e)).toEqual([]);
    expect(checksBox()?.getAttribute('role')).toBe('alert');
    expect(checksBox()?.textContent).toContain('Revise lo siguiente antes de continuar:');
    expect(checksListed()).toEqual([
      'Debe seleccionar un colegio',
      'Debe seleccionar una comunidad de crecimiento',
      'Debe ingresar un título',
      'Debe seleccionar una fecha',
      'Debe ingresar una ubicación para modalidad presencial o híbrida',
      'Debe asignar al menos un facilitador a la sesión',
      'Debe haber exactamente un facilitador principal',
    ]);
    expect(dialog()).toBeNull();
    // Beside each field (the control names its message).
    const describedBy = (name: string) => {
      const ids = field(name)?.getAttribute('aria-describedby')?.split(' ') ?? [];
      return ids.map((id) => document.getElementById(id)?.textContent).join(' | ');
    };
    expect(describedBy('title')).toBe('Debe ingresar un título');
    expect(describedBy('session_date')).toBe('Debe seleccionar una fecha');
    expect(describedBy('location')).toBe('Debe ingresar una ubicación para modalidad presencial o híbrida');
    expect(field('title')?.getAttribute('aria-invalid')).toBe('true');
    // The box takes the focus; a link moves to its field.
    expect(document.activeElement).toBe(checksBox());
    await click(screen.getByRole('link', { name: 'Debe ingresar un título' }));
    expect(document.activeElement).toBe(field('title'));
  });

  it('send-back B10: changing a field with an error takes its message out of the box and from beside it at once; the others stay', async () => {
    await draw(admin());
    await click(scheduleButton());
    expect(field('title')?.getAttribute('aria-invalid')).toBe('true');
    takeLog();
    await change(field('title'), 'Taller Inventado');
    expect(checksListed()).not.toContain('Debe ingresar un título');
    expect(field('title')?.getAttribute('aria-invalid')).toBeNull();
    expect(field('title')?.getAttribute('aria-describedby') ?? null).toBeNull();
    expect(checksListed()).toContain('Debe seleccionar un colegio');
    expect(checksListed()).toContain('Debe seleccionar una fecha');
    // Nothing is checked while typing: emptying the title again shows nothing until the next press.
    await change(field('title'), '');
    expect(checksListed()).not.toContain('Debe ingresar un título');
    expect(field('title')?.getAttribute('aria-invalid')).toBeNull();
    // Changing a field without an error takes nothing out.
    await change(field('description'), 'Una descripción inventada');
    expect(checksListed()).toContain('Debe seleccionar una fecha');
    expect(requests(takeLog())).toEqual([]);
    // At the next press the title's error is back, with today's words.
    await click(scheduleButton());
    expect(checksListed()).toContain('Debe ingresar un título');
  });

  it('send-back B10: the box goes when its last line goes; no new error appears while typing', async () => {
    await draw(admin());
    await fillValid();
    await change(field('location'), '');
    await click(scheduleButton());
    expect(checksListed()).toEqual(['Debe ingresar una ubicación para modalidad presencial o híbrida']);
    expect(field('location')?.getAttribute('aria-invalid')).toBe('true');
    await change(field('location'), 'Sala Inventada 2');
    expect(checksBox()).toBeNull();
    expect(field('location')?.getAttribute('aria-invalid')).toBeNull();
    await change(field('title'), '');
    expect(checksBox()).toBeNull();
    expect(field('title')?.getAttribute('aria-invalid')).toBeNull();
  });

  it('send-back B10: the facilitators’ errors sit under «Colegio» while no school is chosen, by the facilitators’ field once it is drawn, and go when a consultant is added', async () => {
    const FAC = 'Debe asignar al menos un facilitador a la sesión';
    const LEAD = 'Debe haber exactamente un facilitador principal';
    const consultants = () => document.getElementById('create-session-consultants');
    const describedText = (el: Element | null) =>
      (el?.getAttribute('aria-describedby')?.split(' ') ?? []).map((id) => document.getElementById(id)?.textContent ?? '').join(' | ');
    await draw(admin());
    await click(scheduleButton());
    expect(consultants()).toBeNull();
    expect(describedText(field('school_id'))).toContain(FAC);
    expect(describedText(field('school_id'))).toContain(LEAD);
    expect(screen.getByRole('link', { name: FAC }).getAttribute('href')).toBe('#create-session-school');

    // A school chosen: its own error goes, the facilitators' two move beside the facilitators' field.
    await change(field('school_id'), '7');
    expect(checksListed()).not.toContain('Debe seleccionar un colegio');
    expect(checksListed()).toEqual(expect.arrayContaining([FAC, LEAD]));
    expect(field('school_id')?.getAttribute('aria-invalid')).toBeNull();
    expect(describedText(field('school_id'))).not.toContain(FAC);
    expect(consultants()).not.toBeNull();
    expect(describedText(consultants())).toContain(FAC);
    expect(describedText(consultants())).toContain(LEAD);
    expect(screen.getByRole('link', { name: FAC }).getAttribute('href')).toBe('#create-session-consultants');

    // A consultant added (the facilitators' field changed): both go.
    await change(consultantSelect(), 'u-c1');
    expect(checksListed()).not.toContain(FAC);
    expect(checksListed()).not.toContain(LEAD);
    expect(consultants()?.getAttribute('aria-describedby') ?? null).toBeNull();
  });

  it('the times: check 5 under the empty one, check 6 under «Hora de término»', async () => {
    await draw(admin());
    await fillValid();
    await change(field('start_time'), '');
    await click(scheduleButton());
    expect(checksListed()).toEqual(['Debe ingresar hora de inicio y término']);
    expect(field('start_time')?.getAttribute('aria-invalid')).toBe('true');
    await change(field('start_time'), '11:00');
    await click(scheduleButton());
    expect(checksListed()).toEqual(['La hora de término debe ser posterior a la hora de inicio']);
    expect(field('end_time')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('«Guardar borrador» with a field missing: the same box, no toast, no request', async () => {
    await draw(admin());
    await fillValid();
    await change(field('location'), '');
    takeLog();
    await click(draftButton());
    const asked = takeLog();
    expect(checksListed()).toEqual(['Debe ingresar una ubicación para modalidad presencial o híbrida']);
    expect(toasts(asked)).toEqual([]);
    expect(requests(asked)).toEqual([]);
  });

  it('series count cleared: same outcome as today’s check; the question names 0 sessions', async () => {
    await draw(admin());
    await fillValid();
    await click(screen.getByText('Serie recurrente').closest('label')!.querySelector('input'));
    await change($('input[type="number"]'), '');
    await click(scheduleButton());
    expect(checksBox()).toBeNull();
    expect(dialog()?.textContent).toContain('¿Está seguro de que desea programar estas 0 sesiones?');
  });
});

describe('approved change 1: a real form', () => {
  it('one submit button («Programar …»); every other button of the form is type="button"', async () => {
    await draw(admin());
    await change(field('school_id'), '7');
    await change(consultantSelect(), 'u-c1');
    await click(screen.getByText('Serie recurrente').closest('label')!.querySelector('input'));
    await change(screen.getByText('Semanal').closest('select'), 'custom');
    await click(buttonStarting('Agregar fecha'));
    await click(scheduleButton());
    const buttons = Array.from(form().querySelectorAll('button'));
    const submits = buttons.filter((b) => b.type === 'submit');
    expect(submits.map((b) => b.textContent)).toEqual(['Programar sesión']);
    for (const b of buttons) if (b !== submits[0]) expect(b.getAttribute('type'), b.textContent ?? '').toBe('button');
    expect(form().noValidate).toBe(true);
  });

  it('Enter in «Título de la Sesión» opens the pop-up; «Cancelar» closes it and the form stays filled', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} });
    await draw(admin());
    await fillValid();
    takeLog();
    await act(async () => {
      await user.type(field('title') as HTMLInputElement, '{Enter}');
    });
    await settle();
    const box = dialog()!;
    expect(box).not.toBeNull();
    expect(within(box).getByRole('heading', { name: '¿Está seguro de que desea programar esta sesión?' })).toBeTruthy();
    expect(within(box).getByText('Se notificará a los participantes.')).toBeTruthy();
    expect(within(box).getByText('Colegio Inventado del Norte')).toBeTruthy();
    expect(within(box).getByText('Comunidad Inventada Alfa')).toBeTruthy();
    expect(within(box).getByText('1 dic 2026')).toBeTruthy();
    const answers = Array.from(box.querySelectorAll('button')).map((b) => b.textContent?.trim()).filter(Boolean);
    expect(answers).toEqual(['Cancelar', 'Programar sesión']);
    expect(document.activeElement?.textContent).toBe('Cancelar');
    await click(within(box).getByText('Cancelar'));
    expect(dialog()).toBeNull();
    expect((field('title') as HTMLInputElement).value).toBe('Taller Inventado de Prueba');
    const asked = takeLog();
    expect(requests(asked)).toEqual([]);
    expect(asked.filter((e: any) => e && typeof e === 'object' && 'confirm' in e)).toEqual([]);
  });

  it('Enter with a field missing shows the box instead; Enter in «Descripción» makes a line and sends nothing', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} });
    await draw(admin());
    await fillValid();
    await act(async () => {
      await user.type(field('description') as HTMLTextAreaElement, 'Uno{Enter}Dos');
    });
    await settle();
    expect((field('description') as HTMLTextAreaElement).value).toBe('Uno\nDos');
    expect(dialog()).toBeNull();
    expect(checksBox()).toBeNull();
    await act(async () => {
      await user.clear(field('location') as HTMLInputElement);
      await user.type(field('title') as HTMLInputElement, '{Enter}');
    });
    await settle();
    expect(dialog()).toBeNull();
    expect(checksListed()).toEqual(['Debe ingresar una ubicación para modalidad presencial o híbrida']);
  });

  it('Enter on «Quitar», «Agregar fecha», «Eliminar fecha» and «Externo»/«Interno» does only that button\'s action', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} });
    await draw(admin());
    await fillValid();
    await change(consultantSelect(), 'u-c2');
    await click(screen.getByText('Serie recurrente').closest('label')!.querySelector('input'));
    await change(screen.getByText('Semanal').closest('select'), 'custom');
    const press = async (el: HTMLElement | null) => {
      if (!el) throw new Error('nothing to press');
      el.focus();
      await act(async () => {
        await user.keyboard('{Enter}');
      });
      await settle();
    };
    await press(buttonStarting('Agregar fecha'));
    expect(screen.getAllByLabelText('Eliminar fecha')).toHaveLength(2);
    await press(screen.getAllByLabelText('Eliminar fecha')[1] as HTMLElement);
    expect(screen.queryAllByLabelText('Eliminar fecha')).toHaveLength(0);
    const interno = within(screen.getByRole('group', { name: 'Tipo de consultor de Bruno Ficticio' })).getByText('Interno');
    await press(interno);
    expect(interno.getAttribute('aria-pressed')).toBe('true');
    await press($('button[aria-label="Quitar consultor Bruno Ficticio"]'));
    expect($('button[aria-label="Quitar consultor Bruno Ficticio"]')).toBeNull();
    expect(dialog()).toBeNull();
    expect(checksBox()).toBeNull();
  });
});

describe('the confirmed «Programar» and approved change 3, the drafts notice', () => {
  it('confirmed: create, approve, today\'s toast and the session page; no browser question, no notice', async () => {
    await draw(admin());
    await fillValid();
    takeLog();
    await click(scheduleButton());
    const confirmButton = Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent === 'Programar sesión');
    await click(confirmButton);
    const asked = takeLog();
    expect(requests(asked).map((e: any) => e.fetch)).toEqual(['/api/sessions', '/api/sessions/ses-inventada-1/approve']);
    expect(asked).toContainEqual({ 'toast.success': 'Sesión programada exitosamente' });
    expect(asked).toContainEqual({ 'router.push': '/admin/sessions/ses-inventada-1' });
    expect(asked.filter((e: any) => e && typeof e === 'object' && 'confirm' in e)).toEqual([]);
    expect(draftsNotice()).toBeNull();
  });

  it('created, approval answered 500: today\'s error toast AND the notice (one session)', async () => {
    await draw(admin({ fetch: { 'POST /api/sessions/ses-inventada-1/approve': { status: 500, body: { error: 'Fallo inventado' } } } }));
    await fillValid();
    takeLog();
    await click(scheduleButton());
    await click(Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent === 'Programar sesión'));
    const asked = takeLog();
    expect(toasts(asked)).toEqual([{ 'toast.error': 'Fallo inventado' }]);
    expect(draftsNotice()?.textContent).toBe(
      'La sesión quedó guardada como borrador. Revise la lista de sesiones antes de volver a programar, para no crearla dos veces.'
    );
    expect(asked.some((e: any) => e && typeof e === 'object' && 'router.push' in e)).toBe(false);
    // Scheduling again clears it before the requests.
    await click(scheduleButton());
    await click(Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent === 'Programar sesión'));
    expect(draftsNotice()).not.toBeNull();
  });

  it('a series, bulk approval answered 500: today\'s toast AND the series notice', async () => {
    await draw(
      admin({
        fetch: {
          'POST /api/sessions': { body: { data: { recurrence_group_id: 'grp-inventado', sessions: [{ id: 's1' }] } } },
          'POST /api/sessions/bulk-approve': { status: 500, body: {} },
        },
      })
    );
    await fillValid();
    await click(screen.getByText('Serie recurrente').closest('label')!.querySelector('input'));
    takeLog();
    await click(scheduleButton());
    expect(within(dialog()!).getByRole('heading').textContent).toBe('¿Está seguro de que desea programar estas 4 sesiones?');
    await click(Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent === 'Programar serie (4 sesiones)'));
    const asked = takeLog();
    expect(toasts(asked)).toEqual([{ 'toast.error': 'Error al aprobar sesiones' }]);
    expect(draftsNotice()?.textContent).toBe(
      'Las sesiones quedaron guardadas como borrador. Revise la lista de sesiones antes de volver a programar, para no crearlas dos veces.'
    );
  });

  it('the creation fails: the toast only, no notice', async () => {
    await draw(admin({ fetch: { 'POST /api/sessions': { status: 400, body: { error: 'Rechazo inventado' } } } }));
    await fillValid();
    takeLog();
    await click(scheduleButton());
    await click(Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent === 'Programar sesión'));
    const asked = takeLog();
    expect(toasts(asked)).toEqual([{ 'toast.error': 'Rechazo inventado' }]);
    expect(requests(asked).map((e: any) => e.fetch)).toEqual(['/api/sessions']);
    expect(draftsNotice()).toBeNull();
  });

  it('the creation rejected by the network: the toast only, no notice', async () => {
    await draw(admin({ fetch: { 'POST /api/sessions': 'reject' } }));
    await fillValid();
    takeLog();
    await click(scheduleButton());
    await click(Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent === 'Programar sesión'));
    expect(toasts(takeLog())).toEqual([{ 'toast.error': 'Synthetic network failure' }]);
    expect(draftsNotice()).toBeNull();
  });

  it('the creation answered ok but its answer cannot be read: the toast only, no notice, no approval asked', async () => {
    await draw(admin({ fetch: { 'POST /api/sessions': { body: null, unreadable: true } } }));
    await fillValid();
    takeLog();
    await confirmSchedule();
    const asked = takeLog();
    expect(toasts(asked)).toEqual([{ 'toast.error': 'Synthetic unreadable body' }]);
    expect(requests(asked).map((e: any) => e.fetch)).toEqual(['/api/sessions']);
    expect(draftsNotice()).toBeNull();
  });

  it('created and read, the approval request rejected by the network: today\'s toast AND the notice', async () => {
    await draw(admin({ fetch: { 'POST /api/sessions/ses-inventada-1/approve': 'reject' } }));
    await fillValid();
    takeLog();
    await confirmSchedule();
    const asked = takeLog();
    expect(toasts(asked)).toEqual([{ 'toast.error': 'Synthetic network failure' }]);
    expect(requests(asked).map((e: any) => e.fetch)).toEqual(['/api/sessions', '/api/sessions/ses-inventada-1/approve']);
    expect(draftsNotice()).not.toBeNull();
  });

  it('something failing after a successful approval: today\'s toasts only, no notice', async () => {
    router.push.mockImplementationOnce(() => {
      throw new Error('Fallo inventado tras aprobar');
    });
    await draw(admin());
    await fillValid();
    takeLog();
    await confirmSchedule();
    const asked = takeLog();
    expect(toasts(asked)).toEqual([{ 'toast.success': 'Sesión programada exitosamente' }, { 'toast.error': 'Fallo inventado tras aprobar' }]);
    expect(draftsNotice()).toBeNull();
  });

  it('while the request waits both buttons and «Cancelar» are disabled', async () => {
    await draw(admin({ fetch: { 'POST /api/sessions': 'pending' } }));
    await fillValid();
    await click(scheduleButton());
    await click(Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent === 'Programar sesión'));
    expect((scheduleButton() as HTMLButtonElement).disabled).toBe(true);
    expect((draftButton() as HTMLButtonElement).disabled).toBe(true);
    expect(within($('[data-testid="session-create-nuevo-summary"]')!).getByText('Cancelar').closest('a')?.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('approved: the server\'s refusal of a half-chosen hours pair, under the two selects', () => {
  const refused = () => admin({ fetch: { 'POST /api/sessions': { status: 400, body: { error: HOUR_PAIR_REFUSAL } } } });

  it('the view\'s words are the server\'s', () => {
    expect(HOUR_PAIR_REFUSAL).toBe(HOUR_TRACKING_PAIR_ERROR_ES);
  });

  it('only «Tipo de Hora» chosen, the server refuses: today\'s toast AND the message under the selects, both marked', async () => {
    await draw(refused());
    await fillValid();
    await change($('#hour-type-select'), 'taller');
    takeLog();
    await confirmSchedule();
    const asked = takeLog();
    expect(toasts(asked)).toEqual([{ 'toast.error': HOUR_PAIR_REFUSAL }]);
    expect(requests(asked).map((e: any) => e.fetch)).toEqual(['/api/sessions']);
    expect(pairRefusal()?.textContent).toBe(HOUR_PAIR_REFUSAL);
    for (const id of ['#hour-type-select', '#contrato-select']) {
      expect($(id)?.getAttribute('aria-invalid')).toBe('true');
      expect($(id)?.getAttribute('aria-describedby')?.split(' ')).toContain('hour-pair-refusal');
    }
    // Under the selects: after them in the section.
    const contrato = $('#contrato-select')!;
    expect(contrato.compareDocumentPosition(pairRefusal()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(draftsNotice()).toBeNull();
    // Changing either select takes it away.
    await change($('#hour-type-select'), '');
    expect(pairRefusal()).toBeNull();
    expect($('#hour-type-select')?.getAttribute('aria-invalid')).toBeNull();
  });

  it('only «Contrato» chosen: the same', async () => {
    await draw(refused());
    await fillValid();
    await change($('#contrato-select'), 'ctr-7');
    await confirmSchedule();
    expect(pairRefusal()?.textContent).toBe(HOUR_PAIR_REFUSAL);
  });

  it('a refusal that arrives after the pair was changed: today\'s toast, nothing marked, nothing under the selects', async () => {
    await draw(refused());
    await fillValid();
    await change($('#hour-type-select'), 'taller');
    // The create request is held until the person has changed the pair, then answered with the refusal.
    let answer: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const fetchOfTheFakes = globalThis.fetch;
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
      url === '/api/sessions' && init?.method === 'POST'
        ? held.then(() => fetchOfTheFakes(url, init))
        : fetchOfTheFakes(url, init)
    );
    takeLog();
    await confirmSchedule();
    expect(pairRefusal()).toBeNull();
    // While it is sent, the person also picks the contract: the pair sent is no longer the pair shown.
    expect(($('#contrato-select') as HTMLSelectElement).disabled).toBe(false);
    await change($('#contrato-select'), 'ctr-7');
    answer();
    await settle();
    expect(toasts(takeLog())).toEqual([{ 'toast.error': HOUR_PAIR_REFUSAL }]);
    expect(pairRefusal()).toBeNull();
    for (const id of ['#hour-type-select', '#contrato-select']) {
      expect($(id)?.getAttribute('aria-invalid')).toBeNull();
    }
  });

  it('another refusal, or neither select chosen: the toast only, nothing under the selects', async () => {
    await draw(admin({ fetch: { 'POST /api/sessions': { status: 400, body: { error: 'Rechazo inventado' } } } }));
    await fillValid();
    await change($('#hour-type-select'), 'taller');
    takeLog();
    await confirmSchedule();
    expect(toasts(takeLog())).toEqual([{ 'toast.error': 'Rechazo inventado' }]);
    expect(pairRefusal()).toBeNull();
    view.unmount();
    await draw(refused());
    await fillValid();
    takeLog();
    await confirmSchedule();
    expect(toasts(takeLog())).toEqual([{ 'toast.error': HOUR_PAIR_REFUSAL }]);
    expect(pairRefusal()).toBeNull();
  });
});

describe('the look under a filled form', () => {
  it('clasico → nuevo → clasico: the form keeps what was typed and the frame is mounted once', async () => {
    await draw(admin(), 'clasico');
    await change(field('school_id'), '7');
    await change(field('title'), 'Taller Inventado');
    fakes.look = 'nuevo';
    view.rerender(<SessionCreatePage />);
    await settle();
    expect(form()).not.toBeNull();
    expect((field('title') as HTMLInputElement).value).toBe('Taller Inventado');
    expect((field('school_id') as HTMLSelectElement).value).toBe('7');
    fakes.look = 'clasico';
    view.rerender(<SessionCreatePage />);
    await settle();
    expect(form()).toBeNull();
    expect((field('title') as HTMLInputElement).value).toBe('Taller Inventado');
    expect(fakes.layoutMounts).toBe(1);
  });
});
