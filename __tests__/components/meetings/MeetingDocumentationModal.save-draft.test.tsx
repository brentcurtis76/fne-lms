// @vitest-environment jsdom
import React from 'react';
import { render, act, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'react-hot-toast';
import {
  capturedCalls,
  failingWrites,
  makeMeetingSupabaseClient,
  resetMeetingSupabaseMock,
  seedRows,
  tableRows,
  holdWrites,
  makeGate,
  failingReads,
  refusedWrites,
} from './meetingSupabaseMock';

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

// Synthetic people.
const ANA = { id: '33333333-3333-4333-8333-333333333333', first_name: 'Ana', last_name: 'Uno', email: 'ana@x.cl', avatar_url: null, user_roles: [{ role_type: 'docente' }] };
const BRUNO = { id: '44444444-4444-4444-8444-444444444444', first_name: 'Bruno', last_name: 'Dos', email: 'bruno@x.cl', avatar_url: null, user_roles: [{ role_type: 'docente' }] };

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

const toastError = vi.mocked(toast.error);
const toastSuccess = vi.mocked(toast.success);

beforeEach(() => {
  editorOnChange.clear();
  resetMeetingSupabaseMock();
  mockUpdateMeeting.mockReset();
  mockGetMeetingDetails.mockReset();
  mockUpdateMeeting.mockResolvedValue({ success: true });
  // @ts-expect-error override global fetch for test
  global.fetch = vi.fn(async (input: RequestInfo) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.startsWith('/api/community/members')) {
      return new Response(JSON.stringify({ members: [ANA, BRUNO] }), { status: 200 });
    }
    if (url.endsWith('/work-session/start')) {
      return new Response(JSON.stringify({ data: { id: 'ws-session' } }), { status: 201 });
    }
    return new Response(JSON.stringify({ data: null }), { status: 200 });
  });
});

afterEach(() => { vi.clearAllMocks(); });

const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };

/** Create mode, Ana ticked as participant, landed on step 3. */
async function createToStep3(utils: ReturnType<typeof render>) {
  const { getByRole, getByPlaceholderText, container, getByTestId } = utils;
  fireEvent.change(getByPlaceholderText(/Reunión de planificación semanal/i), { target: { value: 'Reunión semanal' } });
  const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
  fireEvent.change(dateInput, { target: { value: '2026-05-01T10:00' } });
  await waitFor(() => expect(getByTestId(`meeting-attendee-${ANA.id}`)).toBeDefined());
  await click(getByTestId(`meeting-attendee-${ANA.id}`));
  await click(getByRole('button', { name: /Siguiente/i }));
  await waitFor(() => expect(editorOnChange.get('Resumen de la reunión…')).toBeDefined());
  await act(async () => { editorOnChange.get('Resumen de la reunión…')!(richDoc('Puntos discutidos')); });
  await click(getByRole('button', { name: /Siguiente/i }));
  await waitFor(() => expect(getByRole('button', { name: /Agregar Compromiso/i })).toBeDefined());
}

/** One complete commitment and one complete task, both for Ana. */
async function addCompleteItems(utils: ReturnType<typeof render>) {
  const { getByRole, getByTestId } = utils;
  await click(getByRole('button', { name: /Agregar Compromiso/i }));
  await click(getByRole('button', { name: /Agregar Tarea/i }));
  await waitFor(() => {
    expect(editorOnChange.get('Describe el compromiso…')).toBeDefined();
    expect(editorOnChange.get('Describe la tarea…')).toBeDefined();
  });
  await act(async () => {
    editorOnChange.get('Describe el compromiso…')!(richDoc('Enviar informe final'));
    editorOnChange.get('Describe la tarea…')!(richDoc('Preparar presentación'));
  });
  fireEvent.change(getByTestId('meeting-commitment-assignee-0'), { target: { value: ANA.id } });
  fireEvent.change(getByTestId('meeting-commitment-due-0'), { target: { value: '2026-05-10' } });
  fireEvent.change(getByTestId('meeting-task-title-0'), { target: { value: 'Preparar deck' } });
  fireEvent.change(getByTestId('meeting-task-assignee-0'), { target: { value: ANA.id } });
  fireEvent.change(getByTestId('meeting-task-due-0'), { target: { value: '2026-05-12' } });
}

describe('MeetingDocumentationModal — saving (SM-H8)', () => {
  it('create mode: "Guardar borrador" writes the meeting, participant, commitment and task, then says so', async () => {
    const utils = render(<MeetingDocumentationModal {...defaultProps} />);
    await createToStep3(utils);
    await addCompleteItems(utils);

    await click(utils.getByRole('button', { name: /Guardar borrador/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Borrador guardado'));
    const meetingInsert = capturedCalls['insert:community_meetings'];
    expect(meetingInsert).toHaveLength(1);
    expect(meetingInsert[0].status).toBe('borrador');
    expect(meetingInsert[0].created_by).toBe('user-1');
    // datetime-local wall time converted through the browser zone, not sent raw.
    expect(meetingInsert[0].meeting_date).toBe(new Date(2026, 4, 1, 10, 0).toISOString());
    expect(capturedCalls['insert:meeting_attendees'][0]).toEqual([
      { meeting_id: expect.any(String), user_id: ANA.id, attendance_status: 'invited', role: 'participant' },
    ]);
    expect(capturedCalls['insert:meeting_commitments'][0]).toMatchObject({
      commitment_text: 'Enviar informe final', assigned_to: ANA.id, due_date: '2026-05-10',
    });
    expect(capturedCalls['insert:meeting_tasks'][0]).toMatchObject({
      task_title: 'Preparar deck', task_description: 'Preparar presentación', assigned_to: ANA.id, due_date: '2026-05-12',
    });
    expect(defaultProps.onDraftSaved).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('a second save after the first one updates the same rows instead of inserting duplicates', async () => {
    const utils = render(<MeetingDocumentationModal {...defaultProps} />);
    await createToStep3(utils);
    await addCompleteItems(utils);
    await click(utils.getByRole('button', { name: /Guardar borrador/i }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));

    await click(utils.getByRole('button', { name: /Guardar borrador/i }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(2));

    expect(capturedCalls['insert:community_meetings']).toHaveLength(1);
    expect(capturedCalls['insert:meeting_commitments']).toHaveLength(1);
    expect(capturedCalls['insert:meeting_tasks']).toHaveLength(1);
    expect(capturedCalls['insert:meeting_attendees']).toHaveLength(1);
    expect(mockUpdateMeeting).toHaveBeenCalledTimes(1);
    expect(capturedCalls['update:meeting_commitments']).toHaveLength(1);
    expect(capturedCalls['update:meeting_tasks']).toHaveLength(1);
  });

  it('blocks the save while a task has no title, person or date, and says what is missing', async () => {
    const utils = render(<MeetingDocumentationModal {...defaultProps} />);
    await createToStep3(utils);
    await click(utils.getByRole('button', { name: /Agregar Tarea/i }));

    await click(utils.getByRole('button', { name: /Guardar borrador/i }));

    expect(capturedCalls['insert:community_meetings']).toBeUndefined();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('Escribe el título de la tarea'));
    const errors = utils.getByTestId('meeting-task-0-errors').textContent;
    expect(errors).toContain('Escribe el título de la tarea o elimínala.');
    expect(errors).toContain('Elige a quién se asigna esta tarea.');
    expect(errors).toContain('Indica la fecha límite de la tarea.');
  });

  it('a refused task insert is shown, never "Borrador guardado", and the retry does not create the meeting again', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    failingWrites['insert:meeting_tasks'] = { code: '23514', message: 'violates check constraint "task_title_not_empty"' };
    const utils = render(<MeetingDocumentationModal {...defaultProps} />);
    await createToStep3(utils);
    await addCompleteItems(utils);

    await click(utils.getByRole('button', { name: /Guardar borrador/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Tarea 1: el texto no puede quedar vacío.'));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(defaultProps.onDraftSaved).not.toHaveBeenCalled();
    expect(utils.getByTestId('meeting-task-0-errors').textContent).toContain('Tarea 1: el texto no puede quedar vacío.');

    delete failingWrites['insert:meeting_tasks'];
    await click(utils.getByRole('button', { name: /Guardar borrador/i }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Borrador guardado'));
    expect(capturedCalls['insert:community_meetings']).toHaveLength(1);
    expect(capturedCalls['insert:meeting_commitments']).toHaveLength(1);
    expect(capturedCalls['insert:meeting_tasks']).toHaveLength(2);
    consoleError.mockRestore();
  });

  it('assignee lists offer only the participants ticked in step 1', async () => {
    const utils = render(<MeetingDocumentationModal {...defaultProps} />);
    await createToStep3(utils);
    await click(utils.getByRole('button', { name: /Agregar Compromiso/i }));
    const select = utils.getByTestId('meeting-commitment-assignee-0') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['', ANA.id]);
  });

  it('unticking a participant who has a task warns in step 1 and blocks the save until reassigned', async () => {
    const utils = render(<MeetingDocumentationModal {...defaultProps} />);
    await createToStep3(utils);
    await addCompleteItems(utils);
    await click(utils.getByRole('button', { name: /Anterior/i }));
    await click(utils.getByRole('button', { name: /Anterior/i }));
    await click(utils.getByTestId(`meeting-attendee-${ANA.id}`));

    expect(utils.getByTestId('meeting-assignee-not-participant-warning').textContent).toContain('Ana Uno ya no es participante');

    await click(utils.getByRole('button', { name: /Guardar borrador/i }));
    expect(capturedCalls['insert:community_meetings']).toBeUndefined();
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('ya no es participante'));
  });

  it('opens every step at the top of the scroll area', async () => {
    const utils = render(<MeetingDocumentationModal {...defaultProps} />);
    const body = utils.getByTestId('meeting-step-body');
    const { getByRole, getByPlaceholderText, container } = utils;
    fireEvent.change(getByPlaceholderText(/Reunión de planificación semanal/i), { target: { value: 'R' } });
    fireEvent.change(container.querySelector('input[type="datetime-local"]') as HTMLInputElement, { target: { value: '2026-05-01T10:00' } });
    await click(getByRole('button', { name: /Siguiente/i }));
    await waitFor(() => expect(editorOnChange.get('Resumen de la reunión…')).toBeDefined());
    await act(async () => { editorOnChange.get('Resumen de la reunión…')!(richDoc('x')); });
    body.scrollTop = 250;
    await click(getByRole('button', { name: /Siguiente/i }));
    expect(body.scrollTop).toBe(0);
  });

  it('edit mode: "Guardar borrador" updates the kept commitment and deletes the removed one, keeping status=borrador', async () => {
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
      attendees: [{ user_id: ANA.id, role: 'participant' }],
      agreements: [],
      commitments: [
        { id: 'c1', commitment_text: 'first', commitment_doc: richDoc('first'), assigned_to: ANA.id, due_date: '2026-05-01' },
        { id: 'c2', commitment_text: 'second', commitment_doc: richDoc('second'), assigned_to: ANA.id, due_date: '2026-05-02' },
      ],
      tasks: [],
      version: 1,
      updated_at: new Date().toISOString(),
    });

    seedRows('meeting_commitments', [
      { id: 'c1', meeting_id: 'meeting-1', commitment_text: 'first' },
      { id: 'c2', meeting_id: 'meeting-1', commitment_text: 'second' },
    ]);
    seedRows('meeting_attendees', [{ id: 'att-ana', meeting_id: 'meeting-1', user_id: ANA.id, role: 'participant' }]);

    const { getByRole, container } = render(
      <MeetingDocumentationModal {...defaultProps} meetingId="meeting-1" mode="edit" />
    );
    await waitFor(() => {
      const titleInput = container.querySelector('input[type="text"]') as HTMLInputElement | null;
      expect(titleInput?.value).toBe('Existing meeting');
    });
    await click(getByRole('button', { name: /Siguiente/i }));
    await click(getByRole('button', { name: /Siguiente/i }));
    await waitFor(() => expect(editorOnChange.get('Describe el compromiso…')).toBeDefined());

    // Two commitments register under the same placeholder; the map holds c2's.
    await act(async () => { editorOnChange.get('Describe el compromiso…')!(richDoc('second — updated')); });
    const redTrashButtons = Array.from(container.querySelectorAll('button')).filter((b) => b.className.includes('text-red'));
    await click(redTrashButtons[0]);

    await click(getByRole('button', { name: /Guardar borrador/i }));

    await waitFor(() => expect(mockUpdateMeeting).toHaveBeenCalledTimes(1));
    const [, updatePayload] = mockUpdateMeeting.mock.calls[0];
    expect(updatePayload.status).toBe('borrador');
    // The stored UTC instant goes back unchanged after a load/save round trip.
    expect(updatePayload.meeting_date).toBe('2026-04-21T12:00:00.000Z');
    const commitmentUpdates = capturedCalls['update:meeting_commitments'] ?? [];
    expect(commitmentUpdates.some((u: any) => u.commitment_text === 'second — updated')).toBe(true);
    expect((capturedCalls['in:meeting_commitments'] ?? []).flat()).toContain('c1');
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Borrador guardado'));
    expect(tableRows.meeting_commitments.map((row) => row.id)).toEqual(['c2']);
  });

  describe('review r0 fixes', () => {
    const editMeeting = (over: Record<string, unknown> = {}) => ({
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
      attendees: [{ user_id: ANA.id, role: 'participant' }],
      agreements: [],
      commitments: [],
      tasks: [],
      version: 1,
      updated_at: new Date().toISOString(),
      ...over,
    });
    const openEdit = async (meeting: Record<string, unknown>) => {
      mockGetMeetingDetails.mockResolvedValue(meeting);
      const utils = render(<MeetingDocumentationModal {...defaultProps} meetingId="meeting-1" mode="edit" />);
      await waitFor(() => {
        const titleInput = utils.container.querySelector('input[type="text"]') as HTMLInputElement | null;
        expect(titleInput?.value).toBe('Existing meeting');
      });
      return utils;
    };

    it('only one save runs at a time: a second click while the first is writing creates nothing more', async () => {
      const gate = makeGate();
      holdWrites['insert:community_meetings'] = gate.promise;
      const utils = render(<MeetingDocumentationModal {...defaultProps} />);
      await createToStep3(utils);
      await addCompleteItems(utils);

      await click(utils.getByRole('button', { name: /Guardar borrador/i }));
      await click(utils.getByRole('button', { name: /Guardando…/i }));
      expect((utils.getByRole('button', { name: /Crear Reunión/i }) as HTMLButtonElement).disabled).toBe(true);
      await click(utils.getByRole('button', { name: /Crear Reunión/i }));

      await act(async () => { gate.release(); });
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Borrador guardado'));
      expect(capturedCalls['insert:community_meetings']).toHaveLength(1);
      expect(capturedCalls['insert:meeting_tasks']).toHaveLength(1);
    });

    it('the modal cannot be closed while a save is writing', async () => {
      const gate = makeGate();
      holdWrites['insert:community_meetings'] = gate.promise;
      const utils = render(<MeetingDocumentationModal {...defaultProps} />);
      await createToStep3(utils);
      await click(utils.getByRole('button', { name: /Guardar borrador/i }));
      await click(utils.getByRole('button', { name: /Cancelar/i }));
      expect(defaultProps.onClose).not.toHaveBeenCalled();
      await act(async () => { gate.release(); });
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Borrador guardado'));
    });

    it('ids land on the item that was saved even if the list changed during the save', async () => {
      const gate = makeGate();
      holdWrites['insert:meeting_tasks'] = gate.promise;
      const utils = render(<MeetingDocumentationModal {...defaultProps} />);
      await createToStep3(utils);
      // Two complete tasks.
      for (const index of [0, 1]) {
        await click(utils.getByRole('button', { name: /Agregar Tarea/i }));
        fireEvent.change(utils.getByTestId(`meeting-task-title-${index}`), { target: { value: `Tarea ${index}` } });
        fireEvent.change(utils.getByTestId(`meeting-task-assignee-${index}`), { target: { value: ANA.id } });
        fireEvent.change(utils.getByTestId(`meeting-task-due-${index}`), { target: { value: '2026-05-12' } });
      }
      await click(utils.getByRole('button', { name: /Guardar borrador/i }));
      // While the inserts are held, remove the first task.
      await click(utils.getByTestId('meeting-task-remove-0'));
      await act(async () => { gate.release(); });
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Borrador guardado'));
      const [first, second] = tableRows.meeting_tasks.map((row) => row.id);
      expect((utils.getByTestId('meeting-task-title-0') as HTMLInputElement).value).toBe('Tarea 1');

      await click(utils.getByRole('button', { name: /Guardar borrador/i }));
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(2));
      // The removed task's row is deleted; the kept one is updated, not re-inserted.
      expect(capturedCalls['insert:meeting_tasks']).toHaveLength(2);
      expect((capturedCalls['in:meeting_tasks'] ?? []).flat()).toEqual([first]);
      expect(tableRows.meeting_tasks.map((row) => row.id)).toEqual([second]);
      expect(tableRows.meeting_tasks[0].task_title).toBe('Tarea 1');
    });

    it('if who-has-access cannot be read back, the save is not reported as done', async () => {
      seedRows('meeting_attendees', [{ id: 'att-ana', meeting_id: 'meeting-1', user_id: ANA.id, role: 'participant' }]);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const utils = await openEdit(editMeeting());
      failingReads.meeting_attendees = { code: '57014', message: 'timeout' };
      await click(utils.getByRole('button', { name: /Guardar borrador/i }));
      await waitFor(() => expect(toastError).toHaveBeenCalledWith('No se pudo confirmar quiénes tienen acceso a la reunión. Vuelve a guardar.'));
      expect(toastSuccess).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('a facilitator / co-editor row is shown but cannot be unticked', async () => {
      seedRows('meeting_attendees', [{ id: 'att-ana', meeting_id: 'meeting-1', user_id: ANA.id, role: 'co_editor' }]);
      const utils = await openEdit(editMeeting({ attendees: [{ user_id: ANA.id, role: 'co_editor' }] }));
      await waitFor(() => expect((utils.getByTestId(`meeting-attendee-${ANA.id}`) as HTMLInputElement).disabled).toBe(true));
      expect(utils.getByTestId(`meeting-attendee-${ANA.id}`).closest('label')!.textContent).toContain('(co-editor/a)');
      expect((utils.getByTestId(`meeting-attendee-${BRUNO.id}`) as HTMLInputElement).disabled).toBe(false);
    });

    it('a document whose file could not be removed is retried, and is not reported again once gone', async () => {
      seedRows('meeting_attendees', [{ id: 'att-ana', meeting_id: 'meeting-1', user_id: ANA.id, role: 'participant' }]);
      seedRows('meeting_attachments', [{ id: 'doc-1', meeting_id: 'meeting-1', filename: 'acta.pdf', file_path: 'ws-1/meeting-1/acta.pdf', file_size: 10, file_type: 'application/pdf' }]);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const utils = await openEdit(editMeeting());
      await click(utils.getByRole('button', { name: /Siguiente/i }));
      await click(utils.getByRole('button', { name: /Siguiente/i }));
      await waitFor(() => expect(utils.getByText('acta.pdf')).toBeDefined());
      await click(utils.getByTitle('Eliminar archivo'));

      failingWrites['remove:storage'] = { code: 'storage', message: 'boom' };
      await click(utils.getByRole('button', { name: /Guardar borrador/i }));
      await waitFor(() => expect(toastError).toHaveBeenCalledWith('No se pudo eliminar acta.pdf.'));
      expect(tableRows.meeting_attachments).toHaveLength(1);

      delete failingWrites['remove:storage'];
      await click(utils.getByRole('button', { name: /Guardar borrador/i }));
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Borrador guardado'));
      expect(tableRows.meeting_attachments).toHaveLength(0);

      await click(utils.getByRole('button', { name: /Guardar borrador/i }));
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(2));
      consoleError.mockRestore();
    });

    it('an unchanged date in the repeated DST hour saves back the exact stored instant', async () => {
      const previousTz = process.env.TZ;
      process.env.TZ = 'America/Santiago';
      try {
        seedRows('meeting_attendees', [{ id: 'att-ana', meeting_id: 'meeting-1', user_id: ANA.id, role: 'participant' }]);
        // 2026-04-05T03:30Z is 23:30 on 4 Apr in Santiago, the second time that hour happens.
        const utils = await openEdit(editMeeting({ meeting_date: '2026-04-05T03:30:00.000Z' }));
        expect((utils.container.querySelector('input[type="datetime-local"]') as HTMLInputElement).value).toBe('2026-04-04T23:30');
        await click(utils.getByRole('button', { name: /Guardar borrador/i }));
        await waitFor(() => expect(mockUpdateMeeting).toHaveBeenCalledTimes(1));
        expect(mockUpdateMeeting.mock.calls[0][1].meeting_date).toBe('2026-04-05T03:30:00.000Z');
      } finally {
        if (previousTz === undefined) delete process.env.TZ;
        else process.env.TZ = previousTz;
      }
    });

    it('a participant removal that failed is retried on the next save (not forgotten after a good read-back)', async () => {
      seedRows('meeting_attendees', [
        { id: 'att-ana', meeting_id: 'meeting-1', user_id: ANA.id, role: 'participant' },
        { id: 'att-bruno', meeting_id: 'meeting-1', user_id: BRUNO.id, role: 'participant' },
      ]);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const utils = await openEdit(editMeeting({
        attendees: [{ user_id: ANA.id, role: 'participant' }, { user_id: BRUNO.id, role: 'participant' }],
      }));
      await waitFor(() => expect((utils.getByTestId(`meeting-attendee-${BRUNO.id}`) as HTMLInputElement).checked).toBe(true));
      await click(utils.getByTestId(`meeting-attendee-${BRUNO.id}`));

      refusedWrites.add('delete:meeting_attendees');
      await click(utils.getByRole('button', { name: /Guardar borrador/i }));
      await waitFor(() => expect(toastError).toHaveBeenCalledWith('Participantes: no tienes permiso para guardar este cambio.'));
      expect(tableRows.meeting_attendees.map((row) => row.user_id)).toContain(BRUNO.id);

      refusedWrites.delete('delete:meeting_attendees');
      await click(utils.getByRole('button', { name: /Guardar borrador/i }));
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Borrador guardado'));
      expect(tableRows.meeting_attendees.map((row) => row.user_id)).toEqual([ANA.id]);
      consoleError.mockRestore();
    });

    it('closing (unmount) while the draft save is finishing shows no success and calls nothing', async () => {
      const gate = makeGate();
      const plainFetch = global.fetch;
      // @ts-expect-error override global fetch for test
      global.fetch = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.endsWith('/work-session/start')) {
          await gate.promise;
          return new Response(JSON.stringify({ data: { id: 'ws-late' } }), { status: 201 });
        }
        return (plainFetch as any)(input, init);
      });
      const utils = render(<MeetingDocumentationModal {...defaultProps} />);
      await createToStep3(utils);
      await click(utils.getByRole('button', { name: /Guardar borrador/i }));
      await waitFor(() => expect(capturedCalls['insert:community_meetings']).toHaveLength(1));
      utils.unmount();
      await act(async () => { gate.release(); });
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(defaultProps.onDraftSaved).not.toHaveBeenCalled();
    });
  });
});

describe('MeetingDocumentationModal — a failed child save is never reported as saved (SM-23)', () => {
  const TWO_DAYS_AGO = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const openEditOnStep3 = async () => {
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
      attendees: [{ user_id: ANA.id, role: 'participant' }],
      agreements: [],
      commitments: [{ id: 'c1', commitment_text: 'first', commitment_doc: richDoc('first'), assigned_to: ANA.id, due_date: '2026-05-01' }],
      tasks: [],
      version: 1,
      updated_at: TWO_DAYS_AGO,
    });
    seedRows('meeting_attendees', [{ id: 'att-ana', meeting_id: 'meeting-1', user_id: ANA.id, role: 'participant' }]);
    seedRows('meeting_commitments', [{ id: 'c1', meeting_id: 'meeting-1', commitment_text: 'first' }]);
    const utils = render(<MeetingDocumentationModal {...defaultProps} meetingId="meeting-1" mode="edit" />);
    await waitFor(() => expect(utils.getByText(/Guardado hace 2 días/)).toBeDefined());
    await click(utils.getByRole('button', { name: /Siguiente/i }));
    await click(utils.getByRole('button', { name: /Siguiente/i }));
    await waitFor(() => expect(utils.getByRole('button', { name: /Agregar Acuerdo/i })).toBeDefined());
    return utils;
  };
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { consoleError = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { consoleError.mockRestore(); });

  it('create + submit: every write succeeds, so it says so, calls onSuccess and closes', async () => {
    const utils = render(<MeetingDocumentationModal {...defaultProps} />);
    await createToStep3(utils);
    await addCompleteItems(utils);
    await click(utils.getByRole('button', { name: /Crear Reunión/i }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Reunión documentada correctamente'));
    expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('create + submit: a failed task insert shows the es-CL error, no success toast, and the form stays open', async () => {
    failingWrites['insert:meeting_tasks'] = { code: '42501', message: 'new row violates row-level security policy' };
    const utils = render(<MeetingDocumentationModal {...defaultProps} />);
    await createToStep3(utils);
    await addCompleteItems(utils);
    await click(utils.getByRole('button', { name: /Crear Reunión/i }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Tarea 1: no tienes permiso para guardar este cambio.'));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
    expect(utils.getByTestId('meeting-task-0-errors').textContent).toContain('Tarea 1: no tienes permiso para guardar este cambio.');
    expect((utils.getByTestId('meeting-task-title-0') as HTMLInputElement).value).toBe('Preparar deck');
  });

  it('edit + submit: every write succeeds, so it says so, calls onSuccess and closes', async () => {
    const utils = await openEditOnStep3();
    await click(utils.getByRole('button', { name: /Guardar Cambios/i }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Reunión actualizada correctamente'));
    expect(capturedCalls['update:meeting_commitments']).toHaveLength(1);
    expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('edit + draft: a failed commitment update shows the error, no success, and the last-saved time stays', async () => {
    failingWrites['update:meeting_commitments'] = { code: 'XX000', message: 'forced' };
    const utils = await openEditOnStep3();
    await click(utils.getByRole('button', { name: /Guardar borrador/i }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Compromiso 1: no se pudo guardar (forced).'));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(defaultProps.onDraftSaved).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
    expect(utils.getByText(/Guardado hace 2 días/)).toBeDefined();
  });

  it('edit + submit: a failed agreement insert shows the error, no success toast, and the form stays open', async () => {
    failingWrites['insert:meeting_agreements'] = { code: 'XX000', message: 'forced' };
    const utils = await openEditOnStep3();
    await click(utils.getByRole('button', { name: /Agregar Acuerdo/i }));
    await waitFor(() => expect(editorOnChange.get('Describe el acuerdo…')).toBeDefined());
    await act(async () => { editorOnChange.get('Describe el acuerdo…')!(richDoc('Nuevo acuerdo')); });
    await click(utils.getByRole('button', { name: /Guardar Cambios/i }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Acuerdo 1: no se pudo guardar (forced).'));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
    expect(utils.getByText(/Guardado hace 2 días/)).toBeDefined();
  });
});

describe('MeetingDocumentationModal — every commitment and task needs a person and a due date (SM-24)', () => {
  const MISSING = [
    { kind: 'commitment', field: 'assignee', testId: 'meeting-commitment-assignee-0', message: 'Elige a quién se asigna este compromiso.' },
    { kind: 'commitment', field: 'due date', testId: 'meeting-commitment-due-0', message: 'Indica la fecha límite del compromiso.' },
    { kind: 'task', field: 'assignee', testId: 'meeting-task-assignee-0', message: 'Elige a quién se asigna esta tarea.' },
    { kind: 'task', field: 'due date', testId: 'meeting-task-due-0', message: 'Indica la fecha límite de la tarea.' },
  ] as const;
  const SAVES = [
    { action: 'draft', button: /Guardar borrador/i },
    { action: 'submit', button: /Crear Reunión/i },
  ] as const;

  const cases = SAVES.flatMap((save) => MISSING.map((missing) => ({ ...save, ...missing })));

  it.each(cases)('$action with a $kind missing its $field: refused in es-CL, form open, nothing written', async ({ button, kind, testId, message }) => {
    const utils = render(<MeetingDocumentationModal {...defaultProps} />);
    await createToStep3(utils);
    await addCompleteItems(utils);
    fireEvent.change(utils.getByTestId(testId), { target: { value: '' } });

    await click(utils.getByRole('button', { name: button }));

    expect(toastError).toHaveBeenCalledWith(expect.stringContaining(message));
    expect(utils.getByTestId(`meeting-${kind}-0-errors`).textContent).toContain(message);
    expect(utils.getByRole('button', { name: /Agregar Compromiso/i })).toBeDefined();
    expect(capturedCalls['insert:community_meetings']).toBeUndefined();
    expect(capturedCalls['insert:meeting_commitments']).toBeUndefined();
    expect(capturedCalls['insert:meeting_tasks']).toBeUndefined();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(defaultProps.onDraftSaved).not.toHaveBeenCalled();
    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
  });

  // A meeting saved before this rule: the commitment's person is only spaces
  // and the task has no date.
  const incompleteMeeting = () => ({
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
    attendees: [{ user_id: ANA.id, role: 'participant' }],
    agreements: [],
    commitments: [{ id: 'c1', commitment_text: 'Enviar informe', commitment_doc: richDoc('Enviar informe'), assigned_to: '   ', due_date: '2026-05-01' }],
    tasks: [{ id: 't1', task_title: 'Preparar deck', task_description: '', task_description_doc: null, assigned_to: ANA.id, due_date: null, priority: 'media', category: '', estimated_hours: 0 }],
    version: 1,
    updated_at: new Date().toISOString(),
  });

  async function openIncompleteAtStep3() {
    mockGetMeetingDetails.mockResolvedValue(incompleteMeeting());
    seedRows('meeting_commitments', [{ id: 'c1', meeting_id: 'meeting-1' }]);
    seedRows('meeting_tasks', [{ id: 't1', meeting_id: 'meeting-1' }]);
    seedRows('meeting_attendees', [{ id: 'att-ana', meeting_id: 'meeting-1', user_id: ANA.id, role: 'participant' }]);
    const utils = render(<MeetingDocumentationModal {...defaultProps} meetingId="meeting-1" mode="edit" />);
    await waitFor(() => {
      const titleInput = utils.container.querySelector('input[type="text"]') as HTMLInputElement | null;
      expect(titleInput?.value).toBe('Existing meeting');
    });
    await click(utils.getByRole('button', { name: /Siguiente/i }));
    await click(utils.getByRole('button', { name: /Siguiente/i }));
    await waitFor(() => expect(utils.getByTestId('meeting-commitment-assignee-0')).toBeDefined());
    return utils;
  }

  const expectNothingWritten = () => {
    expect(mockUpdateMeeting).not.toHaveBeenCalled();
    expect(capturedCalls['update:meeting_commitments']).toBeUndefined();
    expect(capturedCalls['update:meeting_tasks']).toBeUndefined();
    expect(toastSuccess).not.toHaveBeenCalled();
  };

  it.each([
    { button: /Guardar borrador/i, success: 'Borrador guardado' },
    { button: /Guardar Cambios/i, success: 'Reunión actualizada correctamente' },
  ])('edit: a loaded incomplete row is refused by "$button" and saves once corrected', async ({ button, success }) => {
    const utils = await openIncompleteAtStep3();

    await click(utils.getByRole('button', { name: button }));

    expectNothingWritten();
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('Elige a quién se asigna este compromiso.'));
    expect(utils.getByTestId('meeting-commitment-0-errors').textContent).toContain('Elige a quién se asigna este compromiso.');
    expect(utils.getByTestId('meeting-task-0-errors').textContent).toContain('Indica la fecha límite de la tarea.');
    expect(defaultProps.onDraftSaved).not.toHaveBeenCalled();
    expect(defaultProps.onSuccess).not.toHaveBeenCalled();

    fireEvent.change(utils.getByTestId('meeting-commitment-assignee-0'), { target: { value: ANA.id } });
    fireEvent.change(utils.getByTestId('meeting-task-due-0'), { target: { value: '2026-05-20' } });
    await click(utils.getByRole('button', { name: button }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith(success));
    expect(mockUpdateMeeting).toHaveBeenCalledTimes(1);
    expect(capturedCalls['update:meeting_commitments']).toEqual([
      expect.objectContaining({ assigned_to: ANA.id, due_date: '2026-05-01' }),
    ]);
    expect(capturedCalls['update:meeting_tasks']).toEqual([
      expect.objectContaining({ assigned_to: ANA.id, due_date: '2026-05-20' }),
    ]);
    expect(utils.queryByTestId('meeting-commitment-0-errors')).toBeNull();
    expect(utils.queryByTestId('meeting-task-0-errors')).toBeNull();
  });

  it('edit: "Finalizar reunión" with a loaded incomplete row writes nothing and does not open the finalize dialog', async () => {
    const utils = await openIncompleteAtStep3();

    await click(utils.getByRole('button', { name: /Finalizar reunión/i }));

    expectNothingWritten();
    expect(toastError).toHaveBeenCalledWith('Elige a quién se asigna este compromiso. (y 1 problema más)');
    expect(utils.getByTestId('meeting-task-0-errors').textContent).toContain('Indica la fecha límite de la tarea.');
    expect(utils.queryByRole('dialog')).toBeNull();
  });
});
