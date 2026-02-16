import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createServiceRoleClient,
  sendAuthError,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../../lib/api-auth';
import { Validators } from '../../../../../lib/types/api-auth.types';
import { createSessionCalendar, generateExportFilename, ICalSessionInput } from '../../../../../lib/utils/session-ical';
import type { SessionStatus } from '../../../../../lib/types/consultor-sessions.types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-series-ical');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { groupId } = req.query;

  if (!groupId || typeof groupId !== 'string' || !Validators.isUUID(groupId)) {
    return sendAuthError(res, 'ID de grupo inválido', 400);
  }

  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden exportar series de sesiones', 403);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Query sessions in the recurrence group
    const { data: sessions, error: queryError } = await serviceClient
      .from('consultor_sessions')
      .select(
        'id, title, description, objectives, session_date, start_time, end_time, status, location, meeting_link, schools(name), growth_communities(name), session_facilitators(profiles(first_name, last_name, email))'
      )
      .eq('recurrence_group_id', groupId)
      .eq('is_active', true)
      .order('session_number', { ascending: true });

    if (queryError) {
      console.error('Database error fetching series sessions:', queryError);
      return sendAuthError(res, 'Error al obtener sesiones de la serie', 500, queryError.message);
    }

    if (!sessions || sessions.length === 0) {
      // Empty group returns 200 with empty calendar
      const emptyCalendar = createSessionCalendar([], `Serie: ${groupId}`);
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="serie-vacia.ics"`
      );
      return res.status(200).send(emptyCalendar.toString());
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
    const calendar = createSessionCalendar(
      icalSessions,
      `Serie de Sesiones: ${icalSessions[0]?.title || 'Series de Capacitación'}`
    );

    // Generate filename
    const filename = generateExportFilename(sessions.length, `serie-${groupId.substring(0, 8)}`);

    // Set response headers
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    // Send iCal content
    res.status(200).send(calendar.toString());
  } catch (error: unknown) {
    console.error('Error generating series iCal:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error al generar archivo de calendario de serie', 500, message);
  }
}
