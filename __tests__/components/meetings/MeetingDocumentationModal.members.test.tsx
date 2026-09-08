// @vitest-environment jsdom
import React from 'react';
import { render, act, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'react-hot-toast';

/**
 * Community-scoped member pickers.
 *
 * The modal must load its candidate list (Asistentes, Compromisos, Tareas)
 * ONLY through `GET /api/community/members?community_id=<prop>`, fail closed
 * on every error, cancel the request on close/unmount, and preserve historical
 * assignees that are no longer members without ever labelling them as outside
 * the community before the load has succeeded.
 */

// TipTap editors register their onChange by placeholder so tests can drive step 2.
const editorOnChange = new Map<string, (json: any) => void>();

vi.mock('../../../src/components/TipTapEditor', () => ({
  __esModule: true,
  default: ({ onChange, placeholder }: any) => {
    if (placeholder) editorOnChange.set(placeholder, onChange);
    return <div data-testid={`tiptap-${placeholder ?? 'none'}`} />;
  },
}));

// Every `supabase.from(table)` call is recorded so the suite can prove that
// candidate loading never touches profiles / user_roles / community_workspaces.
// Update payloads are captured so the save assertions can read `assigned_to`.
const fromCalls: string[] = [];
const capturedCalls: Record<string, any[]> = {};

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({
    from: vi.fn((table: string) => {
      fromCalls.push(table);
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
    storage: { from: () => ({ remove: vi.fn().mockResolvedValue({ data: null, error: null }) }) },
  }),
}));

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockCreateMeeting = vi.fn();
const mockUpdateMeeting = vi.fn();
const mockGetMeetingDetails = vi.fn();

vi.mock('../../../utils/meetingUtils', () => ({
  createMeetingWithDocumentation: (...args: any[]) => mockCreateMeeting(...args),
  getMeetingDetails: (...args: any[]) => mockGetMeetingDetails(...args),
  updateMeeting: (...args: any[]) => mockUpdateMeeting(...args),
}));

vi.mock('../../../utils/storage', () => ({
  uploadFile: vi.fn(),
}));

import MeetingDocumentationModal from '../../../components/meetings/MeetingDocumentationModal';

const toastError = vi.mocked(toast.error);

// ---------------------------------------------------------------------------
// Fixtures (synthetic ids only)
// ---------------------------------------------------------------------------

const COMMUNITY_ID = 'd75e23ca-621c-4b06-84df-2c61fb779dfb';
const MEMBER_A = {
  id: '33333333-3333-4333-8333-333333333333',
  first_name: 'Ana',
  last_name: 'Uno',
  email: 'ana@x.cl',
  avatar_url: null,
  user_roles: [{ role_type: 'lider_comunidad' }, { role_type: 'docente' }],
};
const MEMBER_B = {
  id: '44444444-4444-4444-8444-444444444444',
  first_name: 'Bruno',
  last_name: 'Dos',
  email: 'bruno@x.cl',
  avatar_url: null,
  user_roles: [{ role_type: 'docente' }],
};
/** Saved on the meeting during the defect; NOT a member of COMMUNITY_ID. */
const OUTSIDER_ID = '99999999-9999-4999-8999-999999999999';

const MEMBERS_TOAST = 'No se pudieron cargar los miembros de la comunidad. Intenta nuevamente.';
const DIRECT_MEMBER_TABLES = ['profiles', 'user_roles', 'community_workspaces'];

const richDoc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

function meetingWithOutsider() {
  return {
    id: 'meeting-1',
    title: 'Reunión histórica',
    meeting_date: new Date('2026-04-21T12:00:00Z').toISOString(),
    duration_minutes: 60,
    location: '',
    status: 'completada',
    summary: 'resumen',
    summary_doc: richDoc('resumen'),
    notes: '',
    notes_doc: null,
    attendees: [{ user_id: MEMBER_A.id }, { user_id: OUTSIDER_ID }],
    agreements: [],
    commitments: [
      {
        id: 'c1',
        commitment_text: 'Enviar informe',
        commitment_doc: richDoc('Enviar informe'),
        assigned_to: OUTSIDER_ID,
        due_date: null,
      },
    ],
    tasks: [
      {
        id: 't1',
        task_title: 'Preparar deck',
        task_description: 'desc',
        task_description_doc: richDoc('desc'),
        assigned_to: '',
        due_date: null,
        priority: 'media',
        category: '',
        estimated_hours: null,
      },
    ],
    version: 1,
    updated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Route-aware fetch stub
// ---------------------------------------------------------------------------

type MembersResponder = (init?: RequestInit) => Promise<Response>;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const membersOk = (members: unknown[]): MembersResponder => async () =>
  jsonResponse({ members });

let membersResponder: MembersResponder = membersOk([]);
const membersRequests: Array<{ url: string; init?: RequestInit }> = [];

function installFetch() {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (url.startsWith('/api/community/members')) {
      membersRequests.push({ url, init });
      return membersResponder(init);
    }
    if (url.endsWith('/work-session/start')) {
      return jsonResponse({ data: { id: 'ws-1' } }, 201);
    }
    return jsonResponse({ data: null }, 200);
  }) as unknown as typeof fetch;
}

/** A members response the test settles by hand, after unmount/close. */
function deferredMembers(options: { rejectOnAbort?: boolean } = {}) {
  let resolve!: (r: Response) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const responder: MembersResponder = (init) => {
    if (options.rejectOnAbort) {
      // Mirror a real fetch: an aborted request rejects with AbortError.
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    }
    return promise;
  };
  return { responder, resolve, reject };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  workspaceId: 'ws-1',
  communityId: COMMUNITY_ID,
  userId: 'user-1',
  onSuccess: vi.fn(),
};

function attendeeCheckboxes(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-testid^="meeting-attendee-"]')
  );
}

function optionValues(select: HTMLSelectElement) {
  return Array.from(select.options).map((option) => option.value);
}

function optionLabels(select: HTMLSelectElement) {
  return Array.from(select.options).map((option) => option.textContent);
}

function expectNoDirectMemberReads() {
  expect(fromCalls.filter((table) => DIRECT_MEMBER_TABLES.includes(table))).toEqual([]);
}

async function clickNext(getByRole: any) {
  await act(async () => {
    fireEvent.click(getByRole('button', { name: /Siguiente/i }));
  });
}

/** Create mode: satisfy step-1 and step-2 validation, land on step 3. */
async function createFlowToStep3(utils: ReturnType<typeof render>) {
  const { getByRole, getByPlaceholderText, container } = utils;
  fireEvent.change(getByPlaceholderText(/Reunión de planificación semanal/i), {
    target: { value: 'Reunión semanal' },
  });
  const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
  fireEvent.change(dateInput, { target: { value: '2026-05-01T10:00' } });
  await clickNext(getByRole);
  await waitFor(() => {
    expect(editorOnChange.get('Resumen de la reunión…')).toBeDefined();
  });
  await act(async () => {
    editorOnChange.get('Resumen de la reunión…')!(richDoc('Puntos discutidos'));
  });
  await clickNext(getByRole);
  await waitFor(() => {
    expect(getByRole('button', { name: /Agregar Compromiso/i })).toBeDefined();
  });
}

/** Edit mode: wait for the meeting to populate, then step 1 → 2 → 3. */
async function editFlowToStep3(utils: ReturnType<typeof render>, expectedTitle: string) {
  const { getByRole, container } = utils;
  await waitFor(() => {
    const titleInput = container.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(titleInput?.value).toBe(expectedTitle);
  });
  await clickNext(getByRole);
  await clickNext(getByRole);
  await waitFor(() => {
    expect(getByRole('button', { name: /Agregar Compromiso/i })).toBeDefined();
  });
}

async function flushMicrotasks() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  editorOnChange.clear();
  fromCalls.length = 0;
  membersRequests.length = 0;
  for (const key of Object.keys(capturedCalls)) delete capturedCalls[key];
  mockCreateMeeting.mockReset();
  mockUpdateMeeting.mockReset();
  mockGetMeetingDetails.mockReset();
  mockCreateMeeting.mockResolvedValue({ success: true, meetingId: 'new-meeting' });
  mockUpdateMeeting.mockResolvedValue({ success: true });
  membersResponder = membersOk([]);
  installFetch();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------

describe('MeetingDocumentationModal — community-scoped member pickers', () => {
  it('offers exactly the endpoint members in Asistentes and in every Compromiso/Tarea assignee selector', async () => {
    membersResponder = membersOk([MEMBER_A, MEMBER_B]);

    const utils = render(<MeetingDocumentationModal {...baseProps} />);
    const { container, getByTestId, queryByTestId } = utils;

    await waitFor(() => {
      expect(attendeeCheckboxes(container)).toHaveLength(2);
    });
    expect(getByTestId(`meeting-attendee-${MEMBER_A.id}`).closest('label')?.textContent).toContain('Ana Uno');
    expect(getByTestId(`meeting-attendee-${MEMBER_B.id}`).closest('label')?.textContent).toContain('Bruno Dos');
    expect(queryByTestId('meeting-members-status-attendees')).toBeNull();
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);

    await createFlowToStep3(utils);
    await act(async () => {
      fireEvent.click(utils.getByRole('button', { name: /Agregar Compromiso/i }));
    });
    await act(async () => {
      fireEvent.click(utils.getByRole('button', { name: /Agregar Tarea/i }));
    });

    const commitmentSelect = getByTestId('meeting-commitment-assignee-0') as HTMLSelectElement;
    const taskSelect = getByTestId('meeting-task-assignee-0') as HTMLSelectElement;
    expect(optionValues(commitmentSelect)).toEqual(['', MEMBER_A.id, MEMBER_B.id]);
    expect(optionValues(taskSelect)).toEqual(['', MEMBER_A.id, MEMBER_B.id]);
    expect(optionLabels(commitmentSelect)).toEqual(['Asignar a…', 'Ana Uno', 'Bruno Dos']);
    expect(commitmentSelect.disabled).toBe(false);
    expect(taskSelect.disabled).toBe(false);

    expect(membersRequests).toHaveLength(1);
    expectNoDirectMemberReads();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('requests the members endpoint with the encoded communityId prop and never resolves the workspace itself', async () => {
    const trickyCommunityId = 'comunidad 42&x';
    membersResponder = membersOk([MEMBER_A]);

    const { container } = render(
      <MeetingDocumentationModal {...baseProps} communityId={trickyCommunityId} />
    );

    await waitFor(() => {
      expect(attendeeCheckboxes(container)).toHaveLength(1);
    });

    expect(membersRequests).toHaveLength(1);
    expect(membersRequests[0].url).toBe('/api/community/members?community_id=comunidad%2042%26x');
    expect(membersRequests[0].init?.signal).toBeInstanceOf(AbortSignal);
    expect(fromCalls).not.toContain('community_workspaces');
    expectNoDirectMemberReads();
  });

  it('never reads profiles, user_roles or community_workspaces from the browser while loading candidates (create and edit)', async () => {
    membersResponder = membersOk([MEMBER_A, MEMBER_B]);

    const createRender = render(<MeetingDocumentationModal {...baseProps} />);
    await waitFor(() => {
      expect(attendeeCheckboxes(createRender.container)).toHaveLength(2);
    });
    // Create mode has no meeting to load, so the browser client is never used at all.
    expect(fromCalls).toEqual([]);
    createRender.unmount();

    fromCalls.length = 0;
    mockGetMeetingDetails.mockResolvedValue(meetingWithOutsider());
    const editRender = render(
      <MeetingDocumentationModal {...baseProps} meetingId="meeting-1" mode="edit" />
    );
    await waitFor(() => {
      expect(attendeeCheckboxes(editRender.container)).toHaveLength(2);
    });
    await waitFor(() => {
      expect(mockGetMeetingDetails).toHaveBeenCalledTimes(1);
    });
    // Edit mode reads the meeting's own attachments; nothing member-related.
    expect(fromCalls.every((table) => !DIRECT_MEMBER_TABLES.includes(table))).toBe(true);
    expectNoDirectMemberReads();
  });

  it('shows the explicit empty state for a valid { members: [] } response and does not fall back', async () => {
    membersResponder = membersOk([]);

    const utils = render(<MeetingDocumentationModal {...baseProps} />);
    const { container, getByTestId } = utils;

    await waitFor(() => {
      expect(getByTestId('meeting-members-status-attendees').getAttribute('data-state')).toBe('empty');
    });
    expect(getByTestId('meeting-members-status-attendees').textContent).toBe(
      'Esta comunidad aún no tiene miembros asignados.'
    );
    expect(attendeeCheckboxes(container)).toHaveLength(0);

    await createFlowToStep3(utils);
    await act(async () => {
      fireEvent.click(utils.getByRole('button', { name: /Agregar Compromiso/i }));
    });
    const commitmentSelect = getByTestId('meeting-commitment-assignee-0') as HTMLSelectElement;
    expect(optionValues(commitmentSelect)).toEqual(['']);
    expect(getByTestId('meeting-members-status-commitments').getAttribute('data-state')).toBe('empty');

    expect(membersRequests).toHaveLength(1);
    expectNoDirectMemberReads();
    expect(toastError).not.toHaveBeenCalled();
  });

  describe('fails closed', () => {
    const failures: Array<[string, MembersResponder]> = [
      ['a 403 response', async () => jsonResponse({ error: 'Forbidden' }, 403)],
      ['a 403 response that still carries a members array', async () => jsonResponse({ members: [MEMBER_A] }, 403)],
      ['a 500 response', async () => jsonResponse({ error: 'Internal Server Error' }, 500)],
      ['a 200 whose members property is not an array', async () => jsonResponse({ members: { id: MEMBER_A.id } })],
      ['a 200 without a members property', async () => jsonResponse({ data: [MEMBER_A] })],
      ['a 200 whose body is not JSON', async () => new Response('<html>not json</html>', { status: 200 })],
      ['a network failure', async () => { throw new TypeError('Failed to fetch'); }],
    ];

    it.each(failures)('on %s: empty candidates, one es-CL toast, no alternative query', async (_label, responder) => {
      membersResponder = responder;
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const utils = render(<MeetingDocumentationModal {...baseProps} />);
      const { container, getByTestId } = utils;

      await waitFor(() => {
        expect(getByTestId('meeting-members-status-attendees').getAttribute('data-state')).toBe('error');
      });
      expect(getByTestId('meeting-members-status-attendees').textContent).toBe(
        'No se pudieron cargar los miembros de la comunidad.'
      );
      expect(attendeeCheckboxes(container)).toHaveLength(0);
      expect(toastError).toHaveBeenCalledTimes(1);
      expect(toastError).toHaveBeenCalledWith(MEMBERS_TOAST, { id: 'meeting-members-load-error' });

      await createFlowToStep3(utils);
      await act(async () => {
        fireEvent.click(utils.getByRole('button', { name: /Agregar Tarea/i }));
      });
      const taskSelect = getByTestId('meeting-task-assignee-0') as HTMLSelectElement;
      expect(optionValues(taskSelect)).toEqual(['']);
      expect(getByTestId('meeting-members-status-tasks').getAttribute('data-state')).toBe('error');

      // Exactly one attempt, no retry storm, and no other member source.
      expect(membersRequests).toHaveLength(1);
      expectNoDirectMemberReads();
      expect(toastError).toHaveBeenCalledTimes(1);

      consoleError.mockRestore();
    });
  });

  describe('cancellation', () => {
    it('aborts the request on unmount and an AbortError produces no toast', async () => {
      const deferred = deferredMembers({ rejectOnAbort: true });
      membersResponder = deferred.responder;

      const { unmount, getByTestId } = render(<MeetingDocumentationModal {...baseProps} />);
      await waitFor(() => {
        expect(membersRequests).toHaveLength(1);
      });
      expect(getByTestId('meeting-members-status-attendees').getAttribute('data-state')).toBe('loading');
      const signal = membersRequests[0].init?.signal as AbortSignal;
      expect(signal.aborted).toBe(false);

      await act(async () => {
        unmount();
      });

      expect(signal.aborted).toBe(true);
      await flushMicrotasks();
      expect(toastError).not.toHaveBeenCalled();
      expectNoDirectMemberReads();
    });

    it('ignores a failure that settles after unmount: no toast, no state update', async () => {
      const deferred = deferredMembers();
      membersResponder = deferred.responder;
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { unmount } = render(<MeetingDocumentationModal {...baseProps} />);
      await waitFor(() => {
        expect(membersRequests).toHaveLength(1);
      });

      await act(async () => {
        unmount();
      });
      expect((membersRequests[0].init?.signal as AbortSignal).aborted).toBe(true);

      deferred.resolve(jsonResponse({ error: 'Internal Server Error' }, 500));
      await flushMicrotasks();

      expect(toastError).not.toHaveBeenCalled();
      // React would have logged a warning for an update on an unmounted tree;
      // nothing member-related was logged at all.
      expect(consoleError.mock.calls.filter((call) => String(call[0]).includes('community members'))).toEqual([]);
      consoleError.mockRestore();
    });

    it('cancels the pending request when the modal closes (isOpen → false) and a late failure stays silent', async () => {
      const deferred = deferredMembers();
      membersResponder = deferred.responder;

      const { rerender } = render(<MeetingDocumentationModal {...baseProps} />);
      await waitFor(() => {
        expect(membersRequests).toHaveLength(1);
      });

      await act(async () => {
        rerender(<MeetingDocumentationModal {...baseProps} isOpen={false} />);
      });
      expect((membersRequests[0].init?.signal as AbortSignal).aborted).toBe(true);

      deferred.resolve(jsonResponse({ error: 'Forbidden' }, 403));
      await flushMicrotasks();

      expect(toastError).not.toHaveBeenCalled();
    });
  });

  describe('historical assignees', () => {
    it('does not call a saved assignee outside the community while members are still loading', async () => {
      const deferred = deferredMembers();
      membersResponder = deferred.responder;
      mockGetMeetingDetails.mockResolvedValue(meetingWithOutsider());

      const utils = render(
        <MeetingDocumentationModal {...baseProps} meetingId="meeting-1" mode="edit" />
      );
      const { getByTestId, queryByText, queryByTestId } = utils;

      await waitFor(() => {
        expect(mockGetMeetingDetails).toHaveBeenCalledTimes(1);
      });
      // Step 1 while loading: the saved outsider is preserved in state but not
      // labelled, and no historical attendee row is rendered yet.
      expect(getByTestId('meeting-members-status-attendees').getAttribute('data-state')).toBe('loading');
      expect(queryByTestId(`meeting-attendee-historical-${OUTSIDER_ID}`)).toBeNull();
      expect(queryByText('Usuario fuera de la comunidad')).toBeNull();

      await editFlowToStep3(utils, 'Reunión histórica');

      const commitmentSelect = getByTestId('meeting-commitment-assignee-0') as HTMLSelectElement;
      expect(commitmentSelect.disabled).toBe(true);
      expect(commitmentSelect.value).toBe(OUTSIDER_ID);
      const historical = getByTestId('meeting-historical-assignee') as HTMLOptionElement;
      expect(historical.value).toBe(OUTSIDER_ID);
      expect(historical.disabled).toBe(true);
      expect(historical.textContent).toBe('Verificando membresía…');
      expect(queryByText('Usuario fuera de la comunidad')).toBeNull();

      // Once the load succeeds the label becomes the real one and the picker opens.
      deferred.resolve(jsonResponse({ members: [MEMBER_A, MEMBER_B] }));
      await waitFor(() => {
        expect(getByTestId('meeting-historical-assignee').textContent).toBe('Usuario fuera de la comunidad');
      });
      expect(commitmentSelect.disabled).toBe(false);
      expect(commitmentSelect.value).toBe(OUTSIDER_ID);
      expectNoDirectMemberReads();
    });

    it('keeps a neutral verification-failure label (never "outside the community") when the load fails', async () => {
      membersResponder = async () => jsonResponse({ error: 'Internal Server Error' }, 500);
      mockGetMeetingDetails.mockResolvedValue(meetingWithOutsider());
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const utils = render(
        <MeetingDocumentationModal {...baseProps} meetingId="meeting-1" mode="edit" />
      );
      const { getByTestId, queryByText, queryByTestId } = utils;

      await waitFor(() => {
        expect(getByTestId('meeting-members-status-attendees').getAttribute('data-state')).toBe('error');
      });
      expect(queryByTestId(`meeting-attendee-historical-${OUTSIDER_ID}`)).toBeNull();

      await editFlowToStep3(utils, 'Reunión histórica');
      const commitmentSelect = getByTestId('meeting-commitment-assignee-0') as HTMLSelectElement;
      expect(commitmentSelect.value).toBe(OUTSIDER_ID);
      const historical = getByTestId('meeting-historical-assignee') as HTMLOptionElement;
      expect(historical.textContent).toBe('No se pudo verificar la membresía');
      expect(historical.disabled).toBe(true);
      expect(queryByText('Usuario fuera de la comunidad')).toBeNull();
      expect(optionValues(commitmentSelect)).toEqual(['', OUTSIDER_ID]);

      consoleError.mockRestore();
    });

    it('after a successful load, a missing saved assignee is a disabled record-local option whose id survives an unchanged save', async () => {
      membersResponder = membersOk([MEMBER_A, MEMBER_B]);
      mockGetMeetingDetails.mockResolvedValue(meetingWithOutsider());

      const utils = render(
        <MeetingDocumentationModal {...baseProps} meetingId="meeting-1" mode="edit" />
      );
      const { container, getByTestId, getByRole } = utils;

      await waitFor(() => {
        expect(attendeeCheckboxes(container)).toHaveLength(2);
      });
      await waitFor(() => {
        expect(getByTestId(`meeting-attendee-historical-${OUTSIDER_ID}`)).toBeDefined();
      });
      // Attendees: the two members are the only selectable rows; the saved
      // outsider is a read-only historical row, still part of attendee_ids.
      expect((getByTestId(`meeting-attendee-${MEMBER_A.id}`) as HTMLInputElement).checked).toBe(true);
      expect((getByTestId(`meeting-attendee-${MEMBER_B.id}`) as HTMLInputElement).checked).toBe(false);
      const historicalRow = getByTestId(`meeting-attendee-historical-${OUTSIDER_ID}`);
      const historicalCheckbox = historicalRow.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(historicalCheckbox.checked).toBe(true);
      expect(historicalCheckbox.disabled).toBe(true);
      expect(historicalRow.textContent).toContain('Usuario fuera de la comunidad');

      await editFlowToStep3(utils, 'Reunión histórica');

      const commitmentSelect = getByTestId('meeting-commitment-assignee-0') as HTMLSelectElement;
      expect(commitmentSelect.disabled).toBe(false);
      expect(commitmentSelect.value).toBe(OUTSIDER_ID);
      expect(optionValues(commitmentSelect)).toEqual(['', OUTSIDER_ID, MEMBER_A.id, MEMBER_B.id]);
      const historical = getByTestId('meeting-historical-assignee') as HTMLOptionElement;
      expect(historical.disabled).toBe(true);
      expect(historical.selected).toBe(true);
      expect(historical.textContent).toBe('Usuario fuera de la comunidad');

      // The synthetic option is record-local: the task selector on the same
      // meeting offers only real members.
      const taskSelect = getByTestId('meeting-task-assignee-0') as HTMLSelectElement;
      expect(optionValues(taskSelect)).toEqual(['', MEMBER_A.id, MEMBER_B.id]);

      // Unchanged save keeps the historical id.
      await act(async () => {
        fireEvent.click(getByRole('button', { name: /Guardar Cambios/i }));
      });
      await waitFor(() => {
        expect(mockUpdateMeeting).toHaveBeenCalledTimes(1);
      });
      const commitmentUpdates = capturedCalls['update:meeting_commitments'] ?? [];
      expect(commitmentUpdates).toHaveLength(1);
      expect(commitmentUpdates[0].assigned_to).toBe(OUTSIDER_ID);
      expectNoDirectMemberReads();
    });

    it('lets the user explicitly replace the historical assignee with a valid member and saves the new id', async () => {
      membersResponder = membersOk([MEMBER_A, MEMBER_B]);
      mockGetMeetingDetails.mockResolvedValue(meetingWithOutsider());

      const utils = render(
        <MeetingDocumentationModal {...baseProps} meetingId="meeting-1" mode="edit" />
      );
      const { container, getByTestId, getByRole, queryByTestId } = utils;

      await waitFor(() => {
        expect(attendeeCheckboxes(container)).toHaveLength(2);
      });
      await editFlowToStep3(utils, 'Reunión histórica');

      const commitmentSelect = getByTestId('meeting-commitment-assignee-0') as HTMLSelectElement;
      expect(commitmentSelect.value).toBe(OUTSIDER_ID);

      await act(async () => {
        fireEvent.change(commitmentSelect, { target: { value: MEMBER_A.id } });
      });
      expect(commitmentSelect.value).toBe(MEMBER_A.id);
      // Once a real member is chosen the synthetic option is gone for good.
      expect(queryByTestId('meeting-historical-assignee')).toBeNull();
      expect(optionValues(commitmentSelect)).toEqual(['', MEMBER_A.id, MEMBER_B.id]);

      await act(async () => {
        fireEvent.click(getByRole('button', { name: /Guardar Cambios/i }));
      });
      await waitFor(() => {
        expect(mockUpdateMeeting).toHaveBeenCalledTimes(1);
      });
      const commitmentUpdates = capturedCalls['update:meeting_commitments'] ?? [];
      expect(commitmentUpdates).toHaveLength(1);
      expect(commitmentUpdates[0].assigned_to).toBe(MEMBER_A.id);
      expectNoDirectMemberReads();
    });
  });
});
