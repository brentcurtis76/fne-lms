// @vitest-environment jsdom
import React from 'react';
import { render, act, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture TipTapEditor onChange callbacks keyed by placeholder. Placeholders
// repeat across rows (e.g. one per commitment) so the map holds the most
// recently-mounted editor for a given placeholder; the tests below account
// for that.
const editorOnChange = new Map<string, (json: any) => void>();

vi.mock('../../../src/components/TipTapEditor', () => ({
  __esModule: true,
  default: ({ onChange, placeholder }: any) => {
    if (placeholder) editorOnChange.set(placeholder, onChange);
    return <div data-testid={`tiptap-${placeholder ?? 'none'}`} />;
  },
}));

// Capture Supabase call payloads per `<verb>:<table>`.
const capturedCalls: Record<string, any[]> = {};

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({
    from: vi.fn((table: string) => {
      const empty = { data: [], error: null };
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn((_col: string, ids: string[]) => {
          (capturedCalls[`in:${table}`] ??= []).push(ids);
          return chain;
        }),
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
        delete: vi.fn(() => {
          (capturedCalls[`delete:${table}`] ??= []).push(true);
          return chain;
        }),
      };
      return chain;
    }),
    storage: { from: () => ({ remove: vi.fn().mockResolvedValue({ data: null, error: null }) }) },
  }),
}));

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockCreateMeeting = vi.fn();
const mockUpdateMeeting = vi.fn();
const mockGetMeetingDetails = vi.fn();
const mockSendTaskNotifications = vi.fn();

vi.mock('../../../utils/meetingUtils', () => ({
  createMeetingWithDocumentation: (...args: any[]) => mockCreateMeeting(...args),
  getCommunityMembersForAssignment: vi.fn().mockResolvedValue([]),
  sendTaskAssignmentNotifications: (...args: any[]) => mockSendTaskNotifications(...args),
  getMeetingDetails: (...args: any[]) => mockGetMeetingDetails(...args),
  updateMeeting: (...args: any[]) => mockUpdateMeeting(...args),
}));

vi.mock('../../../utils/storage', () => ({
  uploadFile: vi.fn(),
}));

import MeetingDocumentationModal from '../../../components/meetings/MeetingDocumentationModal';

const defaultProps = {
  isOpen: true as const,
  onClose: vi.fn(),
  workspaceId: 'ws-1',
  userId: 'user-1',
  onSuccess: vi.fn(),
};

const richDoc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

beforeEach(() => {
  editorOnChange.clear();
  for (const key of Object.keys(capturedCalls)) delete capturedCalls[key];
  mockCreateMeeting.mockReset();
  mockUpdateMeeting.mockReset();
  mockGetMeetingDetails.mockReset();
  mockSendTaskNotifications.mockReset();
  mockCreateMeeting.mockResolvedValue({ success: true, meetingId: 'new-meeting' });
  mockUpdateMeeting.mockResolvedValue({ success: true });
  // @ts-expect-error override global fetch for test
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ data: null }), { status: 200 })
  );
});

afterEach(() => { vi.clearAllMocks(); });

describe('MeetingDocumentationModal — "Guardar borrador" persists step-3 content', () => {
  it('create mode: clicking "Guardar borrador" sends commitments/tasks the user added, not empty arrays', async () => {
    const { getByRole, getByPlaceholderText, container } = render(
      <MeetingDocumentationModal {...defaultProps} />
    );

    // Step 1: required fields so handleSaveDraft's title/date gate passes.
    fireEvent.change(getByPlaceholderText(/Reunión de planificación semanal/i), {
      target: { value: 'Reunión semanal' },
    });
    const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-05-01T10:00' } });

    // Step 1 → 2 (validateStep passes because title + date are set).
    await act(async () => { fireEvent.click(getByRole('button', { name: /Siguiente/i })); });

    // Step 2 → 3 requires a non-empty summary doc. Drive the editor onChange.
    await waitFor(() => {
      expect(editorOnChange.get('Resumen de la reunión…')).toBeDefined();
    });
    await act(async () => {
      editorOnChange.get('Resumen de la reunión…')!(richDoc('Puntos discutidos'));
    });
    await act(async () => { fireEvent.click(getByRole('button', { name: /Siguiente/i })); });

    // Step 3: add one commitment + one task.
    await waitFor(() => {
      expect(getByRole('button', { name: /Agregar Compromiso/i })).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(getByRole('button', { name: /Agregar Compromiso/i }));
    });
    await act(async () => {
      fireEvent.click(getByRole('button', { name: /Agregar Tarea/i }));
    });

    await waitFor(() => {
      expect(editorOnChange.get('Describe el compromiso…')).toBeDefined();
      expect(editorOnChange.get('Describe la tarea…')).toBeDefined();
    });

    await act(async () => {
      editorOnChange.get('Describe el compromiso…')!(richDoc('Enviar informe final'));
      editorOnChange.get('Describe la tarea…')!(richDoc('Preparar presentación'));
    });

    const taskTitleInput = container.querySelector(
      'input[placeholder="Título de la tarea..."]'
    ) as HTMLInputElement;
    fireEvent.change(taskTitleInput, { target: { value: 'Preparar deck' } });

    // Click "Guardar borrador" — must send commitments + tasks, NOT empty arrays.
    await act(async () => {
      fireEvent.click(getByRole('button', { name: /Guardar borrador/i }));
    });

    await waitFor(() => {
      expect(mockCreateMeeting).toHaveBeenCalledTimes(1);
    });

    const [workspaceArg, userArg, payload] = mockCreateMeeting.mock.calls[0];
    expect(workspaceArg).toBe('ws-1');
    expect(userArg).toBe('user-1');
    expect(payload.summary_info.status).toBe('borrador');
    expect(payload.commitments).toHaveLength(1);
    expect(payload.commitments[0].commitment_text).toBe('Enviar informe final');
    expect(payload.tasks).toHaveLength(1);
    expect(payload.tasks[0].task_title).toBe('Preparar deck');
    expect(payload.tasks[0].task_description).toBe('Preparar presentación');
    // Draft save should not fire assignee notifications.
    expect(mockSendTaskNotifications).not.toHaveBeenCalled();
  });

  it('edit mode: "Guardar borrador" updates the existing commitment and deletes the removed one, keeping status=borrador', async () => {
    mockGetMeetingDetails.mockResolvedValue({
      id: 'meeting-1',
      title: 'Existing meeting',
      meeting_date: new Date('2026-04-21T12:00:00Z').toISOString(),
      duration_minutes: 60,
      location: '',
      status: 'borrador',
      summary: 'summary text',
      summary_doc: richDoc('summary text'),
      notes: '',
      notes_doc: null,
      attendees: [],
      agreements: [],
      commitments: [
        {
          id: 'c1',
          commitment_text: 'first',
          commitment_doc: richDoc('first'),
          assigned_to: '',
          due_date: null,
        },
        {
          id: 'c2',
          commitment_text: 'second',
          commitment_doc: richDoc('second'),
          assigned_to: '',
          due_date: null,
        },
      ],
      tasks: [],
      version: 1,
      updated_at: new Date().toISOString(),
    });

    const { getByRole, container } = render(
      <MeetingDocumentationModal {...defaultProps} meetingId="meeting-1" mode="edit" />
    );

    await waitFor(() => {
      const titleInput = container.querySelector('input[type="text"]') as HTMLInputElement | null;
      expect(titleInput?.value).toBe('Existing meeting');
    });

    // Step 1 → 2 → 3.
    await act(async () => { fireEvent.click(getByRole('button', { name: /Siguiente/i })); });
    await act(async () => { fireEvent.click(getByRole('button', { name: /Siguiente/i })); });

    await waitFor(() => {
      expect(editorOnChange.get('Describe el compromiso…')).toBeDefined();
    });

    // Two commitments render two editors — both register under the same
    // placeholder key, so the map has the SECOND one. Use that to modify c2's
    // text; we'll delete c1 below.
    const modifiedDoc = richDoc('second — updated');
    await act(async () => {
      editorOnChange.get('Describe el compromiso…')!(modifiedDoc);
    });

    // Click the first commitment's delete button (the trash-icon button with
    // red text class). Commitments render in order: c1, c2.
    const redTrashButtons = Array.from(container.querySelectorAll('button'))
      .filter((b) => b.className.includes('text-red'));
    expect(redTrashButtons.length).toBeGreaterThanOrEqual(2);
    await act(async () => { fireEvent.click(redTrashButtons[0]); });

    await act(async () => {
      fireEvent.click(getByRole('button', { name: /Guardar borrador/i }));
    });

    await waitFor(() => {
      expect(mockUpdateMeeting).toHaveBeenCalledTimes(1);
    });

    const [, updatePayload] = mockUpdateMeeting.mock.calls[0];
    expect(updatePayload.status).toBe('borrador');

    const commitmentUpdates = capturedCalls['update:meeting_commitments'] ?? [];
    const deletedIdBatches = capturedCalls['in:meeting_commitments'] ?? [];

    // The surviving commitment (c2) got its text updated.
    expect(commitmentUpdates.length).toBeGreaterThan(0);
    expect(commitmentUpdates.some((u: any) => u.commitment_text === 'second — updated')).toBe(true);

    // A delete-in call fired with c1 (the removed commitment).
    expect(deletedIdBatches.flat()).toContain('c1');

    // Draft save still skips task-assignment notifications.
    expect(mockSendTaskNotifications).not.toHaveBeenCalled();
  });
});
