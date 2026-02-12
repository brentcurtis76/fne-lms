import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../../lib/api-auth';
import { Validators } from '../../../../../lib/types/api-auth.types';
import { getUserRoles, getHighestRole } from '../../../../../utils/roleUtils';
import { SessionActivityLogInsert } from '../../../../../lib/types/consultor-sessions.types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-material-detail');

  const { id, mid } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de sesión inválido', 400);
  }

  if (!mid || typeof mid !== 'string' || !Validators.isUUID(mid)) {
    return sendAuthError(res, 'ID de material inválido', 400);
  }

  if (req.method !== 'DELETE') {
    return handleMethodNotAllowed(res, ['DELETE']);
  }

  return await handleDelete(req, res, id, mid);
}

/**
 * DELETE /api/sessions/[id]/materials/[mid]
 * Remove a material from storage and database
 */
async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  sessionId: string,
  materialId: string
) {
  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Fetch material
    const { data: material, error: materialError } = await serviceClient
      .from('session_materials')
      .select('*')
      .eq('id', materialId)
      .eq('session_id', sessionId)
      .single();

    if (materialError || !material) {
      return sendAuthError(res, 'Material no encontrado', 404);
    }

    // Fetch session for status check
    const { data: session, error: sessionError } = await serviceClient
      .from('consultor_sessions')
      .select('id, status')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return sendAuthError(res, 'Sesión no encontrada', 404);
    }

    // Status check: reject completada/cancelada
    if (session.status === 'completada' || session.status === 'cancelada') {
      return sendAuthError(res, 'No se pueden eliminar materiales de sesiones completadas o canceladas', 403);
    }

    // Auth check: uploader, facilitator, or admin
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    let canDelete = false;

    if (highestRole === 'admin') {
      canDelete = true;
    } else if (material.uploaded_by === user.id) {
      canDelete = true;
    } else {
      // Check if user is a facilitator for this session
      const { data: facilitatorCheck } = await serviceClient
        .from('session_facilitators')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (facilitatorCheck) {
        canDelete = true;
      }
    }

    if (!canDelete) {
      return sendAuthError(res, 'Solo el autor, facilitador o administrador pueden eliminar este material', 403);
    }

    // Delete from storage
    const { error: storageError } = await serviceClient.storage
      .from('session-materials')
      .remove([material.storage_path]);

    if (storageError) {
      console.error('Error deleting from storage:', storageError);
      // Continue anyway - orphaned storage files are less harmful than phantom DB records
    }

    // Delete from database
    const { error: deleteError } = await serviceClient
      .from('session_materials')
      .delete()
      .eq('id', materialId);

    if (deleteError) {
      console.error('Error deleting material record:', deleteError);
      return sendAuthError(res, 'Error al eliminar material', 500, deleteError.message);
    }

    // Insert activity log
    const activityLogEntry: SessionActivityLogInsert = {
      session_id: sessionId,
      user_id: user.id,
      action: 'materials_deleted',
      details: { file_name: material.file_name, material_id: materialId },
    };

    const { error: logError } = await serviceClient
      .from('session_activity_log')
      .insert(activityLogEntry);

    if (logError) {
      console.error('Error inserting activity log:', logError);
      // Don't fail the request
    }

    return sendApiResponse(res, { message: 'Material eliminado correctamente' });
  } catch (error: any) {
    console.error('Delete material error:', error);
    return sendAuthError(res, 'Error inesperado al eliminar material', 500, error.message);
  }
}
