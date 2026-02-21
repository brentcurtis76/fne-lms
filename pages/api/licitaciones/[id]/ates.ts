import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
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
import { uuidSchema } from '@/lib/validation/schemas';
import { CreateAteSchema, UpdateAteSchema } from '@/types/licitaciones';
import { validateRut } from '@/utils/rutValidation';

// File uploads need bodyParser disabled
// We handle this per-method inside the handler
export const config = {
  api: {
    bodyParser: false,
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
  logApiRequest(req, 'licitaciones-ates');

  const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  if (!allowedMethods.includes(req.method || '')) {
    return handleMethodNotAllowed(res, allowedMethods);
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
      return sendAuthError(res, 'No tiene permisos para gestionar ATEs', 403);
    }

    // Fetch licitacion to verify access and school scoping
    const { data: licitacion, error: licitError } = await serviceClient
      .from('licitaciones')
      .select('id, school_id, estado')
      .eq('id', licitacionId)
      .single();

    if (licitError || !licitacion) {
      return sendAuthError(res, 'Licitacion no encontrada', 404);
    }

    // School scoping for encargado
    if (!isAdmin && isEncargado) {
      const encargadoRole = userRoles.find(r => r.role_type === 'encargado_licitacion');
      const encargadoSchoolId = encargadoRole?.school_id != null ? Number(encargadoRole.school_id) : null;
      if (!encargadoRole || encargadoSchoolId !== licitacion.school_id) {
        return sendAuthError(res, 'No tiene permisos para esta licitacion', 403);
      }
    }

    // ============================================================
    // GET — List all ATEs for this licitacion
    // ============================================================
    if (req.method === 'GET') {
      const { data: ates, error: listError } = await serviceClient
        .from('licitacion_ates')
        .select('*')
        .eq('licitacion_id', licitacionId)
        .order('created_at', { ascending: true });

      if (listError) {
        return sendAuthError(res, 'Error al obtener ATEs', 500, listError.message);
      }

      return sendApiResponse(res, { ates: ates || [] });
    }

    // ============================================================
    // POST — Create a new ATE
    // ============================================================
    if (req.method === 'POST') {
      // Parse body manually since bodyParser is disabled
      const body = await parseJsonBody(req);
      const parseResult = CreateAteSchema.safeParse(body);
      if (!parseResult.success) {
        const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return sendAuthError(res, `Datos invalidos: ${errors}`, 400);
      }

      const data = parseResult.data;

      // Validate RUT if provided
      if (data.rut_ate && !validateRut(data.rut_ate)) {
        return sendAuthError(res, 'RUT invalido. Por favor ingrese un RUT valido (ej: 12.345.678-5)', 400);
      }

      const { data: ate, error: insertError } = await serviceClient
        .from('licitacion_ates')
        .insert({
          licitacion_id: licitacionId,
          nombre_ate: data.nombre_ate,
          rut_ate: data.rut_ate || null,
          nombre_contacto: data.nombre_contacto || null,
          email: data.email || null,
          telefono: data.telefono || null,
          fecha_solicitud_bases: data.fecha_solicitud_bases || null,
        })
        .select('*')
        .single();

      if (insertError) {
        return sendAuthError(res, 'Error al registrar ATE', 500, insertError.message);
      }

      // Historial
      await serviceClient.from('licitacion_historial').insert({
        licitacion_id: licitacionId,
        accion: `ATE registrada: ${data.nombre_ate}`,
        estado_anterior: licitacion.estado,
        estado_nuevo: licitacion.estado,
        detalles: { nombre_ate: data.nombre_ate, rut_ate: data.rut_ate },
        user_id: user.id,
      });

      return sendApiResponse(res, { ate }, 201);
    }

    // ============================================================
    // PUT — Update ATE fields (excluding proposal uploads)
    // ============================================================
    if (req.method === 'PUT') {
      const body = await parseJsonBody(req);
      const { ate_id, ...updateFields } = body as { ate_id?: string } & Record<string, unknown>;

      if (!ate_id) {
        return sendAuthError(res, 'ate_id requerido en el body', 400);
      }

      const ateIdParse = uuidSchema.safeParse(ate_id);
      if (!ateIdParse.success) {
        return sendAuthError(res, 'ate_id invalido', 400);
      }

      // Verify ATE belongs to this licitacion
      const { data: existingAte, error: ateError } = await serviceClient
        .from('licitacion_ates')
        .select('id, licitacion_id, nombre_ate')
        .eq('id', ateIdParse.data)
        .eq('licitacion_id', licitacionId)
        .single();

      if (ateError || !existingAte) {
        return sendAuthError(res, 'ATE no encontrada', 404);
      }

      const parseResult = UpdateAteSchema.safeParse(updateFields);
      if (!parseResult.success) {
        const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return sendAuthError(res, `Datos invalidos: ${errors}`, 400);
      }

      const safeUpdate = parseResult.data;

      // Validate RUT if being updated
      if (safeUpdate.rut_ate && !validateRut(safeUpdate.rut_ate)) {
        return sendAuthError(res, 'RUT invalido. Por favor ingrese un RUT valido', 400);
      }

      const { data: updated, error: updateError } = await serviceClient
        .from('licitacion_ates')
        .update(safeUpdate)
        .eq('id', ateIdParse.data)
        .select('*')
        .single();

      if (updateError) {
        return sendAuthError(res, 'Error al actualizar ATE', 500, updateError.message);
      }

      // Historial for marking bases sent
      if (safeUpdate.fecha_envio_bases) {
        await serviceClient.from('licitacion_historial').insert({
          licitacion_id: licitacionId,
          accion: `Bases enviadas a ATE: ${existingAte.nombre_ate}`,
          estado_anterior: licitacion.estado,
          estado_nuevo: licitacion.estado,
          detalles: { ate_id: ateIdParse.data, fecha_envio_bases: safeUpdate.fecha_envio_bases },
          user_id: user.id,
        });
      }

      return sendApiResponse(res, { ate: updated });
    }

    // ============================================================
    // PATCH — Upload proposal for an ATE (multipart/form-data)
    // ============================================================
    if (req.method === 'PATCH') {
      const form = formidable({ maxFileSize: MAX_FILE_SIZE });
      const { fields, files } = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>(
        (resolve, reject) => {
          form.parse(req, (err, f, fi) => {
            if (err) reject(err);
            else resolve({ fields: f, files: fi });
          });
        }
      );

      const ateIdField = Array.isArray(fields.ate_id) ? fields.ate_id[0] : fields.ate_id;
      const fechaPropuestaField = Array.isArray(fields.fecha_propuesta) ? fields.fecha_propuesta[0] : fields.fecha_propuesta;
      const notasField = Array.isArray(fields.notas) ? fields.notas[0] : fields.notas;

      if (!ateIdField) {
        return sendAuthError(res, 'ate_id requerido en el formulario', 400);
      }

      const ateIdParse = uuidSchema.safeParse(ateIdField);
      if (!ateIdParse.success) {
        return sendAuthError(res, 'ate_id invalido', 400);
      }

      // Verify ATE belongs to this licitacion
      const { data: existingAte, error: ateError } = await serviceClient
        .from('licitacion_ates')
        .select('id, licitacion_id, nombre_ate')
        .eq('id', ateIdParse.data)
        .eq('licitacion_id', licitacionId)
        .single();

      if (ateError || !existingAte) {
        return sendAuthError(res, 'ATE no encontrada', 404);
      }

      // Extract file
      const fileArray = Array.isArray(files.file) ? files.file : [files.file];
      const file = fileArray[0];

      if (!file) {
        return sendAuthError(res, 'No se proporciono ningun archivo', 400);
      }

      if (file.size > MAX_FILE_SIZE) {
        return sendAuthError(res, 'El archivo excede el tamano maximo de 25 MB', 400);
      }

      // Validate MIME from magic bytes
      const detected = await fromFile(file.filepath);
      const mimeType = detected?.mime || file.mimetype || 'application/octet-stream';
      if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        return sendAuthError(res, 'Tipo de archivo no permitido. Se aceptan PDF, Word e imagenes.', 400);
      }

      const fileBuffer = readFileSync(file.filepath);
      const rawFileName = file.originalFilename || 'propuesta';
      const safeFileName = rawFileName
        .replace(/\.\.\//g, '')
        .replace(/\.\.\\/g, '')
        .replace(/[^a-zA-Z0-9._\-]/g, '_')
        .substring(0, 200);

      const uniqueId = randomUUID();
      const storagePath = `licitaciones/${licitacionId}/propuestas/${ateIdParse.data}/${uniqueId}_${safeFileName}`;

      // Upload to Supabase storage
      const { error: uploadError } = await serviceClient.storage
        .from('licitaciones')
        .upload(storagePath, fileBuffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        return sendAuthError(res, 'Error al subir el archivo', 500, uploadError.message);
      }

      // Insert licitacion_documentos record
      const { error: docInsertError } = await serviceClient
        .from('licitacion_documentos')
        .insert({
          licitacion_id: licitacionId,
          tipo: 'propuesta',
          nombre: `Propuesta ${existingAte.nombre_ate}`,
          storage_path: storagePath,
          file_name: safeFileName,
          file_size: file.size,
          mime_type: mimeType,
          uploaded_by: user.id,
        });

      if (docInsertError) {
        await serviceClient.storage.from('licitaciones').remove([storagePath]);
        return sendAuthError(res, 'Error al guardar registro del documento', 500, docInsertError.message);
      }

      // Update ATE with proposal metadata
      const ateUpdate: Record<string, unknown> = {
        propuesta_url: storagePath,
        propuesta_filename: safeFileName,
        propuesta_size: file.size,
        propuesta_mime_type: mimeType,
      };
      if (fechaPropuestaField) {
        ateUpdate.fecha_propuesta = fechaPropuestaField;
      }
      if (notasField) {
        ateUpdate.notas = notasField.substring(0, 2000);
      }

      const { data: updatedAte, error: ateUpdateError } = await serviceClient
        .from('licitacion_ates')
        .update(ateUpdate)
        .eq('id', ateIdParse.data)
        .select('*')
        .single();

      if (ateUpdateError) {
        return sendAuthError(res, 'Error al actualizar ATE con propuesta', 500, ateUpdateError.message);
      }

      // Historial
      await serviceClient.from('licitacion_historial').insert({
        licitacion_id: licitacionId,
        accion: `Propuesta recibida de ATE: ${existingAte.nombre_ate}`,
        estado_anterior: licitacion.estado,
        estado_nuevo: licitacion.estado,
        detalles: { ate_id: ateIdParse.data, file_name: safeFileName, file_size: file.size },
        user_id: user.id,
      });

      // Generate signed URL
      const { data: signedUrlData } = await serviceClient.storage
        .from('licitaciones')
        .createSignedUrl(storagePath, 3600);

      return sendApiResponse(res, {
        ate: updatedAte,
        download_url: signedUrlData?.signedUrl || null,
      });
    }

    // ============================================================
    // DELETE — Remove an ATE (uses service client for RLS bypass)
    // ============================================================
    if (req.method === 'DELETE') {
      const body = await parseJsonBody(req);
      const { ate_id } = body as { ate_id?: string };

      if (!ate_id) {
        return sendAuthError(res, 'ate_id requerido en el body', 400);
      }

      const ateIdParse = uuidSchema.safeParse(ate_id);
      if (!ateIdParse.success) {
        return sendAuthError(res, 'ate_id invalido', 400);
      }

      // Verify ATE belongs to this licitacion
      const { data: existingAte, error: ateError } = await serviceClient
        .from('licitacion_ates')
        .select('id, licitacion_id, nombre_ate, propuesta_url')
        .eq('id', ateIdParse.data)
        .eq('licitacion_id', licitacionId)
        .single();

      if (ateError || !existingAte) {
        return sendAuthError(res, 'ATE no encontrada', 404);
      }

      // Block deletion if ATE has a proposal uploaded (preserve audit trail)
      if (existingAte.propuesta_url) {
        return sendAuthError(
          res,
          'No se puede eliminar una ATE que ya tiene una propuesta subida. La propuesta debe preservarse para la auditoria.',
          409
        );
      }

      // Delete using service client (no DELETE RLS policy for encargado)
      const { error: deleteError } = await serviceClient
        .from('licitacion_ates')
        .delete()
        .eq('id', ateIdParse.data);

      if (deleteError) {
        return sendAuthError(res, 'Error al eliminar ATE', 500, deleteError.message);
      }

      // Historial
      await serviceClient.from('licitacion_historial').insert({
        licitacion_id: licitacionId,
        accion: `ATE eliminada: ${existingAte.nombre_ate}`,
        estado_anterior: licitacion.estado,
        estado_nuevo: licitacion.estado,
        detalles: { ate_id: ateIdParse.data, nombre_ate: existingAte.nombre_ate },
        user_id: user.id,
      });

      return sendApiResponse(res, { success: true });
    }

    return sendAuthError(res, 'Metodo no permitido', 405);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error inesperado', 500, message);
  }
}

/**
 * Parse JSON body from a request with bodyParser disabled.
 * Reads the raw stream and parses it.
 */
async function parseJsonBody(req: NextApiRequest): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}
