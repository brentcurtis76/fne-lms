/**
 * GET /api/pasantias/mine/documents/[docId] — a traveller opens one of their
 * own documents (airline ticket or invitation letter).
 *
 * The document must belong to a traveller whose email equals the CONFIRMED
 * email of the signed-in account, be of a kind travellers may see, and not be
 * removed. Anything else — someone else's document included — is the same 404.
 * Answers a download link that lasts 60 seconds.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  createServiceRoleClient,
  getApiUser,
  getForcedPasswordChangeVerdict,
  handleMethodNotAllowed,
  sendForcedPasswordChangeResponse,
} from '../../../../../lib/api-auth';
import { logIntakeFailure, setNoStore } from '../../../../../lib/pasantias/participants/server';
import { isUuid } from '../../../../../lib/pasantias/participants/validation';
import { SIGNED_URL_SECONDS } from '../../../../../lib/pasantias/panel/documents';
import {
  TRAVELLER_DOCUMENT_KINDS,
  confirmedEmail,
  findMyParticipantIds,
} from '../../../../../lib/pasantias/panel/mine';
import { DOCUMENTS_BUCKET } from '../../../../../lib/pasantias/panel/server';

const NOT_FOUND = { code: 'NOT_FOUND', error: 'No encontramos ese documento.' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoStore(res);
  if (req.method !== 'GET') return handleMethodNotAllowed(res, ['GET']);
  const { user, error } = await getApiUser(req, res);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  const docId = typeof req.query.docId === 'string' ? req.query.docId.toLowerCase() : '';
  if (!isUuid(docId)) return res.status(404).json(NOT_FOUND);

  try {
    const supabase = createServiceRoleClient();
    const verdict = await getForcedPasswordChangeVerdict(supabase, user.id);
    if (sendForcedPasswordChangeResponse(res, verdict)) return;

    const email = confirmedEmail(user);
    if (!email) return res.status(404).json(NOT_FOUND);
    const mine = await findMyParticipantIds(supabase, email);
    // Explicit `=== false`: tsconfig has strict off (see the intake routes).
    if (mine.ok === false) {
      logIntakeFailure('mi pasantia lookup failed', mine.error);
      return res.status(500).json({ error: 'Error al abrir el documento' });
    }
    if (mine.value.length === 0) return res.status(404).json(NOT_FOUND);

    const { data, error: readError } = await supabase
      .from('pasantias_panel_documents')
      .select('storage_path, file_name')
      .eq('id', docId)
      .in('participant_id', mine.value)
      .in('kind', TRAVELLER_DOCUMENT_KINDS as string[])
      .is('removed_at', null)
      .maybeSingle();
    if (readError) {
      logIntakeFailure('mi pasantia document read failed', readError);
      return res.status(500).json({ error: 'Error al abrir el documento' });
    }
    if (!data) return res.status(404).json(NOT_FOUND);
    const doc = data as unknown as { storage_path: string; file_name: string };

    const { data: signed, error: signError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS, { download: doc.file_name });
    if (signError || !signed?.signedUrl) {
      logIntakeFailure('mi pasantia document sign failed', signError);
      return res.status(500).json({ error: 'Error al abrir el documento' });
    }
    return res.status(200).json({ url: signed.signedUrl, fileName: doc.file_name });
  } catch (unexpected) {
    logIntakeFailure('mi pasantia unexpected error', unexpected);
    return res.status(500).json({ error: 'Error al abrir el documento' });
  }
}
