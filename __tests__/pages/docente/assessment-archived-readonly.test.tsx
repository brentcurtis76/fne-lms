// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AssessmentResponseForm from '@/pages/docente/assessments/[instanceId]';

// The docente list links archived evaluations to this detail page
// ("Ver evaluación"). Even when the assignee row still says can_edit and
// can_submit, an archived instance must render read-only and send nothing.
const mocks = vi.hoisted(() => {
  const single = vi.fn().mockResolvedValue({ data: {} });
  const query = { select: vi.fn(), eq: vi.fn(), single };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return {
    router: { query: { instanceId: 'synthetic-archived-instance' }, push: vi.fn() },
    supabase: {
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'synthetic-adult' } } } }) },
      from: vi.fn().mockReturnValue(query),
    },
  };
});
vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => mocks.supabase }));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
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
let writes: Array<{ url: string; method: string }>;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  writes = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (!options) return json({
      instance: { status: 'archived' }, template: { name: 'Evaluación sintética archivada' },
      modules: [{ id: 'module', indicators: [{ id: 'indicator', category: 'frecuencia', displayOrder: 1 }] }],
      responses: { indicator: { frequencyValue: 2 } }, assignee: { canEdit: true, canSubmit: true },
      progress: { total: 1, answered: 1, percentage: 100 },
    });
    writes.push({ url, method: options.method ?? 'GET' });
    return json({ success: true });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('archived evaluation detail is read-only', () => {
  it('shows the stored answer but offers no save or submit, even with can_edit and can_submit', async () => {
    render(<AssessmentResponseForm />);
    const answer = await screen.findByLabelText('Respuesta');
    expect(answer).toHaveValue('2');
    expect(answer).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Guardar$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enviar/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('assessment-submit-confirm-button')).not.toBeInTheDocument();
  });

  it('sends no write request and keeps no local draft when the page is left', async () => {
    const view = render(<AssessmentResponseForm />);
    const answer = await screen.findByLabelText('Respuesta');
    fireEvent.change(answer, { target: { value: '9' } });
    window.dispatchEvent(new Event('online'));
    const leaving = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leaving);
    view.unmount();
    expect(writes).toEqual([]);
    expect(leaving.defaultPrevented).toBe(false);
    expect(localStorage.length).toBe(0);
  });
});
