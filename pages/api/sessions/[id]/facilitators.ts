import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import { Validators } from '../../../../lib/types/api-auth.types';
import { SessionActivityLogInsert } from '../../../../lib/types/consultor-sessions.types';
import { validateFacilitatorIntegrity, FacilitatorValidationInput } from '../../../../lib/utils/facilitator-validation';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-facilitators');

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de sesión inválido', 400);
  }

  switch (req.method) {
    case 'PUT':
      return await handlePut(req, res, id);
    default:
      return handleMethodNotAllowed(res, ['PUT']);
  }
}

/**
 * PUT /api/sessions/[id]/facilitators
 * Admin remediation endpoint to replace facilitator assignments
 * Enforces full integrity validation before updating
 */
async function handlePut(req: NextApiRequest, res: NextApiResponse, sessionId: string) {
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden modificar consultores de sesiones', 403);
  }

  const { facilitators } = req.body;

  if (!facilitators || !Array.isArray(facilitators)) {
    return sendAuthError(res, 'Se requiere un array de consultores', 400);
  }

  // Validate payload structure
  for (const facilitator of facilitators) {
    if (!facilitator.user_id || typeof facilitator.user_id !== 'string' || !Validators.isUUID(facilitator.user_id)) {
      return sendAuthError(res, 'user_id inválido en payload', 400);
    }
    if (typeof facilitator.is_lead !== 'boolean') {
      return sendAuthError(res, 'is_lead debe ser booleano', 400);
    }
    if (!facilitator.facilitator_role || !['consultor_externo', 'equipo_interno'].includes(facilitator.facilitator_role)) {
      return sendAuthError(res, 'facilitator_role inválido', 400);
    }
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Fetch session to verify access and get school_id
    const { data: session, error: sessionError } = await serviceClient
      .from('consultor_sessions')
      .select('id, school_id, status')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return sendAuthError(res, 'Sesión no encontrada', 404);
    }

    // Check if session is completada or cancelada (read-only)
    if (session.status === 'completada' || session.status === 'cancelada') {
      return sendAuthError(res, 'No se puede editar consultores de sesiones completadas o canceladas', 403);
    }

    // Run facilitator integrity validation
    const validationInput: FacilitatorValidationInput[] = facilitators.map((f) => ({
      user_id: f.user_id,
      is_lead: f.is_lead,
      facilitator_role: f.facilitator_role,
    }));

    const validationResult = await validateFacilitatorIntegrity(
      serviceClient,
      validationInput,
      session.school_id
    );

    if (!validationResult.valid) {
      return sendAuthError(
        res,
        'Validación de consultores fallida: ' + validationResult.errors.join('; '),
        400
      );
    }

    // Delete all existing session_facilitators for this session
    const { error: deleteError } = await serviceClient
      .from('session_facilitators')
      .delete()
      .eq('session_id', sessionId);

    if (deleteError) {
      console.error('Error deleting existing facilitators:', deleteError);
      return sendAuthError(
        res,
        'Error al eliminar consultores existentes',
        500,
        deleteError.message
      );
    }

    // Insert new facilitators
    const newFacilitators = facilitators.map((f) => ({
      session_id: sessionId,
      user_id: f.user_id,
      facilitator_role: f.facilitator_role,
      is_lead: f.is_lead,
      created_at: new Date().toISOString(),
    }));

    const { data: insertedFacilitators, error: insertError } = await serviceClient
      .from('session_facilitators')
      .insert(newFacilitators)
      .select('*, profiles(id, first_name, last_name, email)');

    if (insertError) {
      console.error('Error inserting new facilitators:', insertError);
      // Critical: facilitators were deleted but insert failed
      console.error('CRITICAL: Facilitators were deleted but insert failed. Session may have no facilitators.');
      return sendAuthError(
        res,
        'Error al insertar nuevos consultores',
        500,
        insertError.message
      );
    }

    // Log the change
    const activityLogEntry: SessionActivityLogInsert = {
      session_id: sessionId,
      user_id: user!.id,
      action: 'facilitators_updated',
      details: {
        updated_facilitators: facilitators.length,
        facilitator_ids: facilitators.map((f) => f.user_id),
      },
    };

    const { error: logError } = await serviceClient
      .from('session_activity_log')
      .insert(activityLogEntry);

    if (logError) {
      console.error('Error inserting activity log:', logError);
      // Don't fail the request
    }

    return sendApiResponse(res, { facilitators: insertedFacilitators || [] });
  } catch (error: any) {
    console.error('Put facilitators error:', error);
    return sendAuthError(res, 'Error inesperado al actualizar consultores', 500, error.message);
  }
}
