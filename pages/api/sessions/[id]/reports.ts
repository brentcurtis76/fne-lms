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
  SessionReportInsert,
  ReportVisibility,
  ReportType,
} from '../../../../lib/types/consultor-sessions.types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-reports');

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de sesión inválido', 400);
  }

  switch (req.method) {
    case 'GET':
      return await handleGet(req, res, id);
    case 'POST':
      return await handlePost(req, res, id);
    default:
      return handleMethodNotAllowed(res, ['GET', 'POST']);
  }
}

/**
 * GET /api/sessions/[id]/reports
 * List reports with author info, visibility-filtered
 */
async function handleGet(req: NextApiRequest, res: NextApiResponse, sessionId: string) {
  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Fetch session
    const { data: session, error: sessionError } = await serviceClient
      .from('consultor_sessions')
      .select('id, growth_community_id, school_id')
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

    // Fetch reports
    const { data: reports, error: reportsError } = await serviceClient
      .from('session_reports')
      .select('*, profiles:author_id(first_name, last_name, email)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (reportsError) {
      console.error('Error fetching reports:', reportsError);
      return sendAuthError(res, 'Error al obtener informes', 500, reportsError.message);
    }

    // Visibility filtering
    let filteredReports = reports || [];

    if (!isFacilitatorOrAdmin) {
      // GC members see only all_participants reports
      filteredReports = filteredReports.filter((r) => r.visibility === 'all_participants');
    }

    return sendApiResponse(res, { reports: filteredReports });
  } catch (error: any) {
    console.error('Get reports error:', error);
    return sendAuthError(res, 'Error inesperado al obtener informes', 500, error.message);
  }
}

/**
 * POST /api/sessions/[id]/reports
 * Create a new session report
 */
async function handlePost(req: NextApiRequest, res: NextApiResponse, sessionId: string) {
  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  const { content, visibility, report_type } = req.body;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return sendAuthError(res, 'Se requiere contenido del informe', 400);
  }

  const finalVisibility: ReportVisibility = visibility || 'facilitators_only';
  const finalReportType: ReportType = report_type || 'session_report';

  if (!['facilitators_only', 'all_participants'].includes(finalVisibility)) {
    return sendAuthError(res, 'Visibilidad inválida', 400);
  }

  if (!['session_report', 'planning_notes'].includes(finalReportType)) {
    return sendAuthError(res, 'Tipo de informe inválido', 400);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Fetch session
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
      return sendAuthError(res, 'No se pueden crear informes en sesiones completadas o canceladas', 403);
    }

    // Auth check: facilitator only
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    let canCreate = false;

    if (highestRole === 'admin') {
      canCreate = true;
    } else {
      const { data: facilitatorCheck } = await serviceClient
        .from('session_facilitators')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (facilitatorCheck) {
        canCreate = true;
      }
    }

    if (!canCreate) {
      return sendAuthError(res, 'Solo facilitadores pueden crear informes', 403);
    }

    // Enforce uniqueness: only one session_report per session per author
    if (finalReportType === 'session_report') {
      const { data: existingReport } = await serviceClient
        .from('session_reports')
        .select('id')
        .eq('session_id', sessionId)
        .eq('author_id', user.id)
        .eq('report_type', 'session_report')
        .single();

      if (existingReport) {
        return sendAuthError(res, 'Ya existe un informe de sesión para este autor', 400);
      }
    }

    // Create report
    const reportData: SessionReportInsert = {
      session_id: sessionId,
      author_id: user.id,
      content: content.trim(),
      visibility: finalVisibility,
      report_type: finalReportType,
      audio_url: null,
      transcript: null,
    };

    const { data: newReport, error: insertError } = await serviceClient
      .from('session_reports')
      .insert(reportData)
      .select('*')
      .single();

    if (insertError) {
      console.error('Error creating report:', insertError);
      return sendAuthError(res, 'Error al crear informe', 500, insertError.message);
    }

    // Insert activity log
    const activityLogEntry: SessionActivityLogInsert = {
      session_id: sessionId,
      user_id: user.id,
      action: 'report_filed',
      details: { report_type: finalReportType, visibility: finalVisibility },
    };

    const { error: logError } = await serviceClient
      .from('session_activity_log')
      .insert(activityLogEntry);

    if (logError) {
      console.error('Error inserting activity log:', logError);
      // Don't fail the request
    }

    return sendApiResponse(res, { report: newReport }, 201);
  } catch (error: any) {
    console.error('Create report error:', error);
    return sendAuthError(res, 'Error inesperado al crear informe', 500, error.message);
  }
}
