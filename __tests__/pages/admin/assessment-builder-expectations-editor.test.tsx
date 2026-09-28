// @vitest-environment jsdom
/**
 * pages/admin/assessment-builder/[templateId]/expectations.tsx — frequency count editor
 *
 * PROC-20: the editor must send exactly the valid count and period the admin
 * sees. A fractional draft stays visible and blocks the save with an es-CL
 * message, the visible default period is saved with a count, counts above 999
 * are accepted, and GT/GI dirty state and server errors behave as before.
 * Renders the real page against a stateful fake of the expectations endpoint.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildChainableQuery } from '../../api/assessment-builder/_helpers';

const TEMPLATE_ID = 'ab000020-0000-4000-8000-000000000001';
const FREQ = 'ab000020-0000-4000-8000-0000000000f1';
const DEPTH = 'ab000020-0000-4000-8000-0000000000d1';
const ERROR_TEXT =
  'No se guardaron los cambios: la cantidad de frecuencia debe ser un número entero mayor o igual a 0.';

const { mockToastError, mockToastSuccess, supabaseHolder, routerMock } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  supabaseHolder: { current: null as any },
  routerMock: {
    push: vi.fn(),
    replace: vi.fn(),
    pathname: '/admin/assessment-builder/[templateId]/expectations',
    query: { templateId: 'ab000020-0000-4000-8000-000000000001' },
    isReady: true,
  },
}));

vi.mock('next/router', () => ({ useRouter: () => routerMock }));
vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => supabaseHolder.current }));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: mockToastError, success: mockToastSuccess });
  return { toast, default: toast };
});
vi.mock('../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="main-layout">{children}</div>,
}));
vi.mock('../../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import ExpectationsEditor from '../../../pages/admin/assessment-builder/[templateId]/expectations';

type Row = Record<string, unknown>;
type Call = { method: string; body?: any };

const emptyRow = (): Row => ({
  year1: null, year1Unit: null, year2: null, year2Unit: null, year3: null, year3Unit: null,
  year4: null, year4Unit: null, year5: null, year5Unit: null, tolerance: 1,
});

// Stateful fake of GET/PUT /expectations: a PUT row replaces the stored row, GET returns it.
function installServer(calls: Call[]) {
  const stored: Record<string, Row> = {
    [`${FREQ}-GT`]: { ...emptyRow(), year1: 2, year1Unit: 'mes' },
    [`${FREQ}-GI`]: emptyRow(),
    [`${DEPTH}-GT`]: { ...emptyRow(), year1: 2 },
    [`${DEPTH}-GI`]: emptyRow(),
  };
  let nextPut: { status: number; body: unknown } | null = null;

  const indicator = (id: string, name: string, category: string, extra: Row = {}) => ({
    indicatorId: id, indicatorCode: id === FREQ ? 'F1' : 'P1', indicatorName: name, indicatorCategory: category,
    expectationsGT: stored[`${id}-GT`], expectationsGI: stored[`${id}-GI`], ...extra,
  });

  globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, body });
    if (method === 'PUT') {
      if (nextPut) {
        const { status, body: errorBody } = nextPut;
        return {
          ok: false, status,
          json: async () => { if (errorBody === null) throw new SyntaxError('Unexpected token <'); return errorBody; },
        } as unknown as Response;
      }
      for (const row of body.expectations) {
        const { indicatorId, generationType, ...values } = row;
        stored[`${indicatorId}-${generationType}`] = values;
      }
      return { ok: true, status: 200, json: async () => ({ success: true, saved: body.expectations.length }) } as unknown as Response;
    }
    return {
      ok: true, status: 200,
      json: async () => ({
        template: {
          id: TEMPLATE_ID, name: 'Plantilla sintética PROC-20', area: 'evaluacion', status: 'draft',
          version: '1.0', isAlwaysGT: false, requiresDualExpectations: true,
        },
        modules: [{
          moduleId: 'mod-1', moduleName: 'Acción sintética', moduleOrder: 1,
          indicators: [
            indicator(FREQ, 'Frecuencia sintética', 'frecuencia', { frequencyUnitOptions: ['semana', 'mes'] }),
            indicator(DEPTH, 'Profundidad sintética', 'profundidad'),
          ],
        }],
        objectives: [],
      }),
    } as unknown as Response;
  }) as unknown as typeof fetch;

  return {
    stored,
    failNextPut: (status: number, body: unknown) => { nextPut = { status, body }; },
  };
}

function installSupabase() {
  supabaseHolder.current = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'admin-1', email: 'admin@example.test' } } } }),
      signOut: vi.fn(),
    },
    from: vi.fn((table: string) => {
      if (table === 'user_roles') return buildChainableQuery([{ role_type: 'admin' }]);
      if (table === 'profiles') return buildChainableQuery({ avatar_url: null });
      return buildChainableQuery(null, null);
    }),
  };
}

const count = (gen: 'GT' | 'GI', year: number) =>
  screen.getByTestId(`freq-${FREQ}-${gen}-year${year}`) as HTMLInputElement;
const unit = (gen: 'GT' | 'GI', year: number) =>
  screen.getByTestId(`freq-${FREQ}-${gen}-year${year}-unit`) as HTMLSelectElement;
const saveButton = () => screen.getByRole('button', { name: /Guardar Cambios/ });
const puts = (calls: Call[]) => calls.filter(c => c.method === 'PUT');

async function renderEditor() {
  render(<ExpectationsEditor />);
  await screen.findByTestId(`freq-${FREQ}-GT-year1`);
}

describe('Expectations editor — frequency count and period (PROC-20)', () => {
  let calls: Call[];
  let server: ReturnType<typeof installServer>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    server = installServer(calls);
    installSupabase();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('D1: a fractional draft stays visible, shows the es-CL error and sends no PUT', async () => {
    await renderEditor();
    fireEvent.change(count('GT', 2), { target: { value: '1.5' } });
    fireEvent.click(saveButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(ERROR_TEXT);
    expect(alert).toHaveTextContent('Revisa: F1 (GT, Año 2)');
    expect(count('GT', 2).value).toBe('1.5');
    expect(count('GT', 2)).toHaveAttribute('aria-invalid', 'true');
    expect(count('GT', 2)).toHaveFocus();
    expect(mockToastError).toHaveBeenCalledWith(ERROR_TEXT);
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(puts(calls)).toHaveLength(0);
    expect(server.stored[`${FREQ}-GT`].year2).toBeNull();

    // Correcting the draft clears the error and the save carries the corrected count
    fireEvent.change(count('GT', 2), { target: { value: '2' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(saveButton());
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0].body.expectations[0]).toMatchObject({ generationType: 'GT', year2: 2, year2Unit: 'semana' });
  });

  it.each(['-1', '1e3', '2,5', 'abc'])('D1: the draft %s is rejected without a PUT and stays as typed', async (raw) => {
    await renderEditor();
    fireEvent.change(count('GT', 3), { target: { value: raw } });
    fireEvent.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_TEXT);
    expect(count('GT', 3).value).toBe(raw);
    expect(puts(calls)).toHaveLength(0);
  });

  it('D2: a count saved with the visible default period carries that period, clears dirty state and reloads the same pair', async () => {
    await renderEditor();
    expect(unit('GT', 2).value).toBe('semana'); // stored unit is null; the select shows the first option
    fireEvent.change(count('GT', 2), { target: { value: '5' } });
    expect(screen.getByText('Hay cambios sin guardar')).toBeInTheDocument();
    fireEvent.click(saveButton());

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('1 expectativa guardada'));
    const [put] = puts(calls);
    expect(put.body.expectations).toHaveLength(1);
    expect(put.body.expectations[0]).toMatchObject({
      indicatorId: FREQ, generationType: 'GT', year1: 2, year1Unit: 'mes', year2: 5, year2Unit: 'semana',
      year3: null, year3Unit: null,
    });
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByText('Hay cambios sin guardar')).toBeNull();

    cleanup();
    await renderEditor();
    expect(count('GT', 2).value).toBe('5');
    expect(unit('GT', 2).value).toBe('semana');
  });

  it('D3: 1000 has no HTML cap and reaches the PUT unchanged; a cleared count is saved as null', async () => {
    await renderEditor();
    expect(count('GT', 4)).not.toHaveAttribute('max');
    fireEvent.change(count('GT', 4), { target: { value: '1000' } });
    fireEvent.change(count('GT', 1), { target: { value: '' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0].body.expectations[0]).toMatchObject({
      generationType: 'GT', year1: null, year1Unit: 'mes', year4: 1000, year4Unit: 'semana',
    });
    expect(screen.queryByRole('alert')).toBeNull();

    cleanup();
    await renderEditor();
    expect(count('GT', 4).value).toBe('1000');
    expect(count('GT', 1).value).toBe('');
  });

  it('D4: GT and GI edits are saved as separate rows and only the dirty generation is sent', async () => {
    await renderEditor();
    fireEvent.change(count('GI', 1), { target: { value: '3' } });
    fireEvent.change(unit('GI', 1), { target: { value: 'mes' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    const rows = puts(calls)[0].body.expectations;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ indicatorId: FREQ, generationType: 'GI', year1: 3, year1Unit: 'mes' });
    expect(server.stored[`${FREQ}-GT`]).toMatchObject({ year1: 2, year1Unit: 'mes' });

    // A depth change on GT and a frequency change on GI in the same save stay separate
    fireEvent.change(screen.getAllByRole('combobox').find(
      el => (el as HTMLSelectElement).value === '2' && el.closest('tr')?.textContent?.includes('Profundidad sintética'),
    )!, { target: { value: '4' } });
    fireEvent.change(count('GI', 2), { target: { value: '7' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(puts(calls)).toHaveLength(2));
    const second = puts(calls)[1].body.expectations;
    expect(second).toHaveLength(2);
    expect(second).toEqual(expect.arrayContaining([
      expect.objectContaining({ indicatorId: FREQ, generationType: 'GI', year1: 3, year2: 7, year2Unit: 'semana' }),
      expect.objectContaining({ indicatorId: DEPTH, generationType: 'GT', year1: 4, year1Unit: null }),
    ]));
  });

  it('D4: a 4xx response shows the server error and keeps the draft and dirty state', async () => {
    server.failNextPut(400, { error: 'Validación fallida: Indicador F1: year2 debe ser un número entero >= 0 o null' });
    await renderEditor();
    fireEvent.change(count('GT', 2), { target: { value: '5' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(
      'Validación fallida: Indicador F1: year2 debe ser un número entero >= 0 o null',
    ));
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(count('GT', 2).value).toBe('5');
    expect(saveButton()).toBeEnabled();
    expect(screen.getByText('Hay cambios sin guardar')).toBeInTheDocument();
    expect(server.stored[`${FREQ}-GT`].year2).toBeNull();
  });

  it('D4: a 5xx response without a JSON body shows the generic error, not a success', async () => {
    server.failNextPut(502, null);
    await renderEditor();
    fireEvent.change(count('GT', 2), { target: { value: '5' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Error al guardar expectativas'));
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(saveButton()).toBeEnabled();
    expect(screen.getByText('Hay cambios sin guardar')).toBeInTheDocument();
  });
});
