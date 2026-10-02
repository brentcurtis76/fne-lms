/**
 * Notification event catalog (NOTIF plan D1, ledger N1-01).
 *
 * One entry per event a producer emits. Categories, email defaults and the one
 * mandatory event follow the plan's rev-3 table ("Categories and defaults are
 * unchanged from rev 3"). `audience` records the recipient rule the live
 * `getRecipients` applies today.
 *
 * `emailDefault` and `mandatory` are metadata only until the N1-03 resolver is
 * wired: the live SM-15 path still sends as it did before this catalog.
 * Release note for N1-03: `system_update` is `off` here, so once the resolver
 * reads this catalog, system updates stop sending email by default.
 */
import type { UserRole } from '../../types/roles';
import { NOTIFICATION_EVENTS } from '../notificationEvents';
import { canViewSession } from '../utils/session-policy';

export type NotificationCategory =
  | 'courses'
  | 'assignments'
  | 'community'
  | 'sessions'
  | 'advisory'
  | 'licitaciones'
  | 'qa_support'
  | 'system';

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  courses: 'Cursos y aprendizaje',
  assignments: 'Tareas y evaluaciones',
  community: 'Comunidad y menciones',
  sessions: 'Sesiones de consultoría',
  advisory: 'Asesoría',
  licitaciones: 'Licitaciones',
  qa_support: 'QA y soporte',
  system: 'Sistema',
};

export type EmailDefault = 'immediate' | 'digest' | 'off';

/** Who receives the event, as resolved by `NotificationService.getRecipients`. */
export type Audience =
  | 'assigned_users'
  | 'student'
  | 'message_recipient'
  | 'mentioned_user'
  /** The finalize route's resolved `recipient_ids`, validated and deduplicated. */
  | 'meeting_recipients'
  | 'session_participants'
  | 'edit_requester'
  | 'tester'
  | 'admins'
  | 'school_encargados'
  | 'school_encargados_and_admins'
  | 'all_active_users'
  /** The producer's persisted group members other than the actor (create-group, add-classmates). */
  | 'group_invitees'
  /** Active consultor/admin users with an active consultant assignment to the group's community (submit-group). */
  | 'group_consultants'
  /** Reviewers the pending-review list shows the submission to: consultant assignments covering its student (notify-pending). */
  | 'quiz_reviewers'
  /** No recipient rule exists yet (producer or recipient case still to be wired). */
  | 'unwired';

type EventData = Record<string, unknown>;

export interface NotificationCatalogEntry {
  category: NotificationCategory;
  audience: Audience;
  emailDefault: EmailDefault;
  mandatory: boolean;
  /** Required when `mandatory` is true. */
  mandatoryJustification?: string;
  /**
   * Stable id of the persisted record occurrence, or null when the payload lacks
   * one. Null (`[]` paths) is also used where the payload names only the entity,
   * whose repeat is a genuine new occurrence: each such trigger is then delivered.
   */
  occurrenceId: (data: EventData) => string | null;
  /** Dotted payload paths an email may carry. Everything else is dropped. */
  emailFields: readonly string[];
  /** `registry` = title/description from `NOTIFICATION_EVENTS`; `producer` = the producer writes them. */
  templates: 'registry' | 'producer';
  /** Same-origin path to the record for a recipient with this role, or null when the payload has no usable record id. */
  urlBuilder: (data: EventData, role?: string) => string | null;
  /** Safe landing page when there is no record context. Always an existing route; see `getFallbackUrl`. */
  fallbackUrl: string;
}

export const DEFAULT_NOTIFICATION_URL = '/dashboard';

const UUID_HEX = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const UUID = new RegExp(`^${UUID_HEX}$`);
const POSITIVE_INT = /^[1-9][0-9]{0,15}$/;

function get(data: EventData, path: string): unknown {
  let current: unknown = data;
  for (const key of path.split('.')) {
    if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, key)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** A record id: a UUID or a positive integer. Anything else is rejected. */
function recordId(data: EventData, ...paths: string[]): string | null {
  for (const path of paths) {
    const value = get(data, path);
    const text = typeof value === 'number' ? String(value) : value;
    if (typeof text === 'string' && (UUID.test(text) || POSITIVE_INT.test(text))) {
      return encodeURIComponent(text);
    }
  }
  return null;
}

/**
 * Each path must hold a non-blank string or a finite number, else null. A UUID
 * is lowercased so a retry keeps its id whatever the case; each part is encoded
 * so no two different tuples join to the same id.
 */
function occurrence(data: EventData, ...paths: string[]): string | null {
  if (paths.length === 0) return null;
  const parts: string[] = [];
  for (const path of paths) {
    const value = get(data, path);
    if (typeof value === 'number' ? !Number.isFinite(value) : typeof value !== 'string' || value.trim() === '') return null;
    const text = String(value);
    parts.push(encodeURIComponent(UUID.test(text) ? text.toLowerCase() : text));
  }
  return parts.join(':');
}

const at = (base: string, ...idPaths: string[]) => (data: EventData) => {
  const id = recordId(data, ...idPaths);
  return id ? `${base}/${id}` : null;
};

/** No record route exists for this event; the link is the entry's `fallbackUrl`. */
const noRecord = () => null;

/** The workspace messaging section with the thread a workspace message payload names. */
const workspaceThreadUrl = (data: EventData) => {
  const id = get(data, 'thread_id');
  return typeof id === 'string' && UUID.test(id) ? `/community/workspace?section=messaging&thread=${id.toLowerCase()}` : null;
};

/**
 * Roles the consultor session pages admit; they send every other role to the
 * dashboard (pages/consultor/sessions/[id].tsx and index.tsx).
 */
const SESSION_DETAIL_ROLES = ['admin', 'consultor', 'lider_comunidad'];
const SESSION_LIST_ROLES = ['admin', 'consultor'];
/** Every path Next.js would route under the two session page prefixes, whatever its case. */
const SESSION_PAGE_PREFIX = /^\/(?:meet\/session|consultor\/sessions)(?:\/|$)/i;
/** The session pages that are not a record: the consultor list and its reports. */
const SESSION_LIST_PATHS = ['/consultor/sessions', '/consultor/sessions/reports'];
/** The exact paths `pages/consultor/sessions/[id].tsx` and `pages/meet/session/[id].tsx` serve: a route is case-sensitive, a UUID is not. */
const SESSION_DETAIL_PATH = new RegExp(`^/consultor/sessions/${UUID_HEX}$`);
const SESSION_RECORD_PATH = new RegExp(`^/(?:consultor/sessions|meet/session)/(${UUID_HEX})$`);

/**
 * The consultor detail page for roles it admits; any other recipient (a docente
 * attendee, for one) gets `/meet/session`, which re-checks `canViewSession` for
 * every role and shows only the session's title and schedule.
 */
const sessionUrl = (data: EventData, role?: string) => {
  const id = get(data, 'session.id');
  if (typeof id !== 'string' || !UUID.test(id)) return null;
  return role && SESSION_DETAIL_ROLES.includes(role) ? `/consultor/sessions/${id}` : `/meet/session/${id}`;
};

const SESSION_FIELDS = ['session.title', 'session.date', 'session.time', 'session.end_time'] as const;
const LICITACION_FIELDS = ['numero_licitacion', 'school_name'] as const;

const session = (
  audience: Audience,
  occurrenceIdPaths: string[],
  extra: Partial<NotificationCatalogEntry> = {}
): NotificationCatalogEntry => ({
  category: 'sessions',
  audience,
  emailDefault: 'immediate',
  mandatory: false,
  occurrenceId: (d) => occurrence(d, ...occurrenceIdPaths),
  emailFields: SESSION_FIELDS,
  templates: 'registry',
  urlBuilder: sessionUrl,
  fallbackUrl: '/consultor/sessions',
  ...extra,
});

const licitacion = (audience: Audience, extraFields: string[] = []): NotificationCatalogEntry => ({
  category: 'licitaciones',
  audience,
  emailDefault: 'immediate',
  mandatory: false,
  occurrenceId: (d) => occurrence(d, 'licitacion_id'),
  emailFields: [...LICITACION_FIELDS, ...extraFields],
  templates: 'registry',
  urlBuilder: at('/licitaciones', 'licitacion_id'),
  fallbackUrl: '/licitaciones',
});

/**
 * A deadline reminder is one occurrence per (licitación, persisted deadline date,
 * reminder phase): the checker reruns on every page load, and the evaluación
 * event is sent both the day before and the day of the same deadline.
 */
const deadline = (audience: Audience): NotificationCatalogEntry => ({
  ...licitacion(audience),
  occurrenceId: (d) => occurrence(d, 'licitacion_id', 'deadline_date', 'reminder'),
});

const plain = (
  category: NotificationCategory,
  audience: Audience,
  emailDefault: EmailDefault,
  occurrenceIdPaths: string[],
  emailFields: string[],
  urlBuilder: (data: EventData) => string | null,
  fallbackUrl: string
): NotificationCatalogEntry => ({
  category,
  audience,
  emailDefault,
  mandatory: false,
  occurrenceId: (d) => occurrence(d, ...occurrenceIdPaths),
  emailFields,
  templates: 'registry',
  urlBuilder,
  fallbackUrl,
});

const ASSIGNMENT_FIELDS = ['assignment.title', 'assignment.due_date', 'assignment_name', 'course_name'];
const assignmentUrl = at('/assignments', 'assignment.id', 'assignment_id');

export const NOTIFICATION_CATALOG: Record<string, NotificationCatalogEntry> = {
  // The payload names the course, not the assignment row: a re-assignment is a new occurrence.
  course_assigned: plain('courses', 'assigned_users', 'immediate', [], ['course.name'], noRecord, '/mi-aprendizaje'),
  learning_path_assigned: plain('courses', 'unwired', 'immediate', [], ['learning_path.name'], noRecord, '/mi-aprendizaje'),
  course_completed: plain('courses', 'student', 'digest', ['course_id', 'student_id'], ['course.name', 'course_name'], noRecord, '/mi-aprendizaje'),
  module_completed: plain('courses', 'student', 'digest', ['module_id', 'student_id'], ['module.name', 'course.name', 'module_name', 'course_name'], noRecord, '/mi-aprendizaje'),

  assignment_created: plain('assignments', 'assigned_users', 'immediate', ['assignment.id'], ASSIGNMENT_FIELDS, assignmentUrl, '/assignments'),
  // Feedback is upserted per (assignment, student): each new feedback is a new occurrence.
  assignment_feedback: plain('assignments', 'student', 'immediate', [], ASSIGNMENT_FIELDS, assignmentUrl, '/assignments'),
  assignment_due_soon: plain('assignments', 'student', 'immediate', ['assignment_id', 'student_id', 'due_date'], ASSIGNMENT_FIELDS, assignmentUrl, '/assignments'),

  // Group and quiz bells (N2-04) carry fixed producer copy and no email fields.
  // A group has no record page for members; one invitation per group and member.
  group_invitation: {
    ...plain('assignments', 'group_invitees', 'immediate', ['group_id'], [], noRecord, '/mi-aprendizaje/tareas'),
    templates: 'producer',
  },
  // One per saved group submission (its persisted submitted_at): an edited resubmission
  // is a new occurrence, an identical retry keeps the timestamp and is not.
  // The review page is admin-only in middleware, so a consultor lands on the overview.
  group_assignment_submitted: {
    ...plain('assignments', 'group_consultants', 'immediate', ['group_id', 'submitted_at'], [], noRecord, '/admin/assignment-overview'),
    templates: 'producer',
    urlBuilder: (d, role) => (role === 'admin' ? at('/admin/assignment-review', 'assignment_id')(d) : null),
  },
  quiz_review_pending: {
    ...plain('assignments', 'quiz_reviewers', 'immediate', ['submission_id'], [], at('/quiz-reviews', 'submission_id'), '/quiz-reviews'),
    templates: 'producer',
  },
  // One per saved review (its persisted graded_at): pass → needs_review → pass is three
  // occurrences, saving the same review again keeps the timestamp and is not.
  quiz_reviewed: {
    ...plain('assignments', 'student', 'immediate', ['submission_id', 'graded_at'], [], at('/student/lesson', 'lesson_id'), '/mi-aprendizaje'),
    templates: 'producer',
  },

  message_sent: plain('community', 'message_recipient', 'immediate', ['message_id'], ['sender_name'], workspaceThreadUrl, '/community/workspace?section=messaging'),
  // A post mention is one occurrence per user_mentions row; a workspace message
  // mention (no mention_id) is one per message, keyed with its recipient.
  user_mentioned: {
    ...plain('community', 'mentioned_user', 'immediate', ['mention_id'], ['author_name'], workspaceThreadUrl, '/community/workspace?section=overview'),
    occurrenceId: (d) => occurrence(d, 'mention_id') ?? occurrence(d, 'message_id'),
  },
  // `emailDefault` governs the finalize route's summary mail; the notification itself is in-app only until N5-06.
  meeting_finalized: plain('community', 'meeting_recipients', 'immediate', ['meeting_id'], ['title'], noRecord, '/community/workspace?section=meetings'),

  session_created: session('session_participants', ['session.id']),
  // No transition id: a later move back to an earlier schedule (A→B→A→B) is
  // indistinguishable from a retry, so each reschedule is delivered.
  session_rescheduled: session('session_participants', [], {
    emailFields: [...SESSION_FIELDS, 'session.previous_date', 'session.previous_time', 'session.previous_end_time'],
  }),
  session_cancelled: session('session_participants', ['session.id'], {
    mandatory: true,
    mandatoryJustification: 'A cancelled session means a person shows up to nothing (plan rev 3).',
  }),
  session_reminder_24h: session('session_participants', ['session.id', 'session.date', 'session.time']),
  session_reminder_1h: session('session_participants', ['session.id', 'session.date', 'session.time']),
  // The payload has no edit-request id: two requests on one session are two occurrences.
  session_edit_request_submitted: session('admins', [], {
    emailFields: ['session.title'],
    urlBuilder: noRecord,
    fallbackUrl: '/admin/sessions/approvals',
  }),
  session_edit_request_approved: session('edit_requester', [], { emailFields: ['session.title'] }),
  session_edit_request_rejected: session('edit_requester', [], { emailFields: ['session.title'] }),

  consultant_assigned: plain('advisory', 'student', 'immediate', ['assignment_id'], ['consultant.name', 'consultant_name'], noRecord, '/profile'),

  licitacion_created: licitacion('school_encargados'),
  licitacion_published: licitacion('school_encargados', ['fecha_publicacion']),
  licitacion_bases_deadline_1d: deadline('school_encargados'),
  licitacion_bases_deadline: deadline('school_encargados'),
  licitacion_consultas_deadline_1d: deadline('school_encargados'),
  licitacion_consultas_deadline: deadline('school_encargados'),
  licitacion_propuestas_open: licitacion('school_encargados'),
  licitacion_propuestas_deadline_1d: deadline('school_encargados'),
  licitacion_propuestas_deadline: deadline('school_encargados'),
  licitacion_evaluacion_start: licitacion('school_encargados'),
  licitacion_evaluacion_deadline_1d: deadline('school_encargados'),
  licitacion_evaluacion_complete: licitacion('school_encargados_and_admins', ['ganador_nombre']),
  licitacion_adjudicada: licitacion('school_encargados_and_admins', ['ganador_nombre']),
  licitacion_contrato_generado: licitacion('admins'),

  qa_scenario_assigned: plain('qa_support', 'tester', 'immediate', [], ['scenario_count', 'due_date'], noRecord, '/qa'),
  new_feedback: plain('qa_support', 'admins', 'digest', ['feedback_id'], ['feedback_type'], noRecord, '/admin/feedback'),
  qa_test_failed: plain('qa_support', 'admins', 'digest', ['test_run_id', 'step_index'], ['scenario_name', 'feature_area'], at('/admin/qa/runs', 'test_run_id'), '/admin/qa'),
  data_quality_alert: {
    ...plain('qa_support', 'admins', 'digest', [], [], noRecord, '/admin/course-builder'),
    templates: 'producer',
  },

  system_update: plain('system', 'all_active_users', 'off', ['update_id'], ['title', 'version'], noRecord, DEFAULT_NOTIFICATION_URL),
};

export function getCatalogEntry(eventType: string): NotificationCatalogEntry | undefined {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_CATALOG, eventType)
    ? NOTIFICATION_CATALOG[eventType]
    : undefined;
}

/** Event types a producer emits that the catalog does not map (completeness check). */
export function findUnmappedEvents(eventTypes: Iterable<string>): string[] {
  return [...new Set(eventTypes)].filter((eventType) => !getCatalogEntry(eventType)).sort();
}

/**
 * A same-origin relative path: one leading slash, no scheme or protocol-relative
 * host, no backslash, control character, whitespace or unresolved placeholder.
 */
export function isSafeNotificationPath(url: unknown): url is string {
  return (
    typeof url === 'string' &&
    url.length > 0 &&
    url.length <= 2048 &&
    url.startsWith('/') &&
    !url.startsWith('//') &&
    !/[\\\s{}]/.test(url) &&
    !/[\u0000-\u001f\u007f]/.test(url)
  );
}

/**
 * The path Next.js routes for a same-origin URL. The query and fragment are not
 * part of the route, and one trailing slash is redirected away (`trailingSlash`
 * is off), so `/x?q`, `/x#f` and `/x/` all reach the page at `/x`.
 */
function routePath(url: string): string {
  const path = url.split(/[?#]/, 1)[0];
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** False for a `/consultor/` page that redirects a recipient with this role to the dashboard. */
export function isOpenToRole(url: string, role: string): boolean {
  const path = routePath(url);
  if (path !== '/consultor' && !path.startsWith('/consultor/')) return true;
  return (SESSION_DETAIL_PATH.test(path) ? SESSION_DETAIL_ROLES : SESSION_LIST_ROLES).includes(role);
}

/** The session columns the session record pages' access rule reads. */
export interface SessionRecord {
  id: string;
  school_id: number;
  growth_community_id: string;
  status: string;
  is_active?: boolean | null;
}

/** A recipient as `user_roles` describes it; `highestRole` is null without an active row. */
export interface SessionRecipient {
  userId: string;
  userRoles: UserRole[];
  highestRole: string | null;
}

/**
 * False for a session page link this recipient cannot open. The URL is classified
 * by the path Next.js routes (`routePath`): any path under `/meet/session` or
 * `/consultor/sessions`, in any case and with or without a query, fragment or
 * trailing slash, is a session target. The list and reports pages are left to
 * `isOpenToRole`. A record page is decided as `/meet/session/[id]` and GET
 * `/api/sessions/[id]` decide for their viewer: an active role, an archived
 * session only for an admin, then `canViewSession`. Any other session target (a
 * non-UUID id, an extra segment, a mis-cased path) is a page that does not exist
 * and is denied, as is no session row (a failed or empty lookup), no role, or a
 * session other than the one in the URL.
 */
export function isSessionRecordOpenTo(url: string, recipient: SessionRecipient, session: SessionRecord | null): boolean {
  const path = routePath(url);
  if (!SESSION_PAGE_PREFIX.test(path)) return true;
  if (SESSION_LIST_PATHS.includes(path)) return true;
  const match = SESSION_RECORD_PATH.exec(path);
  if (!match) return false;
  const { highestRole, userRoles, userId } = recipient;
  if (!session || session.id.toLowerCase() !== match[1].toLowerCase() || !highestRole) return false;
  if (session.is_active === false && highestRole !== 'admin') return false;
  return canViewSession({
    highestRole,
    userRoles,
    session: { id: session.id, school_id: session.school_id, growth_community_id: session.growth_community_id, status: session.status },
    userId,
    isFacilitator: false,
  });
}

/** The record path when the payload identifies one, else null. */
export function buildRecordUrl(eventType: string, data: EventData, role?: string): string | null {
  const url = getCatalogEntry(eventType)?.urlBuilder(data ?? {}, role);
  return isSafeNotificationPath(url) ? url : null;
}

/** The event's landing page; the dashboard when the recipient's role cannot open it. */
export function getFallbackUrl(eventType: string, role?: string): string {
  const url = getCatalogEntry(eventType)?.fallbackUrl ?? DEFAULT_NOTIFICATION_URL;
  return role === undefined || isOpenToRole(url, role) ? url : DEFAULT_NOTIFICATION_URL;
}

/** Record path, else the event's safe fallback, else the dashboard. Never external. */
export function buildNotificationUrl(eventType: string, data: EventData, role?: string): string {
  return buildRecordUrl(eventType, data, role) ?? getFallbackUrl(eventType, role);
}

/** The allowlisted email payload: only the entry's declared scalar fields survive. */
export function buildEmailPayload(eventType: string, data: EventData): Record<string, string | number> {
  const payload: Record<string, string | number> = {};
  for (const path of getCatalogEntry(eventType)?.emailFields ?? []) {
    const value = get(data ?? {}, path);
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) {
      payload[path] = value;
    }
  }
  return payload;
}

/** Title/description renderers for registry-templated events. */
export function getCatalogTemplates(eventType: string) {
  if (getCatalogEntry(eventType)?.templates !== 'registry') return null;
  const config = NOTIFICATION_EVENTS[eventType];
  return config ? { title: config.defaultTitle, description: config.defaultDescription } : null;
}
