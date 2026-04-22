// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

const {
  mockCreateMeetingWithDocumentation,
  mockUpdateMeeting,
  mockGetCommunityMembers,
  mockGetMeetingDetails,
  mockSendTaskAssignmentNotifications,
  mockUploadFile,
  mockToastSuccess,
  mockToastError,
} = vi.hoisted(() => ({
  mockCreateMeetingWithDocumentation: vi.fn(),
  mockUpdateMeeting: vi.fn(),
  mockGetCommunityMembers: vi.fn(),
  mockGetMeetingDetails: vi.fn(),
  mockSendTaskAssignmentNotifications: vi.fn(),
  mockUploadFile: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

// Stub the Supabase client used for loadCommunityMembers and attachment writes.
// loadCommunityMembers falls back to the profiles-only path when the workspace
// lookup fails, which is fine for this test (we don't care about attendees).
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'no workspace' } }) }),
        order: () => Promise.resolve({ data: [], error: null }),
        in: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
      }),
      insert: () => Promise.resolve({ data: null, error: null }),
      delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    }),
  }),
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

vi.mock('../../../utils/meetingUtils', () => ({
  createMeetingWithDocumentation: mockCreateMeetingWithDocumentation,
  updateMeeting: mockUpdateMeeting,
  getCommunityMembersForAssignment: mockGetCommunityMembers,
  getMeetingDetails: mockGetMeetingDetails,
  sendTaskAssignmentNotifications: mockSendTaskAssignmentNotifications,
}));

vi.mock('../../../utils/storage', () => ({
  uploadFile: mockUploadFile,
}));

import MeetingDocumentationModal from '../../../components/meetings/MeetingDocumentationModal';

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  workspaceId: 'ws-1',
  userId: 'user-1',
  onSuccess: vi.fn(),
};

describe('MeetingDocumentationModal — save draft', () => {
  beforeEach(() => {
    mockCreateMeetingWithDocumentation.mockResolvedValue({
      success: true,
      meetingId: 'new-meeting-id',
    });
    mockSendTaskAssignmentNotifications.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('persists commitments and tasks from step 3 when clicking "Guardar borrador" in create mode', async () => {
    render(<MeetingDocumentationModal {...defaultProps} />);

    // Step 1: fill required fields and advance
    fireEvent.change(screen.getByPlaceholderText(/Reunión de planificación semanal/i), {
      target: { value: 'Reunión semanal' },
    });
    const dateInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-05-01T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));

    // Step 2: fill summary and advance
    await waitFor(() => {
      expect(screen.getByText(/Resumen de la Reunión/i)).toBeInTheDocument();
    });
    const summaryTextarea = document.querySelector(
      'textarea[placeholder*="puntos principales"]'
    ) as HTMLTextAreaElement;
    fireEvent.change(summaryTextarea, { target: { value: 'Puntos discutidos' } });
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));

    // Step 3: add one commitment
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Agregar Compromiso/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Agregar Compromiso/i }));
    const commitmentTextarea = document.querySelector(
      'textarea[placeholder*="acuerdo o compromiso"]'
    ) as HTMLTextAreaElement;
    fireEvent.change(commitmentTextarea, {
      target: { value: 'Enviar informe final' },
    });

    // Step 3: add one task
    fireEvent.click(screen.getByRole('button', { name: /Agregar Tarea/i }));
    const taskTitleInput = document.querySelector(
      'input[placeholder="Título de la tarea..."]'
    ) as HTMLInputElement;
    fireEvent.change(taskTitleInput, { target: { value: 'Preparar presentación' } });

    // Click "Guardar borrador"
    fireEvent.click(screen.getByRole('button', { name: /Guardar borrador/i }));

    await waitFor(() => {
      expect(mockCreateMeetingWithDocumentation).toHaveBeenCalledTimes(1);
    });

    const [workspaceArg, userArg, payload] = mockCreateMeetingWithDocumentation.mock.calls[0];
    expect(workspaceArg).toBe('ws-1');
    expect(userArg).toBe('user-1');
    expect(payload.summary_info.status).toBe('borrador');
    expect(payload.commitments).toHaveLength(1);
    expect(payload.commitments[0].commitment_text).toBe('Enviar informe final');
    expect(payload.tasks).toHaveLength(1);
    expect(payload.tasks[0].task_title).toBe('Preparar presentación');

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Borrador guardado correctamente');
    });
  });
});
