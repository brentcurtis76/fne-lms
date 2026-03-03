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
  logApiRequest(req, 'licitaciones-documentos');

  const allowedMethods = ['GET', 'DELETE'];
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
      return sendAuthError(res, 'No tiene permisos para ver documentos', 403);
    }

    // Fetch licitacion for school scoping
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
    // DELETE — Remove a single document
    // ============================================================
    if (req.method === 'DELETE') {
      if (!isAdmin) {
        return sendAuthError(res, 'Solo administradores pueden eliminar documentos', 403);
      }

      const { doc_id } = req.query;
      const docIdParse = uuidSchema.safeParse(doc_id);
      if (!docIdParse.success) {
        return sendAuthError(res, 'doc_id requerido como query parameter', 400);
      }

      // Fetch the document record
      const { data: doc, error: docError } = await serviceClient
        .from('licitacion_documentos')
        .select('id, storage_path, nombre, licitacion_id')
        .eq('id', docIdParse.data)
        .eq('licitacion_id', licitacionId)
        .single();

      if (docError || !doc) {
        return sendAuthError(res, 'Documento no encontrado', 404);
      }

      // Delete from storage
      if (doc.storage_path) {
        await serviceClient.storage.from('licitaciones').remove([doc.storage_path]);
      }

      // Delete DB record
      const { error: deleteError } = await serviceClient
        .from('licitacion_documentos')
        .delete()
        .eq('id', docIdParse.data);

      if (deleteError) {
        return sendAuthError(res, 'Error al eliminar documento', 500, deleteError.message);
      }

      // Log to historial
      await serviceClient.from('licitacion_historial').insert({
        licitacion_id: licitacionId,
        accion: `Documento eliminado: ${doc.nombre}`,
        estado_anterior: licitacion.estado,
        estado_nuevo: licitacion.estado,
        detalles: { doc_id: doc.id, nombre: doc.nombre, storage_path: doc.storage_path },
        user_id: user.id,
      });

      return sendApiResponse(res, { success: true });
    }

    // ============================================================
    // GET — List all documents
    // ============================================================
    const { data: documentos, error: listError } = await serviceClient
      .from('licitacion_documentos')
      .select('*')
      .eq('licitacion_id', licitacionId)
      .order('created_at', { ascending: false });

    if (listError) {
      return sendAuthError(res, 'Error al obtener documentos', 500, listError.message);
    }

    return sendApiResponse(res, { documentos: documentos || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error inesperado', 500, message);
  }
}
