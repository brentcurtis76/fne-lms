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
import {
  buildSessionJoinPath,
  canViewParticipantEmails,
  sessionOffersPlatformJoin,
} from '../../../../lib/utils/session-disclosure';
import { canViewSession, SessionAccessContext } from '../../../../lib/utils/session-policy';
import { sendSessionNotFound } from '../../../../lib/utils/session-denials';
import { buildAbsoluteUrl } from '../../../../lib/utils/app-url';

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
      .select('*, schools!consultor_sessions_school_id_fkey(name), growth_communities(name)')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (sessionError || !session) {
      return sendSessionNotFound(res);
    }

    // Determine user role
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (!highestRole) {
      return sendAuthError(res, 'Usuario sin roles asignados', 403);
    }

    // Fetch facilitators — needed both for the access context and (for
    // privileged callers only) for the ATTENDEE entries.
    const { data: facilitators, error: facilitatorsError } = await serviceClient
      .from('session_facilitators')
      .select('*, profiles(first_name, last_name, email)')
      .eq('session_id', id);

    if (facilitatorsError) {
      console.error('Error fetching facilitators:', facilitatorsError);
      return sendAuthError(res, 'Error al obtener facilitadores', 500);
    }

    // Authorization via the canonical policy helper — same context the session
    // GETs build. The previous inline check granted GC access on any
    // community_id match, ignoring is_active.
    const accessContext: SessionAccessContext = {
      highestRole,
      userRoles,
      session: {
        id: session.id,
        school_id: session.school_id,
        growth_community_id: session.growth_community_id,
        status: session.status,
      },
      userId: user.id,
      isFacilitator: (facilitators || []).some(
        (f: { user_id?: string }) => f?.user_id === user.id
      ),
    };

    // Denied views are indistinguishable from a missing session — see
    // `sendSessionNotFound`. Do NOT restore a 403 here: the status difference
    // alone is an existence oracle.
    if (!canViewSession(accessContext)) {
      return sendSessionNotFound(res);
    }

    // ATTENDEE carries personal e-mail addresses into a file that leaves the
    // platform — same rule as every other participant e-mail.
    const includeAttendees = canViewParticipantEmails(accessContext);

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
      // Platform link only — the raw meeting_link never leaves in an .ics,
      // and a managed session has no meeting_link to test (§8).
      join_url: sessionOffersPlatformJoin(session)
        ? buildAbsoluteUrl(buildSessionJoinPath(session.id), req)
        : undefined,
      status: session.status,
      // Row timestamps drive SEQUENCE; without them a client ignores every revision
      created_at: session.created_at ?? null,
      updated_at: session.updated_at ?? null,
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
    const calendar = createSessionCalendar([icalSession], `Sesión: ${session.title}`, {
      includeAttendees,
    });
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
