// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AssessmentResponseForm from '@/pages/docente/assessments/[instanceId]';

const mocks = vi.hoisted(() => {
  const single = vi.fn().mockResolvedValue({ data: {} });
  const query = { select: vi.fn(), eq: vi.fn(), single };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return {
    router: { query: { instanceId: 'synthetic-instance' }, push: vi.fn() },
    supabase: {
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'synthetic-adult' } } } }) },
      from: vi.fn().mockReturnValue(query),
    },
    success: vi.fn(), error: vi.fn(),
  };
});
vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => mocks.supabase }));
vi.mock('react-hot-toast', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/components/layout/MainLayout', () => ({ default: ({ children }: any) => <main>{children}</main> }));
vi.mock('@/components/layout/FunctionalPageHeader', () => ({ ResponsiveFunctionalPageHeader: () => null }));
vi.mock('@/components/tutorials/HelpButton', () => ({ default: () => null }));
vi.mock('@/components/assessment', () => ({
  ModuleCard: ({ responses, onResponseChange, canEdit }: any) => (
    <input aria-label="Respuesta" value={responses.indicator?.frequencyValue ?? ''} disabled={!canEdit}
      onChange={event => onResponseChange('indicator', 'frequencyValue', Number(event.target.value))} />
  ),
}));
const json = (body: any, ok = true) => ({ ok, json: async () => body });
let requests: Array<{ method: string; body: any }>;
let saveResult: any;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  requests = [];
  saveResult = json({ saved: 1 });
  fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
    if (!options) return json({
      instance: { status: 'in_progress' }, template: { name: 'Evaluación sintética' },
      modules: [{ id: 'module', indicators: [{ id: 'indicator', category: 'frecuencia', displayOrder: 1 }] }],
      responses: { indicator: { frequencyValue: 2 } }, assignee: { canEdit: true },
      progress: { total: 1, answered: 1, percentage: 100 },
    });
    requests.push({ method: options.method!, body: options.body ? JSON.parse(String(options.body)) : null });
    return options.method === 'PUT' ? saveResult : json({ success: true, completedAt: '2026-09-08T12:00:00Z' });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function editAndSubmit() {
  render(<AssessmentResponseForm />);
  fireEvent.change(await screen.findByLabelText('Respuesta'), { target: { value: '7' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Enviar/ })); });
}

describe('Assessment completion preserves answers', () => {
  it('saves the latest answer before submitting and retains it with the completion message', async () => {
    await editAndSubmit();
    expect(await screen.findByRole('status')).toHaveTextContent('Los informes individuales y del colegio se generarán');
    expect(requests.map(request => request.method)).toEqual(['PUT', 'POST']);
    expect(requests[0].body.responses[0].frequency_value).toBe(7);
    expect(screen.getByLabelText('Respuesta')).toHaveValue('7');
    expect(screen.getByLabelText('Respuesta')).toBeDisabled();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it('waits for an in-flight autosave before saving the final answer and submitting', async () => {
    let finishAutosave!: (value: any) => void;
    saveResult = new Promise(resolve => { finishAutosave = resolve; });
    render(<AssessmentResponseForm />);
    fireEvent.change(await screen.findByLabelText('Respuesta'), { target: { value: '4' } });
    await waitFor(() => expect(requests).toHaveLength(1), { timeout: 3500 });
    fireEvent.change(screen.getByLabelText('Respuesta'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }));
    expect(requests.map(request => request.method)).toEqual(['PUT']);
    expect(screen.getByLabelText('Respuesta')).toBeDisabled();
    saveResult = json({ saved: 1 });
    await act(async () => { finishAutosave(json({ saved: 1 })); });
    expect(await screen.findByRole('status')).toHaveTextContent('Evaluación completada');
    expect(requests.map(request => request.method)).toEqual(['PUT', 'PUT', 'POST']);
    expect(requests[0].body.responses[0].frequency_value).toBe(4);
    expect(requests[1].body.responses[0].frequency_value).toBe(9);
  });

  it.each([
    ['failed', json({ error: 'Error de conexión' }, false)],
    ['partial', json({ saved: 0, errors: ['Respuesta rechazada'] })],
  ])('does not submit after a %s save and keeps the answer available for retry', async (_label, result) => {
    saveResult = result;
    await editAndSubmit();
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(requests.map(request => request.method)).toEqual(['PUT']);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Respuesta')).toHaveValue('7');
    await waitFor(() => expect(screen.getByLabelText('Respuesta')).toBeEnabled());
    saveResult = json({ saved: 1 });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Enviar/ })); });
    expect(await screen.findByRole('status')).toHaveTextContent('Evaluación completada');
    expect(requests.map(request => request.method)).toEqual(['PUT', 'PUT', 'POST']);
    expect(requests[1].body.responses[0].frequency_value).toBe(7);
  });
});
