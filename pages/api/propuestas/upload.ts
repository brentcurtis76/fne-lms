/**
 * POST /api/propuestas/upload
 * Admin-only: upload a file to the propuestas Supabase storage bucket.
 * Accepts multipart/form-data with:
 *   - file: the file to upload
 *   - subfolder: storage path prefix (e.g. "consultores", "documentos/certificado_pertenencia")
 * Returns: { data: { path: string } }
 */
import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import { readFileSync } from 'fs';
import { fromFile } from 'file-type';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import { getUserRoles } from '@/utils/roleUtils';

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'propuestas-upload');

  if (req.method !== 'POST') return handleMethodNotAllowed(res, ['POST']);

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden subir archivos', 403);
  }

  try {
    const form = formidable({ maxFileSize: MAX_FILE_SIZE });
    const { fields, files } = await new Promise<{
      fields: formidable.Fields;
      files: formidable.Files;
    }>((resolve, reject) => {
      form.parse(req, (err, f, fi) => {
        if (err) reject(err);
        else resolve({ fields: f, files: fi });
      });
    });

    const fileArray = Array.isArray(files.file) ? files.file : [files.file];
    const file = fileArray[0];
    if (!file) return sendAuthError(res, 'No se proporcionó ningún archivo', 400);

    const detected = await fromFile(file.filepath);
    const mimeType = detected?.mime || file.mimetype || 'application/octet-stream';
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return sendAuthError(res, 'Tipo de archivo no permitido. Se aceptan PDF e imágenes PNG/JPG/WEBP.', 400);
    }

    const subfolderRaw = Array.isArray(fields.subfolder) ? fields.subfolder[0] : fields.subfolder;
    const subfolder = (subfolderRaw || 'misc')
      .replace(/\.\.\//g, '')
      .replace(/\.\.\\/g, '')
      .replace(/[^a-zA-Z0-9/_-]/g, '_')
      .substring(0, 100);

    const rawFileName = file.originalFilename || 'archivo';
    const safeFileName = rawFileName
      .replace(/\.\.\//g, '')
      .replace(/\.\.\\/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .substring(0, 200);

    const storagePath = `${subfolder}/${safeFileName}`;
    const fileBuffer = readFileSync(file.filepath);

    const { error: uploadError } = await serviceClient.storage
      .from('propuestas')
      .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });

    if (uploadError) {
      return sendAuthError(res, 'Error al subir archivo', 500, uploadError.message);
    }

    return sendApiResponse(res, { path: storagePath }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al subir archivo', 500, message);
  }
}
