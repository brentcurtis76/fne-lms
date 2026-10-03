// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { applyMeetingDiffs, syncMeetingPeople, insertMeetingRow } from '../../../components/meetings/persistMeeting';
import {
  capturedCalls as calls,
  failingWrites,
  makeMeetingSupabaseClient,
  resetMeetingSupabaseMock,
  seedRows,
  tableRows,
  refusedWrites,
} from './meetingSupabaseMock';
import {
  deriveMeetingDocs,
  collectAssignedUserIds,
} from '../../../components/meetings/persistMeeting';
import type { MeetingDocumentationInput } from '../../../types/meetings';

function buildForm(
  overrides: Partial<MeetingDocumentationInput> = {},
): MeetingDocumentationInput {
  return {
    meeting_info: {
      title: 'T',
      meeting_date: '2026-04-22',
      duration_minutes: 60,
      location: '',
      attendee_ids: [],
    },
    summary_info: {
      summary: 'plain summary',
      summary_doc: undefined,
      notes: 'plain notes',
      notes_doc: undefined,
      status: 'borrador',
    },
    agreements: [],
    commitments: [],
    tasks: [],
    ...overrides,
  };
}

describe('deriveMeetingDocs', () => {
  it('resolves empty doc fallback for summary/notes when form has no doc', () => {
    const result = deriveMeetingDocs(buildForm());
    // emptyDoc() returns a `{ type: 'doc', content: [] }` shape; downstream
    // code treats this as "render nothing". We don't assert the exact
    // shape — only that the call returned something truthy for both.
    expect(result.summaryDoc).toBeTruthy();
    expect(result.notesDoc).toBeTruthy();
    // Plain text is derived from the empty doc, so it should be ''.
    expect(result.summaryText).toBe('');
    expect(result.notesText).toBe('');
  });

  it('maps agreement docs to id+text+doc+category tuples', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Acuerdo' }] }] };
    const form = buildForm({
      agreements: [
        { id: 'a1', agreement_text: 'legacy text', agreement_doc: doc, category: 'X' },
        { agreement_text: 'no doc fallback', agreement_doc: null as any, category: undefined },
      ],
    });
    const result = deriveMeetingDocs(form);
    expect(result.agreementsForPersist).toHaveLength(2);
    expect(result.agreementsForPersist[0]).toMatchObject({
      id: 'a1',
      agreement_text: 'Acuerdo',
      category: 'X',
    });
    // When the doc renders empty, fall back to the legacy text or ''.
    expect(result.agreementsForPersist[1]).toMatchObject({
      agreement_text: 'no doc fallback',
    });
  });

  it('derives plain-text commitment_text from the commitment_doc', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Compromiso X' }] }] };
    const form = buildForm({
      commitments: [
        {
          id: 'c1',
          commitment_text: 'stale',
          commitment_doc: doc,
          assigned_to: 'u1',
          due_date: '2026-05-01',
        },
      ],
    });
    const result = deriveMeetingDocs(form);
    expect(result.commitmentsForPersist[0]).toMatchObject({
      id: 'c1',
      commitment_text: 'Compromiso X',
      assigned_to: 'u1',
      due_date: '2026-05-01',
    });
  });

  it('preserves task metadata (priority/category/estimated_hours)', () => {
    const form = buildForm({
      tasks: [
        {
          id: 't1',
          task_title: 'Task A',
          task_description: '',
          task_description_doc: undefined,
          assigned_to: 'u2',
          due_date: '2026-06-01',
          priority: 'alta',
          category: 'ops',
          estimated_hours: 4,
        },
      ],
    });
    const result = deriveMeetingDocs(form);
    expect(result.tasksForPersist[0]).toMatchObject({
      id: 't1',
      task_title: 'Task A',
      assigned_to: 'u2',
      due_date: '2026-06-01',
      priority: 'alta',
      category: 'ops',
      estimated_hours: 4,
    });
  });
});

describe('collectAssignedUserIds', () => {
  it('dedupes user ids across commitments and tasks', () => {
    const form = buildForm({
      commitments: [
        { commitment_text: '', assigned_to: 'u1', due_date: '' },
        { commitment_text: '', assigned_to: 'u2', due_date: '' },
      ],
      tasks: [
        { task_title: '', assigned_to: 'u1', due_date: '', priority: 'media' },
        { task_title: '', assigned_to: 'u3', due_date: '', priority: 'media' },
      ],
    });
    const ids = collectAssignedUserIds(form);
    expect(ids.sort()).toEqual(['u1', 'u2', 'u3']);
  });

  it('filters out empty-string assigned_to (unassigned rows)', () => {
    const form = buildForm({
      commitments: [
        { commitment_text: '', assigned_to: '', due_date: '' },
        { commitment_text: '', assigned_to: 'u1', due_date: '' },
      ],
      tasks: [],
    });
    expect(collectAssignedUserIds(form)).toEqual(['u1']);
  });

  it('returns an empty array when nothing is assigned', () => {
    const form = buildForm({ commitments: [], tasks: [] });
    expect(collectAssignedUserIds(form)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SM-H8: writes are checked and ids come back
// ---------------------------------------------------------------------------

const payload = (over: Partial<Parameters<typeof applyMeetingDiffs>[2]> = {}) => ({
  agreementsForPersist: [],
  commitmentsForPersist: [],
  tasksForPersist: [],
  ...over,
});
const task = (id?: string) => ({
  id, task_title: 'T', task_description: '', task_description_doc: null, assigned_to: 'a1', due_date: '2026-10-10',
  priority: 'media', category: '', estimated_hours: 0,
});
const none = { agreements: new Set<string>(), commitments: new Set<string>(), tasks: new Set<string>() };

describe('applyMeetingDiffs (SM-H8)', () => {
  beforeEach(() => resetMeetingSupabaseMock());

  it('inserts new rows one by one and returns their ids in form order', async () => {
    const client = makeMeetingSupabaseClient() as any;
    const result = await applyMeetingDiffs(client, 'm1', payload({ tasksForPersist: [task(), task()] }), none);
    expect(result.problems).toEqual([]);
    expect(result.ids.tasks).toHaveLength(2);
    expect(result.ids.tasks.every((id) => typeof id === 'string')).toBe(true);
    expect(calls['insert:meeting_tasks']).toHaveLength(2);
  });

  it('a refused insert is reported with its position and leaves no id', async () => {
    failingWrites['insert:meeting_tasks'] = { code: '23502', message: 'null value in column "due_date"' };
    const client = makeMeetingSupabaseClient() as any;
    const result = await applyMeetingDiffs(client, 'm1', payload({ tasksForPersist: [task()] }), none);
    expect(result.problems).toEqual([{ kind: 'task', index: 0, message: 'Tarea 1: falta la fecha o no es válida.' }]);
    expect(result.ids.tasks).toEqual([undefined]);
  });

  it('an update that reaches no row (RLS) is a permission problem, not a success', async () => {
    const client = makeMeetingSupabaseClient() as any;
    const original = client.from;
    client.from = (table: string) => {
      const chain = original(table);
      const select = chain.select;
      chain.select = (...args: any[]) => {
        const next = select(...args);
        next.then = (resolve: any) => resolve({ data: [], error: null });
        return next;
      };
      return chain;
    };
    const result = await applyMeetingDiffs(client, 'm1', payload({ tasksForPersist: [task('t1')] }), { ...none, tasks: new Set(['t1']) });
    expect(result.problems).toEqual([{ kind: 'task', index: 0, message: 'Tarea 1: no tienes permiso para guardar este cambio.' }]);
  });

  it('deletes rows removed from the form', async () => {
    seedRows('meeting_tasks', [{ id: 't1', meeting_id: 'm1' }, { id: 't2', meeting_id: 'm1' }]);
    const client = makeMeetingSupabaseClient() as any;
    const result = await applyMeetingDiffs(client, 'm1', payload(), { ...none, tasks: new Set(['t1', 't2']) });
    expect(result.problems).toEqual([]);
    expect(calls['in:meeting_tasks']).toEqual([['t1', 't2']]);
    expect(tableRows.meeting_tasks).toEqual([]);
  });

  it('a row that is already gone counts as deleted (nothing to retry, nothing to report)', async () => {
    seedRows('meeting_tasks', [{ id: 't1', meeting_id: 'm1' }]);
    const client = makeMeetingSupabaseClient() as any;
    const result = await applyMeetingDiffs(client, 'm1', payload(), { ...none, tasks: new Set(['t1', 'ghost']) });
    expect(result.problems).toEqual([]);
    expect(result.pendingDeletes.tasks).toEqual([]);
  });

  it('a delete RLS refuses (row still there) is reported and stays pending for the retry', async () => {
    seedRows('meeting_tasks', [{ id: 't1', meeting_id: 'm1' }, { id: 't2', meeting_id: 'm1' }]);
    refusedWrites.add('delete:meeting_tasks');
    const client = makeMeetingSupabaseClient() as any;
    const result = await applyMeetingDiffs(client, 'm1', payload(), { ...none, tasks: new Set(['t1', 't2']) });
    expect(result.problems).toEqual([{ kind: 'task', message: 'Tarea: no tienes permiso para guardar este cambio.' }]);
    expect(result.pendingDeletes.tasks).toEqual(['t1', 't2']);
  });
});

describe('syncMeetingPeople (SM-H8)', () => {
  beforeEach(() => resetMeetingSupabaseMock());

  it('adds new participants, removes unticked participant rows, keeps other roles', async () => {
    const client = makeMeetingSupabaseClient() as any;
    const stored = {
      participants: new Map<string, string | null>([['a1', 'participant'], ['old', 'participant'], ['ed', 'co_editor'], ['nul', null]]),
      readerIds: new Set<string>(),
    };
    seedRows('meeting_attendees', Array.from(stored.participants.entries()).map(([user_id, role]) => ({ id: `att-${user_id}`, meeting_id: 'm1', user_id, role })));
    const problems = await syncMeetingPeople(client, 'm1', {
      actorId: 'me',
      participantIds: ['a1', 'n1'],
      readerIds: [],
      baseline: stored,
      current: stored,
    });
    expect(problems).toEqual([]);
    expect(calls['insert:meeting_attendees'][0]).toEqual([
      { meeting_id: 'm1', user_id: 'n1', attendance_status: 'invited', role: 'participant' },
    ]);
    // 'old' and the NULL-role row are removed; the co_editor row never is.
    expect(calls['in:meeting_attendees']).toEqual([['old', 'nul']]);
  });

  it('a retry writes only what is still missing and keeps a pending removal', async () => {
    const client = makeMeetingSupabaseClient() as any;
    const baseline = { participants: new Map<string, string | null>([['a1', 'participant'], ['old', 'participant']]), readerIds: new Set<string>() };
    // A previous attempt added n1 but failed to remove 'old'.
    const current = { participants: new Map<string, string | null>([['a1', 'participant'], ['old', 'participant'], ['n1', 'participant']]), readerIds: new Set<string>() };
    seedRows('meeting_attendees', ['a1', 'old', 'n1'].map((user_id) => ({ id: `att-${user_id}`, meeting_id: 'm1', user_id, role: 'participant' })));
    const problems = await syncMeetingPeople(client, 'm1', {
      actorId: 'me', participantIds: ['a1', 'n1'], readerIds: [], baseline, current,
    });
    expect(problems).toEqual([]);
    expect(calls['insert:meeting_attendees']).toBeUndefined();
    expect(calls['in:meeting_attendees']).toEqual([['old']]);
  });

  it('leaves alone people someone else added meanwhile', async () => {
    const client = makeMeetingSupabaseClient() as any;
    const baseline = { participants: new Map<string, string | null>([['a1', 'participant']]), readerIds: new Set<string>() };
    const current = { participants: new Map<string, string | null>([['a1', 'participant'], ['other', 'participant']]), readerIds: new Set<string>(['r-other']) };
    await syncMeetingPeople(client, 'm1', { actorId: 'me', participantIds: ['a1'], readerIds: [], baseline, current });
    expect(calls['in:meeting_attendees']).toBeUndefined();
    expect(calls['in:meeting_read_grants']).toBeUndefined();
  });

  it('adds and removes readers, recording who added them; a participant needs no grant', async () => {
    const client = makeMeetingSupabaseClient() as any;
    const stored = { participants: new Map<string, string | null>([['a1', 'participant']]), readerIds: new Set(['gone']) };
    seedRows('meeting_read_grants', [{ meeting_id: 'm1', user_id: 'gone', granted_by: 'x' }]);
    const problems = await syncMeetingPeople(client, 'm1', {
      actorId: 'me',
      participantIds: ['a1'],
      readerIds: ['r1', 'a1'],
      baseline: stored,
      current: stored,
    });
    expect(problems).toEqual([]);
    expect(calls['insert:meeting_read_grants'][0]).toEqual([{ meeting_id: 'm1', user_id: 'r1', granted_by: 'me' }]);
    expect(calls['in:meeting_read_grants']).toEqual([['gone']]);
  });

  it('reports a refused participant insert', async () => {
    failingWrites['insert:meeting_attendees'] = { code: '42501', message: 'new row violates row-level security policy' };
    const client = makeMeetingSupabaseClient() as any;
    const nobody = { participants: new Map<string, string | null>(), readerIds: new Set<string>() };
    const problems = await syncMeetingPeople(client, 'm1', {
      actorId: 'me', participantIds: ['n1'], readerIds: [], baseline: nobody, current: nobody,
    });
    expect(problems).toEqual([{ kind: 'participant', message: 'Participantes: no tienes permiso para guardar este cambio.' }]);
  });
});

describe('insertMeetingRow (SM-H8)', () => {
  beforeEach(() => resetMeetingSupabaseMock());

  it('returns the new id and version', async () => {
    const client = makeMeetingSupabaseClient() as any;
    const row = await insertMeetingRow(client, {
      workspaceId: 'w', userId: 'u', title: 'R', meetingDate: '2026-10-02T19:00:00.000Z', durationMinutes: 60,
      summary: '', summaryDoc: null, notes: '', notesDoc: null, status: 'borrador',
    });
    expect(row.meetingId).toMatch(/^community_meetings-new-/);
    expect(row.version).toBe(0);
    expect(calls['insert:community_meetings'][0]).toMatchObject({ workspace_id: 'w', created_by: 'u', meeting_date: '2026-10-02T19:00:00.000Z' });
  });

  it('reports a refused insert', async () => {
    failingWrites['insert:community_meetings'] = { code: '42501', message: 'rls' };
    const client = makeMeetingSupabaseClient() as any;
    const row = await insertMeetingRow(client, {
      workspaceId: 'w', userId: 'u', title: 'R', meetingDate: 'x', durationMinutes: 60,
      summary: '', summaryDoc: null, notes: '', notesDoc: null, status: 'borrador',
    });
    expect(row.meetingId).toBeUndefined();
    expect(row.problem?.message).toBe('La reunión: no tienes permiso para guardar este cambio.');
  });
});
