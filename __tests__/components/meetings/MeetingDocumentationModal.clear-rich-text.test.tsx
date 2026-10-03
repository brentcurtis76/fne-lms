// @vitest-environment jsdom
import React from 'react';
import { render, act, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Registry exposing TipTapEditor onChange callbacks keyed by placeholder.
const editorOnChange = new Map<string, (json: any) => void>();

vi.mock('../../../src/components/TipTapEditor', () => ({
  __esModule: true,
  default: ({ onChange, placeholder }: any) => {
    if (placeholder) {
      editorOnChange.set(placeholder, onChange);
    }
    return <div data-testid={`tiptap-${placeholder ?? 'none'}`} />;
  },
}));

// Capture Supabase insert/update payloads per table (shared PostgREST-like double).
vi.mock('@supabase/auth-helpers-react', async () => {
  const mock = await import('./meetingSupabaseMock');
  const client = mock.makeMeetingSupabaseClient();
  return { useSupabaseClient: () => client };
});

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../../../utils/meetingUtils', () => ({
  createMeetingWithDocumentation: vi.fn(),
  getMeetingDetails: vi.fn().mockResolvedValue({
    id: 'meeting-1',
    title: 'Test meeting',
    meeting_date: new Date('2026-04-21T12:00:00Z').toISOString(),
    duration_minutes: 60,
    location: '',
    status: 'completada',
    summary: 'summary text',
    summary_doc: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'summary text' }] }],
    },
    notes: '',
    notes_doc: null,
    attendees: [{ user_id: '33333333-3333-4333-8333-333333333333', role: 'participant' }],
    agreements: [],
    commitments: [
      {
        id: 'c1',
        commitment_text: 'old stale commitment text',
        commitment_doc: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'rich commitment' }] }],
        },
        assigned_to: '33333333-3333-4333-8333-333333333333',
        due_date: '2026-05-01',
      },
    ],
    tasks: [
      {
        id: 't1',
        task_title: 'Task 1',
        task_description: 'old stale task description',
        task_description_doc: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'rich task desc' }] }],
        },
        assigned_to: '33333333-3333-4333-8333-333333333333',
        due_date: '2026-05-02',
        priority: 'media',
        category: '',
        estimated_hours: null,
      },
    ],
    version: 1,
    updated_at: new Date().toISOString(),
  }),
  updateMeeting: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../../utils/storage', () => ({
  uploadFile: vi.fn(),
}));

import MeetingDocumentationModal from '../../../components/meetings/MeetingDocumentationModal';
import { toast } from 'react-hot-toast';
import { capturedCalls, resetMeetingSupabaseMock } from './meetingSupabaseMock';

describe('MeetingDocumentationModal — clearing rich text clears plaintext', () => {
  beforeEach(() => {
    editorOnChange.clear();
    resetMeetingSupabaseMock();
    // Route-aware: the community-scoped member pickers load through
    // /api/community/members and an empty community is a valid answer.
    // @ts-expect-error override global fetch for test
    global.fetch = vi.fn(async (input: RequestInfo) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.startsWith('/api/community/members')) {
        return new Response(JSON.stringify({ members: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: null }), { status: 200 });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function openStep3() {
    const utils = render(
      <MeetingDocumentationModal
        isOpen={false}
        onClose={vi.fn()}
        workspaceId="ws-1"
        communityId="comm-1"
        userId="user-1"
        onSuccess={vi.fn()}
        meetingId="meeting-1"
        mode="edit"
      />
    );
    await act(async () => {
      utils.rerender(
        <MeetingDocumentationModal
          isOpen
          onClose={vi.fn()}
          workspaceId="ws-1"
          communityId="comm-1"
          userId="user-1"
          onSuccess={vi.fn()}
          meetingId="meeting-1"
          mode="edit"
        />
      );
    });
    // Wait for getMeetingDetails to populate the form (title input reflects loaded meeting).
    await waitFor(() => {
      const titleInput = utils.container.querySelector('input[type="text"]') as HTMLInputElement | null;
      expect(titleInput?.value).toBe('Test meeting');
    });
    await act(async () => { fireEvent.click(utils.getByText('Siguiente')); });
    await waitFor(() => expect(editorOnChange.get('Resumen de la reunión…')).toBeDefined());
    await act(async () => { fireEvent.click(utils.getByText('Siguiente')); });
    await waitFor(() => {
      expect(editorOnChange.get('Describe el compromiso…')).toBeDefined();
      expect(editorOnChange.get('Describe la tarea…')).toBeDefined();
    });
    return utils;
  }

  const emptyDocValue = { type: 'doc', content: [{ type: 'paragraph' }] };

  it('persists an empty task_description and task_description_doc when the task editor is cleared', async () => {
    const { getByText } = await openStep3();
    await act(async () => {
      editorOnChange.get('Describe la tarea…')!(emptyDocValue);
    });
    await act(async () => { fireEvent.click(getByText('Guardar Cambios')); });

    await waitFor(() => {
      expect((capturedCalls['update:meeting_tasks'] ?? []).length).toBeGreaterThan(0);
    });
    const taskUpdates = capturedCalls['update:meeting_tasks']!;
    expect(taskUpdates[0].task_description).toBe('');
    expect(taskUpdates[0].task_description_doc).toEqual(emptyDocValue);
  });

  it('a cleared commitment is not saved empty: the save is blocked with a message (SM-H8)', async () => {
    const { getByText, getByTestId } = await openStep3();
    await act(async () => {
      editorOnChange.get('Describe el compromiso…')!(emptyDocValue);
    });
    await act(async () => { fireEvent.click(getByText('Guardar Cambios')); });

    expect(capturedCalls['update:meeting_commitments']).toBeUndefined();
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Describe el compromiso o elimínalo.');
    expect(getByTestId('meeting-commitment-0-errors').textContent).toContain('Describe el compromiso o elimínalo.');
  });
});
