// @vitest-environment jsdom
/**
 * pages/docente/assessments/[instanceId]/index.tsx — autosave reliability and
 * form clarity (PR 3, items 1 and 3). Renders the REAL page with the real
 * ModuleCard / IndicatorInput / FrecuenciaInput tree; only the layout chrome,
 * router, Supabase client and toast are mocked.
 *
 * Covered:
 *  - rapid A -> B -> C edits inside the debounce window persist in ONE PUT
 *  - a failed PUT keeps everything dirty and Guardar enabled; Guardar retries
 *  - an edit made while a save is in flight is flushed after it
 *  - Enviar aborts (no POST) when the pre-submit flush fails
 *  - clearing the frequency field sends null (never NaN)
 *  - the displayed default unit is emitted and persisted; allowed_units and
 *    config.unit from the snapshot drive that default
 *  - beforeunload warns only while dirty
 *  - the context summary shows course, grade, year, generation and status
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildChainableQuery } from '../../api/assessment-builder/_helpers';

const { mockRouterPush, mockToastError, mockToastSuccess, supabaseHolder, routerMock, INSTANCE_ID } = vi.hoisted(() => {
  const INSTANCE_ID = '66666666-6666-4666-8666-666666666666';
  return {
    INSTANCE_ID,
    mockRouterPush: vi.fn(),
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn(),
    supabaseHolder: { current: null as any },
    routerMock: {
      push: vi.fn(),
      replace: vi.fn(),
      pathname: '/docente/assessments/[instanceId]',
      query: { instanceId: INSTANCE_ID },
      isReady: true,
      // Minimal Next router event bus: tests fire routeChangeStart through it.
      events: (() => {
        const handlers = new Map<string, Set<(...args: any[]) => void>>();
        return {
          on: vi.fn((name: string, fn: (...args: any[]) => void) => {
            if (!handlers.has(name)) handlers.set(name, new Set());
            handlers.get(name)!.add(fn);
          }),
          off: vi.fn((name: string, fn: (...args: any[]) => void) => handlers.get(name)?.delete(fn)),
          emit: vi.fn(),
          fire(name: string, ...args: any[]) {
            for (const fn of handlers.get(name) ?? []) fn(...args);
          },
          handlerCount(name: string) {
            return handlers.get(name)?.size ?? 0;
          },
        };
      })(),
    },
  };
});

vi.mock('next/router', () => ({ useRouter: () => routerMock }));
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => supabaseHolder.current,
}));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign((..._args: unknown[]) => undefined, {
    error: mockToastError,
    success: mockToastSuccess,
  });
  return { toast, default: toast };
});
vi.mock('../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="main-layout">{children}</div>,
}));
vi.mock('../../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ title, subtitle, children }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      {children}
    </div>
  ),
}));
vi.mock('../../../components/tutorials/HelpButton', () => ({
  default: () => <button type="button">Ayuda</button>,
}));

import AssessmentResponseForm from '../../../pages/docente/assessments/[instanceId]/index';

// Main's journal survives unmount; each synthetic test starts with fresh storage.
beforeEach(() => window.localStorage.clear());

// ---------------------------------------------------------------------------
// Synthetic fixture: one objective, one module, A (cobertura gate), B
// (frecuencia), C (profundidad).
// ---------------------------------------------------------------------------
const IND_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const IND_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const IND_C = 'cccccccc-0000-4000-8000-000000000003';
const MODULE_ID = 'dddddddd-0000-4000-8000-000000000004';

type FrequencyOverrides = { frequencyConfig?: Record<string, unknown>; frequencyUnitOptions?: string[] };

function buildInstancePayload(opts: {
  responses?: Record<string, unknown>;
  status?: string;
  generationType?: string;
  frequency?: FrequencyOverrides;
  assignee?: Partial<{ canEdit: boolean; canSubmit: boolean }>;
} = {}) {
  const indicators = [
    { id: IND_A, code: 'A', name: 'Indicador A', category: 'cobertura', displayOrder: 1, weight: 1 },
    {
      id: IND_B, code: 'B', name: 'Indicador B', category: 'frecuencia', displayOrder: 2, weight: 1,
      frequencyConfig: opts.frequency?.frequencyConfig ?? { type: 'count', min: 0, max: 10, step: 1 },
      frequencyUnitOptions: opts.frequency?.frequencyUnitOptions,
    },
    {
      id: IND_C, code: 'C', name: 'Indicador C', category: 'profundidad', displayOrder: 3, weight: 1,
      level0Descriptor: 'Nada', level1Descriptor: 'Poco', level2Descriptor: 'Algo', level3Descriptor: 'Bastante', level4Descriptor: 'Todo',
    },
  ];
  const module = { id: MODULE_ID, name: 'Práctica 1', displayOrder: 1, weight: 1, objectiveId: 'obj-1', indicators };
  const responses = opts.responses ?? {};
  return {
    success: true,
    instance: {
      id: INSTANCE_ID,
      transformationYear: 2,
      generationType: opts.generationType ?? 'GI',
      status: opts.status ?? 'in_progress',
      courseInfo: { gradeLevel: '3_basico', courseName: '3° Básico A' },
    },
    assignee: { canEdit: true, canSubmit: true, hasStarted: true, hasSubmitted: false, ...(opts.assignee ?? {}) },
    template: { id: 'tpl-1', version: '1.1.0', name: 'Plantilla Sintética', area: 'evaluacion' },
    objectives: [{ id: 'obj-1', name: 'Objetivo 1', displayOrder: 1, weight: 1, modules: [module] }],
    modules: [module],
    responses,
    progress: { total: 3, answered: Object.keys(responses).length, percentage: 0 },
  };
}

const ALL_ANSWERED = {
  [IND_A]: { coverageValue: true },
  [IND_B]: { frequencyValue: 2, frequencyUnit: 'semana' },
  [IND_C]: { profundityLevel: 3 },
};

type PutCall = { body: any };
type Deferred = { resolve: (r: Response) => void };

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 300, status, json: async () => body } as unknown as Response;
}

interface ServerState {
  putStatus: number;
  putBody: Record<string, unknown>;
  /** When set, the next PUT is held until the test resolves it. */
  holdNextPut?: Deferred[];
}

function installFetch(instancePayload: unknown, server: ServerState) {
  const puts: PutCall[] = [];
  const submits: number[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url === `/api/docente/assessments/${INSTANCE_ID}` && method === 'GET') {
      return jsonResponse(instancePayload);
    }
    if (url === `/api/docente/assessments/${INSTANCE_ID}/responses` && method === 'PUT') {
      puts.push({ body: JSON.parse(String(init?.body)) });
      if (server.holdNextPut && server.holdNextPut.length >= 0 && server.holdNextPut !== undefined) {
        const hold = server.holdNextPut;
        server.holdNextPut = undefined;
        return new Promise<Response>((resolve) => hold.push({ resolve }));
      }
      const body = { ...server.putBody };
      if (body.success && body.saved === undefined && !body.errors) {
        body.saved = JSON.parse(String(init?.body)).responses.length;
      }
      return jsonResponse(body, server.putStatus);
    }
    if (url === `/api/docente/assessments/${INSTANCE_ID}/submit` && method === 'POST') {
      submits.push(Date.now());
      return jsonResponse({ success: true });
    }
    return jsonResponse({});
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { fetchMock, puts, submits };
}

function installSupabase() {
  supabaseHolder.current = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'docente-1', email: 'docente@example.test' } } },
      }),
      signOut: vi.fn(),
    },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return buildChainableQuery({ avatar_url: null });
      return buildChainableQuery(null, null);
    }),
  };
}

const okServer = (): ServerState => ({ putStatus: 200, putBody: { success: true } });

async function renderForm(instancePayload: unknown, server: ServerState) {
  installSupabase();
  const io = installFetch(instancePayload, server);
  const view = render(<AssessmentResponseForm />);
  await screen.findByTestId('assessment-context-summary');
  // The first module is expanded by default; wait for its gate button.
  await screen.findByRole('button', { name: `Sí: Indicador A` });
  return { ...io, unmount: view.unmount };
}

const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const rowFor = (puts: PutCall[], index: number, indicatorId: string) =>
  puts[index].body.responses.find((r: any) => r.indicator_id === indicatorId);

describe('docente assessment form — autosave reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists rapid A -> B -> C edits made inside the debounce window in ONE PUT', async () => {
    const server = okServer();
    const { puts } = await renderForm(buildInstancePayload(), server);

    fireEvent.click(screen.getByRole('button', { name: 'Sí: Indicador A' }));
    const frequency = await screen.findByTestId('frecuencia-value-input');
    fireEvent.change(frequency, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /^2\. En Desarrollo/ }));

    await advance(1999);
    expect(puts).toHaveLength(0);
    await advance(1);
    await waitFor(() => expect(puts).toHaveLength(1));

    const ids = puts[0].body.responses.map((r: any) => r.indicator_id).sort();
    expect(ids).toEqual([IND_A, IND_B, IND_C].sort());
    expect(rowFor(puts, 0, IND_A)).toMatchObject({ coverage_value: true });
    expect(rowFor(puts, 0, IND_B)).toMatchObject({ frequency_value: 3, frequency_unit: 'dia' });
    expect(rowFor(puts, 0, IND_C)).toMatchObject({ profundity_level: 2 });

    await waitFor(() => expect(screen.getByTestId('assessment-save-button')).toBeDisabled());
    await advance(5000);
    expect(puts).toHaveLength(1);
  });

  it('keeps everything dirty and Guardar enabled when the PUT fails, and Guardar retries the same set', async () => {
    const server: ServerState = { putStatus: 500, putBody: { error: 'Error al guardar respuestas' } };
    const { puts } = await renderForm(buildInstancePayload(), server);

    fireEvent.click(screen.getByRole('button', { name: 'Sí: Indicador A' }));
    fireEvent.click(screen.getByRole('button', { name: /^3\. Avanzado/ }));
    await advance(2000);
    await waitFor(() => expect(puts).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId('assessment-save-status')).toHaveTextContent('Error al guardar respuestas'));

    const save = screen.getByTestId('assessment-save-button');
    await waitFor(() => expect(save).toBeEnabled());

    server.putStatus = 200;
    server.putBody = { success: true, saved: 2 };
    fireEvent.click(save);
    await waitFor(() => expect(puts).toHaveLength(2));
    const retried = puts[1].body.responses.map((r: any) => r.indicator_id).sort();
    expect(retried).toEqual([IND_A, IND_C].sort());
    await waitFor(() => expect(screen.getByTestId('assessment-save-button')).toBeDisabled());
  });

  it('flushes an edit made while a save is in flight, after that save finishes', async () => {
    const server = okServer();
    const held: Deferred[] = [];
    server.holdNextPut = held;
    const { puts } = await renderForm(buildInstancePayload(), server);

    fireEvent.click(screen.getByRole('button', { name: 'Sí: Indicador A' }));
    await advance(2000);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(held).toHaveLength(1);

    // Edit C while PUT #1 is still pending.
    fireEvent.click(screen.getByRole('button', { name: /^4\. Consolidado/ }));
    expect(puts).toHaveLength(1);

    await act(async () => {
      held[0].resolve(jsonResponse({ success: true, saved: 1 }));
    });
    await flushMicrotasks();

    // The edit's own debounce fires and is queued behind PUT #1.
    await advance(2000);
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1].body.responses.map((r: any) => r.indicator_id)).toEqual([IND_C]);
    expect(rowFor(puts, 1, IND_C)).toMatchObject({ profundity_level: 4 });
    await waitFor(() => expect(screen.getByTestId('assessment-save-button')).toBeDisabled());
  });

  it('Guardar is disabled while a save is in flight, then re-enabled for an edit made meanwhile and sends only it', async () => {
    const server = okServer();
    const held: Deferred[] = [];
    server.holdNextPut = held;
    const { puts } = await renderForm(buildInstancePayload(), server);

    fireEvent.click(screen.getByRole('button', { name: 'Sí: Indicador A' }));
    await advance(2000);
    await waitFor(() => expect(held).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: /^1\. Incipiente/ }));
    const save = screen.getByTestId('assessment-save-button');
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(puts).toHaveLength(1); // still waiting on PUT #1; the click was a no-op

    await act(async () => {
      held[0].resolve(jsonResponse({ success: true, saved: 1 }));
    });
    // A confirmed PUT #1 must not clear C, which was edited after it started.
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1].body.responses.map((r: any) => r.indicator_id)).toEqual([IND_C]);
    expect(rowFor(puts, 1, IND_C)).toMatchObject({ profundity_level: 1 });
  });

  it('Enviar aborts with an es-CL toast and never POSTs submit when the pre-save fails', async () => {
    const server: ServerState = { putStatus: 500, putBody: { error: 'Error al guardar respuestas' } };
    const { puts, submits } = await renderForm(buildInstancePayload({ responses: ALL_ANSWERED }), server);

    const submit = screen.getByTestId('assessment-submit-button');
    await waitFor(() => expect(submit).toBeEnabled());

    // Make something dirty so the flush has work to do, then submit before the debounce.
    fireEvent.click(screen.getByRole('button', { name: /^4\. Consolidado/ }));
    fireEvent.click(submit);
    fireEvent.click(await screen.findByTestId('assessment-submit-confirm-button'));

    await waitFor(() => expect(puts).toHaveLength(1));
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'Hay respuestas pendientes de guardar. Intenta nuevamente antes de enviar.'
      )
    );
    expect(submits).toHaveLength(0);
    expect(routerMock.push).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('assessment-save-button')).toBeEnabled());

    // The debounce was cancelled by Enviar: no second PUT fires on its own.
    await advance(3000);
    expect(puts).toHaveLength(1);
  });

  it('Enviar flushes dirty responses first and then POSTs submit when the save succeeds', async () => {
    const server = okServer();
    const { puts, submits } = await renderForm(buildInstancePayload({ responses: ALL_ANSWERED }), server);
    const submit = screen.getByTestId('assessment-submit-button');
    await waitFor(() => expect(submit).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: /^4\. Consolidado/ }));
    fireEvent.click(submit);
    fireEvent.click(await screen.findByTestId('assessment-submit-confirm-button'));

    await waitFor(() => expect(submits).toHaveLength(1));
    expect(puts).toHaveLength(1);
    expect(rowFor(puts, 0, IND_C)).toMatchObject({ profundity_level: 4 });
    await waitFor(() => expect(screen.getByTestId('assessment-context-status')).toHaveTextContent('Completada'));
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('sends null (never NaN) when the frequency field is cleared', async () => {
    const server = okServer();
    const { puts } = await renderForm(
      buildInstancePayload({ responses: { [IND_A]: { coverageValue: true }, [IND_B]: { frequencyValue: 5, frequencyUnit: 'mes' } } }),
      server
    );
    const frequency = await screen.findByTestId('frecuencia-value-input');
    expect(frequency).toHaveValue(5);

    fireEvent.change(frequency, { target: { value: '' } });
    await advance(2000);
    await waitFor(() => expect(puts).toHaveLength(1));

    const row = rowFor(puts, 0, IND_B);
    expect(row).toHaveProperty('frequency_value', null);
    expect(row.frequency_unit).toBe('mes');
    expect(JSON.stringify(puts[0].body)).not.toContain('NaN');
  });

  it('emits the displayed default unit so frequency_unit is persisted with the value', async () => {
    const server = okServer();
    const { puts } = await renderForm(
      buildInstancePayload({
        responses: { [IND_A]: { coverageValue: true } },
        frequency: { frequencyConfig: { type: 'count', min: 0, max: 10, step: 1, allowed_units: ['mes', 'semana'] } },
      }),
      server
    );
    const select = await screen.findByTestId('frecuencia-unit-select');
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.value)).toEqual(['mes', 'semana']);
    expect(select).toHaveValue('mes');

    fireEvent.change(screen.getByTestId('frecuencia-value-input'), { target: { value: '4' } });
    await advance(2000);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(rowFor(puts, 0, IND_B)).toMatchObject({ frequency_value: 4, frequency_unit: 'mes' });
  });

  it('puts config.unit first among the allowed units and uses it as the default', async () => {
    const server = okServer();
    const { puts } = await renderForm(
      buildInstancePayload({
        responses: { [IND_A]: { coverageValue: true } },
        frequency: {
          frequencyConfig: { type: 'count', min: 0, max: 10, step: 1, unit: 'semana', allowed_units: ['mes', 'semana'] },
        },
      }),
      server
    );
    const select = await screen.findByTestId('frecuencia-unit-select');
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.value)).toEqual(['semana', 'mes']);

    fireEvent.change(screen.getByTestId('frecuencia-value-input'), { target: { value: '1' } });
    await advance(2000);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(rowFor(puts, 0, IND_B)).toMatchObject({ frequency_value: 1, frequency_unit: 'semana' });
  });

  it('falls back to the platform default units when the snapshot has none, ignoring a legacy "veces" unit', async () => {
    const server = okServer();
    await renderForm(
      buildInstancePayload({
        responses: { [IND_A]: { coverageValue: true } },
        frequency: { frequencyConfig: { type: 'count', unit: 'veces' } },
      }),
      server
    );
    const select = await screen.findByTestId('frecuencia-unit-select');
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.value)).toEqual([
      'dia', 'semana', 'mes', 'trimestre', 'semestre', 'año',
    ]);
  });

  it('does not autosave anything just by opening a form with an untouched frecuencia indicator', async () => {
    const server = okServer();
    const { puts } = await renderForm(buildInstancePayload({ responses: { [IND_A]: { coverageValue: true } } }), server);
    await screen.findByTestId('frecuencia-unit-select');
    await advance(5000);
    expect(puts).toHaveLength(0);
    expect(screen.getByTestId('assessment-save-button')).toBeDisabled();
  });

  it('warns on beforeunload only while there are unsaved responses', async () => {
    const server = okServer();
    const { puts } = await renderForm(buildInstancePayload(), server);

    const fire = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(fire()).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Sí: Indicador A' }));
    await waitFor(() => expect(screen.getByTestId('assessment-save-button')).toBeEnabled());
    expect(fire()).toBe(true);

    await advance(2000);
    await waitFor(() => expect(puts).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId('assessment-save-button')).toBeDisabled());
    expect(fire()).toBe(false);
  });

  it('keeps an indicator dirty when the API reports it in errors on a 200', async () => {
    const server: ServerState = {
      putStatus: 200,
      putBody: { success: true, saved: 1, errors: [`Indicador ${IND_B}: frecuencia debe ser un número válido`] },
    };
    const { puts } = await renderForm(buildInstancePayload({ responses: { [IND_A]: { coverageValue: true } } }), server);

    fireEvent.change(await screen.findByTestId('frecuencia-value-input'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /^1\. Incipiente/ }));
    await advance(2000);
    await waitFor(() => expect(puts).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId('assessment-save-button')).toBeEnabled());

    server.putBody = { success: true, saved: 2 };
    fireEvent.click(screen.getByTestId('assessment-save-button'));
    await waitFor(() => expect(puts).toHaveLength(2));
    // Main's durable journal conservatively retains the whole partial batch.
    // The idempotent upsert may repeat C, but must never acknowledge failed B.
    expect(puts[1].body.responses.map((r: any) => r.indicator_id).sort()).toEqual([IND_B, IND_C].sort());
    await waitFor(() => expect(screen.getByTestId('assessment-save-button')).toBeDisabled());
  });
});

describe('docente assessment form — context summary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows course, grade, transformation year, generation type and status in es-CL', async () => {
    await renderForm(buildInstancePayload({ generationType: 'GI', status: 'in_progress' }), okServer());
    const summary = screen.getByTestId('assessment-context-summary');
    expect(summary).toBeInTheDocument();
    expect(screen.getByTestId('assessment-context-course')).toHaveTextContent('3° Básico A');
    expect(screen.getByTestId('assessment-context-grade')).toHaveTextContent('3° Básico');
    expect(screen.getByTestId('assessment-context-year')).toHaveTextContent('Año 2');
    expect(screen.getByTestId('assessment-context-generation')).toHaveTextContent('Generación Innova (GI)');
    expect(screen.getByTestId('assessment-context-status')).toHaveTextContent('En progreso');
  });

  it('labels GT and a pending status', async () => {
    await renderForm(buildInstancePayload({ generationType: 'GT', status: 'pending' }), okServer());
    expect(screen.getByTestId('assessment-context-generation')).toHaveTextContent('Generación Tractor (GT)');
    expect(screen.getByTestId('assessment-context-status')).toHaveTextContent('Pendiente');
  });
  // ── R6: internal navigation must not discard autosaved edits ──────────
  describe('internal navigation (R6)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('Volver flushes the dirty set first and navigates only after the PUT succeeded — no confirm dialog', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const server = okServer();
      const { puts } = await renderForm(buildInstancePayload(), server);

      fireEvent.click(screen.getByRole('button', { name: 'Sí: Indicador A' }));
      fireEvent.click(screen.getByTestId('assessment-back-button'));

      await waitFor(() => expect(puts).toHaveLength(1));
      expect(rowFor(puts, 0, IND_A)).toMatchObject({ coverage_value: true });
      await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/docente/assessments'));
      expect(confirmSpy).not.toHaveBeenCalled();
      // The debounce was cancelled by the flush: no second PUT.
      await advance(3000);
      expect(puts).toHaveLength(1);
      confirmSpy.mockRestore();
    });

    it('Volver stays on the page (no navigation) when the flush fails, keeping the responses dirty', async () => {
      const server: ServerState = { putStatus: 500, putBody: { error: 'Error al guardar respuestas' } };
      const { puts } = await renderForm(buildInstancePayload(), server);

      fireEvent.click(screen.getByRole('button', { name: 'Sí: Indicador A' }));
      fireEvent.click(screen.getByTestId('assessment-back-button'));

      await waitFor(() => expect(puts).toHaveLength(1));
      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith(
          'No se pudieron guardar tus respuestas antes de salir. Revisa tu conexión e intenta nuevamente.'
        )
      );
      expect(routerMock.push).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.getByTestId('assessment-save-button')).toBeEnabled());
      await waitFor(() => expect(screen.getByTestId('assessment-back-button')).toBeEnabled());
    });

    it('a route change with unsaved responses asks stay/leave; "stay" aborts the navigation and keeps the autosave', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const server = okServer();
      const { puts } = await renderForm(buildInstancePayload(), server);
      expect(routerMock.events.handlerCount('routeChangeStart')).toBe(1);

      fireEvent.click(screen.getByRole('button', { name: 'Sí: Indicador A' }));
      expect(() => routerMock.events.fire('routeChangeStart', '/docente/assessments')).toThrow(/respuestas sin guardar/);
      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('respuestas sin guardar'));
      expect(routerMock.events.emit).toHaveBeenCalledWith('routeChangeError', expect.any(Error), '/docente/assessments', { shallow: false });

      // Staying: the pending debounce still saves the answer.
      await advance(2000);
      await waitFor(() => expect(puts).toHaveLength(1));
      confirmSpy.mockRestore();
    });

    it('"leave" lets the navigation through and cancels the pending debounce (no stray save after unmount)', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const server = okServer();
      const { puts, unmount } = await renderForm(buildInstancePayload(), server);

      fireEvent.click(screen.getByRole('button', { name: 'Sí: Indicador A' }));
      expect(() => routerMock.events.fire('routeChangeStart', '/docente/assessments')).not.toThrow();
      expect(routerMock.events.emit).not.toHaveBeenCalled();
      unmount(); // Next unmounts after the accepted route change; the mock must too.
      await advance(3000);
      expect(puts).toHaveLength(0);
      expect(window.localStorage.length).toBe(1); // Recovery survives leaving.
      confirmSpy.mockRestore();
    });

    it('a route change with nothing dirty never prompts', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      await renderForm(buildInstancePayload({ responses: ALL_ANSWERED }), okServer());
      expect(() => routerMock.events.fire('routeChangeStart', '/docente/assessments')).not.toThrow();
      expect(confirmSpy).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('unmount removes the route guard', async () => {
      const { unmount } = render(<AssessmentResponseForm />);
      await screen.findByTestId('assessment-context-summary');
      expect(routerMock.events.handlerCount('routeChangeStart')).toBe(1);
      unmount();
      expect(routerMock.events.handlerCount('routeChangeStart')).toBe(0);
    });
  });

  // ── R11: submit authority and confirmation ─────────────────────────────
  describe('submit controls (R11)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('an assignee without can_submit never sees an enabled Enviar action', async () => {
      await renderForm(buildInstancePayload({ responses: ALL_ANSWERED, assignee: { canSubmit: false } }), okServer());
      expect(screen.queryByTestId('assessment-submit-button')).not.toBeInTheDocument();
      expect(screen.getByTestId('assessment-submit-unavailable')).toHaveTextContent('Sin autorización para enviar');
      // Editing is still possible for a can_edit assignee.
      expect(screen.getByTestId('assessment-save-button')).toBeInTheDocument();
    });

    it('a read-only assignee (can_edit false) has no Guardar control', async () => {
      await renderForm(buildInstancePayload({ responses: ALL_ANSWERED, assignee: { canEdit: false } }), okServer());
      expect(screen.queryByTestId('assessment-save-button')).not.toBeInTheDocument();
    });

    it('Enviar opens a confirmation; cancelling never POSTs', async () => {
      const { submits, puts } = await renderForm(buildInstancePayload({ responses: ALL_ANSWERED }), okServer());
      const submit = screen.getByTestId('assessment-submit-button');
      await waitFor(() => expect(submit).toBeEnabled());

      fireEvent.click(submit);
      const dialog = await screen.findByTestId('assessment-submit-confirm');
      expect(dialog).toHaveTextContent('¿Enviar la evaluación?');
      fireEvent.click(screen.getByTestId('assessment-submit-cancel'));

      await waitFor(() => expect(screen.queryByTestId('assessment-submit-confirm')).not.toBeInTheDocument());
      expect(submits).toHaveLength(0);
      expect(puts).toHaveLength(0);
      expect(routerMock.push).not.toHaveBeenCalled();
    });

    it('a successful confirmed submit retains the completed form without navigating or stranding "Enviando"', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const { submits } = await renderForm(buildInstancePayload({ responses: ALL_ANSWERED }), okServer());
      const submit = screen.getByTestId('assessment-submit-button');
      await waitFor(() => expect(submit).toBeEnabled());

      fireEvent.click(submit);
      fireEvent.click(await screen.findByTestId('assessment-submit-confirm-button'));

      await waitFor(() => expect(submits).toHaveLength(1));
      await waitFor(() => expect(screen.getByTestId('assessment-context-status')).toHaveTextContent('Completada'));
      expect(routerMock.push).not.toHaveBeenCalled();
      expect(() => routerMock.events.fire('routeChangeStart', `/docente/assessments/${INSTANCE_ID}/results`)).not.toThrow();
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(screen.queryByTestId('assessment-submit-button')).not.toBeInTheDocument();
      confirmSpy.mockRestore();
    });
  });
});
