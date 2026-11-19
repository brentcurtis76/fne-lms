// @vitest-environment jsdom
// F18 EC-R8: closing the meeting form with unsaved changes asks first.
import React from 'react';
import { render, act, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'react-hot-toast';
import { resetMeetingSupabaseMock, seedRows } from './meetingSupabaseMock';

vi.mock('../../../src/components/TipTapEditor', () => ({
  __esModule: true,
  default: ({ placeholder }: any) => <div data-testid={`tiptap-${placeholder ?? 'none'}`} />,
}));

vi.mock('@supabase/auth-helpers-react', async () => {
  const mock = await import('./meetingSupabaseMock');
  const client = mock.makeMeetingSupabaseClient();
  return { useSupabaseClient: () => client };
});

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockUpdateMeeting = vi.fn();
const mockGetMeetingDetails = vi.fn();

vi.mock('../../../utils/meetingUtils', () => ({
  createMeetingWithDocumentation: vi.fn(),
  getMeetingDetails: (...args: any[]) => mockGetMeetingDetails(...args),
  updateMeeting: (...args: any[]) => mockUpdateMeeting(...args),
}));

vi.mock('../../../utils/storage', () => ({ uploadFile: vi.fn() }));

// The finalise dialog is a stub that records its props; a test plays its
// success path by calling onFinalized.
const dialog: { props: any } = { props: null };
vi.mock('../../../components/meetings/FinalizeMeetingDialog', () => ({
  FinalizeMeetingDialog: (props: any) => {
    dialog.props = props;
    return null;
  },
}));

import MeetingDocumentationModal from '../../../components/meetings/MeetingDocumentationModal';

// Invented person.
const ANA = { id: '33333333-3333-4333-8333-333333333333', first_name: 'Ana', last_name: 'Uno', email: 'ana@example.test', avatar_url: null, user_roles: [{ role_type: 'docente' }] };
const QUESTION = 'Tienes cambios sin guardar. ¿Cerrar y descartarlos?';

const richDoc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const storedDraft = () => ({
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
  finalized_at: null,
  updated_at: new Date().toISOString(),
});

let onClose: ReturnType<typeof vi.fn>;
let confirmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  dialog.props = null;
  resetMeetingSupabaseMock();
  mockUpdateMeeting.mockReset();
  mockGetMeetingDetails.mockReset();
  mockUpdateMeeting.mockResolvedValue({ success: true, version: 2 });
  mockGetMeetingDetails.mockResolvedValue(storedDraft());
  seedRows('meeting_attendees', [{ id: 'att-ana', meeting_id: 'meeting-1', user_id: ANA.id, role: 'participant' }]);
  onClose = vi.fn();
  confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => false);
  // @ts-expect-error override global fetch for test
  global.fetch = vi.fn(async (input: RequestInfo) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.startsWith('/api/community/members')) return new Response(JSON.stringify({ members: [ANA] }), { status: 200 });
    if (url.endsWith('/work-session/start')) return new Response(JSON.stringify({ data: { id: 'ws-session' } }), { status: 201 });
    return new Response(JSON.stringify({ data: null }), { status: 200 });
  });
});

afterEach(() => {
  confirmSpy.mockRestore();
  vi.clearAllMocks();
});

const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };

const renderModal = (props: Record<string, unknown> = {}) =>
  render(
    <MeetingDocumentationModal
      isOpen
      onClose={onClose}
      workspaceId="ws-1"
      communityId="comm-1"
      userId="user-1"
      onSuccess={vi.fn()}
      onDraftSaved={vi.fn()}
      {...props}
    />
  );

const titleInput = (utils: ReturnType<typeof render>) =>
  utils.getByPlaceholderText(/Reunión de planificación semanal/i) as HTMLInputElement;

const closers: Array<{ name: string; find: (utils: ReturnType<typeof render>) => Element }> = [
  { name: 'the X', find: (utils) => utils.getByTestId('meeting-modal-close') },
  { name: '«Cancelar»', find: (utils) => utils.getByRole('button', { name: /Cancelar/i }) },
  { name: 'a backdrop click', find: (utils) => utils.container.querySelector('.fixed.inset-0.bg-black\\/50') as Element },
];

async function openStoredDraft() {
  const utils = renderModal({ meetingId: 'meeting-1', mode: 'edit' });
  await waitFor(() => expect(titleInput(utils).value).toBe('Reunión sintética'));
  return utils;
}

describe('MeetingDocumentationModal — closing with unsaved changes asks first (EC-R8)', () => {
  it.each(closers)('typed, then $name: asks; «no» keeps the form open with the text, «yes» closes it', async ({ find }) => {
    const utils = renderModal();
    fireEvent.change(titleInput(utils), { target: { value: 'Reunión escrita' } });

    await click(find(utils));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith(QUESTION);
    expect(onClose).not.toHaveBeenCalled();
    expect(titleInput(utils).value).toBe('Reunión escrita');

    confirmSpy.mockImplementation(() => true);
    await click(find(utils));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each(closers)('nothing typed, then $name: closes with no question', async ({ find }) => {
    const utils = renderModal();
    await click(find(utils));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a stored meeting opened and left unchanged closes with no question', async () => {
    const utils = await openStoredDraft();
    await click(utils.getByTestId('meeting-modal-close'));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('typed, then saved with «Guardar borrador»: closes with no question', async () => {
    const utils = await openStoredDraft();
    fireEvent.change(titleInput(utils), { target: { value: 'Reunión corregida' } });
    await click(utils.getByRole('button', { name: /Guardar borrador/i }));
    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Borrador guardado'));

    await click(utils.getByTestId('meeting-modal-close'));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('after a successful finalise the form closes with no question', async () => {
    const utils = await openStoredDraft();
    fireEvent.change(titleInput(utils), { target: { value: 'Reunión corregida' } });
    await click(utils.getByRole('button', { name: /Finalizar reunión/i }));
    await waitFor(() => expect(mockUpdateMeeting).toHaveBeenCalledTimes(1));
    // Even a change left in the form does not stop the close after a finalise.
    fireEvent.change(titleInput(utils), { target: { value: 'Otro título' } });
    expect(dialog.props).not.toBeNull();

    await act(async () => { dialog.props.onFinalized?.(); });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('with unsaved changes the header says «Cambios sin guardar»; it goes away after a save', async () => {
    const utils = await openStoredDraft();
    expect(utils.queryByText(/Cambios sin guardar/)).toBeNull();
    fireEvent.change(titleInput(utils), { target: { value: 'Reunión corregida' } });
    expect(utils.getByText(/Cambios sin guardar/)).toBeDefined();

    await click(utils.getByRole('button', { name: /Guardar borrador/i }));
    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Borrador guardado'));
    expect(utils.queryByText(/Cambios sin guardar/)).toBeNull();
  });

  it('a new meeting with typed data also shows «Cambios sin guardar»', async () => {
    const utils = renderModal();
    expect(utils.queryByText(/Cambios sin guardar/)).toBeNull();
    fireEvent.change(titleInput(utils), { target: { value: 'Reunión escrita' } });
    expect(utils.getByText(/Cambios sin guardar/)).toBeDefined();
  });
});

describe('MeetingDocumentationModal — a half-typed date counts as unsaved (send-back 1)', () => {
  it('a date field holding an incomplete typed value: closing asks', async () => {
    const utils = renderModal();
    const dateInput = utils.getByTestId('meeting-date') as HTMLInputElement;
    // The browser keeps the value empty but marks the input badInput.
    Object.defineProperty(dateInput, 'validity', { configurable: true, value: { badInput: true } });
    fireEvent.change(dateInput, { target: { value: '' } });
    fireEvent.blur(dateInput);
    expect(utils.getByTestId('meeting-date-incomplete')).toBeDefined();

    await click(utils.getByTestId('meeting-modal-close'));
    expect(confirmSpy).toHaveBeenCalledWith(QUESTION);
    expect(onClose).not.toHaveBeenCalled();
  });
});
