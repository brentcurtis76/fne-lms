import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import { Validators } from '../../../../lib/types/api-auth.types';
import { getUserRoles, getHighestRole } from '../../../../utils/roleUtils';
import { createSessionCalendar, generateSessionExportFilename, ICalSessionInput } from '../../../../lib/utils/session-ical';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-detail-ical');

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de sesión inválido', 400);
  }

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

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
      .eq('id', id)
      .eq('is_active', true)
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
      // Check if consultant is at the same school or if they are global
      const consultorRoles = userRoles.filter(
        (r) => r.role_type === 'consultor' && r.is_active
      );
      const isGlobalConsultor = consultorRoles.some((r) => !r.school_id);

      if (isGlobalConsultor) {
        canAccess = true;
      } else {
        const consultantSchools = consultorRoles
          .filter((r) => r.school_id)
          .map((r) => r.school_id);

        if (consultantSchools.includes(session.school_id)) {
          canAccess = true;
        }
      }
    } else {
      // GC member: can view sessions for communities they belong to
      const userCommunityIds = userRoles
        .filter((r) => r.community_id)
        .map((r) => r.community_id);

      if (userCommunityIds.includes(session.growth_community_id)) {
        canAccess = true;
      }
    }

    if (!canAccess) {
      return sendAuthError(res, 'Acceso denegado a esta sesión', 403);
    }

    // Fetch facilitators
    const { data: facilitators, error: facilitatorsError } = await serviceClient
      .from('session_facilitators')
      .select('*, profiles(first_name, last_name, email)')
      .eq('session_id', id);

    if (facilitatorsError) {
      console.error('Error fetching facilitators:', facilitatorsError);
      return sendAuthError(res, 'Error al obtener facilitadores', 500);
    }

    // Build iCal input
    const icalSession: ICalSessionInput = {
      id: session.id,
      title: session.title,
      description: session.description,
      objectives: session.objectives,
      session_date: session.session_date,
      start_time: session.start_time,
      end_time: session.end_time,
      location: session.location,
      meeting_link: session.meeting_link,
      status: session.status,
      school_name: session.schools?.name || undefined,
      growth_community_name: session.growth_communities?.name || undefined,
      facilitators: (facilitators || []).map((f: unknown) => {
        const fac = f as Record<string, unknown>;
        const profile = fac.profiles as Record<string, unknown> | undefined;
        return {
          first_name: profile?.first_name as string | null | undefined,
          last_name: profile?.last_name as string | null | undefined,
          email: profile?.email as string | null | undefined,
        };
      }),
    };

    // Generate calendar
    const calendar = createSessionCalendar([icalSession], `Sesión: ${session.title}`);
    const filename = generateSessionExportFilename(icalSession);

    // Set response headers
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    // Send iCal content
    res.status(200).send(calendar.toString());
  } catch (error: unknown) {
    console.error('Error generating session iCal:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error al generar archivo de calendario', 500, message);
  }
}
