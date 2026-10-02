/**
 * MeetingDocumentationModal persistence helpers.
 *
 * `persistMeetingData` in the modal used to handle validation, plaintext
 * derivation, upsert dispatch, per-entity diff-upsert-delete, attachment
 * storage, and assignment notifications in a single ~270-line function.
 * This module factors the pure + closure-free pieces out so the modal's
 * orchestrator reads top-to-bottom in 50-ish lines. The helpers take every
 * dependency as an argument so they are trivially testable without a
 * React harness.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MeetingDocumentationInput,
  ExistingAttachment,
} from '../../types/meetings';
import { emptyDoc, plainTextFromDoc } from '../../lib/tiptap/helpers';
import {
  describeSaveError,
  noRowsProblem,
  type DbErrorLike,
  type SaveItemKind,
  type SaveProblem,
} from '../../lib/meetings/meeting-save';

/** Subset of the form state the persistence layer actually reads. Lets tests
 *  and helpers pass in a minimal shape without pulling the whole modal state. */
export interface DerivedMeetingDocs {
  summaryDoc: any;
  notesDoc: any;
  summaryText: string;
  notesText: string;
  agreementsForPersist: Array<{
    id?: string;
    agreement_text: string;
    agreement_doc: any;
    category?: string;
  }>;
  commitmentsForPersist: Array<{
    id?: string;
    commitment_text: string;
    commitment_doc: any;
    assigned_to: string;
    due_date: string;
  }>;
  tasksForPersist: Array<{
    id?: string;
    task_title: string;
    task_description: string;
    task_description_doc: any;
    assigned_to: string;
    due_date: string;
    priority: any;
    category: string;
    estimated_hours: number;
  }>;
}

/**
 * Pure: turn the form's current state into DB-ready payloads.
 *
 * - Resolves summary/notes into both a sanitized TipTap doc and the
 *   derived plain-text mirror (so legacy email renderers and full-text
 *   search both work without a second pass).
 * - Resolves each agreement/commitment/task the same way, falling back
 *   to the existing plain string when the doc renders blank.
 */
export function deriveMeetingDocs(
  formData: MeetingDocumentationInput,
): DerivedMeetingDocs {
  const summaryDoc = formData.summary_info.summary_doc ?? emptyDoc();
  const notesDoc = formData.summary_info.notes_doc ?? emptyDoc();
  return {
    summaryDoc,
    notesDoc,
    summaryText: plainTextFromDoc(summaryDoc),
    notesText: plainTextFromDoc(notesDoc),
    agreementsForPersist: formData.agreements.map((a) => {
      const doc = a.agreement_doc ?? emptyDoc();
      return {
        id: a.id,
        agreement_text: plainTextFromDoc(doc) || a.agreement_text || '',
        agreement_doc: doc,
        category: a.category,
      };
    }),
    commitmentsForPersist: formData.commitments.map((c) => {
      const doc = c.commitment_doc ?? emptyDoc();
      return {
        id: c.id,
        commitment_text: plainTextFromDoc(doc),
        commitment_doc: doc,
        assigned_to: c.assigned_to,
        due_date: c.due_date,
      };
    }),
    tasksForPersist: formData.tasks.map((t) => {
      const doc = t.task_description_doc ?? emptyDoc();
      return {
        id: t.id,
        task_title: t.task_title,
        task_description: plainTextFromDoc(doc),
        task_description_doc: doc,
        assigned_to: t.assigned_to,
        due_date: t.due_date,
        priority: t.priority,
        category: t.category,
        estimated_hours: t.estimated_hours,
      };
    }),
  };
}

/**
 * Insert the meeting row itself (create path). Reads back `version` so the
 * caller can seed its optimistic-locking state with the DB value (default 0).
 */
export async function insertMeetingRow(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    userId: string;
    title: string;
    meetingDate: string;
    durationMinutes: number;
    location?: string;
    summary: string;
    summaryDoc: any;
    notes: string;
    notesDoc: any;
    status: string;
  },
): Promise<{ meetingId?: string; version?: number; problem?: SaveProblem }> {
  const { data, error } = await supabase
    .from('community_meetings')
    .insert({
      workspace_id: params.workspaceId,
      title: params.title,
      meeting_date: params.meetingDate,
      duration_minutes: params.durationMinutes,
      location: params.location,
      summary: params.summary,
      summary_doc: params.summaryDoc,
      notes: params.notes,
      notes_doc: params.notesDoc,
      status: params.status,
      created_by: params.userId,
    })
    .select('id, version')
    .single();
  if (error || !data) {
    return { problem: error ? describeSaveError(error, 'meeting') : noRowsProblem('meeting') };
  }
  const row = data as { id: string; version?: number };
  return { meetingId: row.id, version: row.version ?? 0 };
}

interface DiffOriginalIds {
  agreements: Set<string>;
  commitments: Set<string>;
  tasks: Set<string>;
}

/** Ids of the rows behind each form item after a save, in form order. */
export interface MeetingItemIds {
  agreements: Array<string | undefined>;
  commitments: Array<string | undefined>;
  tasks: Array<string | undefined>;
}

export interface MeetingWriteResult {
  problems: SaveProblem[];
  ids: MeetingItemIds;
}

/**
 * Insert new rows, update rows that carry an id, delete rows whose ids
 * were loaded initially but no longer appear in the payload.
 *
 * SM-H8: every write is checked. Inserts go one row at a time and read back
 * the new id, so the caller can put it on the form item (a second save then
 * updates instead of inserting a duplicate). An UPDATE or DELETE that reaches
 * no row is reported as a permission problem — PostgREST answers 2xx when RLS
 * filters the row out. Nothing here throws; all failures come back as
 * `problems`, and the ids array keeps `undefined` for items that were not
 * written.
 *
 * For agreements we also maintain `order_index` so the email template and
 * the details-modal tab preserve author-chosen sequence.
 */
export async function applyMeetingDiffs(
  supabase: SupabaseClient,
  meetingId: string,
  payload: Pick<DerivedMeetingDocs, 'agreementsForPersist' | 'commitmentsForPersist' | 'tasksForPersist'>,
  originalIds: DiffOriginalIds,
): Promise<MeetingWriteResult> {
  const { agreementsForPersist, commitmentsForPersist, tasksForPersist } = payload;
  const problems: SaveProblem[] = [];

  const removed = (original: Set<string>, items: Array<{ id?: string }>) => {
    const current = new Set(items.map((i) => i.id).filter((id): id is string => !!id));
    return Array.from(original).filter((id) => !current.has(id));
  };

  const deleteRows = async (table: string, kind: SaveItemKind, ids: string[]) => {
    if (ids.length === 0) return;
    const { data, error } = await supabase.from(table).delete().in('id', ids).select('id');
    if (error) {
      problems.push(describeSaveError(error, kind));
    } else if ((data ?? []).length !== ids.length) {
      problems.push(noRowsProblem(kind));
    }
  };

  await deleteRows('meeting_agreements', 'agreement', removed(originalIds.agreements, agreementsForPersist));
  await deleteRows('meeting_commitments', 'commitment', removed(originalIds.commitments, commitmentsForPersist));
  await deleteRows('meeting_tasks', 'task', removed(originalIds.tasks, tasksForPersist));

  const writeRow = async (
    table: string,
    kind: SaveItemKind,
    index: number,
    id: string | undefined,
    row: Record<string, unknown>,
  ): Promise<string | undefined> => {
    if (id) {
      const { data, error } = await supabase.from(table).update(row).eq('id', id).select('id');
      if (error) {
        problems.push(describeSaveError(error, kind, index));
        return id;
      }
      if ((data ?? []).length === 0) problems.push(noRowsProblem(kind, index));
      return id;
    }
    const { data, error } = await supabase
      .from(table)
      .insert({ meeting_id: meetingId, ...row })
      .select('id')
      .single();
    if (error || !data) {
      problems.push(error ? describeSaveError(error, kind, index) : noRowsProblem(kind, index));
      return undefined;
    }
    return (data as { id: string }).id;
  };

  const ids: MeetingItemIds = { agreements: [], commitments: [], tasks: [] };

  for (const [index, a] of agreementsForPersist.entries()) {
    ids.agreements.push(
      await writeRow('meeting_agreements', 'agreement', index, a.id, {
        agreement_text: a.agreement_text,
        agreement_doc: a.agreement_doc,
        category: a.category,
        order_index: index,
      }),
    );
  }

  for (const [index, c] of commitmentsForPersist.entries()) {
    ids.commitments.push(
      await writeRow('meeting_commitments', 'commitment', index, c.id, {
        commitment_text: c.commitment_text,
        commitment_doc: c.commitment_doc,
        assigned_to: c.assigned_to,
        due_date: c.due_date,
      }),
    );
  }

  for (const [index, t] of tasksForPersist.entries()) {
    ids.tasks.push(
      await writeRow('meeting_tasks', 'task', index, t.id, {
        task_title: t.task_title,
        task_description: t.task_description,
        task_description_doc: t.task_description_doc,
        assigned_to: t.assigned_to,
        due_date: t.due_date,
        priority: t.priority,
        category: t.category,
        estimated_hours: t.estimated_hours,
      }),
    );
  }

  return { problems, ids };
}

/**
 * Participants (meeting_attendees) and people added as readers
 * (meeting_read_grants) — SM-H8. Both decide who may read the meeting
 * content, and edit mode used to drop participant changes entirely.
 *
 * Only `participant` rows are added or removed here. Rows with another role
 * (facilitator, secretary, co_editor, or Zoom attendance data) are never
 * deleted by unticking, because this form does not manage those roles.
 */
export async function syncMeetingPeople(
  supabase: SupabaseClient,
  meetingId: string,
  params: {
    actorId: string;
    participantIds: string[];
    originalParticipants: Map<string, string | null>;
    readerIds: string[];
    originalReaderIds: Set<string>;
  },
): Promise<SaveProblem[]> {
  const problems: SaveProblem[] = [];
  const participants = new Set(params.participantIds);

  const toAdd = params.participantIds.filter((id) => !params.originalParticipants.has(id));
  const toRemove = Array.from(params.originalParticipants.entries())
    .filter(([id, role]) => !participants.has(id) && (role === 'participant' || role === null))
    .map(([id]) => id);

  if (toAdd.length > 0) {
    const { data, error } = await supabase
      .from('meeting_attendees')
      .insert(
        toAdd.map((user_id) => ({
          meeting_id: meetingId,
          user_id,
          attendance_status: 'invited',
          role: 'participant',
        })),
      )
      .select('id');
    if (error) problems.push(describeSaveError(error, 'participant'));
    else if ((data ?? []).length !== toAdd.length) problems.push(noRowsProblem('participant'));
  }
  if (toRemove.length > 0) {
    const { data, error } = await supabase
      .from('meeting_attendees')
      .delete()
      .eq('meeting_id', meetingId)
      .in('user_id', toRemove)
      .select('id');
    if (error) problems.push(describeSaveError(error, 'participant'));
    else if ((data ?? []).length !== toRemove.length) problems.push(noRowsProblem('participant'));
  }

  // A participant needs no separate grant.
  const readers = new Set(params.readerIds.filter((id) => !participants.has(id)));
  const readersToAdd = Array.from(readers).filter((id) => !params.originalReaderIds.has(id));
  const readersToRemove = Array.from(params.originalReaderIds).filter((id) => !readers.has(id));

  if (readersToAdd.length > 0) {
    const { data, error } = await supabase
      .from('meeting_read_grants')
      .insert(readersToAdd.map((user_id) => ({ meeting_id: meetingId, user_id, granted_by: params.actorId })))
      .select('user_id');
    if (error) problems.push(describeSaveError(error, 'reader'));
    else if ((data ?? []).length !== readersToAdd.length) problems.push(noRowsProblem('reader'));
  }
  if (readersToRemove.length > 0) {
    const { data, error } = await supabase
      .from('meeting_read_grants')
      .delete()
      .eq('meeting_id', meetingId)
      .in('user_id', readersToRemove)
      .select('user_id');
    if (error) problems.push(describeSaveError(error, 'reader'));
    else if ((data ?? []).length !== readersToRemove.length) problems.push(noRowsProblem('reader'));
  }

  return problems;
}

/**
 * Remove storage objects + DB rows for attachments the user deleted in
 * this session. A failed storage removal is reported but does not stop the
 * row cleanup — we'd rather have the DB row gone than leave the row pointing
 * at a blob that may already be gone.
 */
export async function removeDeletedAttachments(
  supabase: SupabaseClient,
  attachments: ExistingAttachment[],
): Promise<SaveProblem[]> {
  if (attachments.length === 0) return [];
  const problems: SaveProblem[] = [];
  const paths = attachments.map((a) => a.file_path);
  try {
    const { error } = await supabase.storage.from('meeting-documents').remove(paths);
    if (error) problems.push(describeSaveError(error as DbErrorLike, 'attachment'));
  } catch (storageErr) {
    console.error('Error removing attachment storage files:', storageErr);
    problems.push(describeSaveError(null, 'attachment'));
  }
  const { data, error } = await supabase
    .from('meeting_attachments')
    .delete()
    .in(
      'id',
      attachments.map((a) => a.id),
    )
    .select('id');
  if (error) problems.push(describeSaveError(error, 'attachment'));
  else if ((data ?? []).length !== attachments.length) problems.push(noRowsProblem('attachment'));
  return problems;
}

/**
 * Upload freshly-selected files to storage and create matching
 * meeting_attachments rows. Per-file handling keeps one failing file from
 * aborting the rest; each failure comes back as a problem naming the file.
 * Files that were stored and recorded are returned in `uploaded` so the
 * caller can stop offering them for upload again.
 */
export async function uploadSelectedAttachments(
  supabase: SupabaseClient,
  uploadFileFn: (
    file: File,
    path: string,
    bucket: string,
  ) => Promise<{ error: unknown }>,
  params: {
    meetingId: string;
    workspaceId: string;
    userId: string;
    files: File[];
  },
): Promise<{ problems: SaveProblem[]; uploaded: File[] }> {
  const { meetingId, workspaceId, userId, files } = params;
  const problems: SaveProblem[] = [];
  const uploaded: File[] = [];
  const bucketName = 'meeting-documents';
  for (const file of files) {
    try {
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${workspaceId}/${meetingId}/${timestamp}-${sanitizedName}`;
      const { error } = await uploadFileFn(file, filePath, bucketName);
      if (error) {
        console.error('Error uploading file:', file.name, error);
        problems.push({ kind: 'attachment', message: `No se pudo subir ${file.name}.` });
        continue;
      }
      const { error: dbError } = await supabase
        .from('meeting_attachments')
        .insert({
          meeting_id: meetingId,
          filename: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
          uploaded_by: userId,
        });
      if (dbError) {
        console.error('Error saving file reference:', dbError);
        problems.push({ kind: 'attachment', message: `No se pudo registrar ${file.name}.` });
        continue;
      }
      uploaded.push(file);
    } catch (uploadError) {
      console.error('Error during file upload:', uploadError);
      problems.push({ kind: 'attachment', message: `No se pudo subir ${file.name}.` });
    }
  }
  return { problems, uploaded };
}

/**
 * Deduplicate the user-ids we need to notify (commitments + tasks).
 */
export function collectAssignedUserIds(
  formData: Pick<MeetingDocumentationInput, 'commitments' | 'tasks'>,
): string[] {
  return [
    ...formData.commitments.map((c) => c.assigned_to),
    ...formData.tasks.map((t) => t.assigned_to),
  ].filter(
    (id, index, arr): id is string => !!id && arr.indexOf(id) === index,
  );
}
