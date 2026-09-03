import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  sendMeetingError,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../lib/api-auth';
import { ApiError, ApiSuccess, Validators } from '../../../lib/types/api-auth.types';
import { getUserRoles, getHighestRole } from '../../../utils/roleUtils';
import {
  ConsultorSessionInsert,
  SessionFacilitatorInsert,
  SessionActivityLogInsert,
  MeetingProvider,
  RecurrencePattern,
} from '../../../lib/types/consultor-sessions.types';
import { generateRecurrenceDates, buildRRule } from '../../../lib/utils/recurrence';
import { validateFacilitatorIntegrity } from '../../../lib/utils/facilitator-validation';
import { checkZoomRolloutPolicy } from '../../../lib/zoom/provisioning-intent';
import {
  isOperatorTenant,
  readSchoolTenantControls,
  type SchoolTenantControls,
  type SchoolTenantControlsLookup,
} from '../../../lib/types/tenant-kind';
import { SessionAccessContext } from '../../../lib/utils/session-policy';
import { buildSessionScope, hidesDraftSessions } from '../../../lib/utils/session-scope';
import {
  applySessionMeetingDisclosure,
  canViewParticipantEmails,
  redactProfileEmails,
} from '../../../lib/utils/session-disclosure';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-index');

  switch (req.method) {
    case 'POST':
      return await handlePost(req, res);
    case 'GET':
      return await handleGet(req, res);
    default:
      return handleMethodNotAllowed(res, ['GET', 'POST']);
  }
}

/**
 * POST /api/sessions
 * Create a new session (admin only)
 */
async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!user) {
    return sendAuthError(res, 'No autenticado', 401);
  }
  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden crear sesiones', 403);
  }

  const {
    school_id,
    growth_community_id,
    title,
    description,
    objectives,
    session_date,
    start_time,
    end_time,
    modality,
    meeting_link,
    meeting_provider,
    location,
    program_enrollment_id,
    facilitators,
    recurrence,
    hour_type_key,
    contrato_id,
    is_zoom_managed,
  } = req.body;

  // Validate required fields
  if (!school_id || typeof school_id !== 'number' || school_id <= 0) {
    return sendAuthError(res, 'school_id debe ser un entero positivo', 400);
  }

  if (!growth_community_id || !Validators.isUUID(growth_community_id)) {
    return sendAuthError(res, 'growth_community_id debe ser un UUID válido', 400);
  }

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return sendAuthError(res, 'title es requerido y no puede estar vacío', 400);
  }

  if (!session_date || !isValidDate(session_date)) {
    return sendAuthError(res, 'session_date debe ser una fecha válida (YYYY-MM-DD)', 400);
  }

  if (!start_time || !isValidTime(start_time)) {
    return sendAuthError(res, 'start_time debe ser una hora válida (HH:MM:SS)', 400);
  }

  if (!end_time || !isValidTime(end_time)) {
    return sendAuthError(res, 'end_time debe ser una hora válida (HH:MM:SS)', 400);
  }

  if (!isTimeAfter(end_time, start_time)) {
    return sendAuthError(res, 'end_time debe ser posterior a start_time', 400);
  }

  if (!modality || !['presencial', 'online', 'hibrida'].includes(modality)) {
    return sendAuthError(res, 'modality debe ser presencial, online, o hibrida', 400);
  }

  // Zoom plan §8: durable managed intent. The link does not exist yet at creation time —
  // the meeting is provisioned asynchronously at approval — so a managed session is
  // exempt from the meeting_link requirement below and stores a NULL link on purpose.
  if (is_zoom_managed !== undefined && typeof is_zoom_managed !== 'boolean') {
    return sendAuthError(res, 'is_zoom_managed debe ser un booleano', 400);
  }

  const isZoomManaged = is_zoom_managed === true;

  if (isZoomManaged && modality !== 'online' && modality !== 'hibrida') {
    return sendAuthError(
      res,
      'Solo las sesiones online o híbridas pueden usar una reunión Zoom gestionada por la plataforma',
      400
    );
  }

  // Conditional validation
  if (!isZoomManaged && (modality === 'online' || modality === 'hibrida') && !meeting_link) {
    return sendAuthError(res, 'meeting_link es requerido para modalidad online o hibrida', 400);
  }

  if ((modality === 'presencial' || modality === 'hibrida') && !location) {
    return sendAuthError(res, 'location es requerido para modalidad presencial o hibrida', 400);
  }

  // Hour tracking is a pair, never two independent optionals. Only both absent
  // is the genuine legacy form; every tracked session carries both validated values.
  const hourTrackingAbsent = hour_type_key == null && contrato_id == null;
  const hourTrackingValid =
    typeof hour_type_key === 'string' && hour_type_key.trim().length > 0 &&
    typeof contrato_id === 'string' && Validators.isUUID(contrato_id);
  if (!hourTrackingAbsent && !hourTrackingValid) {
    return sendAuthError(
      res,
      'El contrato y el tipo de hora deben configurarse juntos.',
      400
    );
  }

  // Auto-detect meeting_provider from meeting_link if not provided
  let finalMeetingProvider: MeetingProvider | null = meeting_provider || null;
  if (meeting_link && !finalMeetingProvider) {
    finalMeetingProvider = detectMeetingProvider(meeting_link);
  }
  // Managed intent forces the provider: §8/ledger item 21 spells it `'zoom'` — the live
  // CHECK constraint has no 'zoom_managed' value and must not grow one.
  if (isZoomManaged) {
    finalMeetingProvider = 'zoom';
  }

  // Validate and process recurrence if provided
  let sessionDates: string[] = [session_date];
  let recurrenceGroupId: string | null = null;
  let recurrenceRule: string | null = null;

  if (recurrence) {
    try {
      const pattern: RecurrencePattern = recurrence;

      // Validate recurrence pattern
      if (pattern.frequency === 'custom') {
        if (!pattern.dates || pattern.dates.length < 2 || pattern.dates.length > 52) {
          return sendAuthError(res, 'Las fechas personalizadas deben tener entre 2 y 52 elementos', 400);
        }
        // Validate all dates are in the future
        const today = new Date().toISOString().split('T')[0];
        const futureDates = pattern.dates.filter(d => d >= today);
        if (futureDates.length !== pattern.dates.length) {
          return sendAuthError(res, 'Todas las fechas deben ser futuras', 400);
        }
      } else {
        if (!pattern.count || pattern.count < 2 || pattern.count > 52) {
          return sendAuthError(res, 'El número de sesiones debe estar entre 2 y 52', 400);
        }
      }

      // Generate dates
      sessionDates = generateRecurrenceDates(session_date, pattern);
      recurrenceGroupId = crypto.randomUUID();
      recurrenceRule = buildRRule(pattern);
    } catch (error: any) {
      return sendAuthError(res, `Error en recurrencia: ${error.message}`, 400);
    }
  }

  try {
    const serviceClient = createServiceRoleClient();

    // FNE Zoom internal test plan §4.1: the selected school's row is the ONLY authority on
    // tenant classification. One exact-id lookup, before any mutation; an unknown school,
    // a lookup error or an unrecognised tenant kind all refuse. Client and QA tenants
    // continue below unchanged; an operator tenant must additionally satisfy
    // `checkOperatorSessionRequest`. The Unit A database triggers remain the final
    // service-role boundary behind this — they are not a reason to skip it.
    const schoolLookup = await readSchoolTenantControls(serviceClient, school_id);
    if (schoolLookup.status !== 'found') {
      return refuseSchoolLookup(res, schoolLookup);
    }

    const operatorRefusal = checkOperatorSessionRequest(
      schoolLookup.school,
      {
        modality,
        isZoomManaged,
        meetingProvider: finalMeetingProvider,
        contratoId: contrato_id,
        hourTypeKey: hour_type_key,
        programEnrollmentId: program_enrollment_id,
      },
      process.env
    );
    if (operatorRefusal !== null) {
      return sendMeetingError(res, operatorRefusal.status, operatorRefusal.code, operatorRefusal.message);
    }

    // Validate facilitators (hard-block)
    const facilitatorValidation = await validateFacilitatorIntegrity(
      serviceClient,
      facilitators,
      school_id
    );

    if (!facilitatorValidation.valid) {
      return sendAuthError(res, facilitatorValidation.errors.join('; '), 400);
    }

    // Verify growth community belongs to the specified school
    const { data: gcCheck, error: gcCheckError } = await serviceClient
      .from('growth_communities')
      .select('id')
      .eq('id', growth_community_id)
      .eq('school_id', school_id)
      .single();

    if (gcCheckError || !gcCheck) {
      return sendAuthError(res, 'La comunidad de crecimiento no pertenece al colegio seleccionado', 400);
    }

    // Build base session data (shared across all sessions in series)
    const baseSessionData = {
      school_id,
      growth_community_id,
      title: title.trim(),
      description: description || null,
      objectives: objectives || null,
      start_time,
      end_time,
      modality,
      // §8: a managed session never carries a raw Zoom link on the source row.
      meeting_link: isZoomManaged ? null : (meeting_link || null),
      meeting_provider: finalMeetingProvider,
      is_zoom_managed: isZoomManaged,
      location: location || null,
      program_enrollment_id: program_enrollment_id || null,
      status: 'borrador' as const,
      created_by: user!.id,
      meeting_summary: null,
      meeting_transcript: null,
      cancellation_reason: null,
      actual_duration_minutes: null,
      // Hour tracking fields (optional — null for legacy sessions)
      hour_type_key: hourTrackingValid ? hour_type_key.trim() : null,
      contrato_id: hourTrackingValid ? contrato_id : null,
    };

    // Build session insert array (one per date)
    // RRULE stored only on the first instance (source of truth for the series)
    const sessionsToInsert: ConsultorSessionInsert[] = sessionDates.map((date, index) => ({
      ...baseSessionData,
      session_date: date,
      recurrence_rule: index === 0 ? recurrenceRule : null,
      recurrence_group_id: recurrenceGroupId,
      session_number: sessionDates.length > 1 ? index + 1 : null,
    }));

    // Insert all sessions in one call (atomic at Postgres level)
    const { data: newSessions, error: sessionError } = await serviceClient
      .from('consultor_sessions')
      .insert(sessionsToInsert)
      .select('*');

    if (sessionError || !newSessions) {
      console.error('Database error creating sessions:', sessionError);
      return sendAuthError(res, 'Error al crear sesiones', 500, sessionError?.message);
    }

    // Insert facilitators for all sessions if provided
    if (facilitators && Array.isArray(facilitators) && facilitators.length > 0) {
      const allFacilitatorInserts: SessionFacilitatorInsert[] = [];
      for (const session of newSessions) {
        for (const f of facilitators) {
          allFacilitatorInserts.push({
            session_id: session.id,
            user_id: f.user_id,
            facilitator_role: f.facilitator_role,
            is_lead: f.is_lead || false,
          });
        }
      }

      const { error: facilitatorsError } = await serviceClient
        .from('session_facilitators')
        .insert(allFacilitatorInserts);

      if (facilitatorsError) {
        console.error('Database error inserting facilitators:', facilitatorsError);
        // Clean up all sessions in the group
        if (recurrenceGroupId) {
          await serviceClient.from('consultor_sessions').delete().eq('recurrence_group_id', recurrenceGroupId);
        } else {
          await serviceClient.from('consultor_sessions').delete().in('id', newSessions.map(s => s.id));
        }
        return sendAuthError(res, 'Error al asignar facilitadores. Las sesiones no fueron creadas.', 500, facilitatorsError.message);
      }
    }

    // Insert activity log entries for all sessions
    const allActivityLogEntries: SessionActivityLogInsert[] = newSessions.map(session => ({
      session_id: session.id,
      user_id: user!.id,
      action: 'created',
      details: {
        title: session.title,
        school_id: session.school_id,
        growth_community_id: session.growth_community_id,
        recurrence_group_id: recurrenceGroupId,
        session_number: session.session_number,
      },
    }));

    const { error: logError } = await serviceClient
      .from('session_activity_log')
      .insert(allActivityLogEntries);

    if (logError) {
      console.error('Error inserting activity logs:', logError);
      // Don't fail the whole request
    }

    // Fetch facilitators for all sessions
    const { data: sessionFacilitators } = await serviceClient
      .from('session_facilitators')
      .select('*')
      .in('session_id', newSessions.map(s => s.id));

    return sendApiResponse(
      res,
      {
        sessions: newSessions,
        facilitators: sessionFacilitators || [],
        recurrence_group_id: recurrenceGroupId,
      },
      201
    );
  } catch (error: any) {
    console.error('Create session error:', error);
    return sendAuthError(res, 'Error inesperado al crear sesión', 500, error.message);
  }
}

/**
 * GET /api/sessions
 * List sessions (role-filtered, paginated)
 */
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  const {
    school_id,
    growth_community_id,
    consultant_id,
    status,
    date_from,
    date_to,
    page = '1',
    limit = '20',
  } = req.query;

  const pageNum = parseInt(page as string, 10);
  const limitNum = Math.min(parseInt(limit as string, 10), 100); // Max 100

  if (isNaN(pageNum) || pageNum < 1) {
    return sendAuthError(res, 'page debe ser un entero positivo', 400);
  }

  if (isNaN(limitNum) || limitNum < 1) {
    return sendAuthError(res, 'limit debe ser un entero positivo', 400);
  }

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
      .select('*, session_facilitators(*, profiles(first_name, last_name, email)), schools!consultor_sessions_school_id_fkey(name), growth_communities(name)', {
        count: 'exact',
      })
      .eq('is_active', true);

    // Query scope = the UNION of everything canViewSession() grants, so the
    // list, the batch iCal export and the detail endpoint agree about which
    // sessions exist. The translation from policy to query filter lives in
    // `lib/utils/session-scope.ts` — shared with the export rather than copied,
    // because the copies are exactly what drifted before.
    //
    // The union is expressed in the QUERY, not by fetching and filtering in
    // memory, so pagination and `count: 'exact'` stay correct.
    const scope = buildSessionScope(highestRole, userRoles);

    if (scope.kind === 'none') {
      // Out of scope entirely — empty list, as before.
      return sendApiResponse(res, { sessions: [], total: 0, page: pageNum, limit: limitNum });
    }

    if (scope.kind === 'union') {
      query = query.or(scope.orClause);
    }

    // Draft visibility is unchanged: hidden from everyone who is neither
    // admin nor consultor.
    if (hidesDraftSessions(highestRole)) {
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
        return sendApiResponse(res, { sessions: [], total: 0, page: pageNum, limit: limitNum });
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
      // Support comma-separated status values for multi-select filters
      if (status.includes(',')) {
        const statusArray = status.split(',').map(s => s.trim());
        query = query.in('status', statusArray);
      } else {
        query = query.eq('status', status);
      }
    }

    if (date_from && isValidDate(date_from as string)) {
      query = query.gte('session_date', date_from);
    }

    if (date_to && isValidDate(date_to as string)) {
      query = query.lte('session_date', date_to);
    }

    // Pagination
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;
    query = query.range(from, to).order('session_date', { ascending: false });

    const { data: sessions, error: queryError, count } = await query;

    if (queryError) {
      console.error('Database error fetching sessions:', queryError);
      return sendAuthError(res, 'Error al obtener sesiones', 500, queryError.message);
    }

    // Strip facilitator e-mails and the raw meeting link/transcript per row.
    // Evaluated per session because a GC member may be a facilitator of some
    // rows and a plain member of others.
    const visibleSessions = (sessions || []).map((row: any) => {
      const accessContext: SessionAccessContext = {
        highestRole,
        userRoles,
        session: {
          id: row.id,
          school_id: row.school_id,
          growth_community_id: row.growth_community_id,
          status: row.status,
        },
        userId: user.id,
        isFacilitator: Array.isArray(row.session_facilitators)
          ? row.session_facilitators.some((f: { user_id?: string }) => f?.user_id === user.id)
          : false,
      };

      const withoutEmails = canViewParticipantEmails(accessContext)
        ? row
        : redactProfileEmails(row);

      return applySessionMeetingDisclosure(withoutEmails, accessContext);
    });

    return sendApiResponse(res, {
      sessions: visibleSessions,
      total: count || 0,
      page: pageNum,
      limit: limitNum,
    });
  } catch (error: any) {
    console.error('Get sessions error:', error);
    return sendAuthError(res, 'Error inesperado al obtener sesiones', 500, error.message);
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function refuseSchoolLookup(res: NextApiResponse, lookup: SchoolTenantControlsLookup): void {
  switch (lookup.status) {
    case 'not_found':
      return sendMeetingError(res, 404, 'school_not_found', 'El colegio seleccionado no existe');
    case 'error':
      return sendMeetingError(res, 500, 'school_lookup_failed', 'Error al verificar el colegio');
    case 'invalid_tenant_kind':
    case 'invalid_row':
      return sendMeetingError(
        res,
        500,
        'school_tenant_invalid',
        'La clasificación del colegio no es válida'
      );
    case 'found':
      // Not a refusal; callers only reach here with a non-found status.
      return;
  }
}

interface OperatorSessionRequest {
  modality: string;
  isZoomManaged: boolean;
  /** The provider as it will be STORED, after managed intent forced it — not the raw body. */
  meetingProvider: MeetingProvider | null;
  contratoId: unknown;
  hourTypeKey: unknown;
  programEnrollmentId: unknown;
}

type OperatorSessionRefusalCode =
  | 'operator_testing_disabled'
  | 'feature_disabled'
  | 'school_not_allowlisted'
  | 'operator_modality_not_remote'
  | 'operator_not_zoom_managed'
  | 'operator_provider_not_zoom'
  | 'operator_financial_fields_present';

interface OperatorSessionRefusal {
  code: OperatorSessionRefusalCode;
  status: number;
  message: string;
}

/**
 * Plan §4.1 creation rules for an OPERATOR tenant. `null` for client and QA tenants — they
 * keep every existing behaviour, including contracts, hour types, program enrollments and
 * the existing managed-Zoom path — and `null` for an operator request that satisfies all of:
 *
 *   - `internal_zoom_testing_enabled = true` on the school row;
 *   - the shared §14 rollout policy (never the full provision gate — this is a draft);
 *   - modality `online` or `hibrida`, `is_zoom_managed = true`, stored provider `zoom`;
 *   - `contrato_id`, `hour_type_key` and `program_enrollment_id` all absent in the request.
 *
 * Admin authorization is established by the route before this is called; the facilitator
 * validator runs after it and stays authoritative for the facilitator rules.
 */
function checkOperatorSessionRequest(
  school: SchoolTenantControls,
  request: OperatorSessionRequest,
  env: NodeJS.ProcessEnv
): OperatorSessionRefusal | null {
  if (!isOperatorTenant(school.tenant_kind)) return null;

  if (school.internal_zoom_testing_enabled !== true) {
    return {
      code: 'operator_testing_disabled',
      status: 403,
      message: 'Las pruebas internas de Zoom no están habilitadas para este colegio',
    };
  }

  const rollout = checkZoomRolloutPolicy(school.id, env);
  if (rollout !== null) {
    return {
      code: rollout.reason,
      status: 403,
      message:
        rollout.reason === 'feature_disabled'
          ? 'Las reuniones Zoom gestionadas no están habilitadas en la plataforma'
          : 'Este colegio no está habilitado para reuniones Zoom gestionadas',
    };
  }

  if (request.modality !== 'online' && request.modality !== 'hibrida') {
    return {
      code: 'operator_modality_not_remote',
      status: 400,
      message: 'Una sesión interna debe ser online o híbrida',
    };
  }

  if (request.isZoomManaged !== true) {
    return {
      code: 'operator_not_zoom_managed',
      status: 400,
      message: 'Una sesión interna debe usar una reunión Zoom gestionada por la plataforma',
    };
  }

  if (request.meetingProvider !== 'zoom') {
    return {
      code: 'operator_provider_not_zoom',
      status: 400,
      message: 'Una sesión interna debe usar Zoom como proveedor de reunión',
    };
  }

  const financialFields: string[] = [];
  if (request.contratoId != null) financialFields.push('contrato_id');
  if (request.hourTypeKey != null) financialFields.push('hour_type_key');
  if (request.programEnrollmentId != null) financialFields.push('program_enrollment_id');
  if (financialFields.length > 0) {
    return {
      code: 'operator_financial_fields_present',
      status: 400,
      message:
        'Una sesión interna no puede tener contrato, tipo de hora ni inscripción de programa ' +
        `(campos: ${financialFields.join(', ')})`,
    };
  }

  return null;
}

function isValidDate(dateString: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) return false;
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

function isValidTime(timeString: string): boolean {
  const timeRegex = /^\d{2}:\d{2}(:\d{2})?$/;
  return timeRegex.test(timeString);
}

function isTimeAfter(endTime: string, startTime: string): boolean {
  const [endHour, endMin] = endTime.split(':').map(Number);
  const [startHour, startMin] = startTime.split(':').map(Number);
  const endMinutes = endHour * 60 + endMin;
  const startMinutes = startHour * 60 + startMin;
  return endMinutes > startMinutes;
}

function detectMeetingProvider(url: string): MeetingProvider {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('zoom.us')) return 'zoom';
  if (lowerUrl.includes('meet.google.com')) return 'google_meet';
  if (lowerUrl.includes('teams.microsoft.com')) return 'teams';
  return 'otro';
}
