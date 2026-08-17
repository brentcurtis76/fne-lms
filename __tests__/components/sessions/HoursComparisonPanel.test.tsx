// @vitest-environment jsdom
/**
 * HoursComparisonPanel (Z7-5) — the §11 admin panel.
 *
 * What must hold in the DOM: the invariant banner is always stated; planned/Zoom/
 * presence render with the ≥15% mismatch highlight; provisional and open-interval
 * conditions are es-CL STATES, never numbers; a zero waiver reads «Sesión eximida»;
 * and the override form posts the §11 intent (integer minutes, mandatory reason,
 * category, request_id) to the admin endpoint.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import HoursComparisonPanel, {
  isMismatchFlagged,
} from '../../../components/sessions/HoursComparisonPanel';
import type { HoursComparisonPayload } from '../../../pages/api/admin/sessions/[id]/hours-comparison';

const SESSION_ID = 'a7a7a7a7-0001-4000-8000-000000000001';

function payload(overrides: Partial<HoursComparisonPayload> = {}): HoursComparisonPayload {
  return {
    session_id: SESSION_ID,
    planned_minutes: 90,
    ledger: { status: 'consumida', hours: 1.5, effective_minutes: null, admin_override: false },
    zoom: {
      state: 'ended',
      actual_started_at: '2026-07-29T23:55:00.000Z',
      actual_ended_at: '2026-07-30T01:00:00.000Z',
      elapsed_minutes: 65,
    },
    attendance: { state: 'report', has_open_intervals: false },
    facilitator_presence: [
      {
        user_id: 'facadfac-0001-4000-8000-000000000001',
        name: 'Líder Sintética',
        is_lead: true,
        observed_minutes: 60,
        has_open_interval: false,
      },
    ],
    overrides: [],
    ...overrides,
  };
}

let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

function mockFetch(payloads: { comparison: HoursComparisonPayload; overrideOk?: boolean }) {
  fetchCalls = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push({ url, init });
    if (url.includes('hours-comparison')) {
      return new Response(JSON.stringify({ data: payloads.comparison }), { status: 200 });
    }
    if (url.includes('hour-override')) {
      return payloads.overrideOk === false
        ? new Response(JSON.stringify({ error: 'request_id ya utilizado' }), { status: 409 })
        : new Response(JSON.stringify({ data: { applied: true } }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the comparison read', () => {
  it('states the §11 invariant and renders planned · zoom · presence with Δ', async () => {
    mockFetch({ comparison: payload() });
    const { getByTestId } = render(<HoursComparisonPanel sessionId={SESSION_ID} />);

    await waitFor(() => expect(getByTestId('hours-planned')).toHaveTextContent('90 min'));
    expect(getByTestId('hours-invariant-banner')).toHaveTextContent(
      'Las horas descontadas siguen siendo las planificadas salvo ajuste manual.'
    );
    expect(getByTestId('hours-zoom-elapsed')).toHaveTextContent('65 min');
    expect(getByTestId('hours-presence')).toHaveTextContent('60 min');
    expect(getByTestId('hours-delta')).toHaveTextContent('Δ -30 min (-33%)');
    // 33% ≥ 15%: the review flag is on.
    expect(getByTestId('hours-delta')).toHaveTextContent('revisar');
  });

  it('a live meeting and provisional/open attendance render as STATES, not numbers', async () => {
    mockFetch({
      comparison: payload({
        zoom: { state: 'live', actual_started_at: '2026-07-29T23:55:00.000Z', actual_ended_at: null, elapsed_minutes: null },
        attendance: { state: 'webhook_provisional', has_open_intervals: true },
        facilitator_presence: [
          {
            user_id: 'facadfac-0001-4000-8000-000000000001',
            name: 'Líder Sintética',
            is_lead: true,
            observed_minutes: null,
            has_open_interval: true,
          },
        ],
      }),
    });
    const { getByTestId, queryByTestId } = render(<HoursComparisonPanel sessionId={SESSION_ID} />);

    await waitFor(() =>
      expect(getByTestId('hours-zoom-elapsed')).toHaveTextContent('Reunión en curso')
    );
    expect(getByTestId('hours-presence')).toHaveTextContent('Sin datos de presencia');
    expect(getByTestId('hours-provisional-badge')).toHaveTextContent('Datos provisionales');
    expect(getByTestId('hours-open-badge')).toHaveTextContent('intervalos sin salida registrada');
    expect(queryByTestId('hours-delta')).not.toBeInTheDocument();
  });

  it('a zero waiver reads «Sesión eximida»', async () => {
    mockFetch({
      comparison: payload({
        ledger: { status: 'consumida', hours: 1.5, effective_minutes: 0, admin_override: true },
      }),
    });
    const { getByTestId } = render(<HoursComparisonPanel sessionId={SESSION_ID} />);

    await waitFor(() =>
      expect(getByTestId('hours-effective')).toHaveTextContent('Sesión eximida (0 min descontados)')
    );
  });

  it('the override action is unavailable until the session is consumida', async () => {
    mockFetch({
      comparison: payload({
        ledger: { status: 'reservada', hours: 1.5, effective_minutes: null, admin_override: false },
      }),
    });
    const { getByTestId } = render(<HoursComparisonPanel sessionId={SESSION_ID} />);

    await waitFor(() => expect(getByTestId('override-open-button')).toBeDisabled());
  });
});

describe('«Ajustar horas descontadas»', () => {
  it('posts the §11 intent: integer minutes, mandatory reason, category, request_id', async () => {
    mockFetch({ comparison: payload() });
    const { getByTestId } = render(<HoursComparisonPanel sessionId={SESSION_ID} />);
    await waitFor(() => expect(getByTestId('override-open-button')).toBeEnabled());

    fireEvent.click(getByTestId('override-open-button'));
    fireEvent.change(getByTestId('override-minutes-input'), { target: { value: '45' } });
    fireEvent.change(getByTestId('override-reason-input'), {
      target: { value: 'Presencia parcial del consultor' },
    });
    fireEvent.change(getByTestId('override-category-select'), {
      target: { value: 'consultant_shortfall' },
    });
    fireEvent.click(getByTestId('override-submit'));

    await waitFor(() => {
      const overrideCall = fetchCalls.find((call) => call.url.includes('hour-override'));
      expect(overrideCall).toBeDefined();
      const body = JSON.parse(String(overrideCall!.init?.body));
      expect(body).toMatchObject({
        new_minutes: 45,
        reason: 'Presencia parcial del consultor',
        reason_category: 'consultant_shortfall',
        reverses_override_id: null,
      });
      expect(typeof body.request_id).toBe('string');
      expect(body.request_id.length).toBeGreaterThan(0);
    });
  });

  it('the submit stays disabled without a reason — §11 mandatory', async () => {
    mockFetch({ comparison: payload() });
    const { getByTestId } = render(<HoursComparisonPanel sessionId={SESSION_ID} />);
    await waitFor(() => expect(getByTestId('override-open-button')).toBeEnabled());

    fireEvent.click(getByTestId('override-open-button'));
    fireEvent.change(getByTestId('override-minutes-input'), { target: { value: '45' } });
    expect(getByTestId('override-submit')).toBeDisabled();
  });

  it('renders the audit trail and offers Revertir only on the latest unreversed apply', async () => {
    mockFetch({
      comparison: payload({
        ledger: { status: 'consumida', hours: 1.5, effective_minutes: 30, admin_override: true },
        overrides: [
          {
            id: 'ovr-1',
            previous_minutes: null,
            new_minutes: 45,
            planned_minutes_snapshot: 90,
            reason: 'Primer ajuste',
            reason_category: 'consultant_shortfall',
            created_by: 'admin-1',
            created_by_name: 'Admin Prueba',
            created_at: '2026-07-30T02:00:00.000Z',
            reverses_override_id: null,
          },
          {
            id: 'ovr-2',
            previous_minutes: 45,
            new_minutes: 30,
            planned_minutes_snapshot: 90,
            reason: 'Segundo ajuste',
            reason_category: 'school_request',
            created_by: 'admin-1',
            created_by_name: 'Admin Prueba',
            created_at: '2026-07-30T03:00:00.000Z',
            reverses_override_id: null,
          },
        ],
      }),
    });
    const { getByTestId, queryByTestId } = render(<HoursComparisonPanel sessionId={SESSION_ID} />);

    await waitFor(() => expect(getByTestId('override-history')).toBeInTheDocument());
    expect(getByTestId('override-row-ovr-1')).toHaveTextContent('planificado → 45 min');
    expect(getByTestId('override-row-ovr-2')).toHaveTextContent('45 min → 30 min');
    // Only the LATEST unreversed apply is reversible (§11).
    expect(queryByTestId('override-reverse-ovr-1')).not.toBeInTheDocument();
    expect(getByTestId('override-reverse-ovr-2')).toBeInTheDocument();
  });
});

describe('isMismatchFlagged — the ≥15% review flag', () => {
  it('flags at and above the boundary, not below', () => {
    expect(isMismatchFlagged(100, 85)).toBe(true);
    expect(isMismatchFlagged(100, 86)).toBe(false);
    expect(isMismatchFlagged(100, 115)).toBe(true);
    expect(isMismatchFlagged(0, 45)).toBe(false);
  });
});
