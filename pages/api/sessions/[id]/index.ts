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
  SessionWithRelations,
  SessionActivityLogInsert,
  STRUCTURAL_FIELDS,
} from '../../../../lib/types/consultor-sessions.types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-detail');

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de sesión inválido', 400);
  }

  switch (req.method) {
    case 'GET':
      return await handleGet(req, res, id);
    case 'PUT':
      return await handlePut(req, res, id);
    default:
      return handleMethodNotAllowed(res, ['GET', 'PUT']);
  }
}

/**
 * GET /api/sessions/[id]
 * Fetch session detail with all relations
 */
async function handleGet(req: NextApiRequest, res: NextApiResponse, sessionId: string) {
  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Fetch session with school and growth community names
    const { data: session, error: sessionError } = await serviceClient
      .from('consultor_sessions')
      .select('*, schools(name), growth_communities(name)')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return sendAuthError(res, 'Sesión no encontrada', 404);
    }

    // Determine user role
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (!highestRole) {
      return sendAuthError(res, 'Usuario sin roles asignados', 403);
    }

    // Role-based visibility
    let canAccess = false;

    if (highestRole === 'admin') {
      canAccess = true;
    } else if (highestRole === 'consultor') {
      // Check if consultant is at the same school
      const consultantSchools = userRoles
        .filter((r) => r.role_type === 'consultor' && r.school_id)
        .map((r) => r.school_id);

      if (consultantSchools.includes(session.school_id)) {
        canAccess = true;
      }
    }

    if (!canAccess) {
      return sendAuthError(res, 'Acceso denegado a esta sesión', 403);
    }

    // Check if activity_log should be included (exact match whitelist)
    const include = req.query.include as string | undefined;
    const VALID_INCLUDES = ['activity_log'];
    const includeActivityLog = include ? VALID_INCLUDES.includes(include) : false;

    // Fetch all relations in parallel
    const [facilitatorsRes, attendeesRes, reportsRes, materialsRes, communicationsRes, activityLogRes] =
      await Promise.all([
        serviceClient
          .from('session_facilitators')
          .select('*, profiles(id, first_name, last_name, email)')
          .eq('session_id', sessionId),
        serviceClient.from('session_attendees').select('*').eq('session_id', sessionId),
        serviceClient.from('session_reports').select('*').eq('session_id', sessionId),
        serviceClient.from('session_materials').select('*').eq('session_id', sessionId),
        serviceClient.from('session_communications').select('*').eq('session_id', sessionId),
        includeActivityLog
          ? serviceClient
              .from('session_activity_log')
              .select('*, profiles:user_id(first_name, last_name)')
              .eq('session_id', sessionId)
              .order('created_at', { ascending: false })
              .limit(50)
          : Promise.resolve({ data: null }),
      ]);

    const sessionWithRelations: SessionWithRelations = {
      ...session,
      facilitators: facilitatorsRes.data || [],
      attendees: attendeesRes.data || [],
      reports: reportsRes.data || [],
      materials: materialsRes.data || [],
      communications: communicationsRes.data || [],
      ...(activityLogRes.data && { activity_log: activityLogRes.data }),
    };

    return sendApiResponse(res, { session: sessionWithRelations });
  } catch (error: any) {
    console.error('Get session detail error:', error);
    return sendAuthError(res, 'Error inesperado al obtener sesión', 500, error.message);
  }
}

/**
 * PUT /api/sessions/[id]
 * Update session (admin: all fields, consultant: non-structural only)
 */
async function handlePut(req: NextApiRequest, res: NextApiResponse, sessionId: string) {
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

    // Determine user role
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (!highestRole) {
      return sendAuthError(res, 'Usuario sin roles asignados', 403);
    }

    let isAdmin = false;
    let isAssignedConsultant = false;

    if (highestRole === 'admin') {
      isAdmin = true;
    } else if (highestRole === 'consultor') {
      // Check if user is an assigned facilitator
      const { data: facilitatorCheck } = await serviceClient
        .from('session_facilitators')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (facilitatorCheck) {
        isAssignedConsultant = true;
      }
    }

    if (!isAdmin && !isAssignedConsultant) {
      return sendAuthError(res, 'No tiene permisos para editar esta sesión', 403);
    }

    // Consultant: check for structural fields
    if (isAssignedConsultant && !isAdmin) {
      const updateKeys = Object.keys(req.body);
      const structuralFieldsAttempted = updateKeys.filter((key) =>
        STRUCTURAL_FIELDS.includes(key as any)
      );

      if (structuralFieldsAttempted.length > 0) {
        return sendAuthError(
          res,
          'Los consultores no pueden modificar campos estructurales. Use solicitudes de edicion para cambios de fecha, hora o comunidad.',
          403
        );
      }
    }

    // Build update object (only allow specific fields)
    const updateData: any = {};
    const allowedFields = [
      'title',
      'description',
      'objectives',
      'meeting_link',
      'meeting_provider',
      'location',
      'meeting_summary',
      'meeting_transcript',
      'session_date',
      'start_time',
      'end_time',
      'modality',
      'growth_community_id',
      'school_id',
      'status',
    ];

    const fieldsChanged: string[] = [];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
        fieldsChanged.push(field);
      }
    });

    if (Object.keys(updateData).length === 0) {
      return sendAuthError(res, 'No hay campos para actualizar', 400);
    }

    // Apply update
    const { data: updatedSession, error: updateError } = await serviceClient
      .from('consultor_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .select('*')
      .single();

    if (updateError) {
      console.error('Database error updating session:', updateError);
      return sendAuthError(res, 'Error al actualizar sesión', 500, updateError.message);
    }

    // Insert activity log
    const activityLogEntry: SessionActivityLogInsert = {
      session_id: sessionId,
      user_id: user.id,
      action: 'edited',
      details: {
        changes: fieldsChanged.map(field => ({
          field,
          old: (session as any)[field],
          new: updateData[field],
        })),
      },
    };

    const { error: logError } = await serviceClient
      .from('session_activity_log')
      .insert(activityLogEntry);

    if (logError) {
      console.error('Error inserting activity log:', logError);
      // Don't fail the request
    }

    return sendApiResponse(res, { session: updatedSession });
  } catch (error: any) {
    console.error('Update session error:', error);
    return sendAuthError(res, 'Error inesperado al actualizar sesión', 500, error.message);
  }
}
