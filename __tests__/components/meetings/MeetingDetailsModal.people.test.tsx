// @vitest-environment jsdom
// F12a EC-R4/R5: participants are shown by their card name, «Participante»
// when there is no card, never «Usuario no encontrado», and no e-mail line.
import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MeetingWithDetails } from '../../../types/meetings';

const { taskTrackerProps } = vi.hoisted(() => ({ taskTrackerProps: [] as any[] }));
vi.mock('../../../components/meetings/TaskTracker', () => ({
  __esModule: true,
  default: (props: any) => {
    taskTrackerProps.push(props);
    return <div data-testid={`task-tracker-${props.item.id}`} />;
  },
}));
vi.mock('../../../components/meetings/RichTextView', () => ({
  __esModule: true,
  default: () => <div data-testid="rich-text-view-stub" />,
}));
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

const { getMeetingDetails } = vi.hoisted(() => ({ getMeetingDetails: vi.fn() }));
vi.mock('../../../utils/meetingUtils', () => ({ getMeetingDetails }));

import MeetingDetailsModal from '../../../components/meetings/MeetingDetailsModal';

// Invented people.
const ANA = '11111111-1111-4111-8111-111111111111';
const NOCARD = '44444444-4444-4444-8444-444444444444';

const meeting = (): MeetingWithDetails =>
  ({
    id: 'mtg-1',
    workspace_id: 'ws-1',
    title: 'Reunión de prueba',
    meeting_date: '2026-04-20T10:00:00Z',
    duration_minutes: 60,
    status: 'completada',
    created_by: 'u-1',
    is_active: true,
    created_at: '2026-04-20T09:00:00Z',
    updated_at: '2026-04-20T09:00:00Z',
    version: 1,
    agreements: [],
    commitments: [],
    tasks: [],
    attendees: [
      { id: 'a1', meeting_id: 'mtg-1', user_id: ANA, role: 'participant', attendance_status: 'invited', user_profile: { id: ANA, first_name: 'Ana', last_name: 'Uno', avatar_url: null } },
      { id: 'a2', meeting_id: 'mtg-1', user_id: NOCARD, role: 'participant', attendance_status: 'invited' },
    ],
  } as unknown as MeetingWithDetails);

beforeEach(() => {
  getMeetingDetails.mockReset();
  taskTrackerProps.length = 0;
});
afterEach(() => { vi.clearAllMocks(); });

describe('MeetingDetailsModal — participants (EC-R4)', () => {
  it('shows the card name, «Participante» without a card, and never «Usuario no encontrado»', async () => {
    getMeetingDetails.mockResolvedValue(meeting());
    const utils = render(<MeetingDetailsModal isOpen onClose={vi.fn()} meetingId="mtg-1" />);
    await waitFor(() => expect(utils.getByText('Reunión de prueba')).toBeDefined());
    await act(async () => { fireEvent.click(utils.getByText(/^Participantes/)); });
    expect(utils.getByText('Ana Uno')).toBeDefined();
    expect(utils.getByText('Participante')).toBeDefined();
    expect(utils.queryByText('Usuario no encontrado')).toBeNull();
  });
});
