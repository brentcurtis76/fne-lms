// @vitest-environment jsdom
// GENERA fixes F12c, N159: after «Finalizar y enviar» inside the meeting's edit
// form, the form tells its parent through the same success callback it uses
// for «Guardar Cambios», so the meetings list reloads (through loadMeetings)
// and shows the meeting as completed at once. Synthetic data only.
import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetMeetingSupabaseMock, seedRows } from './meetingSupabaseMock';

const dialog = vi.hoisted(() => ({ props: null as null | { open: boolean; onFinalized?: () => void } }));

vi.mock('../../../src/components/TipTapEditor', () => ({
  __esModule: true,
  default: () => <div />,
}));

vi.mock('@supabase/auth-helpers-react', async () => {
  const mock = await import('./meetingSupabaseMock');
  const client = mock.makeMeetingSupabaseClient();
  return { useSupabaseClient: () => client };
});

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockGetMeetingDetails = vi.fn();
vi.mock('../../../utils/meetingUtils', () => ({
  createMeetingWithDocumentation: vi.fn(),
  getMeetingDetails: (...args: any[]) => mockGetMeetingDetails(...args),
  updateMeeting: vi.fn(async () => ({ success: true })),
}));
vi.mock('../../../utils/storage', () => ({ uploadFile: vi.fn() }));

// The finalise dialog is a stub that records its props; the test plays the
// dialog's own success path (it calls onFinalized after a successful finalise).
vi.mock('../../../components/meetings/FinalizeMeetingDialog', () => ({
  FinalizeMeetingDialog: (props: any) => {
    dialog.props = props;
    return null;
  },
}));

import MeetingDocumentationModal from '../../../components/meetings/MeetingDocumentationModal';

const ANA = { id: '33333333-3333-4333-8333-333333333333', first_name: 'Ana', last_name: 'Uno', email: 'ana@example.test', avatar_url: null, user_roles: [{ role_type: 'docente' }] };

const richDoc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

beforeEach(() => {
  dialog.props = null;
  resetMeetingSupabaseMock();
  mockGetMeetingDetails.mockReset();
  mockGetMeetingDetails.mockResolvedValue({
    id: 'meeting-1',
    title: 'Reunión sintética',
    meeting_date: new Date('2026-04-21T12:00:00Z').toISOString(),
    duration_minutes: 60,
    location: '',
    status: 'borrador',
    summary: 'resumen',
    summary_doc: richDoc('resumen'),
    notes: '',
    notes_doc: null,
    attendees: [{ user_id: ANA.id, role: 'participant' }],
    agreements: [],
    commitments: [],
    tasks: [],
    version: 1,
    updated_at: new Date().toISOString(),
  });
  seedRows('meeting_attendees', [{ id: 'att-ana', meeting_id: 'meeting-1', user_id: ANA.id, role: 'participant' }]);
  // @ts-expect-error override global fetch for test
  global.fetch = vi.fn(async (input: RequestInfo) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.startsWith('/api/community/members')) return new Response(JSON.stringify({ members: [ANA] }), { status: 200 });
    if (url.endsWith('/work-session/start')) return new Response(JSON.stringify({ data: { id: 'ws-session' } }), { status: 201 });
    return new Response(JSON.stringify({ data: null }), { status: 200 });
  });
});

afterEach(() => { vi.clearAllMocks(); });

describe('N159 a successful finalise reloads the meetings list', () => {
  it('the form calls onSuccess (the parent\'s reload) and closes after the dialog reports a finalise', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const onDraftSaved = vi.fn();
    const utils = render(
      <MeetingDocumentationModal
        isOpen
        onClose={onClose}
        workspaceId="ws-1"
        communityId="comm-1"
        userId="user-1"
        onSuccess={onSuccess}
        onDraftSaved={onDraftSaved}
        meetingId="meeting-1"
        mode="edit"
      />
    );
    await waitFor(() => {
      const titleInput = utils.container.querySelector('input[type="text"]') as HTMLInputElement | null;
      expect(titleInput?.value).toBe('Reunión sintética');
    });
    expect(dialog.props).not.toBeNull();

    await act(async () => {
      dialog.props!.onFinalized?.();
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });
});
