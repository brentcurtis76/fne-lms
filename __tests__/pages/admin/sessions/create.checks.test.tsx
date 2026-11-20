// @vitest-environment jsdom
/**
 * Redesign 6, release SB: `formChecks` (components/sessions/sessionCreateChecks.ts), the new look's
 * 12 checks, against today's `validateForm()` (hooks/useSessionCreate.ts).
 *
 * The real hook is rendered (its data calls answered by `sessionCreateFakes.tsx`), brought to each form
 * of a matrix through its own setters and handlers, and asked `validateForm()`. The first failure of
 * `formChecks` over the hook's state must be the toast today's check gives (or none when it passes),
 * and every message `formChecks` gives must be one of today's 12, in today's order. The matrix: a valid
 * form, each of 17 ways to break it alone, every pair of them, and a few larger mixes. Invented data.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/router', async () => (await import('./sessionCreateFakes')).routerModule());
vi.mock('@supabase/auth-helpers-react', async () => (await import('./sessionCreateFakes')).authHelpersModule());
vi.mock('@/utils/roleUtils', async (importOriginal) =>
  (await import('./sessionCreateFakes')).roleUtilsModule(await importOriginal())
);
vi.mock('react-hot-toast', async () => (await import('./sessionCreateFakes')).toastModule());

import { useSessionCreate } from '@/hooks/useSessionCreate';
import { formChecks, CREATE_FIELD_IDS } from '@/components/sessions/sessionCreateChecks';
import { admin, fakes, installGlobals, settle, takeLog } from './sessionCreateFakes';
import type { RecurrenceFrequency } from '@/lib/types/consultor-sessions.types';

const TODAY_ORDER = [
  'Debe seleccionar un colegio',
  'Debe seleccionar una comunidad de crecimiento',
  'Debe ingresar un título',
  'Debe seleccionar una fecha',
  'Debe ingresar hora de inicio y término',
  'La hora de término debe ser posterior a la hora de inicio',
  'Debe ingresar un enlace de reunión para modalidad online o híbrida',
  'Debe ingresar una ubicación para modalidad presencial o híbrida',
  'Debe asignar al menos un facilitador a la sesión',
  'Debe haber exactamente un facilitador principal',
  'Debe ingresar al menos 2 fechas personalizadas',
  'El número de sesiones debe estar entre 2 y 52',
];

interface Form {
  school_id: number;
  growth_community_id: string;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  modality: 'presencial' | 'online' | 'hibrida';
  meeting_link: string;
  is_zoom_managed: boolean;
  location: string;
  facilitators: 'one' | 'none' | 'noLead' | 'two';
  recurring: boolean;
  frequency: RecurrenceFrequency;
  count: number;
  customDates: string[];
}

const VALID: Form = {
  school_id: 7,
  growth_community_id: 'com-7a',
  title: 'Taller Inventado',
  session_date: '2026-12-01',
  start_time: '09:00',
  end_time: '10:00',
  modality: 'presencial',
  meeting_link: '',
  is_zoom_managed: false,
  location: 'Sala Inventada',
  facilitators: 'one',
  recurring: false,
  frequency: 'weekly',
  count: 4,
  customDates: [''],
};

const BREAKERS: Record<string, Partial<Form>> = {
  noSchool: { school_id: 0 },
  noCommunity: { growth_community_id: '' },
  blankTitle: { title: '   ' },
  noDate: { session_date: '' },
  noStart: { start_time: '' },
  noEnd: { end_time: '' },
  endBeforeStart: { end_time: '08:30' },
  endEqualsStart: { end_time: '09:00' },
  onlineNoLink: { modality: 'online', location: '' },
  hibridaNothing: { modality: 'hibrida', location: '', meeting_link: '' },
  onlineZoomManaged: { modality: 'online', is_zoom_managed: true, location: '' },
  noLocation: { location: '' },
  noFacilitators: { facilitators: 'none' },
  noLead: { facilitators: 'noLead' },
  customOneDate: { recurring: true, frequency: 'custom', customDates: ['2026-12-03', ''] },
  countOne: { recurring: true, frequency: 'weekly', count: 1 },
  countCleared: { recurring: true, frequency: 'biweekly', count: Number.NaN },
};

function matrix(): Array<[string, Form]> {
  const names = Object.keys(BREAKERS);
  const out: Array<[string, Form]> = [['valid', VALID], ['valid, two consultants', { ...VALID, facilitators: 'two' }]];
  for (const a of names) out.push([a, { ...VALID, ...BREAKERS[a] }]);
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      out.push([`${names[i]} + ${names[j]}`, { ...VALID, ...BREAKERS[names[i]], ...BREAKERS[names[j]] }]);
    }
  }
  out.push(['everything empty', { ...VALID, school_id: 0, growth_community_id: '', title: '', session_date: '', location: '', facilitators: 'none' }]);
  out.push(['late mix', { ...VALID, ...BREAKERS.noEnd, ...BREAKERS.hibridaNothing, ...BREAKERS.noLead, ...BREAKERS.countOne }]);
  out.push(['custom with 53 asked as weekly count', { ...VALID, recurring: true, frequency: 'monthly', count: 53 }]);
  out.push(['custom, two dates', { ...VALID, recurring: true, frequency: 'custom', customDates: ['2026-12-03', '2026-12-10'] }]);
  return out;
}

beforeEach(() => {
  installGlobals();
  fakes.scenario = admin();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function bringTo(hook: { current: ReturnType<typeof useSessionCreate> }, form: Form) {
  const {
    facilitators: who,
    recurring,
    frequency,
    count,
    customDates,
    ...formData
  } = form;
  await act(async () => {
    hook.current.setFormData((prev) => ({ ...prev, ...formData }));
  });
  await settle(); // the school's effect runs (and clears the facilitators)
  await act(async () => {
    for (const f of hook.current.facilitators) hook.current.handleRemoveFacilitator(f.user_id);
  });
  if (who !== 'none') {
    await act(async () => hook.current.handleAddFacilitator('u-c1'));
    if (who === 'two' || who === 'noLead') await act(async () => hook.current.handleAddFacilitator('u-c2'));
    if (who === 'noLead') await act(async () => hook.current.handleRemoveFacilitator('u-c1'));
  }
  await act(async () => {
    hook.current.setIsRecurring(recurring);
    hook.current.setRecurrenceFrequency(frequency);
    hook.current.setRecurrenceCount(count);
  });
  // The custom rows: as many as asked, through today's handlers.
  const extraRows = hook.current.customDates.length - 1;
  await act(async () => {
    for (let i = 0; i < extraRows; i += 1) hook.current.handleRemoveCustomDate(0);
  });
  for (let i = 1; i < customDates.length; i += 1) await act(async () => hook.current.handleAddCustomDate());
  for (let i = 0; i < customDates.length; i += 1) await act(async () => hook.current.handleCustomDateChange(i, customDates[i]));
  await settle();
}

describe('formChecks against today\'s validateForm', () => {
  it('over the matrix, the first failure is today\'s toast and the rest follow today\'s order', async () => {
    const { result } = renderHook(() => useSessionCreate());
    await settle();
    expect(result.current.isAdmin).toBe(true);
    const cases = matrix();
    expect(cases.length).toBeGreaterThan(150);
    for (const [name, form] of cases) {
      await bringTo(result, form);
      takeLog();
      let passed = false;
      await act(async () => {
        passed = result.current.validateForm();
      });
      const toast = takeLog().filter((e: any) => e && typeof e === 'object' && 'toast.error' in e).map((e: any) => e['toast.error']);
      const s = result.current;
      const found = formChecks({
        formData: s.formData,
        facilitators: s.facilitators,
        isRecurring: s.isRecurring,
        recurrenceFrequency: s.recurrenceFrequency,
        recurrenceCount: s.recurrenceCount,
        customDates: s.customDates,
      });
      expect(found[0]?.message ?? null, name).toBe(toast[0] ?? null);
      expect(found.length === 0, name).toBe(passed);
      const order = found.map((f) => TODAY_ORDER.indexOf(f.message));
      expect(order.every((at) => at >= 0), name).toBe(true);
      expect([...order].sort((x, y) => x - y), name).toEqual(order);
    }
  });
});

describe('formChecks on its own', () => {
  const base = {
    formData: { ...VALID, meeting_link: '' },
    facilitators: [{ user_id: 'u-c1', facilitator_role: 'consultor_externo' as const, is_lead: true }],
    isRecurring: false,
    recurrenceFrequency: 'weekly' as RecurrenceFrequency,
    recurrenceCount: 4,
    customDates: [''],
  };

  it('an empty form lists every failure at once, 9 and 10 both, linked to the school while none is chosen', () => {
    const found = formChecks({
      ...base,
      formData: { ...base.formData, school_id: 0, growth_community_id: '', title: '', session_date: '', location: '' },
      facilitators: [],
    });
    expect(found.map((f) => f.message)).toEqual([
      'Debe seleccionar un colegio',
      'Debe seleccionar una comunidad de crecimiento',
      'Debe ingresar un título',
      'Debe seleccionar una fecha',
      'Debe ingresar una ubicación para modalidad presencial o híbrida',
      'Debe asignar al menos un facilitador a la sesión',
      'Debe haber exactamente un facilitador principal',
    ]);
    expect(found.slice(-2).map((f) => f.fieldId)).toEqual([CREATE_FIELD_IDS.school, CREATE_FIELD_IDS.school]);
  });

  it('places each message: the empty time, the end, the consultants block with a school', () => {
    const noStart = formChecks({ ...base, formData: { ...base.formData, start_time: '' } });
    expect(noStart.map((f) => f.fieldId)).toEqual([CREATE_FIELD_IDS.start]);
    const noEnd = formChecks({ ...base, formData: { ...base.formData, end_time: '' } });
    expect(noEnd.map((f) => f.fieldId)).toEqual([CREATE_FIELD_IDS.end]);
    const before = formChecks({ ...base, formData: { ...base.formData, end_time: '08:00' } });
    expect(before.map((f) => [f.key, f.fieldId])).toEqual([['endAfterStart', CREATE_FIELD_IDS.end]]);
    const noOne = formChecks({ ...base, facilitators: [] });
    expect(noOne.map((f) => f.fieldId)).toEqual([CREATE_FIELD_IDS.consultants, CREATE_FIELD_IDS.consultants]);
  });
});
