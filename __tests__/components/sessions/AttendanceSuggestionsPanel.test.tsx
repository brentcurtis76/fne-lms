// @vitest-environment jsdom
/**
 * AttendanceSuggestionsPanel (Z7-5) — proposes, never asserts.
 *
 * What must hold in the DOM: provisional data announces itself and suppresses
 * suggested absences; open intervals read as «Sin salida registrada», never as
 * minutes; unmatched participants are listed for the facilitator; and «Aplicar
 * sugerencias» PUTs only the DEFINITE rows through the existing attendees
 * endpoint. A caller the endpoint 404s (not the facilitator) gets no panel at all.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import AttendanceSuggestionsPanel from '../../../components/sessions/AttendanceSuggestionsPanel';

const SESSION_ID = 'a7a7a7a7-0001-4000-8000-000000000001';
const ATTENDEE_A = 'aaaaaaaa-0001-4000-8000-000000000001';
const ATTENDEE_B = 'aaaaaaaa-0002-4000-8000-000000000002';

interface SuggestionsBody {
  state: string;
  provisional: boolean;
  suggestions: Array<Record<string, unknown>>;
  unmatched_rows: Array<Record<string, unknown>>;
}

let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

function mockFetch(options: { suggestions: SuggestionsBody | 404; applyOk?: boolean }) {
  fetchCalls = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push({ url, init });
    if (url.includes('attendance-suggestions')) {
      if (options.suggestions === 404) {
        return new Response(JSON.stringify({ error: 'Sesión no encontrada' }), { status: 404 });
      }
      return new Response(JSON.stringify({ data: options.suggestions }), { status: 200 });
    }
    if (url.includes('/attendees')) {
      return options.applyOk === false
        ? new Response(JSON.stringify({ error: 'No autorizado' }), { status: 403 })
        : new Response(JSON.stringify({ data: { updated: 2 } }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
}

function suggestion(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    user_id: ATTENDEE_A,
    name: 'Ana Sintética',
    expected: true,
    attended_current: null,
    suggestion: 'present',
    observed_minutes: 30,
    has_open_interval: false,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('visibility and states', () => {
  it('renders nothing at all for a caller the endpoint 404s', async () => {
    mockFetch({ suggestions: 404 });
    const { container } = render(<AttendanceSuggestionsPanel sessionId={SESSION_ID} />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders nothing when the session has no managed meeting', async () => {
    mockFetch({
      suggestions: { state: 'no_meeting', provisional: true, suggestions: [], unmatched_rows: [] },
    });
    const { container } = render(<AttendanceSuggestionsPanel sessionId={SESSION_ID} />);
    await waitFor(() => expect(fetchCalls.length).toBe(1));
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('provisional webhook data announces itself, suppressed absences and all', async () => {
    mockFetch({
      suggestions: {
        state: 'webhook_provisional',
        provisional: true,
        suggestions: [
          suggestion({ suggestion: 'present', observed_minutes: null, has_open_interval: true }),
          suggestion({ user_id: ATTENDEE_B, name: 'Benjamín Sintético', suggestion: 'no_data', observed_minutes: null }),
        ],
        unmatched_rows: [],
      },
    });
    const { getByTestId } = render(<AttendanceSuggestionsPanel sessionId={SESSION_ID} />);

    await waitFor(() =>
      expect(getByTestId('attendance-suggestions-state')).toHaveTextContent('Datos provisionales')
    );
    // The open interval is a STATE — no minutes are shown for it.
    expect(getByTestId(`attendance-open-${ATTENDEE_A}`)).toHaveTextContent('Sin salida registrada');
    expect(getByTestId(`attendance-suggestion-${ATTENDEE_A}`)).not.toHaveTextContent('min');
    expect(getByTestId(`attendance-suggestion-${ATTENDEE_B}`)).toHaveTextContent('Sin datos');
  });

  it('under the complete report, absence is a suggestion and unmatched rows are listed', async () => {
    mockFetch({
      suggestions: {
        state: 'report',
        provisional: false,
        suggestions: [
          suggestion({}),
          suggestion({ user_id: ATTENDEE_B, name: 'Benjamín Sintético', suggestion: 'absent', observed_minutes: null }),
        ],
        unmatched_rows: [
          { display_name: 'Invitada Anónima', observed_minutes: 12, has_open_interval: false },
        ],
      },
    });
    const { getByTestId } = render(<AttendanceSuggestionsPanel sessionId={SESSION_ID} />);

    await waitFor(() =>
      expect(getByTestId(`attendance-suggestion-${ATTENDEE_A}`)).toHaveTextContent('Presente · 30 min')
    );
    expect(getByTestId(`attendance-suggestion-${ATTENDEE_B}`)).toHaveTextContent(
      'Ausente según informe'
    );
    expect(getByTestId('attendance-unmatched')).toHaveTextContent('Invitada Anónima · 12 min');
  });
});

describe('«Aplicar sugerencias»', () => {
  it('PUTs only the DEFINITE rows through the existing attendees endpoint', async () => {
    const onApplied = vi.fn();
    mockFetch({
      suggestions: {
        state: 'report',
        provisional: false,
        suggestions: [
          suggestion({}),
          suggestion({ user_id: ATTENDEE_B, name: 'Benjamín Sintético', suggestion: 'absent', observed_minutes: null }),
          suggestion({ user_id: 'aaaaaaaa-0003-4000-8000-000000000003', name: 'Carla', suggestion: 'no_data', observed_minutes: null }),
        ],
        unmatched_rows: [],
      },
    });
    const { getByTestId } = render(
      <AttendanceSuggestionsPanel sessionId={SESSION_ID} onApplied={onApplied} />
    );

    await waitFor(() =>
      expect(getByTestId('attendance-apply-suggestions')).toHaveTextContent(
        'Aplicar sugerencias (2)'
      )
    );
    fireEvent.click(getByTestId('attendance-apply-suggestions'));

    await waitFor(() => {
      const putCall = fetchCalls.find((call) => call.url.endsWith('/attendees'));
      expect(putCall).toBeDefined();
      expect(putCall!.init?.method).toBe('PUT');
      expect(JSON.parse(String(putCall!.init?.body))).toEqual({
        attendees: [
          { user_id: ATTENDEE_A, attended: true },
          { user_id: ATTENDEE_B, attended: false },
        ],
      });
    });
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
  });

  it('the apply button is disabled when nothing is definite', async () => {
    mockFetch({
      suggestions: {
        state: 'webhook_provisional',
        provisional: true,
        suggestions: [suggestion({ suggestion: 'no_data', observed_minutes: null })],
        unmatched_rows: [],
      },
    });
    const { getByTestId } = render(<AttendanceSuggestionsPanel sessionId={SESSION_ID} />);

    await waitFor(() => expect(getByTestId('attendance-apply-suggestions')).toBeDisabled());
  });
});
