// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="icon-chevron-down" />,
  ChevronRight: () => <span data-testid="icon-chevron-right" />,
  Clock: () => <span data-testid="icon-clock" />,
}));

import ChangeHistorySection from '../../../components/school/ChangeHistorySection';

// ── Helpers ────────────────────────────────────────────────────
function mockFetchResponse(data: { history: unknown[]; total: number }) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockFetchEmpty() {
  return mockFetchResponse({ history: [], total: 0 });
}

const sampleEntries = [
  {
    id: 'entry-1',
    school_id: 42,
    feature: 'transversal_context',
    action: 'update',
    changed_fields: ['total_students', 'grade_levels'],
    previous_state: { total_students: 100, grade_levels: ['1_basico'] },
    new_state: { total_students: 200, grade_levels: ['1_basico', '2_basico'] },
    user_id: 'u-1',
    user_name: 'Ana García',
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
  },
  {
    id: 'entry-2',
    school_id: 42,
    feature: 'transversal_context',
    action: 'initial_save',
    changed_fields: [],
    previous_state: null,
    new_state: { total_students: 100 },
    user_id: 'u-1',
    user_name: 'Ana García',
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
  },
];

// ── Tests ──────────────────────────────────────────────────────
describe('ChangeHistorySection', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders collapsed by default with "Historial de cambios" header', () => {
    globalThis.fetch = mockFetchEmpty();

    render(
      <ChangeHistorySection schoolId={42} feature="transversal_context" />
    );

    expect(screen.getByText('Historial de cambios')).toBeInTheDocument();
    // Content area should not be visible
    expect(screen.queryByText('No hay cambios registrados aún')).not.toBeInTheDocument();
  });

  it('does not fetch on mount (lazy loading)', () => {
    const fetchMock = mockFetchEmpty();
    globalThis.fetch = fetchMock;

    render(
      <ChangeHistorySection schoolId={42} feature="transversal_context" />
    );

    // After the lazy-load polish, fetch should NOT be called on mount
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('expands on click and shows entries', async () => {
    globalThis.fetch = mockFetchResponse({
      history: sampleEntries,
      total: 2,
    });

    render(
      <ChangeHistorySection schoolId={42} feature="transversal_context" />
    );

    // Click to expand
    fireEvent.click(screen.getByText('Historial de cambios'));

    await waitFor(() => {
      expect(screen.getAllByText('Ana García').length).toBeGreaterThan(0);
    });
  });

  it('shows loading skeleton while fetching', async () => {
    // Use a promise we control to simulate loading state
    let resolveFetch!: (value: unknown) => void;
    globalThis.fetch = vi.fn().mockReturnValue(
      new Promise((resolve) => { resolveFetch = resolve; })
    );

    render(
      <ChangeHistorySection schoolId={42} feature="transversal_context" />
    );

    // Click to expand
    fireEvent.click(screen.getByText('Historial de cambios'));

    // Should show loading skeleton (animated pulse divs)
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);

    // Resolve the fetch
    resolveFetch({
      ok: true,
      json: () => Promise.resolve({ history: [], total: 0 }),
    });

    await waitFor(() => {
      expect(document.querySelectorAll('.animate-pulse')).toHaveLength(0);
    });
  });

  it('shows empty state when no entries', async () => {
    globalThis.fetch = mockFetchEmpty();

    render(
      <ChangeHistorySection schoolId={42} feature="transversal_context" />
    );

    fireEvent.click(screen.getByText('Historial de cambios'));

    await waitFor(() => {
      expect(screen.getByText('No hay cambios registrados aún')).toBeInTheDocument();
    });
  });

  it('shows "Ver más" button when there are more entries', async () => {
    globalThis.fetch = mockFetchResponse({
      history: sampleEntries,
      total: 15, // More than the 2 entries returned
    });

    render(
      <ChangeHistorySection schoolId={42} feature="transversal_context" />
    );

    fireEvent.click(screen.getByText('Historial de cambios'));

    await waitFor(() => {
      expect(screen.getByText('Ver más')).toBeInTheDocument();
    });
  });

  it('formats relative time correctly (minutes, hours, days)', async () => {
    const entries = [
      {
        ...sampleEntries[0],
        id: 'e-min',
        created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
      },
      {
        ...sampleEntries[0],
        id: 'e-hour',
        created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
      },
      {
        ...sampleEntries[0],
        id: 'e-day',
        created_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(), // 2 days ago
      },
    ];

    globalThis.fetch = mockFetchResponse({ history: entries, total: 3 });

    render(
      <ChangeHistorySection schoolId={42} feature="transversal_context" />
    );

    fireEvent.click(screen.getByText('Historial de cambios'));

    await waitFor(() => {
      expect(screen.getByText('hace 5 minutos')).toBeInTheDocument();
      expect(screen.getByText('hace 3 horas')).toBeInTheDocument();
      expect(screen.getByText('hace 2 días')).toBeInTheDocument();
    });
  });

  it('maps action labels correctly (initial_save → Registro inicial, update → Actualización)', async () => {
    globalThis.fetch = mockFetchResponse({
      history: sampleEntries,
      total: 2,
    });

    render(
      <ChangeHistorySection schoolId={42} feature="transversal_context" />
    );

    fireEvent.click(screen.getByText('Historial de cambios'));

    await waitFor(() => {
      expect(screen.getByText('Actualización')).toBeInTheDocument();
      expect(screen.getByText('Registro inicial')).toBeInTheDocument();
    });
  });

  it('shows before→after values for changed fields', async () => {
    globalThis.fetch = mockFetchResponse({
      history: [sampleEntries[0]],
      total: 1,
    });

    render(
      <ChangeHistorySection
        schoolId={42}
        feature="transversal_context"
        fieldLabels={{ total_students: 'Total Estudiantes' }}
      />
    );

    fireEvent.click(screen.getByText('Historial de cambios'));

    await waitFor(() => {
      // Field label should be human-readable
      expect(screen.getByText('Total Estudiantes')).toBeInTheDocument();
      // Previous value with strikethrough
      expect(screen.getByText('100')).toBeInTheDocument();
      // New value
      expect(screen.getByText('200')).toBeInTheDocument();
    });
  });

  it('uses fieldLabels prop to display human-readable field names', async () => {
    globalThis.fetch = mockFetchResponse({
      history: [sampleEntries[0]],
      total: 1,
    });

    const fieldLabels = {
      total_students: 'Número de Estudiantes',
      grade_levels: 'Niveles Educativos',
    };

    render(
      <ChangeHistorySection
        schoolId={42}
        feature="transversal_context"
        fieldLabels={fieldLabels}
      />
    );

    fireEvent.click(screen.getByText('Historial de cambios'));

    await waitFor(() => {
      expect(screen.getByText('Número de Estudiantes')).toBeInTheDocument();
      expect(screen.getByText('Niveles Educativos')).toBeInTheDocument();
    });
  });

  it('does not show badge count when collapsed (lazy-load polish)', () => {
    globalThis.fetch = mockFetchEmpty();

    render(
      <ChangeHistorySection schoolId={42} feature="transversal_context" />
    );

    // No badge should be visible since we haven't fetched yet
    const badges = document.querySelectorAll('.rounded-full');
    // Filter to badge-like elements (not timeline dots)
    const countBadges = Array.from(badges).filter(el =>
      el.classList.contains('bg-brand_primary/10')
    );
    expect(countBadges).toHaveLength(0);
  });
});
