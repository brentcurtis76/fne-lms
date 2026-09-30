// @vitest-environment jsdom
/**
 * pages/admin/assessment-builder/[templateId]/index.tsx — frecuencia editor
 *
 * PR 3 item 2: the indicator modal exposes min / max / step / default period
 * / allowed periods for a frecuencia indicator, prefills them from the stored
 * frequency_config, refuses to save an incomplete config with the same rule
 * set the publish endpoint enforces, and sends the full config (allowed_units
 * included) on save. Renders the real page with its data sources mocked.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildChainableQuery } from '../../api/assessment-builder/_helpers';
import { validateFrequencyConfig } from '../../../lib/services/assessment-builder/frequencyConfig';

const TEMPLATE_ID = 'ab000002-0000-0000-0000-000000000001';

const { mockToastError, mockToastSuccess, supabaseHolder, routerHolder, routerMock } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  supabaseHolder: { current: null as any },
  routerHolder: { current: null as any },
  routerMock: {
    push: vi.fn(),
    replace: vi.fn(),
    pathname: '/admin/assessment-builder/[templateId]',
    query: { templateId: 'ab000002-0000-0000-0000-000000000001' },
    isReady: true,
  },
}));

vi.mock('next/router', () => ({ useRouter: () => routerHolder.current }));
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

import TemplateEditor from '../../../pages/admin/assessment-builder/[templateId]/index';

const template = {
  id: TEMPLATE_ID, name: 'CRE Tercero Básico', description: '', area: 'evaluacion', status: 'draft', version: '1.0.0',
  is_archived: false, grade_id: 7,
  scoring_config: {
    level_thresholds: { consolidated: 87.5, advanced: 62.5, developing: 37.5, emerging: 12.5 },
    default_weights: { objective: 1, module: 1, indicator: 1 },
  },
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};
const objective = { id: 'obj-1', template_id: TEMPLATE_ID, name: 'Objetivo A', description: '', display_order: 1, weight: 1 };

function moduleWith(frequencyConfig: Record<string, unknown> | null, frequencyUnitOptions?: string[]) {
  return {
    id: 'mod-1', template_id: TEMPLATE_ID, objective_id: 'obj-1', name: 'Módulo A', description: '', instructions: '',
    display_order: 1, weight: 1,
    indicators: [
      { id: 'ind-1', moduleId: 'mod-1', code: 'C1', name: 'Cobertura', description: '', category: 'cobertura', weight: 1, displayOrder: 1 },
      {
        id: 'ind-2', moduleId: 'mod-1', code: 'F1', name: 'Frecuencia uno', description: '', category: 'frecuencia', weight: 1, displayOrder: 2,
        frequencyConfig: frequencyConfig, frequencyUnitOptions,
      },
    ],
  };
}

type FetchCall = { url: string; init?: RequestInit };
const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status < 300, status, json: async () => body } as unknown as Response);

function installFetch(log: FetchCall[], module: unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    log.push({ url, init });
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.endsWith(`/templates/${TEMPLATE_ID}`) && method === 'GET') return jsonResponse({ template });
    if (url.endsWith('/objectives') && method === 'GET') return jsonResponse({ objectives: [objective] });
    if (url.endsWith('/modules') && method === 'GET') return jsonResponse({ modules: [module] });
    // Expanding a module (re)loads its indicators from this endpoint.
    if (url.endsWith('/modules/mod-1/indicators') && method === 'GET') {
      return jsonResponse({ indicators: (module as any).indicators });
    }
    if (url.includes('/indicators/ind-2') && method === 'PUT') {
      const body = JSON.parse(String(init?.body));
      (module as any).indicators[1].frequencyConfig = body.frequencyConfig;
      return jsonResponse({ indicator: { ...(module as any).indicators[1], frequencyConfig: body.frequencyConfig, frequencyUnitOptions: body.frequencyUnitOptions } });
    }
    // Stands in for the publish endpoint's own gate: the stored config must pass the shared validator.
    if (url.endsWith(`/templates/${TEMPLATE_ID}/publish`) && method === 'POST') {
      const { valid, errors } = validateFrequencyConfig((module as any).indicators[1].frequencyConfig);
      return valid
        ? jsonResponse({ template: { version: '1.0.0' }, message: 'Template publicado correctamente' })
        : jsonResponse({ error: 'Configuración de frecuencia inválida', details: errors }, 400);
    }
    return jsonResponse({});
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
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

/** Expands objective and module, then opens the editor for the frecuencia indicator. */
async function openFrequencyEditor() {
  fireEvent.click(await screen.findByRole('button', { name: /Expandir proceso generativo: Objetivo A/ }));
  fireEvent.click(await screen.findByText('Módulo A'));
  fireEvent.click(await screen.findByRole('button', { name: 'Editar indicador: Frecuencia uno' }));
  await screen.findByTestId('frequency-min');
}

const putCalls = (log: FetchCall[]) => log.filter(c => c.url.includes('/indicators/ind-2') && c.init?.method === 'PUT');
const putBody = (log: FetchCall[]) => JSON.parse(String(putCalls(log)[0].init?.body));

describe('Template editor — frecuencia indicator configuration (PR 3 item 2)', () => {
  let fetchLog: FetchCall[];
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchLog = [];
    routerHolder.current = routerMock;
    installSupabase();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('prefills min/max/step, the default period and the allowed periods from the stored config', async () => {
    installFetch(fetchLog, moduleWith({ type: 'count', min: 1, max: 8, step: 0.5, unit: 'mes', allowed_units: ['semana', 'mes'] }));
    render(<TemplateEditor />);
    await openFrequencyEditor();

    expect(screen.getByTestId('frequency-min')).toHaveValue(1);
    expect(screen.getByTestId('frequency-max')).toHaveValue(8);
    expect(screen.getByTestId('frequency-step')).toHaveValue(0.5);
    expect(screen.getByTestId('frequency-default-unit')).toHaveValue('mes');
    expect(screen.getByTestId('frequency-allowed-unit-semana')).toBeChecked();
    expect(screen.getByTestId('frequency-allowed-unit-mes')).toBeChecked();
    expect(screen.getByTestId('frequency-allowed-unit-dia')).not.toBeChecked();
    expect(screen.queryByTestId('frequency-config-hint')).toBeNull();
  });

  it('shows the gap for a legacy { unit: "veces" } config and refuses to save until it is complete', async () => {
    installFetch(fetchLog, moduleWith({ unit: 'veces' }, ['dia', 'semana']));
    render(<TemplateEditor />);
    await openFrequencyEditor();

    // Legacy "veces" is not a period: the default falls back to the first allowed one.
    expect(screen.getByTestId('frequency-default-unit')).toHaveValue('dia');
    expect(screen.getByTestId('frequency-max')).toHaveValue(null);
    expect(screen.getByTestId('frequency-config-hint')).toHaveTextContent('Para publicar: el valor mínimo debe ser un número');

    fireEvent.click(screen.getByTestId('indicator-save-btn'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('Configuración de frecuencia incompleta'), { position: 'top-center' }));
    expect(putCalls(fetchLog)).toHaveLength(0);

    fireEvent.change(screen.getByTestId('frequency-min'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('frequency-max'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('frequency-step'), { target: { value: '1' } });
    expect(screen.getByTestId('frequency-config-hint')).toHaveTextContent('el valor mínimo debe ser menor que el máximo');
    fireEvent.click(screen.getByTestId('indicator-save-btn'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledTimes(2));
    expect(putCalls(fetchLog)).toHaveLength(0);
  });

  it('sends the complete frequency_config (allowed_units included) on save', async () => {
    installFetch(fetchLog, moduleWith({ type: 'count', unit: 'veces' }, ['dia', 'semana', 'mes']));
    render(<TemplateEditor />);
    await openFrequencyEditor();

    fireEvent.change(screen.getByTestId('frequency-min'), { target: { value: '0' } });
    fireEvent.change(screen.getByTestId('frequency-max'), { target: { value: '12' } });
    fireEvent.change(screen.getByTestId('frequency-step'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('frequency-allowed-unit-dia')); // uncheck dia (was the default)
    expect(screen.getByTestId('frequency-default-unit')).toHaveValue('semana');
    fireEvent.change(screen.getByTestId('frequency-default-unit'), { target: { value: 'mes' } });
    expect(screen.queryByTestId('frequency-config-hint')).toBeNull();

    fireEvent.click(screen.getByTestId('indicator-save-btn'));
    await waitFor(() => expect(putCalls(fetchLog)).toHaveLength(1));
    const body = putBody(fetchLog);
    expect(body.frequencyConfig).toEqual({
      type: 'count', unit: 'mes', min: 0, max: 12, step: 2, allowed_units: ['semana', 'mes'],
    });
    expect(body.frequencyUnitOptions).toEqual(['semana', 'mes']);
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Indicador actualizado'));
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('keeps the tree expanded when the router settles after first load, then saves and publishes past the separate gate (PROC-B004 D2)', async () => {
    installFetch(fetchLog, moduleWith({ type: 'count', min: 0.1, max: 3.1, step: 4, unit: 'semana', allowed_units: ['semana'] }, ['semana']));
    // Every session read yields a fresh user object, as a real client does.
    supabaseHolder.current.auth.getSession = vi.fn(async () => ({ data: { session: { user: { id: 'admin-1', email: 'admin@example.test' } } } }));
    const view = render(<TemplateEditor />);
    fireEvent.click(await screen.findByRole('button', { name: /Expandir proceso generativo: Objetivo A/ }));
    fireEvent.click(await screen.findByText('Módulo A'));
    const editButton = await screen.findByRole('button', { name: 'Editar indicador: Frecuencia uno' });

    // Hydration: Next hands the page a new router object for the same route.
    routerHolder.current = { ...routerMock };
    view.rerender(<TemplateEditor />);
    await waitFor(() => expect(supabaseHolder.current.auth.getSession).toHaveBeenCalledTimes(1));
    const templateLoads = () => fetchLog.filter(c => c.url.endsWith(`/templates/${TEMPLATE_ID}`) && !c.init?.method).length;
    expect(templateLoads()).toBe(1);
    expect(screen.getByRole('button', { name: 'Editar indicador: Frecuencia uno' })).toBe(editButton);

    // The stored draft config is invalid, so the publish gate refuses it and the template stays a draft.
    fireEvent.click(screen.getByTestId('publish-btn'));
    fireEvent.click(await screen.findByTestId('publish-confirm-btn'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Configuración de frecuencia inválida'));
    expect(mockToastSuccess).not.toHaveBeenCalled();

    fireEvent.click(editButton);
    await screen.findByTestId('frequency-min');
    // The modal's own refusal is raised at the top, away from the bottom-right toaster that covers its buttons (R0-F1).
    fireEvent.click(screen.getByTestId('indicator-save-btn'));
    await waitFor(() => expect(mockToastError).toHaveBeenLastCalledWith(
      expect.stringContaining('Configuración de frecuencia incompleta'), { position: 'top-center' }));
    expect(putCalls(fetchLog)).toHaveLength(0);
    fireEvent.change(screen.getByTestId('frequency-step'), { target: { value: '0.1' } });
    fireEvent.click(screen.getByTestId('indicator-save-btn'));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Indicador actualizado'));
    expect(putBody(fetchLog).frequencyConfig).toMatchObject({ min: 0.1, max: 3.1, step: 0.1, unit: 'semana' });

    fireEvent.click(screen.getByTestId('publish-btn'));
    fireEvent.click(await screen.findByTestId('publish-confirm-btn'));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Template publicado correctamente'));
    const publishes = fetchLog.filter(c => c.url.endsWith('/publish'));
    expect(publishes).toHaveLength(2);
    expect(templateLoads()).toBe(1);
  });
});
