/**
 * Zoom attendance SUGGESTIONS for one session (Z7-5).
 *
 * Read-only: the panel proposes, the facilitator confirms, and the ONLY mutation
 * path stays the existing `PUT /api/sessions/[id]/attendees` — one authorization
 * decision for writing attendance, not two.
 *
 * Visibility follows the §7 `zoom_attendance` row: admin, or the facilitator of
 * THIS session — a consultor reaches Zoom attendance only by being its
 * facilitator, never by school scope. Everyone else gets the same not-found the
 * session surfaces use (no existence oracle).
 *
 * ## Direction of failure (§15.3.5 / §15.3.9)
 *
 * A row matched to the wrong person is the defect; an unmatched row is correct
 * behaviour a facilitator resolves by hand. So:
 *  · `present` is suggested only for rows whose `user_id` the ingestion matched;
 *  · `absent` is suggested ONLY under a complete report batch — the authoritative
 *    set saying someone is not in it is data. Under provisional webhook rows an
 *    absent expected attendee is `no_data`, because a missed join webhook must
 *    not become a suggested absence;
 *  · open intervals surface as a STATE (`has_open_interval`), never as minutes;
 *  · rows the ingestion could not attribute are listed for the facilitator with
 *    exactly the evidence Zoom presented (display name), matched to nobody.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
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
import { sendSessionNotFound } from '../../../../lib/utils/session-denials';
import {
  defaultAttendanceEffectiveStore,
  resolveEffectiveAttendance,
  type EffectiveAttendance,
} from '../../../../lib/zoom/attendance-effective';
import { totalPresenceSeconds } from '../../../../lib/zoom/attendance-intervals';

export type SuggestionState = 'report' | 'webhook_provisional' | 'none' | 'no_meeting';

export interface AttendanceSuggestion {
  user_id: string;
  name: string | null;
  expected: boolean;
  attended_current: boolean | null;
  /** present = matched rows exist · absent = authoritative report has none · no_data. */
  suggestion: 'present' | 'absent' | 'no_data';
  observed_minutes: number | null;
  has_open_interval: boolean;
}

export interface UnmatchedRow {
  display_name: string | null;
  observed_minutes: number | null;
  has_open_interval: boolean;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-attendance-suggestions');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de sesión inválido', 400);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    const { data: session, error: sessionError } = await serviceClient
      .from('consultor_sessions')
      .select('id, school_id')
      .eq('id', id)
      .maybeSingle();
    if (sessionError) throw new Error(sessionError.message);
    if (!session) return sendSessionNotFound(res);

    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);
    if (!highestRole) {
      return sendAuthError(res, 'Usuario sin roles asignados', 403);
    }

    const { data: facilitatorCheck } = await serviceClient
      .from('session_facilitators')
      .select('id')
      .eq('session_id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    // The §7 zoom_attendance row: admin all; the facilitator of this surface; a
    // consultor ONLY by being its facilitator. Everyone else: not-found.
    const isAdmin = highestRole === 'admin';
    if (!isAdmin && !facilitatorCheck) {
      return sendSessionNotFound(res);
    }

    const [{ data: attendees, error: attendeesError }, { data: meeting, error: meetingError }] =
      await Promise.all([
        serviceClient
          .from('session_attendees')
          .select('user_id, expected, attended, profiles:user_id(first_name, last_name)')
          .eq('session_id', id),
        serviceClient
          .schema('zoom_internal')
          .from('zoom_meetings')
          .select('zoom_meeting_uuid')
          .eq('surface_type', 'consultor_session')
          .eq('surface_id', id)
          .maybeSingle(),
      ]);
    if (attendeesError) throw new Error(attendeesError.message);
    if (meetingError) throw new Error(meetingError.message);

    let effective: EffectiveAttendance = {
      source: 'none',
      provisional: true,
      batchId: null,
      rows: [],
    };
    let state: SuggestionState = 'no_meeting';
    if (meeting?.zoom_meeting_uuid) {
      effective = await resolveEffectiveAttendance(
        defaultAttendanceEffectiveStore(),
        meeting.zoom_meeting_uuid
      );
      state =
        effective.source === 'report'
          ? 'report'
          : effective.source === 'webhook'
            ? 'webhook_provisional'
            : 'none';
    }

    const readName = (joined: unknown): string | null => {
      const profile = Array.isArray(joined) ? joined[0] : joined;
      if (!profile || typeof profile !== 'object') return null;
      const { first_name, last_name } = profile as {
        first_name?: string | null;
        last_name?: string | null;
      };
      const name = [first_name, last_name].filter(Boolean).join(' ');
      return name.length > 0 ? name : null;
    };

    const presenceOf = (rows: EffectiveAttendance['rows']) => {
      const seconds = totalPresenceSeconds(
        rows.map((row) => ({ joinedAt: row.joinedAt, leftAt: row.leftAt }))
      );
      const hasClosed = rows.some((row) => row.leftAt !== null);
      return {
        observed_minutes: seconds > 0 ? Math.round(seconds / 60) : hasClosed ? 0 : null,
        has_open_interval: rows.some((row) => row.leftAt === null),
      };
    };

    const suggestions: AttendanceSuggestion[] = (attendees ?? []).map((attendee) => {
      const rows = effective.rows.filter((row) => row.userId === attendee.user_id);
      const presence = presenceOf(rows);
      let suggestion: AttendanceSuggestion['suggestion'] = 'no_data';
      if (rows.length > 0) {
        suggestion = 'present';
      } else if (state === 'report') {
        // Only the COMPLETE report may suggest an absence — its silence is data.
        suggestion = 'absent';
      }
      return {
        user_id: attendee.user_id,
        name: readName(attendee.profiles),
        expected: attendee.expected,
        attended_current: attendee.attended,
        suggestion,
        ...presence,
      };
    });

    const attendeeIds = new Set((attendees ?? []).map((attendee) => attendee.user_id));
    const unmatchedByName = new Map<string, EffectiveAttendance['rows']>();
    for (const row of effective.rows) {
      if (row.userId !== null && attendeeIds.has(row.userId)) continue;
      const key = row.displayName ?? '(sin nombre)';
      unmatchedByName.set(key, [...(unmatchedByName.get(key) ?? []), row]);
    }
    const unmatched_rows: UnmatchedRow[] = [...unmatchedByName.entries()].map(
      ([displayName, rows]) => ({
        display_name: displayName === '(sin nombre)' ? null : displayName,
        ...presenceOf(rows),
      })
    );

    return sendApiResponse(res, {
      state,
      provisional: effective.provisional,
      suggestions,
      unmatched_rows,
    });
  } catch (error) {
    console.error('[attendance-suggestions] failed:', error);
    return sendAuthError(res, 'Error interno', 500);
  }
}
