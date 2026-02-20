import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import { getUserRoles } from '@/utils/roleUtils';
import { uuidSchema } from '@/lib/validation/schemas';

export const config = {
  api: {
    bodyParser: false, // Required for multipart/form-data
  },
};

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitaciones-upload');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { id } = req.query;
  const idParse = uuidSchema.safeParse(id);
  if (!idParse.success) {
    return sendAuthError(res, 'ID de licitacion invalido', 400);
  }
  const licitacionId = idParse.data;

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'No autorizado', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const userRoles = await getUserRoles(serviceClient, user.id);
    const roleTypes = userRoles.map(r => r.role_type);
    const isAdmin = roleTypes.includes('admin');
    const isEncargado = roleTypes.includes('encargado_licitacion');

    if (!isAdmin && !isEncargado) {
      return sendAuthError(res, 'No tiene permisos para subir documentos a licitaciones', 403);
    }

    // Fetch licitacion to verify access
    const { data: licitacion, error: licitError } = await serviceClient
      .from('licitaciones')
      .select('id, school_id, estado')
      .eq('id', licitacionId)
      .single();

    if (licitError || !licitacion) {
      return sendAuthError(res, 'Licitacion no encontrada', 404);
    }

    // For encargados, verify school scope
    if (!isAdmin && isEncargado) {
      const encargadoRole = userRoles.find(r => r.role_type === 'encargado_licitacion');
      const encargadoSchoolId = encargadoRole?.school_id != null ? Number(encargadoRole.school_id) : null;
      if (!encargadoRole || encargadoSchoolId !== licitacion.school_id) {
        return sendAuthError(res, 'No tiene permisos para esta licitacion', 403);
      }
    }

    // Parse multipart form
    const form = formidable({ maxFileSize: MAX_FILE_SIZE });
    const { fields, files } = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>(
      (resolve, reject) => {
        form.parse(req, (err, f, fi) => {
          if (err) reject(err);
          else resolve({ fields: f, files: fi });
        });
      }
    );

    // Extract file
    const fileArray = Array.isArray(files.file) ? files.file : [files.file];
    const file = fileArray[0];

    if (!file) {
      return sendAuthError(res, 'No se proporciono ningun archivo', 400);
    }

    const mimeType = file.mimetype || 'application/octet-stream';
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return sendAuthError(res, 'Tipo de archivo no permitido. Se aceptan PDF, Word e imagenes.', 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return sendAuthError(res, 'El archivo excede el tamano maximo de 25 MB', 400);
    }

    // Read file buffer
    const fileBuffer = readFileSync(file.filepath);
    // Sanitize filename: remove path traversal sequences, restrict to safe characters
    const rawFileName = file.originalFilename || 'documento';
    const safeFileName = rawFileName
      .replace(/\.\.\//g, '')
      .replace(/\.\.\\/g, '')
      .replace(/[^a-zA-Z0-9._\-]/g, '_')
      .substring(0, 200);
    const uniqueId = randomUUID();
    const storagePath = `licitaciones/${licitacionId}/${uniqueId}_${safeFileName}`;

    // Extract document type from fields
    const tipoField = Array.isArray(fields.tipo) ? fields.tipo[0] : fields.tipo;
    const tipo = tipoField || 'publicacion_imagen';

    const validTipos = [
      'publicacion_imagen',
      'bases_generadas',
      'bases_enviadas',
      'propuesta',
      'evaluacion_generada',
      'evaluacion_firmada',
      'carta_adjudicacion_generada',
      'carta_adjudicacion_firmada',
      'otro',
    ];

    if (!validTipos.includes(tipo)) {
      return sendAuthError(res, `Tipo de documento invalido: ${tipo}`, 400);
    }

    const nombreField = Array.isArray(fields.nombre) ? fields.nombre[0] : fields.nombre;
    const rawNombre = nombreField || rawFileName;
    const nombre = rawNombre.replace(/[<>]/g, '').substring(0, 255);

    // Upload to licitaciones storage bucket (private — service role required)
    const { error: uploadError } = await serviceClient.storage
      .from('licitaciones')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      return sendAuthError(res, 'Error al subir el archivo', 500, uploadError.message);
    }

    // Insert document record
    const { data: docRecord, error: insertError } = await serviceClient
      .from('licitacion_documentos')
      .insert({
        licitacion_id: licitacionId,
        tipo,
        nombre,
        storage_path: storagePath,
        file_name: safeFileName,
        file_size: file.size,
        mime_type: mimeType,
        uploaded_by: user.id,
      })
      .select('*')
      .single();

    if (insertError) {
      // Rollback storage
      await serviceClient.storage.from('licitaciones').remove([storagePath]);
      return sendAuthError(res, 'Error al guardar registro del documento', 500, insertError.message);
    }

    // Log historial
    await serviceClient.from('licitacion_historial').insert({
      licitacion_id: licitacionId,
      accion: `Documento subido: ${tipo}`,
      estado_anterior: licitacion.estado,
      estado_nuevo: licitacion.estado,
      detalles: { file_name: safeFileName, tipo, file_size: file.size },
      user_id: user.id,
    });

    // Generate signed URL for immediate use (1 hour)
    const { data: signedUrlData } = await serviceClient.storage
      .from('licitaciones')
      .createSignedUrl(storagePath, 3600);

    return sendApiResponse(res, {
      documento: docRecord,
      download_url: signedUrlData?.signedUrl || null,
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error inesperado al subir documento', 500, message);
  }
}
