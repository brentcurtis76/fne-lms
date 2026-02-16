import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../lib/api-auth';
import { Validators } from '../../../lib/types/api-auth.types';
import { getUserRoles, getHighestRole } from '../../../utils/roleUtils';
import { createSessionCalendar, generateExportFilename, ICalSessionInput } from '../../../lib/utils/session-ical';
import type { SessionStatus } from '../../../lib/types/consultor-sessions.types';

const VALID_SESSION_STATUSES = [
  'programada',
  'en_progreso',
  'pendiente_informe',
  'completada',
  'pendiente_aprobacion',
  'borrador',
  'cancelada',
] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-batch-ical');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  const { school_id, growth_community_id, consultant_id, status, date_from, date_to } = req.query;

  try {
    const serviceClient = createServiceRoleClient();

    // Determine user role
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (!highestRole) {
      return sendAuthError(res, 'Usuario sin roles asignados', 403);
    }

    // Build query
    let query = serviceClient
      .from('consultor_sessions')
      .select('*, session_facilitators(profiles(first_name, last_name, email)), schools(name), growth_communities(name)')
      .eq('is_active', true);

    // Role-based filtering
    if (highestRole === 'admin') {
      // Admin sees all sessions
    } else if (highestRole === 'consultor') {
      // Consultant sees sessions at their assigned schools
      const consultantSchools = userRoles
        .filter((r) => r.role_type === 'consultor' && r.school_id)
        .map((r) => r.school_id);

      if (consultantSchools.length === 0) {
        // Empty result set - return empty calendar
        const emptyCalendar = createSessionCalendar([]);
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="sesiones-vacio.ics"');
        return res.status(200).send(emptyCalendar.toString());
      }

      query = query.in('school_id', consultantSchools);
    } else {
      // GC member: see sessions for their communities
      const userCommunityIds = userRoles
        .filter((r) => r.community_id)
        .map((r) => r.community_id)
        .filter((id, index, arr) => arr.indexOf(id) === index); // deduplicate

      if (userCommunityIds.length === 0) {
        // Empty result set - return empty calendar
        const emptyCalendar = createSessionCalendar([]);
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="sesiones-vacio.ics"');
        return res.status(200).send(emptyCalendar.toString());
      }

      query = query.in('growth_community_id', userCommunityIds);
      // Exclude drafts for non-admin/non-consultor
      query = query.neq('status', 'borrador');
    }

    // Consultant filter (two-step pattern: first get session IDs, then filter)
    let sessionIdFilter: string[] | null = null;
    if (consultant_id && Validators.isUUID(consultant_id as string)) {
      const { data: consultantSessions, error: csError } = await serviceClient
        .from('session_facilitators')
        .select('session_id')
        .eq('user_id', consultant_id as string);

      if (csError) {
        return sendAuthError(res, 'Error al filtrar por consultor', 500);
      }

      sessionIdFilter = (consultantSessions || []).map((f: { session_id: string }) => f.session_id);

      if (sessionIdFilter.length === 0) {
        // Empty result set - return empty calendar
        const emptyCalendar = createSessionCalendar([]);
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="sesiones-vacio.ics"');
        return res.status(200).send(emptyCalendar.toString());
      }
    }

    // Apply consultant ID filter first (if provided)
    if (sessionIdFilter !== null) {
      query = query.in('id', sessionIdFilter);
    }

    // Apply filters
    if (school_id) {
      const schoolIdNum = parseInt(school_id as string, 10);
      if (!isNaN(schoolIdNum)) {
        query = query.eq('school_id', schoolIdNum);
      }
    }

    if (growth_community_id && Validators.isUUID(growth_community_id as string)) {
      query = query.eq('growth_community_id', growth_community_id);
    }

    if (status && typeof status === 'string') {
      const statusArray = status.includes(',')
        ? status.split(',').map((s) => s.trim())
        : [status];
      const validStatuses = statusArray.filter((s) =>
        (VALID_SESSION_STATUSES as readonly string[]).includes(s)
      );
      if (validStatuses.length === 0) {
        return sendAuthError(res, 'No hay estados válidos para exportar', 400);
      }
      if (validStatuses.length === 1) {
        query = query.eq('status', validStatuses[0]);
      } else {
        query = query.in('status', validStatuses);
      }
    }

    if (date_from && isValidDate(date_from as string)) {
      query = query.gte('session_date', date_from);
    }

    if (date_to && isValidDate(date_to as string)) {
      query = query.lte('session_date', date_to);
    }

    // Sort by session_date and apply limit
    const { data: sessions, error: queryError } = await query
      .order('session_date', { ascending: true })
      .limit(101); // Fetch 101 to check if we exceed 100

    if (queryError) {
      console.error('Database error fetching sessions:', queryError);
      return sendAuthError(res, 'Error al obtener sesiones', 500, queryError.message);
    }

    if (!sessions) {
      return sendAuthError(res, 'No se encontraron sesiones', 404);
    }

    // Check if we have too many results
    if (sessions.length > 100) {
      return sendAuthError(
        res,
        'Demasiadas sesiones para exportar. Use filtros más específicos (máximo 100).',
        400
      );
    }

    // Build iCal sessions
    const icalSessions: ICalSessionInput[] = sessions.map((session: unknown) => {
      const s = session as Record<string, unknown>;
      const facilitators = (s.session_facilitators as Array<Record<string, unknown>> | null) || [];

      return {
        id: s.id as string,
        title: s.title as string,
        description: (s.description as string | null) || undefined,
        objectives: (s.objectives as string | null) || undefined,
        session_date: s.session_date as string,
        start_time: s.start_time as string,
        end_time: s.end_time as string,
        location: (s.location as string | null) || undefined,
        meeting_link: (s.meeting_link as string | null) || undefined,
        status: s.status as SessionStatus,
        school_name: ((s.schools as Record<string, unknown> | null)?.name as string | null) || undefined,
        growth_community_name: (
          (s.growth_communities as Record<string, unknown> | null)?.name as string | null
        ) || undefined,
        facilitators: facilitators.map((f) => ({
          first_name: (((f.profiles as Record<string, unknown> | null)?.first_name as string) || null) as string | null | undefined,
          last_name: (((f.profiles as Record<string, unknown> | null)?.last_name as string) || null) as string | null | undefined,
          email: (((f.profiles as Record<string, unknown> | null)?.email as string) || null) as string | null | undefined,
        })),
      };
    });

    // Generate calendar
    const calendar = createSessionCalendar(icalSessions, 'Sesiones Exportadas');

    // Generate filename with timestamp
    const filename = generateExportFilename(sessions.length);

    // Set response headers
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    // Send iCal content
    res.status(200).send(calendar.toString());
  } catch (error: unknown) {
    console.error('Error generating batch iCal:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error al generar archivo de calendario', 500, message);
  }
}

function isValidDate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}
