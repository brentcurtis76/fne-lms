/**
 * GET /api/community/message-attachments/<message_attachments id>[?download=1]
 *
 * F26b (EC-F3): the one way to show, open or download a message's attached
 * file. Without `download=1` it answers a 302 redirect to the file signed for
 * five minutes, cached privately for four (the `src` of a picture, a PDF, a
 * video or an audio, and the «open in a new tab» address); with `download=1`
 * it answers JSON `{ url, expiresIn }` whose link asks the store to save the
 * file under its own name (file_name).
 *
 * Who may: the message_attachments row is read WITH THE CALLER'S SESSION, so
 * the table's own read rules decide (people who may read the message's
 * conversation: its workspace or its thread). An inactive row, a hidden row, a
 * missing one and a malformed id all get the same 404.
 *
 * Where the file is: the row's storage_path, the key
 * <workspace or thread id>/<message id>/<file> or, in older rows, a full
 * public address of `message-attachments` holding that key
 * (lib/storage/espacio-file-link.ts). The key must be exactly
 * <one segment>/<the row's own message id>/<one segment>; anything else is
 * the same 404. Only the signing uses the service client. The stored value
 * and the link are never logged. Built on
 * pages/api/community/documents/[id]/link.ts.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createApiSupabaseClient, createServiceRoleClient, requireVerifiedCaller } from '../../../../lib/api-auth';
import { FILE_LINK_SECONDS, MESSAGE_ATTACHMENTS_BUCKET, espacioObjectKey } from '../../../../lib/storage/espacio-file-link';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = { error: 'Archivo no encontrado' };
const SERVER_ERROR = { error: 'Error interno del servidor' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const caller = await requireVerifiedCaller(req, res);
  if (!caller.user) {
    return res.status(caller.status).json(caller.body);
  }

  const { id } = req.query;
  const download = req.query.download === '1';
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    return res.status(404).json(NOT_FOUND);
  }

  try {
    const session = await createApiSupabaseClient(req, res);

    const { data: attachment, error: attachmentError } = await session
      .from('message_attachments')
      .select('id, message_id, storage_path, file_name, is_active')
      .eq('id', id)
      .maybeSingle();
    if (attachmentError) {
      console.error('[message-attachment-link] attachment read failed');
      return res.status(500).json(SERVER_ERROR);
    }
    if (!attachment || attachment.is_active !== true || typeof attachment.message_id !== 'string' || !attachment.message_id) {
      return res.status(404).json(NOT_FOUND);
    }

    const key = espacioObjectKey(attachment.storage_path, MESSAGE_ATTACHMENTS_BUCKET);
    const segments = key ? key.split('/') : [];
    if (!key || segments.length !== 3 || !segments[0] || segments[1] !== attachment.message_id || !segments[2]) {
      return res.status(404).json(NOT_FOUND);
    }

    const store = createServiceRoleClient().storage.from(MESSAGE_ATTACHMENTS_BUCKET);
    const { data: signed, error: signError } = await store.createSignedUrl(key, FILE_LINK_SECONDS);
    if (signError || !signed?.signedUrl) {
      if (signError) console.error('[message-attachment-link] signing failed');
      return res.status(404).json(NOT_FOUND);
    }

    if (download) {
      // As the document link (F12d send-back 1): the download value is added
      // to the link storage-js signed, encoded exactly once, without control
      // characters (the store sends the name in a header).
      const raw = typeof attachment.file_name === 'string' ? attachment.file_name : '';
      const fileName = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
      const link = new URL(signed.signedUrl);
      link.searchParams.set('download', fileName);
      return res.status(200).json({ url: link.toString(), expiresIn: FILE_LINK_SECONDS });
    }

    res.setHeader('Cache-Control', 'private, max-age=240');
    return res.redirect(302, signed.signedUrl);
  } catch (error) {
    console.error('[message-attachment-link] unexpected error:', error instanceof Error ? error.name : 'unknown');
    return res.status(500).json(SERVER_ERROR);
  }
}
