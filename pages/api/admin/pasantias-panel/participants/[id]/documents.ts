/**
 * POST /api/admin/pasantias-panel/participants/[id]/documents — upload ONE
 * private file for a traveller (multipart: `file`, `kind`, `description`).
 *
 * Global admins only; the guard runs BEFORE the body is read. At most 4 MB (the platform's request limit is 4.5 MB);
 * PDF, JPEG, PNG or WebP as decided by the file's own bytes. See
 * `lib/pasantias/panel/documents.ts` for how the file is stored.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { authorizeIntakeAdmin } from '../../../../../../lib/pasantias/participants/admin';
import { logIntakeFailure } from '../../../../../../lib/pasantias/participants/server';
import { isUuid } from '../../../../../../lib/pasantias/participants/validation';
import {
  parseSingleUpload,
  sniffAllowedMime,
  storeDocument,
} from '../../../../../../lib/pasantias/panel/documents';
import { ALLOWED_MIME, MAX_FILE_BYTES } from '../../../../../../lib/pasantias/panel/types';
import { safeDisplayFileName, validateUploadFields } from '../../../../../../lib/pasantias/panel/validation';

export const config = { api: { bodyParser: false } };

const NOT_FOUND = { code: 'NOT_FOUND', error: 'No encontramos a esa persona.' };
const TOO_LARGE = 'El archivo supera el máximo de 4 MB.';
const BAD_TYPE = 'Tipo de archivo no permitido. Sube un PDF o una imagen JPG, PNG o WebP.';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authorizeIntakeAdmin(req, res, ['POST']);
  if (!auth) return;
  const { supabase, userId } = auth;

  const participantId = typeof req.query.id === 'string' ? req.query.id.toLowerCase() : '';
  if (!isUuid(participantId)) return res.status(404).json(NOT_FOUND);

  try {
    const { data: participant, error: readError } = await supabase
      .from('pasantias_intake_participants')
      .select('id')
      .eq('id', participantId)
      .maybeSingle();
    if (readError) {
      logIntakeFailure('panel upload participant read failed', readError);
      return res.status(500).json({ error: 'Error al subir el documento' });
    }
    if (!participant) return res.status(404).json(NOT_FOUND);

    const upload = await parseSingleUpload(req, MAX_FILE_BYTES);
    // Explicit `=== false`: tsconfig has strict off (see the intake routes).
    if (upload.ok === false) {
      if (upload.reason === 'too_large') return res.status(413).json({ code: 'TOO_LARGE', error: TOO_LARGE });
      return res.status(422).json({
        code: 'VALIDATION',
        error: 'Elige un archivo para subir.',
        fields: { file: 'Elige un archivo para subir.' },
      });
    }

    const fields = validateUploadFields(upload.fields.kind, upload.fields.description);
    if (fields.ok === false) {
      return res.status(422).json({ code: 'VALIDATION', error: 'Revisa los campos marcados.', fields: fields.errors });
    }
    const mimeType = await sniffAllowedMime(upload.buffer);
    if (!mimeType) {
      return res.status(422).json({ code: 'BAD_TYPE', error: BAD_TYPE, fields: { file: BAD_TYPE } });
    }

    const stored = await storeDocument(supabase, {
      participantId,
      kind: fields.value.kind,
      description: fields.value.description,
      fileName: safeDisplayFileName(upload.originalName, `documento.${ALLOWED_MIME[mimeType]}`),
      mimeType,
      buffer: upload.buffer,
      actorId: userId,
      action: 'document_uploaded',
    });
    if (stored.ok === false) {
      logIntakeFailure(`panel upload failed (${stored.stage})`, stored.error);
      return res.status(500).json({ error: 'Error al subir el documento' });
    }
    if (!stored.activityLogged) console.error('[pasantias-intake] panel upload: activity row not written');
    return res.status(201).json({ document: stored.document });
  } catch (error) {
    logIntakeFailure('panel unexpected error', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
