// @vitest-environment node
import { describe, it, expect } from 'vitest';
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
