/**
 * Source-record access for one queued notification email (NOTIF plan D4, N3-03).
 *
 * The worker asks this before the first attempt: can the recipient still see
 * the record the email is about? A route or role check on `related_url` cannot
 * answer that, so each record-bound event names the kind of record it needs
 * (`notification_email_outbox_source`) and that record is read again, with the
 * service role, against the membership data its own page or policy uses:
 *
 *   session                consultor_sessions, as GET /api/sessions/[id] decides
 *   licitacion             licitaciones RLS: admin, or encargado of its school
 *   course, assignment     course_enrollment_grants_access (C2 entitlement)
 *   consultant_assignment  the active assignment row of this student
 *   group                  group_assignment_groups RLS, then its members / its community's consultants
 *   quiz_submission        its student / the reviewers notify-pending resolves
 *   workspace              can_access_workspace
 *
 * Events without a record are decided by the recipient's current audience role.
 *
 * Fail closed: an event with no rule here, a missing, malformed or mismatched
 * reference is `invalid`; a failed read is `unavailable`. Only `allow` sends.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserRole } from '../../types/roles';
import { getHighestRole } from '../../utils/roleUtils';
import { getCatalogEntry } from '../notifications/catalog';
import { canViewSession } from '../utils/session-policy';

export type SourceKind =
  | 'session'
  | 'licitacion'
  | 'course'
  | 'assignment'
  | 'consultant_assignment'
  | 'group'
  | 'quiz_submission'
  | 'workspace';

export type AccessDecision =
  | { access: 'allow' }
  /** The recipient definitely lost access: the row is cancelled. */
  | { access: 'revoked'; code: string }
  /** No usable reference or rule: the row can never be sent. */
  | { access: 'invalid'; code: string }
  /** A read failed: nothing is sent now. */
  | { access: 'unavailable'; code: string };

export interface AccessInput {
  eventType: string;
  userId: string;
  sourceKind: string | null;
  sourceId: string | null;
}

interface RoleRow {
  role_type: string;
  school_id: number | string | null;
  generation_id: string | null;
  community_id: string | null;
  is_active: boolean;
}

interface Context {
  client: SupabaseClient;
  userId: string;
  roles: RoleRow[];
  highestRole: string;
  sourceId: string;
}

type Check = (ctx: Context) => Promise<boolean>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REVIEWER_ROLES = ['admin', 'consultor', 'equipo_directivo'];

class LookupFailed extends Error {}

/** The rows of a read, or a thrown `LookupFailed`: a failed read is never an empty answer. */
async function rows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new LookupFailed();
  if (data === null || data === undefined) return [];
  return (Array.isArray(data) ? data : [data]) as T[];
}

const hasRole = (ctx: Context, ...types: string[]) => ctx.roles.some((r) => types.includes(r.role_type));

const sessionAccess: Check = async (ctx) => {
  const [session] = await rows<{ id: string; school_id: number; growth_community_id: string; status: string; is_active: boolean | null }>(
    ctx.client.from('consultor_sessions').select('id, school_id, growth_community_id, status, is_active').eq('id', ctx.sourceId).maybeSingle()
  );
  if (!session) return false;
  if (session.is_active !== true && ctx.highestRole !== 'admin') return false;
  return canViewSession({
    highestRole: ctx.highestRole,
    userRoles: ctx.roles as unknown as UserRole[],
    session: { id: session.id, school_id: session.school_id, growth_community_id: session.growth_community_id, status: session.status },
    userId: ctx.userId,
    isFacilitator: false,
  });
};

const licitacionAccess: Check = async (ctx) => {
  const [licitacion] = await rows<{ school_id: number }>(
    ctx.client.from('licitaciones').select('school_id').eq('id', ctx.sourceId).maybeSingle()
  );
  if (!licitacion) return false;
  return (
    hasRole(ctx, 'admin') ||
    ctx.roles.some((r) => r.role_type === 'encargado_licitacion' && Number(r.school_id) === Number(licitacion.school_id))
  );
};

/** `course_enrollment_grants_access`, which the service role cannot execute, read row by row. */
async function courseAccess(ctx: Context, courseId: string): Promise<boolean> {
  const enrollments = await rows<{ access_origin: string | null }>(
    ctx.client.from('course_enrollments').select('access_origin').eq('user_id', ctx.userId).eq('course_id', courseId)
  );
  if (enrollments.length === 0) return false;
  if (enrollments.some((e) => e.access_origin !== 'learning_path')) return true;

  const assignments = await rows<{ status: string | null }>(
    ctx.client.from('course_assignments').select('status').eq('teacher_id', ctx.userId).eq('course_id', courseId)
  );
  if (assignments.some((a) => a.status !== 'cancelled')) return true;

  // A path-derived enrolment grants access only while a path entitlement is current.
  const paths = await rows<{ learning_path_id: string }>(
    ctx.client.from('learning_path_courses').select('learning_path_id').eq('course_id', courseId)
  );
  if (paths.length === 0) return false;
  const pathAssignments = await rows<{ user_id: string | null; group_id: string | null }>(
    ctx.client.from('learning_path_assignments').select('user_id, group_id').in('path_id', paths.map((p) => p.learning_path_id))
  );
  if (pathAssignments.some((a) => a.user_id === ctx.userId)) return true;
  const groupIds = pathAssignments.flatMap((a) => (a.group_id ? [a.group_id] : []));
  if (groupIds.length === 0) return false;
  const workspaces = await rows<{ community_id: string }>(
    ctx.client.from('community_workspaces').select('community_id').in('id', groupIds)
  );
  return workspaces.some((w) => ctx.roles.some((r) => r.community_id === w.community_id));
}

const assignmentAccess: Check = async (ctx) => {
  const [assignment] = await rows<{ course_id: string | null; is_published: boolean | null }>(
    ctx.client.from('lesson_assignments').select('course_id, is_published').eq('id', ctx.sourceId).maybeSingle()
  );
  if (!assignment?.course_id || assignment.is_published !== true) return false;
  return courseAccess(ctx, assignment.course_id);
};

const consultantAssignmentAccess: Check = async (ctx) => {
  const [assignment] = await rows<{ student_id: string | null; is_active: boolean | null }>(
    ctx.client.from('consultant_assignments').select('student_id, is_active').eq('id', ctx.sourceId).maybeSingle()
  );
  return assignment?.is_active === true && assignment.student_id === ctx.userId;
};

/**
 * The group, when the recipient can see it today as its SELECT policy decides:
 * an admin, a role in the group's community or, for a school-only group, a role
 * at its school. A member or assignment row left behind by a move shows nothing.
 */
async function visibleGroup(ctx: Context): Promise<{ community_id: string | null } | null> {
  const [group] = await rows<{ school_id: number | string | null; community_id: string | null }>(
    ctx.client.from('group_assignment_groups').select('school_id, community_id').eq('id', ctx.sourceId).maybeSingle()
  );
  if (!group) return null;
  const { school_id: schoolId, community_id: communityId } = group;
  const visible =
    hasRole(ctx, 'admin') ||
    (communityId
      ? ctx.roles.some((r) => r.community_id === communityId)
      : schoolId !== null && ctx.roles.some((r) => r.school_id !== null && Number(r.school_id) === Number(schoolId)));
  return visible ? group : null;
}

const groupMemberAccess: Check = async (ctx) => {
  if (!(await visibleGroup(ctx))) return false;
  const members = await rows<{ user_id: string }>(
    ctx.client.from('group_assignment_members').select('user_id').eq('group_id', ctx.sourceId).eq('user_id', ctx.userId)
  );
  return members.length > 0;
};

/** submit-group's recipients: an active consultant assignment to the group's community, held by an admin or consultor. */
const groupConsultantAccess: Check = async (ctx) => {
  const group = await visibleGroup(ctx);
  if (!group?.community_id || !hasRole(ctx, 'admin', 'consultor')) return false;
  const assignments = await rows<{ consultant_id: string }>(
    ctx.client
      .from('consultant_assignments')
      .select('consultant_id')
      .eq('consultant_id', ctx.userId)
      .eq('community_id', group.community_id)
      .eq('is_active', true)
  );
  return assignments.length > 0;
};

async function quizStudent(ctx: Context): Promise<string | null> {
  const [submission] = await rows<{ student_id: string }>(
    ctx.client.from('quiz_submissions').select('student_id').eq('id', ctx.sourceId).maybeSingle()
  );
  return submission?.student_id ?? null;
}

const quizStudentAccess: Check = async (ctx) => (await quizStudent(ctx)) === ctx.userId;

/** notify-pending's reviewers: a reviewing role and an active consultant assignment whose scope covers the student. */
const quizReviewerAccess: Check = async (ctx) => {
  const studentId = await quizStudent(ctx);
  if (!studentId || studentId === ctx.userId || !hasRole(ctx, ...REVIEWER_ROLES)) return false;
  const studentRoles = await rows<Pick<RoleRow, 'school_id' | 'generation_id' | 'community_id'>>(
    ctx.client.from('user_roles').select('school_id, generation_id, community_id').eq('user_id', studentId).eq('is_active', true)
  );
  const assignments = await rows<{
    student_id: string | null;
    school_id: number | null;
    generation_id: string | null;
    community_id: string | null;
    assignment_data: { assignment_scope?: string } | null;
  }>(
    ctx.client
      .from('consultant_assignments')
      .select('student_id, school_id, generation_id, community_id, assignment_data')
      .eq('consultant_id', ctx.userId)
      .eq('is_active', true)
  );
  const within = (key: 'school_id' | 'generation_id' | 'community_id', value: unknown) =>
    value !== null && value !== undefined && studentRoles.some((r) => String(r[key]) === String(value));
  return assignments.some((a) => {
    switch (a.assignment_data?.assignment_scope || 'individual') {
      case 'individual': return a.student_id === studentId;
      case 'school': return within('school_id', a.school_id);
      case 'generation': return within('generation_id', a.generation_id);
      case 'community': return within('community_id', a.community_id);
      default: return false;
    }
  });
};

const workspaceAccess: Check = async (ctx) => {
  const { data, error } = await ctx.client.rpc('can_access_workspace', { p_user_id: ctx.userId, p_workspace_id: ctx.sourceId });
  if (error) throw new LookupFailed();
  return data === true;
};

const testerAccess: Check = async (ctx) => {
  if (hasRole(ctx, 'admin')) return true;
  const [profile] = await rows<{ can_run_qa_tests: boolean | null }>(
    ctx.client.from('profiles').select('can_run_qa_tests').eq('id', ctx.userId).maybeSingle()
  );
  return profile?.can_run_qa_tests === true;
};

/** Any recipient with an active role (already required of everyone). */
const activeUser: Check = async () => true;
const adminOnly: Check = async (ctx) => hasRole(ctx, 'admin');

interface Rule {
  /** The record kind the event's reference must name; null for an event without a record. */
  kind: SourceKind | null;
  check: Check;
}

const record = (kind: SourceKind, check: Check): Rule => ({ kind, check });
const SESSION = record('session', sessionAccess);
const LICITACION = record('licitacion', licitacionAccess);
const COURSE = record('course', (ctx) => courseAccess(ctx, ctx.sourceId));
const ASSIGNMENT = record('assignment', assignmentAccess);
const WORKSPACE = record('workspace', workspaceAccess);
const ADMINS: Rule = { kind: null, check: adminOnly };

/**
 * Every event the worker may mail. An event absent here — unmapped, `unwired`
 * (`learning_path_assigned`) or `meeting_finalized` — is never sent.
 */
const RULES: Record<string, Rule> = {
  course_assigned: COURSE,
  course_completed: COURSE,
  module_completed: COURSE,
  assignment_created: ASSIGNMENT,
  assignment_feedback: ASSIGNMENT,
  assignment_due_soon: ASSIGNMENT,
  group_invitation: record('group', groupMemberAccess),
  group_assignment_submitted: record('group', groupConsultantAccess),
  quiz_review_pending: record('quiz_submission', quizReviewerAccess),
  quiz_reviewed: record('quiz_submission', quizStudentAccess),
  message_sent: WORKSPACE,
  user_mentioned: WORKSPACE,
  session_created: SESSION,
  session_rescheduled: SESSION,
  session_cancelled: SESSION,
  session_reminder_24h: SESSION,
  session_reminder_1h: SESSION,
  session_edit_request_submitted: SESSION,
  session_edit_request_approved: SESSION,
  session_edit_request_rejected: SESSION,
  consultant_assigned: record('consultant_assignment', consultantAssignmentAccess),
  licitacion_created: LICITACION,
  licitacion_published: LICITACION,
  licitacion_bases_deadline_1d: LICITACION,
  licitacion_bases_deadline: LICITACION,
  licitacion_consultas_deadline_1d: LICITACION,
  licitacion_consultas_deadline: LICITACION,
  licitacion_propuestas_open: LICITACION,
  licitacion_propuestas_deadline_1d: LICITACION,
  licitacion_propuestas_deadline: LICITACION,
  licitacion_evaluacion_start: LICITACION,
  licitacion_evaluacion_deadline_1d: LICITACION,
  licitacion_evaluacion_complete: LICITACION,
  licitacion_adjudicada: LICITACION,
  licitacion_contrato_generado: LICITACION,
  qa_scenario_assigned: { kind: null, check: testerAccess },
  new_feedback: ADMINS,
  qa_test_failed: ADMINS,
  data_quality_alert: ADMINS,
  system_update: { kind: null, check: activeUser },
};

export async function checkNotificationAccess(client: SupabaseClient, input: AccessInput): Promise<AccessDecision> {
  const rule = Object.prototype.hasOwnProperty.call(RULES, input.eventType) ? RULES[input.eventType] : undefined;
  if (!rule || !getCatalogEntry(input.eventType)) return { access: 'invalid', code: 'event_unsupported' };

  const { sourceKind, sourceId } = input;
  if (rule.kind === null) {
    if (sourceKind !== null || sourceId !== null) return { access: 'invalid', code: 'source_mismatch' };
  } else {
    if (!sourceKind || !sourceId) return { access: 'invalid', code: 'source_missing' };
    if (sourceKind !== rule.kind) return { access: 'invalid', code: 'source_mismatch' };
    if (!UUID.test(sourceId)) return { access: 'invalid', code: 'source_malformed' };
  }

  try {
    const roles = await rows<RoleRow>(
      client
        .from('user_roles')
        .select('role_type, school_id, generation_id, community_id, is_active')
        .eq('user_id', input.userId)
        .eq('is_active', true)
    );
    const highestRole = getHighestRole(roles as unknown as UserRole[]);
    if (!highestRole) return { access: 'revoked', code: 'no_active_role' };

    const ctx: Context = { client, userId: input.userId, roles, highestRole, sourceId: sourceId ?? '' };
    // An admins-only event stays admins-only whatever its record would allow.
    if (getCatalogEntry(input.eventType)?.audience === 'admins' && !hasRole(ctx, 'admin')) {
      return { access: 'revoked', code: 'audience_role_revoked' };
    }
    if (!(await rule.check(ctx))) {
      return { access: 'revoked', code: rule.kind === null ? 'audience_role_revoked' : 'source_access_revoked' };
    }
    return { access: 'allow' };
  } catch {
    // The error can carry a recipient or record id, so it is not logged.
    return { access: 'unavailable', code: 'access_lookup_failed' };
  }
}
