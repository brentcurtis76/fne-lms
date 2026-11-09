/**
 * GET / DELETE /api/admin/pasantias-panel/documents/[docId]
 *
 * Global admins only.
 *
 * GET    a 60-second signed URL for one stored file (`{url, fileName}`); the
 *        storage path itself never leaves the server.
 * DELETE removes a document: the row is stamped removed (the table has no
 *        DELETE for anyone) and then the stored file is deleted. Removing an
 *        already removed document answers 404.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { authorizeIntakeAdmin } from '../../../../../lib/pasantias/participants/admin';
import { logIntakeFailure } from '../../../../../lib/pasantias/participants/server';
import { isUuid } from '../../../../../lib/pasantias/participants/validation';
import { SIGNED_URL_SECONDS } from '../../../../../lib/pasantias/panel/documents';
import { DOCUMENTS_BUCKET, recordActivity } from '../../../../../lib/pasantias/panel/server';

const NOT_FOUND = { code: 'NOT_FOUND', error: 'No encontramos ese documento.' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authorizeIntakeAdmin(req, res, ['GET', 'DELETE']);
  if (!auth) return;
  const { supabase, userId } = auth;

  const docId = typeof req.query.docId === 'string' ? req.query.docId.toLowerCase() : '';
  if (!isUuid(docId)) return res.status(404).json(NOT_FOUND);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('pasantias_panel_documents')
        .select('storage_path, file_name')
        .eq('id', docId)
        .is('removed_at', null)
        .maybeSingle();
      if (error) {
        logIntakeFailure('panel document read failed', error);
        return res.status(500).json({ error: 'Error al abrir el documento' });
      }
      if (!data) return res.status(404).json(NOT_FOUND);
      const doc = data as unknown as { storage_path: string; file_name: string };
      const { data: signed, error: signError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS, { download: doc.file_name });
      if (signError || !signed?.signedUrl) {
        logIntakeFailure('panel document sign failed', signError);
        return res.status(500).json({ error: 'Error al abrir el documento' });
      }
      return res.status(200).json({ url: signed.signedUrl, fileName: doc.file_name });
    }

    // DELETE: only a document not yet removed is written, so two clicks cannot both "win".
    const { data: removed, error: removeError } = await supabase
      .from('pasantias_panel_documents')
      .update({ removed_at: new Date().toISOString(), removed_by: userId })
      .eq('id', docId)
      .is('removed_at', null)
      .select('participant_id, kind, file_name, storage_path')
      .maybeSingle();
    if (removeError) {
      logIntakeFailure('panel document remove failed', removeError);
      return res.status(500).json({ error: 'Error al eliminar el documento' });
    }
    if (!removed) return res.status(404).json(NOT_FOUND);
    const doc = removed as unknown as { participant_id: string; kind: string; file_name: string; storage_path: string };

    const { error: storageError } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path]);
    // The document is already gone for every reader; a leftover object is logged for cleanup.
    if (storageError) logIntakeFailure('panel document object not deleted', storageError);

    const logged = await recordActivity(supabase, {
      participantId: doc.participant_id,
      actorId: userId,
      action: 'document_removed',
      details: { kind: doc.kind, file_name: doc.file_name },
    });
    if (!logged.ok) logIntakeFailure('panel document removal not logged', logged.error);
    return res.status(200).json({ removed: true });
  } catch (error) {
    logIntakeFailure('panel unexpected error', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
