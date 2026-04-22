// @vitest-environment jsdom
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MeetingWithDetails } from '../../../types/meetings';

// Mock child components that would otherwise drag in unrelated dependencies.
vi.mock('../../../components/meetings/TaskTracker', () => ({
  __esModule: true,
  default: () => <div data-testid="task-tracker-stub" />,
}));
vi.mock('../../../components/meetings/RichTextView', () => ({
  __esModule: true,
  default: () => <div data-testid="rich-text-view-stub" />,
}));

// Mock the supabase hook — the modal calls it but the default tab ('summary')
// never reaches the storage APIs we'd care about.
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  }),
}));

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Mock the meeting loader — this is the key mock for the banner test.
const { getMeetingDetails } = vi.hoisted(() => ({
  getMeetingDetails: vi.fn(),
}));
vi.mock('../../../utils/meetingUtils', () => ({
  getMeetingDetails,
}));

import MeetingDetailsModal from '../../../components/meetings/MeetingDetailsModal';

const baseMeeting = (overrides: Partial<MeetingWithDetails> = {}): MeetingWithDetails =>
  ({
    id: 'mtg-1',
    workspace_id: 'ws-1',
    title: 'Reunión de prueba',
    meeting_date: '2026-04-20T10:00:00Z',
    duration_minutes: 60,
    status: 'borrador',
    created_by: 'u-1',
    is_active: true,
    created_at: '2026-04-20T09:00:00Z',
    updated_at: '2026-04-20T09:00:00Z',
    version: 1,
    finalized_at: null,
    finalized_by: null,
    finalize_audience: null,
    agreements: [],
    commitments: [],
    tasks: [],
    attendees: [],
    ...overrides,
  } as MeetingWithDetails);

beforeEach(() => {
  getMeetingDetails.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('MeetingDetailsModal — post-finalize banner', () => {
  it('renders the banner with finalizer name and community audience label', async () => {
    getMeetingDetails.mockResolvedValue(
      baseMeeting({
        status: 'completada',
        finalized_at: '2026-04-22T12:00:00Z',
        finalize_audience: 'community',
        finalized_by_profile: {
          id: 'u-2',
          first_name: 'Ana',
          last_name: 'Pérez',
        },
      }),
    );

    const { findByText, getByTitle } = render(
      <MeetingDetailsModal isOpen onClose={() => {}} meetingId="mtg-1" />,
    );

    // Wait for the async load to complete and banner to render.
    await findByText(/Finalizada el/);
    await findByText(/Ana Pérez/);
    await findByText(/toda la comunidad de crecimiento/);

    // Placeholder button is present.
    expect(getByTitle('Disponible próximamente')).toBeDefined();
  });

  it('does not render the banner when the meeting is still a draft', async () => {
    getMeetingDetails.mockResolvedValue(
      baseMeeting({
        status: 'borrador',
        finalized_at: null,
      }),
    );

    const { findByText, queryByText } = render(
      <MeetingDetailsModal isOpen onClose={() => {}} meetingId="mtg-1" />,
    );

    // Confirm the modal has loaded by finding the title (outside the banner).
    await findByText('Reunión de prueba');

    expect(queryByText(/Finalizada el/)).toBeNull();
    expect(queryByText(/Enviar correo de actualización/)).toBeNull();
  });

  it('does not render the banner for legacy completada rows without finalized_at', async () => {
    getMeetingDetails.mockResolvedValue(
      baseMeeting({
        status: 'completada',
        finalized_at: null,
      }),
    );

    const { findByText, queryByText } = render(
      <MeetingDetailsModal isOpen onClose={() => {}} meetingId="mtg-1" />,
    );

    await findByText('Reunión de prueba');

    expect(queryByText(/Finalizada el/)).toBeNull();
  });

  it("uses the 'sólo quienes asistieron' label when audience is 'attended'", async () => {
    getMeetingDetails.mockResolvedValue(
      baseMeeting({
        status: 'completada',
        finalized_at: '2026-04-22T12:00:00Z',
        finalize_audience: 'attended',
      }),
    );

    const { findByText, queryByText } = render(
      <MeetingDetailsModal isOpen onClose={() => {}} meetingId="mtg-1" />,
    );

    await findByText(/sólo quienes asistieron/);
    // And the community copy must NOT appear.
    expect(queryByText(/toda la comunidad de crecimiento/)).toBeNull();
  });

  it('renders the placeholder button as disabled with the "Disponible próximamente" tooltip', async () => {
    getMeetingDetails.mockResolvedValue(
      baseMeeting({
        status: 'completada',
        finalized_at: '2026-04-22T12:00:00Z',
        finalize_audience: 'community',
      }),
    );

    const { findByText } = render(
      <MeetingDetailsModal isOpen onClose={() => {}} meetingId="mtg-1" />,
    );

    const btn = (await findByText('Enviar correo de actualización')) as HTMLButtonElement;
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('title')).toBe('Disponible próximamente');
  });
});
