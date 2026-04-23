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

// Capture Supabase insert/update payloads per table.
const capturedCalls: Record<string, any[]> = {};

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({
    from: vi.fn((table: string) => {
      const empty = { data: [], error: null };
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        is: vi.fn(() => chain),
        order: vi.fn(() => Promise.resolve(empty)),
        single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        then: (resolve: any) => resolve(empty),
        insert: vi.fn((rows: any) => {
          (capturedCalls[`insert:${table}`] ??= []).push(rows);
          return Promise.resolve(empty);
        }),
        update: vi.fn((payload: any) => {
          (capturedCalls[`update:${table}`] ??= []).push(payload);
          return chain;
        }),
        delete: vi.fn(() => chain),
      };
      return chain;
    }),
  }),
}));

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
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
    status: 'completada',
    summary: 'summary text',
    summary_doc: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'summary text' }] }],
    },
    notes: '',
    notes_doc: null,
    attendees: [],
    agreements: [],
    commitments: [
      {
        id: 'c1',
        commitment_text: 'old stale commitment text',
        commitment_doc: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'rich commitment' }] }],
        },
        assigned_to: '',
        due_date: null,
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
        assigned_to: '',
        due_date: null,
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

describe('MeetingDocumentationModal — clearing rich text clears plaintext', () => {
  beforeEach(() => {
    editorOnChange.clear();
    for (const key of Object.keys(capturedCalls)) delete capturedCalls[key];
    // @ts-expect-error override global fetch for test
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ data: null }), { status: 200 })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('persists empty commitment_text and empty commitment_doc when the editor is cleared', async () => {
    const { rerender, getByText, container } = render(
      <MeetingDocumentationModal
        isOpen={false}
        onClose={vi.fn()}
        workspaceId="ws-1"
        userId="user-1"
        onSuccess={vi.fn()}
        meetingId="meeting-1"
        mode="edit"
      />
    );

    await act(async () => {
      rerender(
        <MeetingDocumentationModal
          isOpen
          onClose={vi.fn()}
          workspaceId="ws-1"
          userId="user-1"
          onSuccess={vi.fn()}
          meetingId="meeting-1"
          mode="edit"
        />
      );
    });

    // Wait for getMeetingDetails to populate the form (title input reflects loaded meeting).
    await waitFor(() => {
      const titleInput = container.querySelector('input[type="text"]') as HTMLInputElement | null;
      expect(titleInput?.value).toBe('Test meeting');
    });

    // Step 1 → Step 2
    await act(async () => {
      fireEvent.click(getByText('Siguiente'));
    });
    await waitFor(() => {
      expect(editorOnChange.get('Resumen de la reunión…')).toBeDefined();
    });

    // Step 2 → Step 3 (AGREEMENTS)
    await act(async () => {
      fireEvent.click(getByText('Siguiente'));
    });

    await waitFor(() => {
      expect(editorOnChange.get('Describe el compromiso…')).toBeDefined();
      expect(editorOnChange.get('Describe la tarea…')).toBeDefined();
    });

    const emptyDocValue = { type: 'doc', content: [{ type: 'paragraph' }] };

    // Simulate the user clearing both editors — fire onChange with an empty doc.
    await act(async () => {
      editorOnChange.get('Describe el compromiso…')!(emptyDocValue);
      editorOnChange.get('Describe la tarea…')!(emptyDocValue);
    });

    // Save.
    await act(async () => {
      fireEvent.click(getByText('Guardar Cambios'));
    });

    await waitFor(() => {
      const commitmentUpdates = capturedCalls['update:meeting_commitments'] ?? [];
      expect(commitmentUpdates.length).toBeGreaterThan(0);
    });

    const commitmentUpdates = capturedCalls['update:meeting_commitments']!;
    const taskUpdates = capturedCalls['update:meeting_tasks']!;

    expect(commitmentUpdates[0].commitment_text).toBe('');
    expect(commitmentUpdates[0].commitment_doc).toEqual(emptyDocValue);

    expect(taskUpdates[0].task_description).toBe('');
    expect(taskUpdates[0].task_description_doc).toEqual(emptyDocValue);
  });
});
