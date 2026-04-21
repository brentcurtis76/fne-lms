// @vitest-environment jsdom
import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Heavy dependency stubs ---------------------------------------------------

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => {
    const empty = { data: [], error: null };
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      is: vi.fn(() => chain),
      order: vi.fn(() => Promise.resolve(empty)),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
      then: (resolve: any) => resolve(empty),
    };
    return { from: vi.fn(() => chain) };
  },
}));

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../../../src/components/TipTapEditor', () => ({
  __esModule: true,
  default: () => <div data-testid="tiptap-stub" />,
}));

vi.mock('../../../utils/meetingUtils', () => ({
  createMeetingWithDocumentation: vi.fn(),
  getCommunityMembersForAssignment: vi.fn().mockResolvedValue([]),
  sendTaskAssignmentNotifications: vi.fn(),
  getMeetingDetails: vi.fn().mockResolvedValue({
    id: 'meeting-1',
    title: 'Test meeting',
    meeting_date: new Date('2026-04-21T12:00:00Z').toISOString(),
    duration_minutes: 60,
    location: '',
    status: 'borrador',
    summary: '',
    summary_doc: null,
    notes: '',
    notes_doc: null,
    attendees: [],
    agreements: [],
    commitments: [],
    tasks: [],
    version: 1,
    updated_at: new Date().toISOString(),
  }),
  updateMeeting: vi.fn(),
}));

vi.mock('../../../utils/storage', () => ({
  uploadFile: vi.fn(),
}));

import MeetingDocumentationModal from '../../../components/meetings/MeetingDocumentationModal';

describe('MeetingDocumentationModal — endWorkSession dedup', () => {
  const endCalls: string[] = [];
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    endCalls.length = 0;
    fetchSpy = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/work-session/start')) {
        return new Response(JSON.stringify({ data: { id: 'ws-1' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/work-session/ws-1/end') && init?.method === 'POST') {
        endCalls.push(url);
        return new Response(JSON.stringify({ data: { id: 'ws-1', ended_at: new Date().toISOString() } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ data: null }), { status: 200 });
    });
    // @ts-expect-error override global fetch for test
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fires exactly one POST to /end when handleClose runs and the modal unmounts', async () => {
    const onClose = vi.fn();

    // First render with isOpen=false so the startWorkSessionRef has a chance
    // to point at the stable callback before the open-effect tries to invoke it.
    const { rerender, unmount, container } = render(
      <MeetingDocumentationModal
        isOpen={false}
        onClose={onClose}
        workspaceId="ws-1"
        userId="user-1"
        onSuccess={() => {}}
        meetingId="meeting-1"
        mode="edit"
      />
    );

    await act(async () => {
      rerender(
        <MeetingDocumentationModal
          isOpen
          onClose={onClose}
          workspaceId="ws-1"
          userId="user-1"
          onSuccess={() => {}}
          meetingId="meeting-1"
          mode="edit"
        />
      );
    });

    // Wait until the work-session has been started (fetch happens inside an
    // async effect once the draft meeting loads).
    await waitFor(() => {
      const started = fetchSpy.mock.calls.some(([url]) =>
        typeof url === 'string' && url.endsWith('/work-session/start')
      );
      expect(started).toBe(true);
    });

    // Click the backdrop to trigger handleClose.
    const backdrop = container.querySelector('.fixed.inset-0.bg-black\\/50') as HTMLElement;
    expect(backdrop).not.toBeNull();
    await act(async () => {
      backdrop.click();
    });

    // Then unmount the modal — mirrors the parent conditionally rendering it.
    await act(async () => {
      unmount();
    });

    expect(endCalls).toHaveLength(1);
    expect(endCalls[0]).toMatch(/\/work-session\/ws-1\/end$/);
  });
});
