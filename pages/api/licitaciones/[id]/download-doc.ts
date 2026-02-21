/**
 * Download Document API
 * GET /api/licitaciones/[id]/download-doc?doc_id=...
 *
 * Generates a signed URL for a specific document belonging to a licitacion.
 * Validates access: admin=any, encargado=own school only.
 */

import { NextApiRequest, NextApiResponse } from 'next';
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitaciones-download-doc');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { id, doc_id } = req.query;
  const idParse = uuidSchema.safeParse(id);
  const docIdParse = uuidSchema.safeParse(doc_id);
  if (!idParse.success) {
    return sendAuthError(res, 'ID de licitacion invalido', 400);
  }
  if (!docIdParse.success) {
    return sendAuthError(res, 'ID de documento invalido', 400);
  }
  const licitacionId = idParse.data;
  const documentId = docIdParse.data;

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
      return sendAuthError(res, 'No tiene permisos para descargar documentos', 403);
    }

    // Fetch licitacion for school scoping
    const { data: licitacion, error: licitError } = await serviceClient
      .from('licitaciones')
      .select('id, school_id')
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

    // Fetch the document and verify it belongs to this licitacion
    const { data: doc, error: docError } = await serviceClient
      .from('licitacion_documentos')
      .select('id, storage_path, file_name')
      .eq('id', documentId)
      .eq('licitacion_id', licitacionId)
      .single();

    if (docError || !doc) {
      return sendAuthError(res, 'Documento no encontrado', 404);
    }

    if (!doc.storage_path) {
      return sendAuthError(res, 'Documento sin archivo asociado', 404);
    }

    // Validate storage path to prevent traversal
    if (doc.storage_path.includes('..') || doc.storage_path.startsWith('/')) {
      return sendAuthError(res, 'Ruta de archivo invalida', 400);
    }

    // Generate signed URL (1-hour expiry)
    const { data: signedData, error: signedError } = await serviceClient.storage
      .from('licitaciones')
      .createSignedUrl(doc.storage_path, 3600);

    if (signedError || !signedData?.signedUrl) {
      return sendAuthError(res, 'No se pudo generar el enlace de descarga', 500);
    }

    return sendApiResponse(res, { signedUrl: signedData.signedUrl }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al generar enlace de descarga', 500, message);
  }
}
