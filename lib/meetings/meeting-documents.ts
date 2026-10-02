/**
 * SM-H8: meeting documents live in the PRIVATE `meeting-documents` bucket
 * (owner decision 2: they follow the meeting's read rule). A public URL no
 * longer works; the browser asks Storage for a short-lived signed URL, which
 * Storage only signs for people who pass the bucket's SELECT policy.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const MEETING_DOCUMENTS_BUCKET = 'meeting-documents';
/** Seconds a download link stays valid. */
export const MEETING_DOCUMENT_URL_TTL = 60;

export async function meetingDocumentUrl(
  supabase: Pick<SupabaseClient, 'storage'>,
  filePath: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(MEETING_DOCUMENTS_BUCKET)
    .createSignedUrl(filePath, MEETING_DOCUMENT_URL_TTL);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Text shown where content is hidden from someone without access. */
export const MEETING_CONTENT_HIDDEN_TEXT =
  'Solo los participantes, el líder de la comunidad y las personas con acceso ven los acuerdos, compromisos, tareas y documentos de esta reunión.';
