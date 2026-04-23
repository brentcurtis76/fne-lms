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

interface DiffOriginalIds {
  agreements: Set<string>;
  commitments: Set<string>;
  tasks: Set<string>;
}

/**
 * Insert new rows, update rows that carry an id, delete rows whose ids
 * were loaded initially but no longer appear in the payload.
 *
 * For agreements we also maintain `order_index` so the email template and
 * the details-modal tab preserve author-chosen sequence.
 */
export async function applyMeetingDiffs(
  supabase: SupabaseClient,
  meetingId: string,
  payload: Pick<DerivedMeetingDocs, 'agreementsForPersist' | 'commitmentsForPersist' | 'tasksForPersist'>,
  originalIds: DiffOriginalIds,
): Promise<void> {
  const { agreementsForPersist, commitmentsForPersist, tasksForPersist } = payload;

  const currentAgreementIds = new Set(
    agreementsForPersist.map((a) => a.id).filter((id): id is string => !!id),
  );
  const currentCommitmentIds = new Set(
    commitmentsForPersist.map((c) => c.id).filter((id): id is string => !!id),
  );
  const currentTaskIds = new Set(
    tasksForPersist.map((t) => t.id).filter((id): id is string => !!id),
  );

  const agreementIdsToDelete = Array.from(originalIds.agreements).filter(
    (id) => !currentAgreementIds.has(id),
  );
  const commitmentIdsToDelete = Array.from(originalIds.commitments).filter(
    (id) => !currentCommitmentIds.has(id),
  );
  const taskIdsToDelete = Array.from(originalIds.tasks).filter(
    (id) => !currentTaskIds.has(id),
  );

  if (agreementIdsToDelete.length > 0) {
    await supabase.from('meeting_agreements').delete().in('id', agreementIdsToDelete);
  }
  if (commitmentIdsToDelete.length > 0) {
    await supabase.from('meeting_commitments').delete().in('id', commitmentIdsToDelete);
  }
  if (taskIdsToDelete.length > 0) {
    await supabase.from('meeting_tasks').delete().in('id', taskIdsToDelete);
  }

  const agreementsWithOrder = agreementsForPersist.map((a, index) => ({
    ...a,
    order_index: index,
  }));
  const agreementsToInsert = agreementsWithOrder.filter((a) => !a.id);
  const agreementsToUpdate = agreementsWithOrder.filter((a) => !!a.id);

  if (agreementsToInsert.length > 0) {
    await supabase.from('meeting_agreements').insert(
      agreementsToInsert.map((a) => ({
        meeting_id: meetingId,
        agreement_text: a.agreement_text,
        agreement_doc: a.agreement_doc,
        category: a.category,
        order_index: a.order_index,
      })),
    );
  }
  for (const a of agreementsToUpdate) {
    await supabase
      .from('meeting_agreements')
      .update({
        agreement_text: a.agreement_text,
        agreement_doc: a.agreement_doc,
        category: a.category,
        order_index: a.order_index,
      })
      .eq('id', a.id!);
  }

  const commitmentsToInsert = commitmentsForPersist.filter((c) => !c.id);
  const commitmentsToUpdate = commitmentsForPersist.filter((c) => !!c.id);

  if (commitmentsToInsert.length > 0) {
    await supabase.from('meeting_commitments').insert(
      commitmentsToInsert.map((c) => ({
        meeting_id: meetingId,
        commitment_text: c.commitment_text,
        commitment_doc: c.commitment_doc,
        assigned_to: c.assigned_to,
        due_date: c.due_date,
      })),
    );
  }
  for (const c of commitmentsToUpdate) {
    await supabase
      .from('meeting_commitments')
      .update({
        commitment_text: c.commitment_text,
        commitment_doc: c.commitment_doc,
        assigned_to: c.assigned_to,
        due_date: c.due_date,
      })
      .eq('id', c.id!);
  }

  const tasksToInsert = tasksForPersist.filter((t) => !t.id);
  const tasksToUpdate = tasksForPersist.filter((t) => !!t.id);

  if (tasksToInsert.length > 0) {
    await supabase.from('meeting_tasks').insert(
      tasksToInsert.map((t) => ({
        meeting_id: meetingId,
        task_title: t.task_title,
        task_description: t.task_description,
        task_description_doc: t.task_description_doc,
        assigned_to: t.assigned_to,
        due_date: t.due_date,
        priority: t.priority,
        category: t.category,
        estimated_hours: t.estimated_hours,
      })),
    );
  }
  for (const t of tasksToUpdate) {
    await supabase
      .from('meeting_tasks')
      .update({
        task_title: t.task_title,
        task_description: t.task_description,
        task_description_doc: t.task_description_doc,
        assigned_to: t.assigned_to,
        due_date: t.due_date,
        priority: t.priority,
        category: t.category,
        estimated_hours: t.estimated_hours,
      })
      .eq('id', t.id!);
  }
}

/**
 * Remove storage objects + DB rows for attachments the user deleted in
 * this session. Storage removal runs with try/catch so a missing blob
 * doesn't abort the DB cleanup — we'd rather have the DB row gone than
 * leave the row pointing at a blob that may already be gone.
 */
export async function removeDeletedAttachments(
  supabase: SupabaseClient,
  attachments: ExistingAttachment[],
): Promise<void> {
  if (attachments.length === 0) return;
  const paths = attachments.map((a) => a.file_path);
  try {
    await supabase.storage.from('meeting-documents').remove(paths);
  } catch (storageErr) {
    console.error('Error removing attachment storage files:', storageErr);
  }
  await supabase
    .from('meeting_attachments')
    .delete()
    .in(
      'id',
      attachments.map((a) => a.id),
    );
}

/**
 * Upload freshly-selected files to storage and create matching
 * meeting_attachments rows. Per-file try/catch keeps one failing file
 * from aborting the rest; the caller doesn't need to know which subset
 * succeeded because the UI re-fetches attachments on the next view.
 */
export async function uploadSelectedAttachments(
  supabase: SupabaseClient,
  uploadFileFn: (
    file: File,
    path: string,
    bucket: string,
  ) => Promise<{ error: unknown }>,
  toastError: (msg: string) => void,
  params: {
    meetingId: string;
    workspaceId: string;
    userId: string;
    files: File[];
  },
): Promise<void> {
  const { meetingId, workspaceId, userId, files } = params;
  if (files.length === 0) return;
  const bucketName = 'meeting-documents';
  try {
    for (const file of files) {
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${workspaceId}/${meetingId}/${timestamp}-${sanitizedName}`;
      const { error } = await uploadFileFn(file, filePath, bucketName);
      if (error) {
        console.error('Error uploading file:', file.name, error);
        toastError(`Error al subir ${file.name}`);
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
      }
    }
  } catch (uploadError) {
    console.error('Error during file upload:', uploadError);
    toastError('Algunos archivos no se pudieron subir');
  }
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
