// @vitest-environment jsdom
// F12a EC-R1: «Crear Reunión» saves a draft; «Completada» only comes from
// «Finalizar reunión». EC-R2: background saving runs for drafts only.
import React from 'react';
import { render, act, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'react-hot-toast';
import {
  capturedCalls,
  resetMeetingSupabaseMock,
  seedRows,
} from './meetingSupabaseMock';

const editorOnChange = new Map<string, (json: any) => void>();
const editorContent = new Map<string, any>();

vi.mock('../../../src/components/TipTapEditor', () => ({
  __esModule: true,
  default: ({ onChange, placeholder, initialContent }: any) => {
    if (placeholder) editorOnChange.set(placeholder, onChange);
    if (placeholder) editorContent.set(placeholder, initialContent);
    return <div data-testid={`tiptap-${placeholder ?? 'none'}`} />;
  },
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

vi.mock('../../../utils/storage', () => ({
  uploadFile: vi.fn(),
}));

import MeetingDocumentationModal from '../../../components/meetings/MeetingDocumentationModal';

// Invented person.
const ANA = { id: '33333333-3333-4333-8333-333333333333', first_name: 'Ana', last_name: 'Uno', email: 'ana@x.cl', avatar_url: null, user_roles: [{ role_type: 'docente' }] };

const defaultProps = {
  isOpen: true as const,
  onClose: vi.fn(),
  workspaceId: 'ws-1',
  communityId: 'comm-1',
  userId: 'user-1',
  onSuccess: vi.fn(),
  onDraftSaved: vi.fn(),
};

const richDoc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const toastSuccess = vi.mocked(toast.success);

beforeEach(() => {
  editorOnChange.clear();
  editorContent.clear();
  resetMeetingSupabaseMock();
  mockUpdateMeeting.mockReset();
  mockGetMeetingDetails.mockReset();
  mockUpdateMeeting.mockResolvedValue({ success: true });
  // @ts-expect-error override global fetch for test
  global.fetch = vi.fn(async (input: RequestInfo) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.startsWith('/api/community/members')) {
      return new Response(JSON.stringify({ members: [ANA] }), { status: 200 });
    }
    if (url.endsWith('/work-session/start')) {
      return new Response(JSON.stringify({ data: { id: 'ws-session' } }), { status: 201 });
    }
    return new Response(JSON.stringify({ data: null }), { status: 200 });
  });
});

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };

const statusOptions = (container: HTMLElement) => {
  const label = Array.from(container.querySelectorAll('label')).find((l) => l.textContent?.includes('Estado de la Reunión'));
  const select = label!.parentElement!.querySelector('select') as HTMLSelectElement;
  return Array.from(select.options).map((o) => o.value);
};

async function fillStep1AndGoToStep2(utils: ReturnType<typeof render>) {
  const { getByRole, getByPlaceholderText, container, getByTestId } = utils;
  fireEvent.change(getByPlaceholderText(/Reunión de planificación semanal/i), { target: { value: 'Reunión semanal' } });
  const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
  fireEvent.change(dateInput, { target: { value: '2026-05-01T10:00' } });
  await waitFor(() => expect(getByTestId(`meeting-attendee-${ANA.id}`)).toBeDefined());
  await click(getByTestId(`meeting-attendee-${ANA.id}`));
  await click(getByRole('button', { name: /Siguiente/i }));
  await waitFor(() => expect(editorOnChange.get('Resumen de la reunión…')).toBeDefined());
}

const storedMeeting = (status: string) => ({
  id: 'meeting-1',
  title: 'Existing meeting',
  meeting_date: new Date('2026-04-21T12:00:00Z').toISOString(),
  duration_minutes: 60,
  location: '',
  status,
  summary: 'summary text',
  summary_doc: richDoc('summary text'),
  notes: '',
  notes_doc: null,
  attendees: [{ user_id: ANA.id, role: 'participant' }],
  agreements: [],
  commitments: [],
  tasks: [],
  version: 1,
  updated_at: new Date().toISOString(),
});

async function openEditOnStep2(status: string) {
  mockGetMeetingDetails.mockResolvedValue(storedMeeting(status));
  seedRows('meeting_attendees', [{ id: 'att-ana', meeting_id: 'meeting-1', user_id: ANA.id, role: 'participant' }]);
  const utils = render(<MeetingDocumentationModal {...defaultProps} meetingId="meeting-1" mode="edit" />);
  await waitFor(() => {
    const titleInput = utils.container.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(titleInput?.value).toBe('Existing meeting');
  });
  await click(utils.getByRole('button', { name: /Siguiente/i }));
  await waitFor(() => expect(editorOnChange.get('Resumen de la reunión…')).toBeDefined());
  return utils;
}

describe('MeetingDocumentationModal — «Crear Reunión» saves a draft (EC-R1)', () => {
  it('a new meeting sent with «Crear Reunión» is inserted as borrador and says how to finalise it', async () => {
    const utils = render(<MeetingDocumentationModal {...defaultProps} />);
    await fillStep1AndGoToStep2(utils);
    await act(async () => { editorOnChange.get('Resumen de la reunión…')!(richDoc('Puntos discutidos')); });
    await click(utils.getByRole('button', { name: /Siguiente/i }));
    await waitFor(() => expect(utils.getByRole('button', { name: /Agregar Compromiso/i })).toBeDefined());

    await click(utils.getByRole('button', { name: /Crear Reunión/i }));

    await waitFor(() => expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1));
    const inserts = capturedCalls['insert:community_meetings'];
    expect(inserts).toHaveLength(1);
    expect(inserts[0].status).toBe('borrador');
    expect(toastSuccess).toHaveBeenCalledWith(
      'Reunión guardada como borrador. Ábrela y pulsa «Finalizar reunión» para enviar el resumen.'
    );
  });

  it('the status select of a NEW meeting does not offer «Completada» and starts on Borrador', async () => {
    const utils = render(<MeetingDocumentationModal {...defaultProps} />);
    await fillStep1AndGoToStep2(utils);
    const options = statusOptions(utils.container);
    expect(options).not.toContain('completada');
    expect(options).toEqual(['borrador', 'programada', 'en_progreso', 'cancelada', 'pospuesta']);
    const label = Array.from(utils.container.querySelectorAll('label')).find((l) => l.textContent?.includes('Estado de la Reunión'));
    expect((label!.parentElement!.querySelector('select') as HTMLSelectElement).value).toBe('borrador');
  });

  it('the status select of a stored draft does not offer «Completada»', async () => {
    const utils = await openEditOnStep2('borrador');
    expect(statusOptions(utils.container)).not.toContain('completada');
  });

  it('the status select of a meeting stored as completada offers it and keeps it', async () => {
    const utils = await openEditOnStep2('completada');
    expect(statusOptions(utils.container)).toContain('completada');
    await click(utils.getByRole('button', { name: /Siguiente/i }));
    await click(utils.getByRole('button', { name: /Guardar Cambios/i }));
    await waitFor(() => expect(mockUpdateMeeting).toHaveBeenCalledTimes(1));
    expect(mockUpdateMeeting.mock.calls[0][1].status).toBe('completada');
    expect(toastSuccess).toHaveBeenCalledWith('Reunión actualizada correctamente');
  });
});

describe('MeetingDocumentationModal — background saving only for drafts (EC-R2)', () => {
  const autosaveCalls = () =>
    vi.mocked(global.fetch).mock.calls.filter(([input]) => String(input).endsWith('/autosave'));

  it('a meeting stored as completada: typing in the summary sends no autosave and the text stays', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const utils = await openEditOnStep2('completada');

    await act(async () => { editorOnChange.get('Resumen de la reunión…')!(richDoc('Texto nuevo escrito')); });
    await act(async () => { vi.advanceTimersByTime(5_000); });
    await act(async () => { await Promise.resolve(); });

    expect(autosaveCalls()).toHaveLength(0);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockGetMeetingDetails).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(editorContent.get('Resumen de la reunión…'))).toContain('Texto nuevo escrito');
    // No «Guardado hace…» indicator for a meeting that is not a draft.
    expect(utils.queryByText(/Guardado hace/)).toBeNull();

    // «Guardar Cambios» still stores the summary of a finalised meeting.
    await click(utils.getByRole('button', { name: /Siguiente/i }));
    await click(utils.getByRole('button', { name: /Guardar Cambios/i }));
    await waitFor(() => expect(mockUpdateMeeting).toHaveBeenCalledTimes(1));
    expect(mockUpdateMeeting.mock.calls[0][1].summary).toContain('Texto nuevo escrito');
    expect(mockUpdateMeeting.mock.calls[0][1].status).toBe('completada');
    alertSpy.mockRestore();
  });

  it('a stored draft still saves in the background after typing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const utils = await openEditOnStep2('borrador');
    expect(utils.getByText(/Guardado hace/)).toBeDefined();

    await act(async () => { editorOnChange.get('Resumen de la reunión…')!(richDoc('Texto del borrador')); });
    await act(async () => { vi.advanceTimersByTime(2_500); });

    await waitFor(() => expect(autosaveCalls()).toHaveLength(1));
    const body = JSON.parse(String((autosaveCalls()[0][1] as RequestInit).body));
    expect(body.version).toBe(1);
  });

  it('a stored draft whose background save hits a version conflict still asks to reload', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => false);
    const plainFetch = global.fetch;
    // @ts-expect-error override global fetch for test
    global.fetch = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      if (String(input).endsWith('/autosave')) {
        return new Response(JSON.stringify({ code: 'version_conflict', updated_by_name: 'Bruno Dos' }), { status: 409 });
      }
      return (plainFetch as any)(input, init);
    });
    await openEditOnStep2('borrador');
    await act(async () => { editorOnChange.get('Resumen de la reunión…')!(richDoc('x')); });
    await act(async () => { vi.advanceTimersByTime(2_500); });
    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1));
    expect(String(confirmSpy.mock.calls[0][0])).toContain('por Bruno Dos');
    confirmSpy.mockRestore();
  });

  it('after «Guardar borrador» on a new meeting, typing saves in the background', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const utils = render(<MeetingDocumentationModal {...defaultProps} />);
    await fillStep1AndGoToStep2(utils);
    await click(utils.getByRole('button', { name: /Guardar borrador/i }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Borrador guardado'));

    await act(async () => { editorOnChange.get('Resumen de la reunión…')!(richDoc('Después del borrador')); });
    await act(async () => { vi.advanceTimersByTime(2_500); });
    await waitFor(() => expect(autosaveCalls()).toHaveLength(1));
  });
});
