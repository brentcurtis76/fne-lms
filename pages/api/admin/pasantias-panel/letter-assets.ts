/**
 * GET / POST /api/admin/pasantias-panel/letter-assets — the two images the
 * invitation letter prints (the Instituto Relacional logo and the signature).
 *
 * They live in the private bucket, never in the repository (it is public).
 * Global admins only.
 *
 * GET  `{logo: boolean, signature: boolean}` — which ones are uploaded.
 * POST multipart `file` + `kind` (logo | signature): PNG or JPEG by its own
 *      bytes, at most 2 MB; replaces the previous image of that kind.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { authorizeIntakeAdmin } from '../../../../lib/pasantias/participants/admin';
import { logIntakeFailure } from '../../../../lib/pasantias/participants/server';
import {
  isLetterAssetKind,
  letterAssetPath,
  parseSingleUpload,
  readLetterAssetsState,
  sniffAllowedMime,
} from '../../../../lib/pasantias/panel/documents';
import { DOCUMENTS_BUCKET } from '../../../../lib/pasantias/panel/server';
import { LETTER_ASSET_MAX_BYTES } from '../../../../lib/pasantias/panel/types';

export const config = { api: { bodyParser: false } };

const BAD_IMAGE = 'Sube una imagen PNG o JPG de hasta 2 MB.';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authorizeIntakeAdmin(req, res, ['GET', 'POST']);
  if (!auth) return;
  const { supabase } = auth;

  try {
    if (req.method === 'POST') {
      const upload = await parseSingleUpload(req, LETTER_ASSET_MAX_BYTES);
      // Explicit `=== false`: tsconfig has strict off (see the intake routes).
      if (upload.ok === false) {
        const status = upload.reason === 'too_large' ? 413 : 422;
        return res.status(status).json({ code: 'VALIDATION', error: BAD_IMAGE, fields: { file: BAD_IMAGE } });
      }
      const kind = upload.fields.kind;
      if (!isLetterAssetKind(kind)) {
        return res.status(422).json({ code: 'VALIDATION', error: 'Elige qué imagen estás subiendo.' });
      }
      const mimeType = await sniffAllowedMime(upload.buffer);
      if (mimeType !== 'image/png' && mimeType !== 'image/jpeg') {
        return res.status(422).json({ code: 'BAD_TYPE', error: BAD_IMAGE, fields: { file: BAD_IMAGE } });
      }
      const { error: uploadError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .upload(letterAssetPath(kind), upload.buffer, { contentType: mimeType, upsert: true });
      if (uploadError) {
        logIntakeFailure('panel letter asset upload failed', uploadError);
        return res.status(500).json({ error: 'Error al subir la imagen' });
      }
    }

    const state = await readLetterAssetsState(supabase);
    if (state.ok === false) {
      logIntakeFailure('panel letter assets state failed', state.error);
      return res.status(500).json({ error: 'Error al cargar las imágenes de la carta' });
    }
    return res.status(req.method === 'POST' ? 201 : 200).json({ letterAssets: state.value });
  } catch (error) {
    logIntakeFailure('panel unexpected error', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
