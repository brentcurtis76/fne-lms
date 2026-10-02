// @vitest-environment jsdom
/**
 * pages/docente/assessments/[instanceId]/index.tsx — frecuencia save feedback (PROC-B004 D1).
 *
 * A save the server refuses as invalid (HTTP 400 with validation details) must tell the docente
 * what was refused, not diagnose a connection problem; a network failure or 5xx keeps the
 * connection/retry message. Renders the real page and form tree; only chrome, router, Supabase
 * client and toast are mocked. The refused value is sent unchanged and never persisted.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildChainableQuery } from '../../api/assessment-builder/_helpers';

const { mockToastError, supabaseHolder, routerMock, INSTANCE_ID } = vi.hoisted(() => {
  const INSTANCE_ID = '77777777-7777-4777-8777-777777777777';
  return {
    INSTANCE_ID,
    mockToastError: vi.fn(),
    supabaseHolder: { current: null as any },
    routerMock: {
      push: vi.fn(),
      replace: vi.fn(),
      pathname: '/docente/assessments/[instanceId]',
      query: { instanceId: INSTANCE_ID },
      isReady: true,
      events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    },
  };
});

vi.mock('next/router', () => ({ useRouter: () => routerMock }));
vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => supabaseHolder.current }));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: mockToastError, success: vi.fn() });
  return { toast, default: toast };
});
vi.mock('../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="main-layout">{children}</div>,
}));
vi.mock('../../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ title, children }: any) => <div><h1>{title}</h1>{children}</div>,
}));
vi.mock('../../../components/tutorials/HelpButton', () => ({ default: () => null }));

import AssessmentResponseForm from '../../../pages/docente/assessments/[instanceId]/index';

const INDICATOR = 'ffffffff-0000-4000-8000-000000000001';
const MODULE_ID = 'dddddddd-0000-4000-8000-000000000002';
const CONNECTION_MESSAGE = 'No se pudieron guardar tus respuestas. Revisa tu conexión e intenta nuevamente.';

const payload = {
  success: true,
  instance: { id: INSTANCE_ID, status: 'in_progress', transformationYear: 1, generationType: 'GT' },
  assignee: { canEdit: true, canSubmit: true },
  template: { id: 'tpl-1', name: 'Plantilla sintética', area: 'personalizacion' },
  objectives: [],
  modules: [{
    id: MODULE_ID, name: 'Acción sintética', displayOrder: 1, weight: 1,
    indicators: [{
      id: INDICATOR, code: 'F1', name: 'Frecuencia sintética', category: 'frecuencia', displayOrder: 1, weight: 1,
      frequencyConfig: { min: 0.1, max: 3.1, step: 0.1, unit: 'semana', allowed_units: ['semana'] },
    }],
  }],
  responses: { [INDICATOR]: { frequencyValue: 1.2, frequencyUnit: 'semana' } },
  progress: { total: 1, answered: 1, percentage: 100 },
};

type PutOutcome = { status: number; body: unknown } | 'network';

function installFetch(outcome: PutOutcome) {
  const puts: any[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `/api/docente/assessments/${INSTANCE_ID}` && !init?.method) {
      return new Response(JSON.stringify(payload), { status: 200 });
    }
    if (url === `/api/docente/assessments/${INSTANCE_ID}/responses` && init?.method === 'PUT') {
      puts.push(JSON.parse(String(init.body)));
      if (outcome === 'network') throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify(outcome.body), { status: outcome.status });
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  return puts;
}

async function saveValue(outcome: PutOutcome, value: string) {
  supabaseHolder.current = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'docente-1', email: 'docente@example.test' } } } }),
      signOut: vi.fn(),
    },
    from: vi.fn(() => buildChainableQuery({ avatar_url: null })),
  };
  const puts = installFetch(outcome);
  render(<AssessmentResponseForm />);
  const input = await screen.findByRole('spinbutton', { name: 'Cantidad de frecuencia' });
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByTestId('assessment-save-button'));
  await waitFor(() => expect(mockToastError).toHaveBeenCalledTimes(1));
  return { puts, input };
}

describe('docente frecuencia save feedback (PROC-B004 D1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('a 400 validation refusal shows the server reason for the named indicator, not a connection diagnosis', async () => {
    const { puts, input } = await saveValue({ status: 400, body: {
      error: 'No hay respuestas válidas para guardar',
      details: [`Indicador ${INDICATOR}: frecuencia debe ser mayor o igual a 0.1`],
    } }, '0');

    expect(puts).toHaveLength(1);
    expect(puts[0].responses[0]).toMatchObject({ indicator_id: INDICATOR, frequency_value: 0 });
    const toastText = String(mockToastError.mock.calls[0][0]);
    expect(toastText).toBe('No se guardaron tus respuestas. «Frecuencia sintética»: frecuencia debe ser mayor o igual a 0.1');
    expect(toastText).not.toContain('conexión');
    const refusal = await screen.findByTestId('assessment-save-refusal');
    expect(refusal).toHaveTextContent('«Frecuencia sintética»: frecuencia debe ser mayor o igual a 0.1');
    expect(refusal).not.toHaveTextContent(INDICATOR);
    expect(screen.getByTestId('assessment-save-status')).toHaveTextContent('Cambios pendientes de guardar en el servidor.');
    // No clamp: the form keeps exactly what the docente typed.
    expect(input).toHaveValue(0);
  });

  it('a partial save that lists refused answers shows those reasons, not a connection diagnosis', async () => {
    await saveValue({ status: 200, body: {
      success: true, saved: 0, errors: [`Indicador ${INDICATOR}: frecuencia debe avanzar de 0.1 en 0.1`],
    } }, '1.25');

    expect(mockToastError).toHaveBeenCalledWith('No se guardaron tus respuestas. «Frecuencia sintética»: frecuencia debe avanzar de 0.1 en 0.1');
    expect(await screen.findByTestId('assessment-save-refusal')).toHaveTextContent('frecuencia debe avanzar de 0.1 en 0.1');
  });

  it('a network failure keeps the connection/retry message and shows no refusal detail', async () => {
    const { puts } = await saveValue('network', '1.3');

    expect(puts).toHaveLength(1);
    expect(mockToastError).toHaveBeenCalledWith(CONNECTION_MESSAGE);
    expect(screen.queryByTestId('assessment-save-refusal')).toBeNull();
  });

  it('a 5xx server error keeps the connection/retry message and shows no refusal detail', async () => {
    const { puts } = await saveValue({ status: 500, body: { error: 'Error al guardar respuestas' } }, '1.3');

    expect(puts).toHaveLength(1);
    expect(mockToastError).toHaveBeenCalledWith(CONNECTION_MESSAGE);
    expect(screen.queryByTestId('assessment-save-refusal')).toBeNull();
    expect(screen.getByTestId('assessment-save-status')).toHaveTextContent('Error al guardar respuestas');
  });
});

describe('docente save feedback across instance navigation (PROC-B004, Codex port note 2)', () => {
  const OTHER_ID = '88888888-8888-4888-8888-888888888888';

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    routerMock.query = { instanceId: INSTANCE_ID };
  });

  it("a late refusal from the previous evaluation never replaces the new evaluation's own refusal", async () => {
    supabaseHolder.current = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'docente-1', email: 'docente@example.test' } } } }),
        signOut: vi.fn(),
      },
      from: vi.fn(() => buildChainableQuery({ avatar_url: null })),
    };
    let finishOld!: (body: unknown) => void;
    const oldBody = new Promise(resolve => { finishOld = resolve; });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      for (const id of [INSTANCE_ID, OTHER_ID]) {
        if (url === `/api/docente/assessments/${id}` && !init?.method) {
          return new Response(JSON.stringify({ ...payload, instance: { ...payload.instance, id } }), { status: 200 });
        }
      }
      if (url === `/api/docente/assessments/${INSTANCE_ID}/responses` && init?.method === 'PUT') {
        return { ok: false, status: 400, json: () => oldBody } as unknown as Response;
      }
      if (url === `/api/docente/assessments/${OTHER_ID}/responses` && init?.method === 'PUT') {
        return new Response(JSON.stringify({
          error: 'No hay respuestas válidas para guardar',
          details: [`Indicador ${INDICATOR}: frecuencia debe ser menor o igual a 3.1`],
        }), { status: 400 });
      }
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;

    // Evaluation A: a save is in flight when the docente moves on.
    const view = render(<AssessmentResponseForm />);
    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Cantidad de frecuencia' }), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('assessment-save-button'));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/docente/assessments/${INSTANCE_ID}/responses`, expect.objectContaining({ method: 'PUT' })
    ));

    // Evaluation B: its own save is refused and its reason is shown.
    routerMock.query = { instanceId: OTHER_ID };
    view.rerender(<AssessmentResponseForm />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(`/api/docente/assessments/${OTHER_ID}`));
    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Cantidad de frecuencia' }), { target: { value: '9' } });
    fireEvent.click(screen.getByTestId('assessment-save-button'));
    const refusal = await screen.findByTestId('assessment-save-refusal');
    expect(refusal).toHaveTextContent('menor o igual a 3.1');

    // A's refusal finally arrives: it must not replace B's.
    await act(async () => {
      finishOld({ error: 'No hay respuestas válidas para guardar', details: [`Indicador ${INDICATOR}: frecuencia debe ser mayor o igual a 0.1`] });
      await oldBody;
    });
    expect(screen.getByTestId('assessment-save-refusal')).toHaveTextContent('menor o igual a 3.1');
    expect(screen.getByTestId('assessment-save-refusal')).not.toHaveTextContent('mayor o igual a 0.1');
  });
});
