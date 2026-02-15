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
import {
  SessionActivityLogInsert,
  SessionReport,
  ReportVisibility,
} from '../../../../../lib/types/consultor-sessions.types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-report-detail');

  const { id, rid } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de sesión inválido', 400);
  }

  if (!rid || typeof rid !== 'string' || !Validators.isUUID(rid)) {
    return sendAuthError(res, 'ID de informe inválido', 400);
  }

  switch (req.method) {
    case 'GET':
      return await handleGet(req, res, id, rid);
    case 'PUT':
      return await handlePut(req, res, id, rid);
    default:
      return handleMethodNotAllowed(res, ['GET', 'PUT']);
  }
}

/**
 * GET /api/sessions/[id]/reports/[rid]
 * Get single report detail
 */
async function handleGet(req: NextApiRequest, res: NextApiResponse, sessionId: string, reportId: string) {
  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Fetch session to verify access
    const { data: session, error: sessionError } = await serviceClient
      .from('consultor_sessions')
      .select('id, growth_community_id, school_id')
      .eq('id', sessionId)
      .eq('is_active', true)
      .single();

    if (sessionError || !session) {
      return sendAuthError(res, 'Sesión no encontrada', 404);
    }

    // Fetch report
    const { data: report, error: reportError } = await serviceClient
      .from('session_reports')
      .select('*, profiles:author_id(first_name, last_name, email)')
      .eq('id', reportId)
      .eq('session_id', sessionId)
      .single();

    if (reportError || !report) {
      return sendAuthError(res, 'Informe no encontrado', 404);
    }

    // Determine user role
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (!highestRole) {
      return sendAuthError(res, 'Usuario sin roles asignados', 403);
    }

    // Role-based access check (mirrors attendees pattern)
    let canAccess = false;
    let isFacilitatorOrAdmin = false;

    if (highestRole === 'admin') {
      canAccess = true;
      isFacilitatorOrAdmin = true;
    } else if (highestRole === 'consultor') {
      const consultantSchools = userRoles
        .filter((r) => r.role_type === 'consultor' && r.school_id)
        .map((r) => r.school_id);

      if (consultantSchools.includes(session.school_id)) {
        canAccess = true;
      }

      // Check if facilitator
      const { data: facilitatorCheck } = await serviceClient
        .from('session_facilitators')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (facilitatorCheck) {
        isFacilitatorOrAdmin = true;
        canAccess = true;
      }
    } else {
      // GC members can also view reports
      const gcMemberships = userRoles.filter(
        (r) => r.community_id === session.growth_community_id && r.is_active
      );
      if (gcMemberships.length > 0) {
        canAccess = true;
      }
    }

    if (!canAccess) {
      return sendAuthError(res, 'Acceso denegado a esta sesión', 403);
    }

    // Visibility check
    if (!isFacilitatorOrAdmin && report.visibility === 'facilitators_only') {
      return sendAuthError(res, 'Acceso denegado a este informe', 403);
    }

    // Generate signed audio URL if audio_url is present
    let signedAudioUrl: string | null = null;
    if (report.audio_url && typeof report.audio_url === 'string' && report.audio_url.startsWith('storage://session-audio/')) {
      const storagePath = report.audio_url.replace('storage://session-audio/', '');
      const { data: signedData } = await serviceClient.storage
        .from('session-audio')
        .createSignedUrl(storagePath, 3600); // 1 hour expiry
      signedAudioUrl = signedData?.signedUrl || null;
    }

    return sendApiResponse(res, { report, signedAudioUrl });
  } catch (error: unknown) {
    console.error('Get report detail error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al obtener informe', 500, errorMessage);
  }
}

/**
 * PUT /api/sessions/[id]/reports/[rid]
 * Update an existing report (author only)
 */
async function handlePut(req: NextApiRequest, res: NextApiResponse, sessionId: string, reportId: string) {
  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  const { content, visibility } = req.body;

  if (!content && !visibility) {
    return sendAuthError(res, 'Se requiere contenido o visibilidad para actualizar', 400);
  }

  if (visibility && !['facilitators_only', 'all_participants'].includes(visibility)) {
    return sendAuthError(res, 'Visibilidad inválida', 400);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Fetch session for status check
    const { data: session, error: sessionError } = await serviceClient
      .from('consultor_sessions')
      .select('id, status')
      .eq('id', sessionId)
      .eq('is_active', true)
      .single();

    if (sessionError || !session) {
      return sendAuthError(res, 'Sesión no encontrada', 404);
    }

    // Status check: reject completada/cancelada
    if (session.status === 'completada' || session.status === 'cancelada') {
      return sendAuthError(res, 'No se pueden editar informes de sesiones completadas o canceladas', 403);
    }

    // Fetch report
    const { data: report, error: reportError } = await serviceClient
      .from('session_reports')
      .select('*')
      .eq('id', reportId)
      .eq('session_id', sessionId)
      .single();

    if (reportError || !report) {
      return sendAuthError(res, 'Informe no encontrado', 404);
    }

    // Auth check: author only
    if (report.author_id !== user.id) {
      return sendAuthError(res, 'Solo el autor puede editar este informe', 403);
    }

    // Build update object
    const updateData: Partial<Pick<SessionReport, 'content' | 'visibility'>> = {};

    if (content && typeof content === 'string' && content.trim().length > 0) {
      updateData.content = content.trim();
    }

    if (visibility) {
      updateData.visibility = visibility as ReportVisibility;
    }

    if (Object.keys(updateData).length === 0) {
      return sendAuthError(res, 'No hay campos válidos para actualizar', 400);
    }

    // Update report
    const { data: updatedReport, error: updateError } = await serviceClient
      .from('session_reports')
      .update(updateData)
      .eq('id', reportId)
      .select('*')
      .single();

    if (updateError) {
      console.error('Error updating report:', updateError);
      return sendAuthError(res, 'Error al actualizar informe', 500, updateError.message);
    }

    // Insert activity log
    const activityLogEntry: SessionActivityLogInsert = {
      session_id: sessionId,
      user_id: user.id,
      action: 'report_updated',
      details: { report_id: reportId, fields_changed: Object.keys(updateData) },
    };

    const { error: logError } = await serviceClient
      .from('session_activity_log')
      .insert(activityLogEntry);

    if (logError) {
      console.error('Error inserting activity log:', logError);
      // Don't fail the request
    }

    return sendApiResponse(res, { report: updatedReport });
  } catch (error: unknown) {
    console.error('Update report error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al actualizar informe', 500, errorMessage);
  }
}
