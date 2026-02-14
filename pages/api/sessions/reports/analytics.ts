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
import { SessionStatus } from '../../../../lib/types/consultor-sessions.types';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

interface SessionAnalyticsKPIs {
  total_sessions: number;
  completed_sessions: number;
  cancelled_sessions: number;
  completion_rate: number;
  total_hours_scheduled: number;
  total_hours_actual: number;
  avg_attendance_rate: number;
  sessions_pending_report: number;
  upcoming_sessions: number;
}

interface StatusDistributionItem {
  status: string;
  count: number;
}

interface ModalityDistributionItem {
  modality: string;
  count: number;
}

interface SessionsByMonthItem {
  month: string;
  total: number;
  completed: number;
  cancelled: number;
}

interface SessionsBySchoolItem {
  school_id: number;
  school_name: string;
  total: number;
  completed: number;
}

interface AttendanceTrendsItem {
  month: string;
  avg_attendance_rate: number;
  total_expected: number;
  total_attended: number;
}

interface TopConsultantItem {
  user_id: string;
  name: string;
  sessions_led: number;
  avg_attendance: number;
}

interface RecentSessionItem {
  id: string;
  title: string;
  session_date: string;
  status: SessionStatus;
  school_name: string;
  gc_name: string;
  attendance_rate: number | null;
}

interface SessionAnalyticsResponse {
  kpis: SessionAnalyticsKPIs;
  status_distribution: StatusDistributionItem[];
  modality_distribution: ModalityDistributionItem[];
  sessions_by_month: SessionsByMonthItem[];
  sessions_by_school: SessionsBySchoolItem[];
  attendance_trends: AttendanceTrendsItem[];
  top_consultants?: TopConsultantItem[];
  recent_sessions: RecentSessionItem[];
}

// Raw row types from Supabase queries
interface SessionRow {
  id: string;
  title: string;
  session_date: string;
  status: SessionStatus;
  modality: string;
  school_id: number;
  growth_community_id: string;
  scheduled_duration_minutes: number | null;
  actual_duration_minutes: number | null;
}

interface AttendeeRow {
  session_id: string;
  expected: boolean;
  attended: boolean | null;
}

interface FacilitatorRow {
  session_id: string;
  user_id: string;
  is_lead: boolean;
}

interface SchoolRow {
  id: number;
  name: string;
}

interface GCRow {
  id: string;
  name: string;
}

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

// ============================================================
// HANDLER
// ============================================================

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'session-reports-analytics');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  // Authenticate
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  // Get user role
  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  const highestRole = getHighestRole(userRoles);

  if (!highestRole || !['admin', 'consultor'].includes(highestRole)) {
    return sendAuthError(res, 'Acceso denegado. Solo administradores y consultores pueden ver reportes de sesiones.', 403);
  }

  const isAdmin = highestRole === 'admin';

  // Parse and validate query params
  const {
    school_id,
    growth_community_id,
    date_from,
    date_to,
    consultant_id,
  } = req.query;

  let schoolIdFilter: number | null = null;
  if (school_id) {
    schoolIdFilter = parseInt(school_id as string, 10);
    if (isNaN(schoolIdFilter)) {
      return sendAuthError(res, 'school_id debe ser un entero válido', 400);
    }
  }

  if (growth_community_id && !Validators.isUUID(growth_community_id as string)) {
    return sendAuthError(res, 'growth_community_id debe ser un UUID válido', 400);
  }

  if (consultant_id) {
    if (!isAdmin) {
      return sendAuthError(res, 'Solo administradores pueden filtrar por consultant_id', 403);
    }
    if (!Validators.isUUID(consultant_id as string)) {
      return sendAuthError(res, 'consultant_id debe ser un UUID válido', 400);
    }
  }

  try {
    // ============================================================
    // STEP 1: Determine accessible session IDs
    // ============================================================
    let sessionIdFilter: string[] | null = null;

    if (!isAdmin) {
      // Consultant: only sessions where they are a facilitator
      const { data: facilitatorSessions, error: facError } = await serviceClient
        .from('session_facilitators')
        .select('session_id')
        .eq('user_id', user.id);

      if (facError) {
        return sendAuthError(res, 'Error al obtener sesiones del consultor', 500);
      }

      sessionIdFilter = (facilitatorSessions || []).map((f: { session_id: string }) => f.session_id);

      if (sessionIdFilter.length === 0) {
        return sendApiResponse(res, buildEmptyResponse());
      }
    } else if (consultant_id) {
      // Admin filtering by a specific consultant
      const { data: consultantSessions, error: csError } = await serviceClient
        .from('session_facilitators')
        .select('session_id')
        .eq('user_id', consultant_id as string);

      if (csError) {
        return sendAuthError(res, 'Error al filtrar por consultor', 500);
      }

      sessionIdFilter = (consultantSessions || []).map((f: { session_id: string }) => f.session_id);

      if (sessionIdFilter.length === 0) {
        return sendApiResponse(res, buildEmptyResponse());
      }
    }

    // ============================================================
    // STEP 2: Fetch all filtered sessions
    // ============================================================
    let sessionsQuery = serviceClient
      .from('consultor_sessions')
      .select('id, title, session_date, status, modality, school_id, growth_community_id, scheduled_duration_minutes, actual_duration_minutes')
      .eq('is_active', true);

    if (sessionIdFilter) {
      sessionsQuery = sessionsQuery.in('id', sessionIdFilter);
    }

    if (schoolIdFilter !== null) {
      sessionsQuery = sessionsQuery.eq('school_id', schoolIdFilter);
    }

    if (growth_community_id) {
      sessionsQuery = sessionsQuery.eq('growth_community_id', growth_community_id as string);
    }

    if (date_from) {
      sessionsQuery = sessionsQuery.gte('session_date', date_from as string);
    }

    if (date_to) {
      sessionsQuery = sessionsQuery.lte('session_date', date_to as string);
    }

    const { data: sessionsData, error: sessionsError } = await sessionsQuery;

    if (sessionsError) {
      return sendAuthError(res, 'Error al obtener sesiones', 500);
    }

    const sessions: SessionRow[] = sessionsData || [];

    if (sessions.length === 0) {
      return sendApiResponse(res, buildEmptyResponse());
    }

    const allSessionIds = sessions.map((s) => s.id);

    // ============================================================
    // STEP 3: Parallel queries for related data
    // ============================================================
    const uniqueSchoolIds = [...new Set(sessions.map((s) => s.school_id).filter(Boolean))];
    const uniqueGCIds = [...new Set(sessions.map((s) => s.growth_community_id).filter(Boolean))];

    const [attendeesResult, facilitatorsResult, schoolsResult, gcsResult] = await Promise.all([
      // Attendees
      serviceClient
        .from('session_attendees')
        .select('session_id, expected, attended')
        .in('session_id', allSessionIds),

      // Facilitators (for top_consultants)
      isAdmin
        ? serviceClient
            .from('session_facilitators')
            .select('session_id, user_id, is_lead')
            .in('session_id', allSessionIds)
            .eq('is_lead', true)
        : Promise.resolve({ data: [] as FacilitatorRow[], error: null }),

      // Schools
      uniqueSchoolIds.length > 0
        ? serviceClient.from('schools').select('id, name').in('id', uniqueSchoolIds)
        : Promise.resolve({ data: [] as SchoolRow[], error: null }),

      // Growth Communities
      uniqueGCIds.length > 0
        ? serviceClient.from('growth_communities').select('id, name').in('id', uniqueGCIds)
        : Promise.resolve({ data: [] as GCRow[], error: null }),
    ]);

    const attendees: AttendeeRow[] = (attendeesResult.data || []) as AttendeeRow[];
    const facilitators: FacilitatorRow[] = (facilitatorsResult.data || []) as FacilitatorRow[];
    const schoolsMap = new Map<number, string>();
    ((schoolsResult.data || []) as SchoolRow[]).forEach((s) => schoolsMap.set(s.id, s.name));
    const gcsMap = new Map<string, string>();
    ((gcsResult.data || []) as GCRow[]).forEach((g) => gcsMap.set(g.id, g.name));

    // ============================================================
    // STEP 4: Compute KPIs
    // ============================================================
    const totalSessions = sessions.length;
    const completedSessions = sessions.filter((s) => s.status === 'completada').length;
    const cancelledSessions = sessions.filter((s) => s.status === 'cancelada').length;

    const completionDenominator = completedSessions + cancelledSessions;
    const completionRate = completionDenominator === 0
      ? 0
      : Math.round((completedSessions / completionDenominator) * 100 * 10) / 10;

    const totalHoursScheduled = Math.round(
      sessions.reduce((sum, s) => sum + (s.scheduled_duration_minutes || 0), 0) / 60 * 10
    ) / 10;

    const totalHoursActual = Math.round(
      sessions.reduce((sum, s) => sum + (s.actual_duration_minutes || 0), 0) / 60 * 10
    ) / 10;

    const sessionsPendingReport = sessions.filter((s) => s.status === 'pendiente_informe').length;

    const today = new Date().toISOString().split('T')[0];
    const upcomingSessions = sessions.filter(
      (s) => ['programada', 'en_progreso'].includes(s.status) && s.session_date >= today
    ).length;

    // Compute attendance rate per session, then average
    const attendeesBySession = new Map<string, { expected: number; attended: number }>();
    for (const att of attendees) {
      if (!att.expected) continue; // Only count expected attendees
      if (!attendeesBySession.has(att.session_id)) {
        attendeesBySession.set(att.session_id, { expected: 0, attended: 0 });
      }
      const entry = attendeesBySession.get(att.session_id)!;
      entry.expected++;
      if (att.attended === true) {
        entry.attended++;
      }
    }

    const sessionAttendanceRates: { sessionId: string; rate: number }[] = [];
    for (const [sessionId, data] of attendeesBySession.entries()) {
      if (data.expected > 0) {
        sessionAttendanceRates.push({
          sessionId,
          rate: (data.attended / data.expected) * 100,
        });
      }
    }

    const avgAttendanceRate = sessionAttendanceRates.length === 0
      ? 0
      : Math.round(
          (sessionAttendanceRates.reduce((sum, r) => sum + r.rate, 0) / sessionAttendanceRates.length) * 10
        ) / 10;

    const kpis: SessionAnalyticsKPIs = {
      total_sessions: totalSessions,
      completed_sessions: completedSessions,
      cancelled_sessions: cancelledSessions,
      completion_rate: completionRate,
      total_hours_scheduled: totalHoursScheduled,
      total_hours_actual: totalHoursActual,
      avg_attendance_rate: avgAttendanceRate,
      sessions_pending_report: sessionsPendingReport,
      upcoming_sessions: upcomingSessions,
    };

    // ============================================================
    // STEP 5: Compute distributions and chart data
    // ============================================================

    // Status distribution
    const statusCounts = new Map<string, number>();
    for (const s of sessions) {
      statusCounts.set(s.status, (statusCounts.get(s.status) || 0) + 1);
    }
    const statusDistribution: StatusDistributionItem[] = Array.from(statusCounts.entries())
      .map(([status, count]) => ({ status, count }));

    // Modality distribution
    const modalityCounts = new Map<string, number>();
    for (const s of sessions) {
      modalityCounts.set(s.modality, (modalityCounts.get(s.modality) || 0) + 1);
    }
    const modalityDistribution: ModalityDistributionItem[] = Array.from(modalityCounts.entries())
      .map(([modality, count]) => ({ modality, count }));

    // Sessions by month
    const monthData = new Map<string, { total: number; completed: number; cancelled: number }>();
    for (const s of sessions) {
      const month = s.session_date.substring(0, 7); // YYYY-MM
      if (!monthData.has(month)) {
        monthData.set(month, { total: 0, completed: 0, cancelled: 0 });
      }
      const entry = monthData.get(month)!;
      entry.total++;
      if (s.status === 'completada') entry.completed++;
      if (s.status === 'cancelada') entry.cancelled++;
    }
    const sessionsByMonth: SessionsByMonthItem[] = Array.from(monthData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }));

    // Sessions by school
    const schoolData = new Map<number, { total: number; completed: number }>();
    for (const s of sessions) {
      if (!s.school_id) continue;
      if (!schoolData.has(s.school_id)) {
        schoolData.set(s.school_id, { total: 0, completed: 0 });
      }
      const entry = schoolData.get(s.school_id)!;
      entry.total++;
      if (s.status === 'completada') entry.completed++;
    }
    const sessionsBySchool: SessionsBySchoolItem[] = Array.from(schoolData.entries())
      .map(([school_id, data]) => ({
        school_id,
        school_name: schoolsMap.get(school_id) || `Escuela ${school_id}`,
        ...data,
      }))
      .sort((a, b) => b.total - a.total);

    // Attendance trends by month
    const monthAttendance = new Map<string, { totalExpected: number; totalAttended: number }>();
    for (const s of sessions) {
      const month = s.session_date.substring(0, 7);
      const sessionAtt = attendeesBySession.get(s.id);
      if (!sessionAtt) continue;
      if (!monthAttendance.has(month)) {
        monthAttendance.set(month, { totalExpected: 0, totalAttended: 0 });
      }
      const entry = monthAttendance.get(month)!;
      entry.totalExpected += sessionAtt.expected;
      entry.totalAttended += sessionAtt.attended;
    }
    const attendanceTrends: AttendanceTrendsItem[] = Array.from(monthAttendance.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        avg_attendance_rate: data.totalExpected === 0
          ? 0
          : Math.round((data.totalAttended / data.totalExpected) * 100 * 10) / 10,
        total_expected: data.totalExpected,
        total_attended: data.totalAttended,
      }));

    // ============================================================
    // STEP 6: Top consultants (admin only)
    // ============================================================
    let topConsultants: TopConsultantItem[] | undefined;

    if (isAdmin && facilitators.length > 0) {
      // Group facilitator sessions by user
      const consultantData = new Map<string, { sessions: string[] }>();
      for (const f of facilitators) {
        if (!consultantData.has(f.user_id)) {
          consultantData.set(f.user_id, { sessions: [] });
        }
        consultantData.get(f.user_id)!.sessions.push(f.session_id);
      }

      // Fetch profiles for lead facilitators
      const consultantUserIds = Array.from(consultantData.keys());
      const { data: profilesData } = await serviceClient
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', consultantUserIds);

      const profilesMap = new Map<string, string>();
      ((profilesData || []) as ProfileRow[]).forEach((p) => {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Sin nombre';
        profilesMap.set(p.id, name);
      });

      topConsultants = Array.from(consultantData.entries())
        .map(([userId, data]) => {
          // Calculate avg attendance for this consultant's sessions
          let totalRate = 0;
          let rateCount = 0;
          for (const sessionId of data.sessions) {
            const att = attendeesBySession.get(sessionId);
            if (att && att.expected > 0) {
              totalRate += (att.attended / att.expected) * 100;
              rateCount++;
            }
          }

          return {
            user_id: userId,
            name: profilesMap.get(userId) || 'Sin nombre',
            sessions_led: data.sessions.length,
            avg_attendance: rateCount === 0
              ? 0
              : Math.round((totalRate / rateCount) * 10) / 10,
          };
        })
        .sort((a, b) => b.sessions_led - a.sessions_led)
        .slice(0, 10);
    }

    // ============================================================
    // STEP 7: Recent sessions
    // ============================================================
    const recentSessions: RecentSessionItem[] = sessions
      .filter((s) => s.status === 'completada' || s.status === 'pendiente_informe')
      .sort((a, b) => b.session_date.localeCompare(a.session_date))
      .slice(0, 10)
      .map((s) => {
        const att = attendeesBySession.get(s.id);
        const attendanceRate = att && att.expected > 0
          ? Math.round((att.attended / att.expected) * 100)
          : null;

        return {
          id: s.id,
          title: s.title,
          session_date: s.session_date,
          status: s.status,
          school_name: schoolsMap.get(s.school_id) || '',
          gc_name: gcsMap.get(s.growth_community_id) || '',
          attendance_rate: attendanceRate,
        };
      });

    // ============================================================
    // STEP 8: Build response
    // ============================================================
    const response: SessionAnalyticsResponse = {
      kpis,
      status_distribution: statusDistribution,
      modality_distribution: modalityDistribution,
      sessions_by_month: sessionsByMonth,
      sessions_by_school: sessionsBySchool,
      attendance_trends: attendanceTrends,
      recent_sessions: recentSessions,
    };

    // Only include top_consultants for admin
    if (isAdmin && topConsultants) {
      response.top_consultants = topConsultants;
    }

    return sendApiResponse(res, response);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al generar reportes de sesiones', 500, errorMessage);
  }
}

// ============================================================
// HELPERS
// ============================================================

function buildEmptyResponse(): SessionAnalyticsResponse {
  return {
    kpis: {
      total_sessions: 0,
      completed_sessions: 0,
      cancelled_sessions: 0,
      completion_rate: 0,
      total_hours_scheduled: 0,
      total_hours_actual: 0,
      avg_attendance_rate: 0,
      sessions_pending_report: 0,
      upcoming_sessions: 0,
    },
    status_distribution: [],
    modality_distribution: [],
    sessions_by_month: [],
    sessions_by_school: [],
    attendance_trends: [],
    recent_sessions: [],
  };
}
