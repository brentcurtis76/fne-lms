/**
 * GET /api/community/post-media/<post_media id>[?download=1]
 *
 * F26b (EC-F2): the one way to show or download a feed post's file (a picture
 * or a document). Without `download=1` it answers a 302 redirect to the file
 * signed for five minutes, never stored by the browser (the `src` of a picture,
 * a plain link); with `download=1` it answers JSON `{ url, expiresIn }` whose
 * link asks the store to save the file under its own name.
 *
 * Who may: the post_media row is read WITH THE CALLER'S SESSION, so the
 * table's own read rule decides (people who may see the post, that is who
 * may enter the post's workspace). A hidden row, another community's row, a
 * missing one and a malformed id all get the same 404.
 *
 * Where the file is: the row's storage_path (the key <post id>/<index>.<ext>)
 * or, when it is empty, the key inside an old public address of `post-media`
 * held in `url` (lib/storage/espacio-file-link.ts). The key must lie inside
 * <the row's own post id>/; anything else is the same 404. Only the signing
 * uses the service client. The stored value and the link are never logged.
 * Built on pages/api/community/documents/[id]/link.ts.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createApiSupabaseClient, createServiceRoleClient, requireVerifiedCaller } from '../../../../lib/api-auth';
import { FILE_LINK_SECONDS, POST_MEDIA_BUCKET, espacioObjectKey } from '../../../../lib/storage/espacio-file-link';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = { error: 'Archivo no encontrado' };
const SERVER_ERROR = { error: 'Error interno del servidor' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Send-back 1: no answer of this route (the redirect included) may be
  // stored or reused by a browser or anything between, or the next person in
  // the same browser would get the previous person's file.
  res.setHeader('Cache-Control', 'private, no-store');
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

    const { data: media, error: mediaError } = await session
      .from('post_media')
      .select('id, post_id, url, storage_path, metadata')
      .eq('id', id)
      .maybeSingle();
    if (mediaError) {
      console.error('[post-media-link] media read failed');
      return res.status(500).json(SERVER_ERROR);
    }
    if (!media || typeof media.post_id !== 'string' || !media.post_id) {
      return res.status(404).json(NOT_FOUND);
    }

    const stored = typeof media.storage_path === 'string' && media.storage_path !== '' ? media.storage_path : media.url;
    const key = espacioObjectKey(stored, POST_MEDIA_BUCKET);
    const prefix = `${media.post_id}/`;
    if (!key || !key.startsWith(prefix) || key.length === prefix.length) {
      return res.status(404).json(NOT_FOUND);
    }

    const store = createServiceRoleClient().storage.from(POST_MEDIA_BUCKET);
    const { data: signed, error: signError } = await store.createSignedUrl(key, FILE_LINK_SECONDS);
    if (signError || !signed?.signedUrl) {
      if (signError) console.error('[post-media-link] signing failed');
      return res.status(404).json(NOT_FOUND);
    }

    if (download) {
      // As the document link (F12d send-back 1): the download value is added
      // to the link storage-js signed, encoded exactly once, without control
      // characters (the store sends the name in a header).
      const metadata = media.metadata as { name?: unknown } | null;
      const raw = typeof metadata?.name === 'string' ? metadata.name : '';
      const fileName = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
      const link = new URL(signed.signedUrl);
      link.searchParams.set('download', fileName);
      return res.status(200).json({ url: link.toString(), expiresIn: FILE_LINK_SECONDS });
    }

    return res.redirect(302, signed.signedUrl);
  } catch (error) {
    console.error('[post-media-link] unexpected error:', error instanceof Error ? error.name : 'unknown');
    return res.status(500).json(SERVER_ERROR);
  }
}
