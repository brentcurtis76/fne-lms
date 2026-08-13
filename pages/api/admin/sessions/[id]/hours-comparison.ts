/**
 * The §11 comparison read for one session (Z7-5, admin only).
 *
 * Serves the admin panel beside «Ajustar horas descontadas»: the planned/approved
 * value, the Zoom-observed quantities, and the override audit trail. COMPARISON
 * ONLY — nothing here writes anything, and no figure returned by this endpoint can
 * reach `contract_hours_ledger` except through the admin override RPC.
 *
 * Direction-of-failure rules the payload encodes rather than papering over:
 *  · an occurrence still open, or attendance not yet superseded by a complete
 *    report batch, is a STATE (`zoom.state`, `facilitator_presence.state`,
 *    `has_open_intervals`) — never a fabricated number;
 *  · presence minutes come from the merged CLOSED intervals only
 *    (`totalPresenceSeconds`), so an open interval contributes nothing;
 *  · missing instants render as missing.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdmin, createServiceRoleClient } from '../../../../../lib/api-auth';
import { Validators } from '../../../../../lib/types/api-auth.types';
import {
  defaultAttendanceEffectiveStore,
  resolveEffectiveAttendance,
  type EffectiveAttendance,
} from '../../../../../lib/zoom/attendance-effective';
import { totalPresenceSeconds } from '../../../../../lib/zoom/attendance-intervals';

interface FacilitatorPresence {
  user_id: string;
  name: string | null;
  is_lead: boolean;
  /** Whole minutes over the MERGED closed intervals. Null when nothing closed. */
  observed_minutes: number | null;
  /** An interval with no leave — rendered as a state, never counted. */
  has_open_interval: boolean;
}

export interface HoursComparisonPayload {
  session_id: string;
  planned_minutes: number | null;
  ledger: {
    status: string;
    hours: number | null;
    effective_minutes: number | null;
    admin_override: boolean;
  } | null;
  zoom: {
    /** none = never provisioned/started · live = started, no end yet · ended. */
    state: 'none' | 'live' | 'ended';
    actual_started_at: string | null;
    actual_ended_at: string | null;
    elapsed_minutes: number | null;
  };
  attendance: {
    /** report = complete batch effective · webhook_provisional · none. */
    state: 'report' | 'webhook_provisional' | 'none';
    has_open_intervals: boolean;
  };
  facilitator_presence: FacilitatorPresence[];
  overrides: Array<{
    id: string;
    previous_minutes: number | null;
    new_minutes: number | null;
    planned_minutes_snapshot: number | null;
    reason: string;
    reason_category: string;
    created_by: string;
    created_by_name: string | null;
    created_at: string;
    reverses_override_id: string | null;
  }>;
}

function minutesBetween(startIso: string | null, endIso: string | null): number | null {
  if (startIso === null || endIso === null) return null;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 60_000);
}

function presenceFor(
  effective: EffectiveAttendance,
  userId: string
): { observed_minutes: number | null; has_open_interval: boolean } {
  const rows = effective.rows.filter((row) => row.userId === userId);
  const hasOpen = rows.some((row) => row.leftAt === null);
  const seconds = totalPresenceSeconds(
    rows.map((row) => ({ joinedAt: row.joinedAt, leftAt: row.leftAt }))
  );
  return {
    // Zero CLOSED seconds with rows present is still "nothing observed closed":
    // the honest value is null unless something actually closed.
    observed_minutes:
      seconds > 0 ? Math.round(seconds / 60) : rows.some((row) => row.leftAt !== null) ? 0 : null,
    has_open_interval: hasOpen,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);
  if (authError || !user) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  if (!isAdmin) {
    return res.status(403).json({ error: 'Solo administradores' });
  }

  const sessionId = req.query.id;
  if (typeof sessionId !== 'string' || !Validators.isUUID(sessionId)) {
    return res.status(400).json({ error: 'Identificador de sesión inválido' });
  }

  try {
    const serviceClient = createServiceRoleClient();

    const { data: session, error: sessionError } = await serviceClient
      .from('consultor_sessions')
      .select('id, scheduled_duration_minutes, status')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionError) throw new Error(sessionError.message);
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

    const [{ data: ledger }, { data: facilitators }, { data: meeting }, { data: overrides }] =
      await Promise.all([
        serviceClient
          .from('contract_hours_ledger')
          .select('status, hours, effective_minutes, admin_override, planned_minutes_snapshot')
          .eq('session_id', sessionId)
          .maybeSingle(),
        serviceClient
          .from('session_facilitators')
          .select('user_id, is_lead, profiles:user_id(first_name, last_name)')
          .eq('session_id', sessionId),
        serviceClient
          .schema('zoom_internal')
          .from('zoom_meetings')
          .select('zoom_meeting_uuid, status, actual_started_at, actual_ended_at')
          .eq('surface_type', 'consultor_session')
          .eq('surface_id', sessionId)
          .maybeSingle(),
        serviceClient
          .from('session_hour_overrides')
          .select(
            'id, previous_minutes, new_minutes, planned_minutes_snapshot, reason, reason_category, created_by, created_at, reverses_override_id, profiles:created_by(first_name, last_name)'
          )
          .eq('session_id', sessionId)
          .order('seq', { ascending: true }),
      ]);

    const zoomState: HoursComparisonPayload['zoom']['state'] =
      meeting === null || meeting === undefined
        ? 'none'
        : meeting.actual_ended_at !== null
          ? 'ended'
          : meeting.actual_started_at !== null
            ? 'live'
            : 'none';

    // The effective attendance set — the §15.3.9 supersession rule, read-time.
    let effective: EffectiveAttendance = {
      source: 'none',
      provisional: true,
      batchId: null,
      rows: [],
    };
    if (meeting?.zoom_meeting_uuid) {
      effective = await resolveEffectiveAttendance(
        defaultAttendanceEffectiveStore(),
        meeting.zoom_meeting_uuid
      );
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

    const payload: HoursComparisonPayload = {
      session_id: sessionId,
      planned_minutes:
        ledger?.planned_minutes_snapshot ?? session.scheduled_duration_minutes ?? null,
      ledger: ledger
        ? {
            status: ledger.status,
            hours: ledger.hours,
            effective_minutes: ledger.effective_minutes,
            admin_override: ledger.admin_override,
          }
        : null,
      zoom: {
        state: zoomState,
        actual_started_at: meeting?.actual_started_at ?? null,
        actual_ended_at: meeting?.actual_ended_at ?? null,
        elapsed_minutes: minutesBetween(
          meeting?.actual_started_at ?? null,
          meeting?.actual_ended_at ?? null
        ),
      },
      attendance: {
        state:
          effective.source === 'report'
            ? 'report'
            : effective.source === 'webhook'
              ? 'webhook_provisional'
              : 'none',
        has_open_intervals: effective.rows.some((row) => row.leftAt === null),
      },
      facilitator_presence: (facilitators ?? []).map((facilitator) => ({
        user_id: facilitator.user_id,
        name: readName(facilitator.profiles),
        is_lead: facilitator.is_lead,
        ...presenceFor(effective, facilitator.user_id),
      })),
      overrides: (overrides ?? []).map((override) => ({
        id: override.id,
        previous_minutes: override.previous_minutes,
        new_minutes: override.new_minutes,
        planned_minutes_snapshot: override.planned_minutes_snapshot,
        reason: override.reason,
        reason_category: override.reason_category,
        created_by: override.created_by,
        created_by_name: readName(override.profiles),
        created_at: override.created_at,
        reverses_override_id: override.reverses_override_id,
      })),
    };

    return res.status(200).json({ data: payload });
  } catch (error) {
    console.error('[hours-comparison] failed:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
}
