import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import { Validators } from '../../../../lib/types/api-auth.types';
import { getUserRoles, getHighestRole } from '../../../../utils/roleUtils';
import {
  SessionActivityLogInsert,
  SessionEditRequestInsert,
  STRUCTURAL_FIELDS,
} from '../../../../lib/types/consultor-sessions.types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-edit-requests');

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de sesión inválido', 400);
  }

  switch (req.method) {
    case 'POST':
      return await handlePost(req, res, id);
    case 'GET':
      return await handleGet(req, res, id);
    default:
      return handleMethodNotAllowed(res, ['POST', 'GET']);
  }
}

/**
 * POST /api/sessions/[id]/edit-requests
 * Create edit request (facilitator only)
 */
async function handlePost(req: NextApiRequest, res: NextApiResponse, sessionId: string) {
  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Fetch session
    const { data: session, error: sessionError } = await serviceClient
      .from('consultor_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return sendAuthError(res, 'Sesión no encontrada', 404);
    }

    // Auth check: assigned facilitator only
    const { data: facilitatorCheck } = await serviceClient
      .from('session_facilitators')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (!facilitatorCheck) {
      return sendAuthError(res, 'Solo facilitadores asignados pueden solicitar cambios', 403);
    }

    // Validate session is not completada or cancelada
    if (session.status === 'completada' || session.status === 'cancelada') {
      return sendAuthError(
        res,
        `No se pueden solicitar cambios en sesiones con estado ${session.status}`,
        400
      );
    }

    // Validate request body
    const { changes, reason } = req.body;

    if (!changes || typeof changes !== 'object' || Object.keys(changes).length === 0) {
      return sendAuthError(res, 'El campo changes es requerido y debe contener al menos un cambio', 400);
    }

    // Validate all keys are structural fields
    const changeKeys = Object.keys(changes);
    const invalidKeys = changeKeys.filter((key) => !(STRUCTURAL_FIELDS as readonly string[]).includes(key));

    if (invalidKeys.length > 0) {
      return sendAuthError(
        res,
        `Los siguientes campos no son campos estructurales: ${invalidKeys.join(', ')}. Solo se permiten cambios en: ${STRUCTURAL_FIELDS.join(', ')}`,
        400
      );
    }

    // Validate old values match current session
    for (const key of changeKeys) {
      const { old: oldValue } = changes[key];
      const currentValue = (session as any)[key];

      // Compare values (handle null/undefined equivalence)
      const normalizedOld = oldValue === null ? null : oldValue;
      const normalizedCurrent = currentValue === null ? null : currentValue;

      if (JSON.stringify(normalizedOld) !== JSON.stringify(normalizedCurrent)) {
        return sendAuthError(
          res,
          `El valor actual de ${key} no coincide con el valor proporcionado. La sesión puede haber sido modificada.`,
          400
        );
      }
    }

    // Check for existing pending request by this user for this session
    const { data: existingPending } = await serviceClient
      .from('session_edit_requests')
      .select('id')
      .eq('session_id', sessionId)
      .eq('requested_by', user.id)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingPending) {
      return sendAuthError(
        res,
        'Ya existe una solicitud de cambio pendiente para esta sesión',
        409
      );
    }

    // Create edit request
    const editRequestData: SessionEditRequestInsert = {
      session_id: sessionId,
      requested_by: user.id,
      changes,
      reason: reason || null,
    };

    const { data: editRequest, error: insertError } = await serviceClient
      .from('session_edit_requests')
      .insert(editRequestData)
      .select('*')
      .single();

    if (insertError) {
      console.error('Database error creating edit request:', insertError);
      return sendAuthError(res, 'Error al crear solicitud de cambio', 500, insertError.message);
    }

    // Insert activity log
    const activityLogEntry: SessionActivityLogInsert = {
      session_id: sessionId,
      user_id: user.id,
      action: 'edit_requested',
      details: {
        edit_request_id: editRequest.id,
        changes: changeKeys,
      },
    };

    const { error: logError } = await serviceClient
      .from('session_activity_log')
      .insert(activityLogEntry);

    if (logError) {
      console.error('Error inserting activity log:', logError);
      // Don't fail the request
    }

    return sendApiResponse(res, { edit_request: editRequest }, 201);
  } catch (error: any) {
    console.error('Create edit request error:', error);
    return sendAuthError(res, 'Error inesperado al crear solicitud de cambio', 500, error.message);
  }
}

/**
 * GET /api/sessions/[id]/edit-requests
 * List edit requests for a session (admin: all, facilitator: own)
 */
async function handleGet(req: NextApiRequest, res: NextApiResponse, sessionId: string) {
  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Determine user role
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (!highestRole) {
      return sendAuthError(res, 'Usuario sin roles asignados', 403);
    }

    let query = serviceClient
      .from('session_edit_requests')
      .select('*, profiles:requested_by(first_name, last_name)')
      .eq('session_id', sessionId);

    // If not admin, filter to own requests
    if (highestRole !== 'admin') {
      query = query.eq('requested_by', user.id);
    }

    const { data: editRequests, error: fetchError } = await query.order('created_at', {
      ascending: false,
    });

    if (fetchError) {
      console.error('Database error fetching edit requests:', fetchError);
      return sendAuthError(res, 'Error al obtener solicitudes de cambio', 500, fetchError.message);
    }

    return sendApiResponse(res, { edit_requests: editRequests || [] });
  } catch (error: any) {
    console.error('Get edit requests error:', error);
    return sendAuthError(res, 'Error inesperado al obtener solicitudes de cambio', 500, error.message);
  }
}
