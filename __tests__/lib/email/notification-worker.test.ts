// @vitest-environment node
/**
 * N3-03 worker core, N3-04 failure semantics and the N3-05 unsubscribe headers,
 * through the real entry point `runNotificationEmailWorker`.
 *
 * The database is an in-memory stand-in: plain tables behind the query calls the
 * worker makes, and the worker RPCs with the semantics pgTAP 100 and 101 prove
 * for the real functions (claim under a lease and behind due recovery mail,
 * live-owner freeze and finish, a stored snapshot never replaced, no attempt and
 * only `unknown` 24 hours after the first one). The provider is a captured
 * transport, or the real one over a stubbed `fetch` where the HTTP status
 * matters. Everything is synthetic: no real address, tenant or credential
 * appears here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/email/outbound-policy', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('../../../lib/email/outbound-policy');
  return { ...actual, authorizeUserEmail: vi.fn(actual.authorizeUserEmail) };
});
vi.mock('../../../lib/email/provider', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('../../../lib/email/provider');
  return { ...actual, deliverOutboundEmail: vi.fn(actual.deliverOutboundEmail) };
});

import { authorizeUserEmail } from '../../../lib/email/outbound-policy';
import { deliverOutboundEmail } from '../../../lib/email/provider';
import { openSnapshot, runNotificationEmailWorker, sealSnapshot } from '../../../lib/email/notification-worker';
import { verifyUnsubscribeToken } from '../../../lib/email/notification-unsubscribe';

type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U = uuid(1); // the recipient
const OTHER = uuid(2);
const RECORD = uuid(10);
const COMMUNITY = uuid(20);
const OTHER_COMMUNITY = uuid(21);
const WORKSPACE = uuid(30);
const PATH = uuid(40);
const SCHOOL = 11;
const OTHER_SCHOOL = 12;
const QA_SCHOOL = 257; // config/production-qa-simulation-target.json
const ADDRESS = 'destinataria.sintetica@ejemplo.invalid';
const BASE_URL = 'https://genera.test';
const UNSUBSCRIBE_SECRET = 'synthetic-unsubscribe-secret-0123456789abcdef';
const DAY = 86400;

const role = (role_type: string, extra: Row = {}): Row => ({
  user_id: U, role_type, school_id: null, generation_id: null, community_id: null, is_active: true, ...extra,
});

function createDb(tables: Tables) {
  const db = {
    tables: {
      outbox: [],
      sources: [],
      /** auth_security.password_recovery_outbox, as far as its due rule reads it. */
      recovery: [],
      profiles: [{ id: U, email: ADDRESS, school_id: null }],
      schools: [SCHOOL, OTHER_SCHOOL].map((id) => ({ id, tenant_kind: 'client', internal_zoom_testing_enabled: false })),
      ...tables,
    } as Tables,
    /** Table or RPC names whose next calls fail. */
    failing: new Set<string>(),
    /** Every table read and RPC, in order. */
    calls: [] as string[],
    now: 1000,
    /** The next value of the preference version sequence. */
    nextVersion: 2,
    /** Runs after an RPC returns, to move the clock or the lease mid-run. */
    afterRpc: (_name: string) => undefined as void,
    client: null as any,
  };
  const failure = { data: null, error: { message: `synthetic failure naming ${U}` } };
  const live = (row: Row | undefined, owner: string) =>
    !!row && row.status === 'sending' && row.lease_owner === owner && row.lease_expires_at > db.now;
  const expired = (row: Row) => row.send_snapshot !== null && row.first_attempt_at !== null && row.first_attempt_at <= db.now - DAY;
  const recoveryDue = () => db.tables.recovery.some((r) =>
    ['queued', 'processing'].includes(r.state) && r.available_at <= db.now && r.provider_attempts < r.max_provider_attempts);

  const rpcs: Record<string, (args: Row) => unknown> = {
    password_recovery_email_due: recoveryDue,
    claim_notification_emails: ({ p_owner, p_limit, p_lease_seconds }) =>
      (recoveryDue() ? [] : db.tables.outbox)
        .filter((r) => r.email_mode === 'immediate' && r.next_attempt_at <= db.now &&
          (r.status === 'pending' || (r.status === 'sending' && r.lease_expires_at <= db.now)))
        .slice(0, p_limit)
        .map((r) => {
          Object.assign(r, { status: 'sending', lease_owner: p_owner, lease_expires_at: db.now + p_lease_seconds });
          const source = db.tables.sources.find((s) => s.outbox_id === r.id);
          return {
            id: r.id, idempotency_key: r.idempotency_key, event_type: r.event_type, user_id: r.user_id,
            related_url: r.related_url, payload: r.payload, has_snapshot: r.send_snapshot !== null,
            source_kind: source?.source_kind ?? null, source_id: source?.source_id ?? null,
          };
        }),
    begin_notification_email_attempt: ({ p_id, p_owner, p_snapshot }) => {
      const row = db.tables.outbox.find((r) => r.id === p_id);
      if (!live(row, p_owner) || !(row!.send_snapshot ?? p_snapshot) || expired(row!)) return null;
      row!.send_snapshot ??= p_snapshot;
      row!.first_attempt_at ??= db.now;
      row!.attempt_count += 1;
      return row!.send_snapshot;
    },
    notification_email_retry_state: ({ p_id, p_owner }) => {
      const row = db.tables.outbox.find((r) => r.id === p_id);
      return live(row, p_owner) ? [{ attempt_count: row!.attempt_count, expired: expired(row!) }] : [];
    },
    settle_ambiguous_notification_email: ({ p_id, p_owner, p_outcome, p_error_code }) => {
      const row = db.tables.outbox.find((r) => r.id === p_id);
      if (!live(row, p_owner) || row!.send_snapshot === null) return false;
      if (p_outcome === 'unknown' && !expired(row!)) return false;
      Object.assign(row!, { status: p_outcome, last_error_code: p_error_code, send_snapshot: null, lease_owner: null, lease_expires_at: null });
      return true;
    },
    finish_notification_email: ({ p_id, p_owner, p_outcome, p_error_code, p_provider_message_id, p_retry_seconds }) => {
      const row = db.tables.outbox.find((r) => r.id === p_id);
      if (!live(row, p_owner)) return false;
      if (p_outcome === 'sent' && row!.send_snapshot === null) return false;
      if (p_outcome === 'digest' && row!.send_snapshot !== null) return false;
      Object.assign(row!, { lease_owner: null, lease_expires_at: null, last_error_code: p_error_code });
      if (p_outcome === 'retry') Object.assign(row!, { status: 'pending', next_attempt_at: db.now + p_retry_seconds });
      else if (p_outcome === 'digest') Object.assign(row!, { status: 'pending', email_mode: 'digest' });
      else Object.assign(row!, { status: p_outcome, send_snapshot: null, provider_message_id: p_provider_message_id });
      return true;
    },
    can_access_workspace: ({ p_user_id, p_workspace_id }) =>
      (db.tables.workspace_members ?? []).some((m) => m.user_id === p_user_id && m.workspace_id === p_workspace_id),
  };

  db.client = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const run = (single: boolean) => {
        db.calls.push(table);
        if (db.failing.has(table)) return failure;
        const found = (db.tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
        return { data: single ? found[0] ?? null : found, error: null };
      };
      const builder: any = {
        select: () => builder,
        eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
        in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), builder),
        not: (column: string) => (filters.push((row) => row[column] !== null && row[column] !== undefined), builder),
        maybeSingle: () => Promise.resolve(run(true)),
        then: (resolve: any, reject: any) => Promise.resolve(run(false)).then(resolve, reject),
        // The database's ON CONFLICT DO NOTHING on (user_id, category), its mode default and its version trigger.
        upsert: async (value: Row) => {
          db.calls.push(`${table}:upsert`);
          if (db.failing.has(`${table}:upsert`)) return failure;
          const rows = (db.tables[table] ??= []);
          if (!rows.some((r) => r.user_id === value.user_id && r.category === value.category)) {
            rows.push({ email_mode: 'default', pref_version: db.nextVersion++, ...value });
          }
          return { data: null, error: null };
        },
      };
      return builder;
    },
    async rpc(name: string, args: Row) {
      db.calls.push(`rpc:${name}`);
      const result = db.failing.has(name) ? failure : { data: rpcs[name](args), error: null };
      db.afterRpc(name);
      return result;
    },
  };
  return db;
}

let nextRow = 100;
/** One pending immediate outbox row, with its source reference when given. */
function queue(db: ReturnType<typeof createDb>, event: string, source: [string, string] | null, extra: Row = {}): Row {
  const id = uuid(nextRow++);
  const row: Row = {
    id, idempotency_key: `notif-${id}`, event_type: event, user_id: U, notification_id: null,
    email_mode: 'immediate', related_url: '/mi-aprendizaje', payload: {}, status: 'pending', attempt_count: 0,
    next_attempt_at: 0, lease_owner: null, lease_expires_at: null, first_attempt_at: null, last_error_code: null,
    provider_message_id: null, send_snapshot: null, ...extra,
  };
  db.tables.outbox.push(row);
  if (source) db.tables.sources.push({ outbox_id: id, source_kind: source[0], source_id: source[1] });
  return row;
}

const accepted = () => vi.fn(async (_message: Row, _options?: Row) => ({ data: { id: 'provider-message-1' }, error: null }));
/** `random` is fixed, so a backoff is exact: 0.5 gives three quarters of the attempt's ceiling. */
const run = (db: ReturnType<typeof createDb>, transport: any, random = () => 0.5) =>
  runNotificationEmailWorker(db.client, { transport, random });

/** A course the recipient may open: the simplest sendable row. */
const ENROLLED: Tables = {
  user_roles: [role('docente', { school_id: SCHOOL })],
  course_enrollments: [{ user_id: U, course_id: RECORD, access_origin: 'independent' }],
};
const COURSE: [string, string] = ['course', RECORD];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NOTIFICATION_OUTBOX_DELIVERY', 'on');
  vi.stubEnv('NOTIFICATION_SNAPSHOT_SECRET', 'synthetic-snapshot-secret-0123456789abcdef');
  vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', UNSUBSCRIBE_SECRET);
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', BASE_URL);
  vi.stubEnv('EMAIL_FROM_ADDRESS', '');
  vi.stubEnv('RESEND_API_KEY', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('D1 — claim, lease and the live owner', () => {
  it('two concurrent runs give each row to one owner and send it once', async () => {
    const db = createDb(ENROLLED);
    const rows = [queue(db, 'course_assigned', COURSE), queue(db, 'course_assigned', COURSE), queue(db, 'course_assigned', COURSE)];
    const transport = accepted();

    const results = await Promise.all([run(db, transport), run(db, transport)]);

    expect(results.map((r) => r.claimed).sort()).toEqual([0, 3]);
    expect(transport.mock.calls.map(([, options]) => options?.idempotencyKey).sort()).toEqual(rows.map((r) => r.idempotency_key).sort());
    expect(rows.map((r) => r.status)).toEqual(['sent', 'sent', 'sent']);
  });

  it('an owner whose lease ran out can neither freeze nor send', async () => {
    const db = createDb(ENROLLED);
    const row = queue(db, 'course_assigned', COURSE);
    db.afterRpc = (name) => { if (name === 'claim_notification_emails') db.now += 121; };
    const transport = accepted();

    const result = await run(db, transport);

    expect(result).toMatchObject({ claimed: 1, lost: 1, sent: 0 });
    expect(transport).not.toHaveBeenCalled();
    expect(row).toMatchObject({ status: 'sending', send_snapshot: null, attempt_count: 0 });
  });

  it('a send its owner could not record is repeated by the next owner with the same bytes and key', async () => {
    const db = createDb(ENROLLED);
    const row = queue(db, 'course_assigned', COURSE, { payload: { 'course.name': 'Curso sintético' } });
    const transport = accepted();
    db.afterRpc = (name) => { if (name === 'begin_notification_email_attempt') db.now += 121; };

    expect(await run(db, transport)).toMatchObject({ claimed: 1, lost: 1 });
    expect(row.status).toBe('sending');
    const frozen = row.send_snapshot;

    db.afterRpc = () => undefined;
    expect(await run(db, transport)).toMatchObject({ claimed: 1, sent: 1 });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1]).toEqual(transport.mock.calls[0]);
    expect(frozen).not.toBeNull();
    expect(row).toMatchObject({ status: 'sent', send_snapshot: null, provider_message_id: 'provider-message-1' });
  });
});

describe('D2 — source access and preference before the first attempt', () => {
  const session = { id: RECORD, school_id: SCHOOL, growth_community_id: COMMUNITY, status: 'programada', is_active: true };
  const SESSION: [string, string] = ['session', RECORD];
  const member = role('docente', { school_id: SCHOOL, community_id: COMMUNITY });
  const licitacion = { id: RECORD, school_id: SCHOOL };
  const group = { id: RECORD, school_id: SCHOOL, community_id: COMMUNITY };
  const schoolGroup = { ...group, community_id: null };
  const GROUP: [string, string] = ['group', RECORD];
  const membership = { group_id: RECORD, user_id: U };
  const moved = { school_id: OTHER_SCHOOL, community_id: OTHER_COMMUNITY };
  const sameSchoolMove = { school_id: SCHOOL, community_id: OTHER_COMMUNITY };
  const invited = (roles: Row[], groups: Row[] = [group], members: Row[] = [membership]): Tables => ({
    user_roles: roles, group_assignment_groups: groups, group_assignment_members: members,
  });
  const consultantOf = (extra: Row): Row => ({
    consultant_id: U, student_id: null, school_id: null, generation_id: null, community_id: null,
    is_active: true, assignment_data: {}, ...extra,
  });
  const pathOrigin: Tables = {
    course_enrollments: [{ user_id: U, course_id: RECORD, access_origin: 'learning_path' }],
    learning_path_courses: [{ learning_path_id: PATH, course_id: RECORD }],
    community_workspaces: [{ id: WORKSPACE, community_id: COMMUNITY }],
  };
  const quiz = { quiz_submissions: [{ id: RECORD, student_id: OTHER }] };
  const studentIn = (community: string) => ({ user_id: OTHER, role_type: 'docente', school_id: SCHOOL, generation_id: null, community_id: community, is_active: true });

  type Case = [name: string, event: string, source: [string, string] | null, tables: Tables, status: string, code: string | null];
  const cases: Case[] = [
    // session: GET /api/sessions/[id]
    ['session: member of its community', 'session_created', SESSION, { user_roles: [member], consultor_sessions: [session] }, 'sent', null],
    ['session: moved to another community', 'session_created', SESSION, { user_roles: [role('docente', { school_id: SCHOOL, community_id: OTHER_COMMUNITY })], consultor_sessions: [session] }, 'cancelled', 'source_access_revoked'],
    ['session: community role no longer active', 'session_created', SESSION, { user_roles: [{ ...member, is_active: false }, role('docente')], consultor_sessions: [session] }, 'cancelled', 'source_access_revoked'],
    ['session: consultor of its school', 'session_reminder_24h', SESSION, { user_roles: [role('consultor', { school_id: SCHOOL })], consultor_sessions: [session] }, 'sent', null],
    ['session: consultor of another school', 'session_reminder_24h', SESSION, { user_roles: [role('consultor', { school_id: OTHER_SCHOOL })], consultor_sessions: [session] }, 'cancelled', 'source_access_revoked'],
    ['session: archived, not an admin', 'session_rescheduled', SESSION, { user_roles: [member], consultor_sessions: [{ ...session, is_active: false }] }, 'cancelled', 'source_access_revoked'],
    ['session: archived, admin', 'session_rescheduled', SESSION, { user_roles: [role('admin')], consultor_sessions: [{ ...session, is_active: false }] }, 'sent', null],
    ['session: deleted', 'session_created', SESSION, { user_roles: [member] }, 'cancelled', 'source_access_revoked'],
    ['session edit request: no longer an admin', 'session_edit_request_submitted', SESSION, { user_roles: [member], consultor_sessions: [session] }, 'cancelled', 'audience_role_revoked'],
    // licitación: RLS
    ['licitación: encargado of its school', 'licitacion_published', ['licitacion', RECORD], { user_roles: [role('encargado_licitacion', { school_id: SCHOOL })], licitaciones: [licitacion] }, 'sent', null],
    ['licitación: encargado moved to another school', 'licitacion_published', ['licitacion', RECORD], { user_roles: [role('encargado_licitacion', { school_id: OTHER_SCHOOL })], licitaciones: [licitacion] }, 'cancelled', 'source_access_revoked'],
    ['licitación: admin', 'licitacion_adjudicada', ['licitacion', RECORD], { user_roles: [role('admin')], licitaciones: [licitacion] }, 'sent', null],
    ['licitación contract: encargado is not its audience', 'licitacion_contrato_generado', ['licitacion', RECORD], { user_roles: [role('encargado_licitacion', { school_id: SCHOOL })], licitaciones: [licitacion] }, 'cancelled', 'audience_role_revoked'],
    // course: course_enrollment_grants_access
    ['course: independent enrolment', 'course_assigned', COURSE, ENROLLED, 'sent', null],
    ['course: enrolment removed', 'course_assigned', COURSE, { user_roles: [role('docente')] }, 'cancelled', 'source_access_revoked'],
    ['course: path enrolment, path entitlement lapsed', 'course_completed', COURSE, { user_roles: [member], ...pathOrigin }, 'cancelled', 'source_access_revoked'],
    ['course: path enrolment, path assigned to their community', 'course_assigned', COURSE, { user_roles: [member], ...pathOrigin, learning_path_assignments: [{ path_id: PATH, user_id: null, group_id: WORKSPACE }] }, 'sent', null],
    ['course: path assigned to a community they left', 'course_completed', COURSE, { user_roles: [role('docente', { community_id: OTHER_COMMUNITY })], ...pathOrigin, learning_path_assignments: [{ path_id: PATH, user_id: null, group_id: WORKSPACE }] }, 'cancelled', 'source_access_revoked'],
    ['course: path enrolment, explicit assignment', 'course_assigned', COURSE, { user_roles: [member], ...pathOrigin, course_assignments: [{ teacher_id: U, course_id: RECORD, status: 'active' }] }, 'sent', null],
    ['course: path enrolment, assignment cancelled', 'module_completed', COURSE, { user_roles: [member], ...pathOrigin, course_assignments: [{ teacher_id: U, course_id: RECORD, status: 'cancelled' }] }, 'cancelled', 'source_access_revoked'],
    // assignment: its course, while published
    ['assignment: published, course open', 'assignment_feedback', ['assignment', uuid(11)], { ...ENROLLED, lesson_assignments: [{ id: uuid(11), course_id: RECORD, is_published: true }] }, 'sent', null],
    ['assignment: unpublished', 'assignment_feedback', ['assignment', uuid(11)], { ...ENROLLED, lesson_assignments: [{ id: uuid(11), course_id: RECORD, is_published: false }] }, 'cancelled', 'source_access_revoked'],
    ['assignment: course no longer open', 'assignment_due_soon', ['assignment', uuid(11)], { user_roles: [member], lesson_assignments: [{ id: uuid(11), course_id: RECORD, is_published: true }] }, 'cancelled', 'source_access_revoked'],
    // consultant assignment
    ['consultant assignment: active, theirs', 'consultant_assigned', ['consultant_assignment', RECORD], { user_roles: [member], consultant_assignments: [{ id: RECORD, consultant_id: OTHER, student_id: U, is_active: true }] }, 'sent', null],
    ['consultant assignment: ended', 'consultant_assigned', ['consultant_assignment', RECORD], { user_roles: [member], consultant_assignments: [{ id: RECORD, consultant_id: OTHER, student_id: U, is_active: false }] }, 'cancelled', 'source_access_revoked'],
    ['consultant assignment: another student\'s', 'consultant_assigned', ['consultant_assignment', RECORD], { user_roles: [member], consultant_assignments: [{ id: RECORD, consultant_id: U, student_id: OTHER, is_active: true }] }, 'cancelled', 'source_access_revoked'],
    // group: visible as group_assignment_groups RLS decides, then member / consultant of its community
    ['group invitation: member in its community', 'group_invitation', GROUP, invited([member]), 'sent', null],
    ['group invitation: member of a school-only group at its school', 'group_invitation', GROUP, invited([role('docente', { school_id: SCHOOL })], [schoolGroup]), 'sent', null],
    ['group invitation: admin member', 'group_invitation', GROUP, invited([role('admin')]), 'sent', null],
    ['group invitation: removed from the group', 'group_invitation', GROUP, invited([member], [group], [{ group_id: RECORD, user_id: OTHER }]), 'cancelled', 'source_access_revoked'],
    ['group invitation: admin who is not a member', 'group_invitation', GROUP, invited([role('admin')], [group], []), 'cancelled', 'source_access_revoked'],
    ['group invitation: moved to another school and community, membership left behind', 'group_invitation', GROUP, invited([role('docente', moved)]), 'cancelled', 'source_access_revoked'],
    ['group invitation: moved to another community of the school, membership left behind', 'group_invitation', GROUP, invited([role('docente', sameSchoolMove)]), 'cancelled', 'source_access_revoked'],
    ['group invitation: community role no longer active, membership left behind', 'group_invitation', GROUP, invited([{ ...member, is_active: false }, role('docente', { school_id: SCHOOL })]), 'cancelled', 'source_access_revoked'],
    ['group invitation: school-only group, moved to another school, membership left behind', 'group_invitation', GROUP, invited([role('docente', moved)], [schoolGroup]), 'cancelled', 'source_access_revoked'],
    ['group invitation: group deleted, membership left behind', 'group_invitation', GROUP, invited([member], []), 'cancelled', 'source_access_revoked'],
    ['group submission: consultant in its community', 'group_assignment_submitted', GROUP, { user_roles: [role('consultor', { school_id: SCHOOL, community_id: COMMUNITY })], group_assignment_groups: [group], consultant_assignments: [consultantOf({ community_id: COMMUNITY })] }, 'sent', null],
    ['group submission: admin assigned to its community', 'group_assignment_submitted', GROUP, { user_roles: [role('admin')], group_assignment_groups: [group], consultant_assignments: [consultantOf({ community_id: COMMUNITY })] }, 'sent', null],
    ['group submission: admin without an assignment', 'group_assignment_submitted', GROUP, { user_roles: [role('admin')], group_assignment_groups: [group] }, 'cancelled', 'source_access_revoked'],
    ['group submission: consultant moved to another school and community, old assignment still active', 'group_assignment_submitted', GROUP, { user_roles: [role('consultor', moved)], group_assignment_groups: [group], consultant_assignments: [consultantOf({ community_id: COMMUNITY })] }, 'cancelled', 'source_access_revoked'],
    ['group submission: consultant moved to another community of the school, old assignment still active', 'group_assignment_submitted', GROUP, { user_roles: [role('consultor', sameSchoolMove)], group_assignment_groups: [group], consultant_assignments: [consultantOf({ community_id: COMMUNITY })] }, 'cancelled', 'source_access_revoked'],
    ['group submission: consultant assigned to another community', 'group_assignment_submitted', GROUP, { user_roles: [role('consultor', { school_id: SCHOOL, community_id: COMMUNITY })], group_assignment_groups: [group], consultant_assignments: [consultantOf({ community_id: OTHER_COMMUNITY })] }, 'cancelled', 'source_access_revoked'],
    ['group submission: community assignment ended', 'group_assignment_submitted', GROUP, { user_roles: [role('consultor', { school_id: SCHOOL, community_id: COMMUNITY })], group_assignment_groups: [group], consultant_assignments: [consultantOf({ community_id: COMMUNITY, is_active: false })] }, 'cancelled', 'source_access_revoked'],
    ['group submission: no longer a consultant', 'group_assignment_submitted', GROUP, { user_roles: [member], group_assignment_groups: [group], consultant_assignments: [consultantOf({ community_id: COMMUNITY })] }, 'cancelled', 'source_access_revoked'],
    ['group submission: school-only group has no community consultants', 'group_assignment_submitted', GROUP, { user_roles: [role('consultor', { school_id: SCHOOL })], group_assignment_groups: [schoolGroup], consultant_assignments: [consultantOf({ community_id: COMMUNITY })] }, 'cancelled', 'source_access_revoked'],
    ['group submission: group deleted, assignment still active', 'group_assignment_submitted', GROUP, { user_roles: [role('consultor', { school_id: SCHOOL, community_id: COMMUNITY })], consultant_assignments: [consultantOf({ community_id: COMMUNITY })] }, 'cancelled', 'source_access_revoked'],
    // quiz submission
    ['quiz reviewed: its student', 'quiz_reviewed', ['quiz_submission', RECORD], { user_roles: [member], quiz_submissions: [{ id: RECORD, student_id: U }] }, 'sent', null],
    ['quiz reviewed: another student\'s', 'quiz_reviewed', ['quiz_submission', RECORD], { user_roles: [member], ...quiz }, 'cancelled', 'source_access_revoked'],
    ['quiz review: consultant whose community covers the student', 'quiz_review_pending', ['quiz_submission', RECORD], { user_roles: [role('consultor'), studentIn(COMMUNITY)], ...quiz, consultant_assignments: [consultantOf({ community_id: COMMUNITY, assignment_data: { assignment_scope: 'community' } })] }, 'sent', null],
    ['quiz review: student moved out of the consultant\'s community', 'quiz_review_pending', ['quiz_submission', RECORD], { user_roles: [role('consultor'), studentIn(OTHER_COMMUNITY)], ...quiz, consultant_assignments: [consultantOf({ community_id: COMMUNITY, assignment_data: { assignment_scope: 'community' } })] }, 'cancelled', 'source_access_revoked'],
    ['quiz review: no longer holds a reviewing role', 'quiz_review_pending', ['quiz_submission', RECORD], { user_roles: [role('docente'), studentIn(COMMUNITY)], ...quiz, consultant_assignments: [consultantOf({ student_id: OTHER })] }, 'cancelled', 'source_access_revoked'],
    // workspace: can_access_workspace
    ['workspace: member', 'user_mentioned', ['workspace', WORKSPACE], { user_roles: [member], workspace_members: [{ user_id: U, workspace_id: WORKSPACE }] }, 'sent', null],
    ['workspace: no longer a member', 'message_sent', ['workspace', WORKSPACE], { user_roles: [member], workspace_members: [{ user_id: OTHER, workspace_id: WORKSPACE }] }, 'cancelled', 'source_access_revoked'],
    // events without a record: the audience role
    ['admin event: admin', 'new_feedback', null, { user_roles: [role('admin')] }, 'digest', null],
    ['admin event: no longer an admin', 'qa_test_failed', null, { user_roles: [member] }, 'cancelled', 'audience_role_revoked'],
    ['tester event: tester', 'qa_scenario_assigned', null, { user_roles: [member], profiles: [{ id: U, email: ADDRESS, school_id: null, can_run_qa_tests: true }] }, 'sent', null],
    ['tester event: no longer a tester', 'qa_scenario_assigned', null, { user_roles: [member], profiles: [{ id: U, email: ADDRESS, school_id: null, can_run_qa_tests: false }] }, 'cancelled', 'audience_role_revoked'],
    ['any recipient without an active role', 'course_assigned', COURSE, { ...ENROLLED, user_roles: [{ ...member, is_active: false }] }, 'cancelled', 'no_active_role'],
    // a reference that cannot be used
    ['reference absent', 'course_assigned', null, ENROLLED, 'failed', 'source_missing'],
    ['reference of another kind', 'course_assigned', ['session', RECORD], ENROLLED, 'failed', 'source_mismatch'],
    ['reference malformed', 'course_assigned', ['course', '42'], ENROLLED, 'failed', 'source_malformed'],
    ['reference on an event without a record', 'new_feedback', COURSE, { user_roles: [role('admin')] }, 'failed', 'source_mismatch'],
    ['event the catalog does not map', 'n14_unmapped_event', COURSE, ENROLLED, 'failed', 'event_unsupported'],
    ['event with no recipient rule', 'learning_path_assigned', COURSE, ENROLLED, 'failed', 'event_unsupported'],
    ['meeting summary stays suppressed', 'meeting_finalized', null, { user_roles: [member] }, 'cancelled', 'email_suppressed'],
  ];

  it.each(cases)('%s', async (_name, event, source, tables, status, code) => {
    const db = createDb(tables);
    const row = queue(db, event, source);
    const transport = accepted();

    await run(db, transport);

    expect([row.status === 'pending' ? row.email_mode : row.status, row.last_error_code]).toEqual([status, code]);
    expect(transport).toHaveBeenCalledTimes(status === 'sent' ? 1 : 0);
    expect(row.send_snapshot).toBeNull();
    if (status !== 'sent') expect(row.attempt_count).toBe(0);
  });

  it.each([
    ['the role read', 'user_roles', 'access_lookup_failed', COURSE],
    ['the source record read', 'course_enrollments', 'access_lookup_failed', COURSE],
    ['the membership check', 'can_access_workspace', 'access_lookup_failed', ['workspace', WORKSPACE]],
    ['the legacy preference read', 'user_notification_preferences', 'preference_unavailable', COURSE],
    ['the category preference read', 'user_notification_category_prefs', 'preference_unavailable', COURSE],
    ['the address read', 'profiles', 'recipient_lookup_failed', COURSE],
  ] as Array<[string, string, string, [string, string]]>)('fails closed when %s fails', async (_name, failing, code, source) => {
    const db = createDb({ ...ENROLLED, workspace_members: [{ user_id: U, workspace_id: WORKSPACE }] });
    const row = queue(db, source[0] === 'course' ? 'course_assigned' : 'message_sent', source);
    db.failing.add(failing);
    const transport = accepted();

    const result = await run(db, transport);

    expect(result).toMatchObject({ claimed: 1, retried: 1, sent: 0 });
    expect(row).toMatchObject({ status: 'pending', last_error_code: code, send_snapshot: null, attempt_count: 0 });
    expect(row.next_attempt_at).toBe(db.now + 900);
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    ['group_invitation', 'user_roles'],
    ['group_invitation', 'group_assignment_groups'],
    ['group_invitation', 'group_assignment_members'],
    ['group_assignment_submitted', 'user_roles'],
    ['group_assignment_submitted', 'group_assignment_groups'],
    ['group_assignment_submitted', 'consultant_assignments'],
  ])('%s fails closed when the %s read fails', async (event, failing) => {
    const db = createDb({
      ...invited([role('consultor', { school_id: SCHOOL, community_id: COMMUNITY })]),
      consultant_assignments: [consultantOf({ community_id: COMMUNITY })],
    });
    const row = queue(db, event, GROUP);
    db.failing.add(failing);
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ claimed: 1, retried: 1, sent: 0 });
    expect(row).toMatchObject({ status: 'pending', last_error_code: 'access_lookup_failed', send_snapshot: null, attempt_count: 0 });
    expect(transport).not.toHaveBeenCalled();

    // The same row is sendable once the read answers: the failure, not the data, held it back.
    db.failing.clear();
    db.now += 900;
    expect(await run(db, transport)).toMatchObject({ claimed: 1, sent: 1 });
  });

  it.each([
    ['category switched off', { user_notification_category_prefs: [{ user_id: U, category: 'courses', email_mode: 'off' }] }, 'cancelled', 'preference_off'],
    ['legacy row switched off', { user_notification_preferences: [{ user_id: U, notification_type: 'course_assigned', email_enabled: false }] }, 'cancelled', 'preference_off'],
    ['category immediate over a legacy off', {
      user_notification_category_prefs: [{ user_id: U, category: 'courses', email_mode: 'immediate', pref_version: 7 }],
      user_notification_preferences: [{ user_id: U, notification_type: 'course_assigned', email_enabled: false }],
    }, 'sent', null],
    ['another category switched off', { user_notification_category_prefs: [{ user_id: U, category: 'sessions', email_mode: 'off' }] }, 'sent', null],
    ['category switched to the daily digest', { user_notification_category_prefs: [{ user_id: U, category: 'courses', email_mode: 'digest' }] }, 'digest', null],
  ] as Array<[string, Tables, string, string | null]>)('current preference: %s', async (_name, prefs, status, code) => {
    const db = createDb({ ...ENROLLED, ...prefs });
    const row = queue(db, 'course_assigned', COURSE);
    const transport = accepted();

    await run(db, transport);

    expect([row.status === 'pending' ? row.email_mode : row.status, row.last_error_code]).toEqual([status, code]);
    expect(transport).toHaveBeenCalledTimes(status === 'sent' ? 1 : 0);
    expect(row.send_snapshot).toBeNull();
  });

  it('a mandatory email ignores preferences, even unreadable ones, but not revoked access', async () => {
    const tables: Tables = {
      user_roles: [member],
      consultor_sessions: [{ ...session, status: 'cancelada' }],
      user_notification_category_prefs: [{ user_id: U, category: 'sessions', email_mode: 'off' }],
    };
    const db = createDb(tables);
    const row = queue(db, 'session_cancelled', SESSION);
    db.failing.add('user_notification_preferences').add('user_notification_category_prefs');
    const transport = accepted();
    await run(db, transport);
    expect(row.status).toBe('sent');
    expect(db.calls).not.toContain('user_notification_category_prefs');

    const revoked = createDb({ ...tables, user_roles: [role('docente', { community_id: OTHER_COMMUNITY })] });
    const revokedRow = queue(revoked, 'session_cancelled', SESSION);
    await run(revoked, transport);
    expect(revokedRow).toMatchObject({ status: 'cancelled', last_error_code: 'source_access_revoked' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

describe('D3 — the frozen, encrypted message', () => {
  const payload = { 'course.name': 'Curso sintético', secret_note: 'nota-que-no-debe-salir' };

  it.each([
    ['email-only', null],
    ['in-app plus email', uuid(90)],
  ])('an eligible %s row is frozen encrypted before the provider is called', async (_name, notificationId) => {
    const db = createDb(ENROLLED);
    const row = queue(db, 'course_assigned', COURSE, { payload, notification_id: notificationId, related_url: '/mi-aprendizaje' });
    let storedAtSend: unknown = null;
    const transport = vi.fn(async () => {
      storedAtSend = row.send_snapshot;
      return { data: { id: 'provider-message-1' }, error: null };
    });

    expect(await run(db, transport)).toMatchObject({ claimed: 1, sent: 1 });

    const [message, options] = transport.mock.calls[0] as unknown as [Row, Row];
    expect(options).toEqual({ idempotencyKey: row.idempotency_key });
    expect(message.to).toBe(ADDRESS);
    expect(message.subject).toBe('Nuevo curso asignado: Curso sintético');
    expect(message.html).toContain(`${BASE_URL}/mi-aprendizaje`);
    expect(message.html).not.toContain('nota-que-no-debe-salir');
    // Frozen before the call, and not readable as stored.
    expect(storedAtSend).toMatch(/^\\x[0-9a-f]+$/);
    const storedText = Buffer.from(String(storedAtSend).slice(2), 'hex').toString('latin1');
    for (const plain of [ADDRESS, 'Curso sint', 'Nuevo curso', BASE_URL]) expect(storedText).not.toContain(plain);
    expect(row).toMatchObject({ status: 'sent', send_snapshot: null, attempt_count: 1 });
  });

  it('a retry resends the frozen bytes under the same key, whatever changed since', async () => {
    const db = createDb(ENROLLED);
    const row = queue(db, 'course_assigned', COURSE, { payload });
    const transport = vi.fn()
      .mockRejectedValueOnce(new Error(`transient provider failure for ${ADDRESS}`))
      .mockResolvedValue({ data: { id: 'provider-message-2' }, error: null });

    expect(await run(db, transport)).toMatchObject({ claimed: 1, retried: 1, sent: 0 });
    expect(row).toMatchObject({ status: 'pending', last_error_code: 'transport_error', attempt_count: 1 });
    const frozen = row.send_snapshot;
    expect(frozen).not.toBeNull();

    // Not due yet: nothing is claimed.
    expect(await run(db, transport)).toMatchObject({ claimed: 0 });

    row.payload = { 'course.name': 'Otro nombre' };
    row.related_url = '/otra-ruta';
    db.tables.profiles[0].email = 'otra.direccion@ejemplo.invalid';
    db.now += 900;
    expect(await run(db, transport)).toMatchObject({ claimed: 1, sent: 1 });

    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1]).toEqual(transport.mock.calls[0]);
    expect(row).toMatchObject({ status: 'sent', send_snapshot: null, attempt_count: 2, provider_message_id: 'provider-message-2' });
    // The source record is checked again before the retry (N3-04); the address is the frozen one.
    expect(db.calls.filter((c) => c === 'course_enrollments')).toHaveLength(2);
  });

  it('a snapshot sealed under another key is never sent', async () => {
    const db = createDb(ENROLLED);
    const row = queue(db, 'course_assigned', COURSE);
    const transport = vi.fn().mockRejectedValueOnce(new Error('transient'));
    await run(db, transport);
    const frozen = row.send_snapshot;

    vi.stubEnv('NOTIFICATION_SNAPSHOT_SECRET', 'another-synthetic-secret-0123456789abcdef');
    db.now += 900;
    expect(await run(db, transport)).toMatchObject({ claimed: 1, retried: 1 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ status: 'pending', last_error_code: 'snapshot_unreadable', send_snapshot: frozen });
  });

  it('an event whose producer writes its own copy goes out as the generic notice', async () => {
    const db = createDb({
      user_roles: [role('docente', { school_id: SCHOOL })],
      group_assignment_groups: [{ id: RECORD, school_id: SCHOOL, community_id: null }],
      group_assignment_members: [{ group_id: RECORD, user_id: U }],
    });
    queue(db, 'group_invitation', ['group', RECORD], { payload: { anything: 'texto libre' }, related_url: '/mi-aprendizaje/tareas' });
    const transport = accepted();
    await run(db, transport);
    const [message] = transport.mock.calls[0];
    expect(message.subject).toBe('Tienes una nueva notificación en Genera');
    expect(message.html).not.toContain('texto libre');
  });

  it('neither the result nor a log line names the recipient', async () => {
    const logs = ['log', 'error', 'warn', 'info'].map((level) => vi.spyOn(console, level as 'log').mockImplementation(() => undefined));
    const db = createDb(ENROLLED);
    queue(db, 'course_assigned', COURSE);
    queue(db, 'course_assigned', null);
    db.failing.add('user_notification_preferences');

    const result = await run(db, vi.fn().mockRejectedValue(new Error(`failure for ${ADDRESS}`)));

    const printed = JSON.stringify([result, ...logs.map((spy) => spy.mock.calls)]);
    expect(printed).not.toContain(ADDRESS);
    expect(printed).not.toContain(U);
    logs.forEach((spy) => spy.mockRestore());
  });
});

describe('D4 — authorization, then the provider', () => {
  it('a client recipient is authorized first and the accepted result is recorded', async () => {
    const db = createDb(ENROLLED);
    const row = queue(db, 'course_assigned', COURSE);
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ status: 'ok', claimed: 1, sent: 1 });

    const authorize = vi.mocked(authorizeUserEmail);
    const deliver = vi.mocked(deliverOutboundEmail);
    expect(authorize).toHaveBeenCalledWith(db.client, U);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(authorize.mock.invocationCallOrder[0]).toBeLessThan(deliver.mock.invocationCallOrder[0]);
    expect(deliver.mock.calls[0][0].authorization).toEqual({ kind: 'allow', scope: 'client', schoolId: SCHOOL });
    expect(transport.mock.calls[0][0].from).toBe('Genera <notificaciones@nuevaeducacion.org>');
    expect(row).toMatchObject({ status: 'sent', provider_message_id: 'provider-message-1', last_error_code: null });
  });

  it.each([
    ['a QA tenant recipient is suppressed', { schools: [{ id: QA_SCHOOL, tenant_kind: 'qa', internal_zoom_testing_enabled: false }] }, QA_SCHOOL, 'cancelled', 'suppressed_qa'],
    ['a QA school outside the allowlist is refused', { schools: [{ id: 999, tenant_kind: 'qa', internal_zoom_testing_enabled: false }] }, 999, 'failed', 'refused_qa_school_not_allowlisted'],
    ['an unreadable school is refused for now', {}, SCHOOL, 'pending', 'refused_school_lookup_failed'],
  ] as Array<[string, Tables, number, string, string]>)('%s without contacting the provider', async (_name, tables, school, status, code) => {
    const db = createDb({ ...ENROLLED, user_roles: [role('docente', { school_id: school })], schools: [], ...tables });
    const row = queue(db, 'course_assigned', COURSE);
    const transport = accepted();

    await run(db, transport);

    expect(row).toMatchObject({ status, last_error_code: code, send_snapshot: null, attempt_count: 0 });
    expect(deliverOutboundEmail).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    ['an invalid sender', 'EMAIL_FROM_ADDRESS', 'Genera <notificaciones@example.invalid>\r\nBcc: x@example.invalid'],
    ['a missing snapshot secret', 'NOTIFICATION_SNAPSHOT_SECRET', ''],
    ['a short snapshot secret', 'NOTIFICATION_SNAPSHOT_SECRET', 'too-short'],
  ])('%s claims nothing and sends nothing', async (_name, variable, value) => {
    vi.stubEnv(variable, value);
    const db = createDb(ENROLLED);
    const row = queue(db, 'course_assigned', COURSE);
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ enabled: true, status: 'not_configured', claimed: 0 });
    expect(db.calls).toEqual([]);
    expect(row.status).toBe('pending');
    expect(transport).not.toHaveBeenCalled();
  });

  it('a provider rejection is recorded as failed, without its text', async () => {
    const db = createDb(ENROLLED);
    const row = queue(db, 'course_assigned', COURSE);
    const transport = vi.fn(async () => ({ data: null, error: { message: `invalid recipient ${ADDRESS}` } }));

    expect(await run(db, transport)).toMatchObject({ claimed: 1, failed: 1, sent: 0 });
    expect(row).toMatchObject({ status: 'failed', last_error_code: 'provider_rejected', send_snapshot: null, provider_message_id: null });
  });

  it('a provider error is left pending with its frozen message, never marked sent', async () => {
    const db = createDb(ENROLLED);
    const row = queue(db, 'course_assigned', COURSE);
    const transport = vi.fn().mockRejectedValue(new Error('transient provider failure'));

    expect(await run(db, transport)).toMatchObject({ claimed: 1, retried: 1, sent: 0 });
    expect(row).toMatchObject({ status: 'pending', last_error_code: 'transport_error', provider_message_id: null });
    expect(row.send_snapshot).not.toBeNull();
    expect(row.next_attempt_at).toBe(db.now + 90);
  });

  it('no provider key: nothing is sent and the row waits', async () => {
    const db = createDb(ENROLLED);
    const row = queue(db, 'course_assigned', COURSE);

    expect(await runNotificationEmailWorker(db.client)).toMatchObject({ claimed: 1, retried: 1 });
    expect(row).toMatchObject({ status: 'pending', last_error_code: 'not_configured' });
  });
});

describe('D5 — the flag', () => {
  it.each([['unset', undefined], ['off', 'off'], ['empty', ''], ['an unknown value', 'yes please']])(
    'NOTIFICATION_OUTBOX_DELIVERY %s: no claim, no read, no send',
    async (_name, value) => {
      if (value === undefined) delete process.env.NOTIFICATION_OUTBOX_DELIVERY;
      else vi.stubEnv('NOTIFICATION_OUTBOX_DELIVERY', value);
      const db = createDb(ENROLLED);
      const row = queue(db, 'course_assigned', COURSE);
      const transport = accepted();

      expect(await run(db, transport)).toMatchObject({ enabled: false, status: 'disabled', claimed: 0 });
      expect(db.calls).toEqual([]);
      expect(row).toMatchObject({ status: 'pending', lease_owner: null });
      expect(transport).not.toHaveBeenCalled();
    }
  );

  it('on: digest rows and rows not yet due stay where they are', async () => {
    const db = createDb(ENROLLED);
    const due = queue(db, 'course_assigned', COURSE);
    const digest = queue(db, 'course_assigned', COURSE, { email_mode: 'digest' });
    const later = queue(db, 'course_assigned', COURSE, { next_attempt_at: 5000 });

    expect(await run(db, accepted())).toMatchObject({ enabled: true, claimed: 1, sent: 1 });
    expect([due.status, digest.status, later.status]).toEqual(['sent', 'pending', 'pending']);
  });

  it('a failed claim throws a message that names nothing', async () => {
    const db = createDb(ENROLLED);
    db.failing.add('claim_notification_emails');
    await expect(run(db, accepted())).rejects.toThrow(/^claim_failed$/);
  });
});

/** One course row whose first attempt got no answer: pending again, frozen, attempt 1, due now. */
async function ambiguousRow() {
  const db = createDb(ENROLLED);
  const row = queue(db, 'course_assigned', COURSE, { payload: { 'course.name': 'Curso sintético' } });
  const transport = vi.fn()
    .mockRejectedValueOnce(new Error(`connection reset for ${ADDRESS}`))
    .mockResolvedValue({ data: { id: 'provider-message-2' }, error: null });
  await run(db, transport);
  db.now = row.next_attempt_at;
  return { db, row, transport, frozen: row.send_snapshot as string };
}

describe('N3-04 D1 — what the provider answered', () => {
  const http = (status: number, body: Row) => vi.fn(async (_url: string, _init: Row) => ({ ok: status < 300, status, json: async () => body }));
  const refusal = { name: 'synthetic_error', message: `refused for ${ADDRESS}` };
  /** The real transport: only `fetch` is a stand-in. */
  const send = (db: ReturnType<typeof createDb>) => runNotificationEmailWorker(db.client, { random: () => 0.5 });

  beforeEach(() => vi.stubEnv('RESEND_API_KEY', 'synthetic-provider-key'));
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['200 is sent', 200, { id: 'provider-message-9' }, 'sent', null],
    ['422 is a definite refusal', 422, refusal, 'failed', 'provider_rejected'],
    ['403 is a definite refusal', 403, refusal, 'failed', 'provider_rejected'],
    ['409 is final on its first response', 409, refusal, 'failed', 'provider_conflict'],
  ] as Array<[string, number, Row, string, string | null]>)('%s', async (_name, status, body, expected, code) => {
    const db = createDb(ENROLLED);
    const row = queue(db, 'course_assigned', COURSE);
    const key = row.idempotency_key;
    const fetchMock = http(status, body);
    vi.stubGlobal('fetch', fetchMock);

    const result = await send(db);

    expect(result).toMatchObject({ claimed: 1, [expected]: 1 });
    expect(row).toMatchObject({ status: expected, last_error_code: code, send_snapshot: null, lease_owner: null, attempt_count: 1 });
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe(key);
    expect(JSON.stringify([result, row.last_error_code])).not.toContain(ADDRESS);

    // Over: never claimed again, and never sent under another key.
    db.now += DAY;
    expect(await send(db)).toMatchObject({ claimed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(row.idempotency_key).toBe(key);
  });

  it.each([
    ['429', () => http(429, refusal)],
    ['500', () => http(500, refusal)],
    ['503', () => http(503, refusal)],
    ['a call that threw', () => vi.fn(async () => { throw new Error(`socket closed for ${ADDRESS}`); })],
  ] as Array<[string, () => any]>)('%s is ambiguous: the row keeps its snapshot and key and goes out again unchanged', async (_name, failing) => {
    const db = createDb(ENROLLED);
    const row = queue(db, 'course_assigned', COURSE);
    const key = row.idempotency_key;
    vi.stubGlobal('fetch', failing());

    expect(await send(db)).toMatchObject({ claimed: 1, retried: 1, sent: 0, failed: 0 });
    expect(row).toMatchObject({ status: 'pending', last_error_code: 'transport_error', idempotency_key: key, attempt_count: 1, provider_message_id: null });
    expect(row.next_attempt_at).toBe(db.now + 90);
    const frozen = row.send_snapshot;
    expect(frozen).toMatch(/^\\x[0-9a-f]+$/);

    const accepting = http(200, { id: 'provider-message-9' });
    let storedAtSend: unknown = null;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: Row) => {
      storedAtSend = row.send_snapshot;
      return accepting(url, init);
    }));
    db.now = row.next_attempt_at;
    expect(await send(db)).toMatchObject({ claimed: 1, sent: 1 });
    expect(storedAtSend).toBe(frozen);
    expect(accepting.mock.calls[0][1].headers['Idempotency-Key']).toBe(key);
    expect(JSON.parse(accepting.mock.calls[0][1].body).to).toBe(ADDRESS);
    expect(row).toMatchObject({ status: 'sent', send_snapshot: null, attempt_count: 2 });
  });

  it.each([
    [400, 'failed', 'provider_rejected'],
    [409, 'failed', 'provider_conflict'],
    [429, 'pending', 'transport_error'],
    [500, 'pending', 'transport_error'],
    [502, 'pending', 'transport_error'],
  ])('a transport that reports status %i as an error value is classified the same way', async (statusCode, status, code) => {
    const db = createDb(ENROLLED);
    const row = queue(db, 'course_assigned', COURSE);
    const transport = vi.fn(async () => ({ data: null, error: { message: `refused for ${ADDRESS}`, statusCode } }));

    await run(db, transport);

    expect(transport).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ status, last_error_code: code, attempt_count: 1 });
    expect(row.send_snapshot === null).toBe(status === 'failed');
  });

  // The senders that pass no idempotency key are live today: a status changes nothing for them.
  it.each([429, 500, 409])('an unkeyed send that gets status %i as an error value is a plain refusal, as before', async (statusCode) => {
    const transport = vi.fn(async (_message: Row, _options?: Row) => ({ data: null, error: { message: 'synthetic refusal', statusCode } }));

    const result = await deliverOutboundEmail({
      authorization: { kind: 'allow', scope: 'client', schoolId: SCHOOL },
      message: { to: ADDRESS, subject: 'Asunto sintético', html: '<p>Mensaje sintético</p>' },
      transport,
    });

    expect(result).toEqual({ status: 'provider_rejected', detail: 'synthetic refusal' });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][1]).toEqual({ idempotencyKey: undefined });
  });

  it('no provider key: the row waits unfrozen, no call is made, and it is sent once the key is there', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const db = createDb(ENROLLED);
    const row = queue(db, 'course_assigned', COURSE);
    const fetchMock = http(200, { id: 'provider-message-9' });
    vi.stubGlobal('fetch', fetchMock);

    expect(await send(db)).toMatchObject({ claimed: 1, retried: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.calls).not.toContain('rpc:begin_notification_email_attempt');
    expect(row).toMatchObject({ status: 'pending', last_error_code: 'not_configured', send_snapshot: null, attempt_count: 0, first_attempt_at: null });
    expect(row.next_attempt_at).toBe(db.now + 900);

    vi.stubEnv('RESEND_API_KEY', 'synthetic-provider-key');
    db.now = row.next_attempt_at;
    expect(await send(db)).toMatchObject({ claimed: 1, sent: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('N3-04 D2 — eligibility before every ambiguous retry', () => {
  it.each([
    ['the enrolment was removed', (t: Tables) => { t.course_enrollments = []; }, 'source_access_revoked'],
    ['no active role is left', (t: Tables) => { t.user_roles = [role('docente', { school_id: SCHOOL, is_active: false })]; }, 'no_active_role'],
    ['the category was switched off', (t: Tables) => { t.user_notification_category_prefs = [{ user_id: U, category: 'courses', email_mode: 'off' }]; }, 'preference_off'],
    ['the event was switched off', (t: Tables) => { t.user_notification_preferences = [{ user_id: U, notification_type: 'course_assigned', email_enabled: false }]; }, 'preference_off'],
    ['the category was moved to the digest', (t: Tables) => { t.user_notification_category_prefs = [{ user_id: U, category: 'courses', email_mode: 'digest' }]; }, 'preference_digest'],
    ['the recipient moved to the QA tenant', (t: Tables) => {
      t.user_roles = [role('docente', { school_id: QA_SCHOOL })];
      t.schools = [{ id: QA_SCHOOL, tenant_kind: 'qa', internal_zoom_testing_enabled: false }];
    }, 'suppressed_qa'],
    ['the recipient moved to a QA school outside the allowlist', (t: Tables) => {
      t.user_roles = [role('docente', { school_id: 999 })];
      t.schools = [{ id: 999, tenant_kind: 'qa', internal_zoom_testing_enabled: false }];
    }, 'refused_qa_school_not_allowlisted'],
  ] as Array<[string, (t: Tables) => void, string]>)('%s: cancelled after ambiguous, nothing more is sent', async (_name, revoke, code) => {
    const { db, row, transport } = await ambiguousRow();
    revoke(db.tables);

    expect(await run(db, transport)).toMatchObject({ claimed: 1, cancelled: 1, sent: 0 });

    expect(transport).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ status: 'cancelled_after_ambiguous', last_error_code: code, send_snapshot: null, lease_owner: null, attempt_count: 1 });
    // Closed through the ambiguous-row function: the only finish call is the first run's retry.
    expect(db.calls.filter((c) => c === 'rpc:finish_notification_email')).toHaveLength(1);
    expect(db.calls.filter((c) => c === 'rpc:settle_ambiguous_notification_email')).toHaveLength(1);
  });

  it.each([
    ['the role read', 'user_roles', 'access_lookup_failed'],
    ['the source record read', 'course_enrollments', 'access_lookup_failed'],
    ['the legacy preference read', 'user_notification_preferences', 'preference_unavailable'],
    ['the category preference read', 'user_notification_category_prefs', 'preference_unavailable'],
    ['the school read', 'schools', 'refused_school_lookup_failed'],
  ])('a retry sends nothing when %s fails, and the same bytes once it answers', async (_name, failing, code) => {
    const { db, row, transport, frozen } = await ambiguousRow();
    db.failing.add(failing);

    expect(await run(db, transport)).toMatchObject({ claimed: 1, retried: 1, sent: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ status: 'pending', last_error_code: code, send_snapshot: frozen, attempt_count: 1 });
    expect(row.next_attempt_at).toBe(db.now + 900);

    db.failing.clear();
    db.now = row.next_attempt_at;
    expect(await run(db, transport)).toMatchObject({ claimed: 1, sent: 1 });
    expect(transport.mock.calls[1]).toEqual(transport.mock.calls[0]);
  });

  it('an eligible retry sends the stored bytes, address and key, whatever the row and the profile say now', async () => {
    const { db, row, transport, frozen } = await ambiguousRow();
    const key = row.idempotency_key;
    row.payload = { 'course.name': 'Otro nombre' };
    db.tables.profiles[0].email = 'otra.direccion@ejemplo.invalid';
    let storedAtSend: unknown = null;
    transport.mockImplementationOnce(async () => {
      storedAtSend = row.send_snapshot;
      return { data: { id: 'provider-message-2' }, error: null };
    });

    expect(await run(db, transport)).toMatchObject({ claimed: 1, sent: 1 });

    expect(storedAtSend).toBe(frozen);
    expect(transport.mock.calls[1]).toEqual(transport.mock.calls[0]);
    expect(transport.mock.calls[1][0].to).toBe(ADDRESS);
    expect(transport.mock.calls[1][1]).toEqual({ idempotencyKey: key });
    expect(db.calls.filter((c) => c === 'course_enrollments')).toHaveLength(2);
    expect(row).toMatchObject({ status: 'sent', send_snapshot: null, attempt_count: 2, idempotency_key: key });
  });

  it('a retry whose lease ran out during the checks starts no attempt', async () => {
    const { db, row, transport, frozen } = await ambiguousRow();
    db.afterRpc = (name) => { if (name === 'password_recovery_email_due') db.now += 121; };

    expect(await run(db, transport)).toMatchObject({ claimed: 1, lost: 1, sent: 0 });

    expect(transport).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ status: 'sending', send_snapshot: frozen, attempt_count: 1 });
  });
});

describe('N3-04 D3 — 24 hours, and rows that are over', () => {
  it('an ambiguous row becomes unknown 24 hours after its first attempt, without another send', async () => {
    const { db, row, transport } = await ambiguousRow();
    db.now = row.first_attempt_at + DAY;

    expect(await run(db, transport)).toMatchObject({ claimed: 1, unknown: 1, sent: 0, retried: 0 });

    expect(transport).toHaveBeenCalledTimes(1);
    expect(db.calls.filter((c) => c === 'rpc:begin_notification_email_attempt')).toHaveLength(1);
    expect(row).toMatchObject({ status: 'unknown', last_error_code: 'ambiguous_timeout', send_snapshot: null, lease_owner: null, attempt_count: 1 });
  });

  it('one second before 24 hours it is still retried', async () => {
    const { db, row, transport } = await ambiguousRow();
    db.now = row.first_attempt_at + DAY - 1;

    expect(await run(db, transport)).toMatchObject({ claimed: 1, sent: 1, unknown: 0 });
    expect(row.status).toBe('sent');
  });

  it('a retry that reaches 24 hours during the checks is not sent, and the next run closes it', async () => {
    const { db, row, transport, frozen } = await ambiguousRow();
    db.now = row.first_attempt_at + DAY - 1;
    db.afterRpc = (name) => { if (name === 'password_recovery_email_due') db.now += 1; };

    expect(await run(db, transport)).toMatchObject({ claimed: 1, lost: 1, sent: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ status: 'sending', send_snapshot: frozen, attempt_count: 1 });

    db.afterRpc = () => undefined;
    db.now += 121;
    expect(await run(db, transport)).toMatchObject({ claimed: 1, unknown: 1 });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['cancelled_after_ambiguous', (t: Tables) => { t.course_enrollments = []; }, 0],
    ['unknown', () => undefined, DAY],
  ] as Array<[string, (t: Tables) => void, number]>)('an owner whose lease ran out cannot close a row as %s', async (_name, change, wait) => {
    const { db, row, transport, frozen } = await ambiguousRow();
    change(db.tables);
    db.now = Math.max(db.now, row.first_attempt_at + wait);
    db.afterRpc = (name) => { if (name === 'notification_email_retry_state') db.now += 121; };

    expect(await run(db, transport)).toMatchObject({ claimed: 1, lost: 1, cancelled: 0, unknown: 0 });
    expect(row).toMatchObject({ status: 'sending', send_snapshot: frozen, attempt_count: 1 });
  });

  const over: Array<[string, () => Promise<{ db: ReturnType<typeof createDb>; row: Row; transport: any }>]> = [
    ['sent', async () => {
      const db = createDb(ENROLLED);
      return { db, row: queue(db, 'course_assigned', COURSE), transport: accepted() };
    }],
    ['failed', async () => {
      const db = createDb(ENROLLED);
      return { db, row: queue(db, 'course_assigned', COURSE), transport: vi.fn(async () => ({ data: null, error: { message: 'refused', statusCode: 409 } })) };
    }],
    ['cancelled', async () => {
      const db = createDb({ user_roles: [role('docente')] });
      return { db, row: queue(db, 'course_assigned', COURSE), transport: accepted() };
    }],
    ['cancelled_after_ambiguous', async () => {
      const state = await ambiguousRow();
      state.db.tables.course_enrollments = [];
      return state;
    }],
    ['unknown', async () => {
      const state = await ambiguousRow();
      state.db.now = state.row.first_attempt_at + DAY;
      return state;
    }],
  ];
  it.each(over)('a %s row holds no snapshot or lease and is never claimed again', async (status, setup) => {
    const { db, row, transport } = await setup();
    await run(db, transport);
    expect(row).toMatchObject({ status, send_snapshot: null, lease_owner: null, lease_expires_at: null });
    const calls = transport.mock.calls.length;

    // Whatever would make it sendable again, it stays over.
    db.tables.course_enrollments = ENROLLED.course_enrollments;
    db.tables.user_roles = ENROLLED.user_roles;
    db.now += 10 * DAY;
    expect(await run(db, transport)).toMatchObject({ claimed: 0 });
    expect(transport).toHaveBeenCalledTimes(calls);
    expect(row.status).toBe(status);
  });
});

describe('N3-04 D4 — backoff, the send budget and recovery mail first', () => {
  const recoveryJob = (extra: Row = {}): Row => ({ state: 'queued', available_at: 0, provider_attempts: 0, max_provider_attempts: 8, ...extra });
  const threeRows = (tables: Tables = {}) => {
    const db = createDb({ ...ENROLLED, ...tables });
    return { db, rows: [0, 1, 2].map(() => queue(db, 'course_assigned', COURSE)) };
  };

  it.each([
    ['the low end', 0, [60, 120, 240, 480, 960, 1800, 1800]],
    ['the middle', 0.5, [90, 180, 360, 720, 1440, 2700, 2700]],
    ['the high end', 0.999999, [120, 240, 480, 960, 1920, 3600, 3600]],
  ])('the delay doubles per ambiguous attempt, randomized in its upper half and capped at an hour: %s', async (_name, random, delays) => {
    const db = createDb(ENROLLED);
    const row = queue(db, 'course_assigned', COURSE);
    const transport = vi.fn().mockRejectedValue(new Error('provider unavailable'));

    const seen: number[] = [];
    for (let attempt = 1; attempt <= delays.length; attempt++) {
      db.now = Math.max(db.now, row.next_attempt_at);
      expect(await run(db, transport, () => random)).toMatchObject({ claimed: 1, retried: 1 });
      seen.push(row.next_attempt_at - db.now);
    }

    expect(seen).toEqual(delays);
    expect(transport).toHaveBeenCalledTimes(delays.length);
    expect(row).toMatchObject({ status: 'pending', attempt_count: delays.length, last_error_code: 'transport_error' });
  });

  it('one run claims and sends at most 20 rows, one at a time', async () => {
    const db = createDb(ENROLLED);
    const rows = Array.from({ length: 25 }, () => queue(db, 'course_assigned', COURSE));
    let inFlight = 0;
    let peak = 0;
    const transport = vi.fn(async () => {
      peak = Math.max(peak, ++inFlight);
      await Promise.resolve();
      inFlight--;
      return { data: { id: 'provider-message-1' }, error: null };
    });

    expect(await run(db, transport)).toMatchObject({ claimed: 20, sent: 20 });

    expect(transport).toHaveBeenCalledTimes(20);
    expect(peak).toBe(1);
    expect(rows.filter((r) => r.status === 'pending' && r.lease_owner === null)).toHaveLength(5);
  });

  it('an ambiguous answer ends the sends of the run; the other rows are handed back untouched and nothing is logged', async () => {
    const logs = ['log', 'error', 'warn', 'info'].map((level) => vi.spyOn(console, level as 'log').mockImplementation(() => undefined));
    const { db, rows } = threeRows();
    const transport = vi.fn().mockRejectedValue(new Error(`429 too many requests for ${ADDRESS}`));

    const result = await run(db, transport);

    expect(result).toMatchObject({ claimed: 3, retried: 1, deferred: 2, sent: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({ status: 'pending', last_error_code: 'transport_error', attempt_count: 1, next_attempt_at: db.now + 90 });
    for (const row of rows.slice(1)) {
      expect(row).toMatchObject({ status: 'pending', last_error_code: 'provider_backoff', send_snapshot: null, attempt_count: 0, lease_owner: null, next_attempt_at: db.now + 60 });
    }
    const printed = JSON.stringify([result, ...logs.map((spy) => spy.mock.calls)]);
    expect(printed).not.toContain(ADDRESS);
    expect(printed).not.toContain(U);
    logs.forEach((spy) => spy.mockRestore());
  });

  it.each([
    ['queued and due', {}],
    ['being sent right now', { state: 'processing' }],
  ] as Array<[string, Row]>)('recovery mail %s: no notification is claimed or sent', async (_name, job) => {
    const { db, rows } = threeRows({ recovery: [recoveryJob(job)] });
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ status: 'ok', claimed: 0, sent: 0 });

    expect(transport).not.toHaveBeenCalled();
    for (const row of rows) expect(row).toMatchObject({ status: 'pending', lease_owner: null, next_attempt_at: 0 });
  });

  it.each([
    ['not due yet', { available_at: 5000 }],
    ['already accepted', { state: 'provider_accepted' }],
    ['out of attempts', { provider_attempts: 8 }],
  ] as Array<[string, Row]>)('recovery mail %s holds nothing back', async (_name, job) => {
    const { db } = threeRows({ recovery: [recoveryJob(job)] });
    expect(await run(db, accepted())).toMatchObject({ claimed: 3, sent: 3 });
  });

  it('recovery mail that becomes due during a run gets the next send: the rest is handed back', async () => {
    const { db, rows } = threeRows();
    db.afterRpc = (name) => {
      if (name === 'finish_notification_email' && db.tables.recovery.length === 0) db.tables.recovery.push(recoveryJob());
    };
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ claimed: 3, sent: 1, deferred: 2 });

    expect(transport).toHaveBeenCalledTimes(1);
    expect(rows[0].status).toBe('sent');
    for (const row of rows.slice(1)) {
      expect(row).toMatchObject({ status: 'pending', last_error_code: 'recovery_priority', send_snapshot: null, attempt_count: 0, next_attempt_at: db.now + 60 });
    }
  });

  it('an unreadable recovery queue fails closed: nothing is frozen or sent', async () => {
    const { db, rows } = threeRows();
    db.failing.add('password_recovery_email_due');
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ claimed: 3, deferred: 3, sent: 0 });

    expect(transport).not.toHaveBeenCalled();
    expect(db.calls).not.toContain('rpc:begin_notification_email_attempt');
    for (const row of rows) {
      expect(row).toMatchObject({ status: 'pending', last_error_code: 'priority_unavailable', send_snapshot: null, attempt_count: 0 });
    }
  });

  it('a held-back ambiguous row keeps its snapshot and is retried once recovery mail is through', async () => {
    const { db, row, transport, frozen } = await ambiguousRow();
    queue(db, 'course_assigned', COURSE);
    db.afterRpc = (name) => {
      if (name === 'notification_email_retry_state') db.tables.recovery.push(recoveryJob());
    };

    expect(await run(db, transport)).toMatchObject({ claimed: 2, deferred: 2, sent: 0 });
    expect(row).toMatchObject({ status: 'pending', last_error_code: 'recovery_priority', send_snapshot: frozen, attempt_count: 1 });

    db.afterRpc = () => undefined;
    db.tables.recovery = [];
    db.now = row.next_attempt_at;
    expect(await run(db, transport)).toMatchObject({ claimed: 2, sent: 2 });
    expect(transport.mock.calls[1]).toEqual(transport.mock.calls[0]);
  });
});

describe('N3-05 D4 — the unsubscribe headers are frozen with the message', () => {
  const session = { id: RECORD, school_id: SCHOOL, growth_community_id: COMMUNITY, status: 'cancelada', is_active: true };
  const MANDATORY: Tables = { user_roles: [role('docente', { school_id: SCHOOL, community_id: COMMUNITY })], consultor_sessions: [session] };
  const prefs = (pref_version: unknown): Tables => ({
    user_notification_category_prefs: [{ user_id: U, category: 'courses', email_mode: 'immediate', pref_version }],
  });
  /** The token of the one-click URL; the URL must be this app's unsubscribe endpoint and nothing else. */
  const tokenOf = (message: Row) =>
    /^<https:\/\/genera\.test\/api\/notifications\/unsubscribe\?t=([A-Za-z0-9_.-]+)>$/.exec(message.headers['List-Unsubscribe'])?.[1];

  it.each([
    ['no preference row: one is written in default and the link carries its version', {}, 2, [{ user_id: U, category: 'courses', email_mode: 'default', pref_version: 2 }]],
    ['a preference row: its version, and nothing is written', prefs(7), 7, prefs(7).user_notification_category_prefs],
  ] as Array<[string, Tables, number, Row[]]>)('first send, %s', async (_name, tables, version, stored) => {
    const db = createDb({ ...ENROLLED, ...tables });
    const row = queue(db, 'course_assigned', COURSE);
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ claimed: 1, sent: 1 });

    const [message, options] = transport.mock.calls[0];
    expect(options).toEqual({ idempotencyKey: row.idempotency_key });
    expect(Object.keys(message.headers).sort()).toEqual(['List-Unsubscribe', 'List-Unsubscribe-Post']);
    expect(message.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(verifyUnsubscribeToken(tokenOf(message))).toEqual({
      ok: true, kind: 'category', userId: U, scopes: [{ category: 'courses', prefVersion: version }],
    });
    expect(db.tables.user_notification_category_prefs).toEqual(stored);
    expect(db.calls.includes('user_notification_category_prefs:upsert')).toBe(version === 2);
  });

  it('no preference row and the row cannot be written: the email is not frozen and not sent; it goes out once the row can be written', async () => {
    const db = createDb(ENROLLED);
    const row = queue(db, 'course_assigned', COURSE);
    const transport = accepted();
    db.failing.add('user_notification_category_prefs:upsert');

    expect(await run(db, transport)).toMatchObject({ claimed: 1, retried: 1, sent: 0 });
    expect(transport).not.toHaveBeenCalled();
    expect(row).toMatchObject({ status: 'pending', last_error_code: 'unsubscribe_unavailable', send_snapshot: null, attempt_count: 0 });
    expect(db.calls).not.toContain('rpc:begin_notification_email_attempt');

    db.failing.clear();
    db.now = row.next_attempt_at;
    expect(await run(db, transport)).toMatchObject({ claimed: 1, sent: 1 });
    expect(verifyUnsubscribeToken(tokenOf(transport.mock.calls[0][0]))).toMatchObject({ ok: true, scopes: [{ category: 'courses', prefVersion: 2 }] });
  });

  it('a retry sends the frozen URL and headers under the same key, whatever the version and the secret are by then', async () => {
    const db = createDb({ ...ENROLLED, ...prefs(7) });
    const row = queue(db, 'course_assigned', COURSE);
    const transport = vi.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue({ data: { id: 'provider-message-2' }, error: null });

    expect(await run(db, transport)).toMatchObject({ claimed: 1, retried: 1 });
    const sealed = row.send_snapshot;
    const storedText = Buffer.from(String(sealed).slice(2), 'hex').toString('latin1');
    for (const plain of ['List-Unsubscribe', 'One-Click', 'unsubscribe?t=']) expect(storedText).not.toContain(plain);

    db.tables.user_notification_category_prefs[0].pref_version = 8;
    vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', '');
    db.now = row.next_attempt_at;
    expect(await run(db, transport)).toMatchObject({ claimed: 1, sent: 1 });

    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1]).toEqual(transport.mock.calls[0]);
    const [message, options] = transport.mock.calls[1];
    expect(options).toEqual({ idempotencyKey: row.idempotency_key });
    vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', UNSUBSCRIBE_SECRET);
    expect(verifyUnsubscribeToken(tokenOf(message))).toMatchObject({ ok: true, scopes: [{ category: 'courses', prefVersion: 7 }] });
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['shorter than 32 characters', 'too-short-synthetic-secret'],
  ])('signing secret %s: an email with an unsubscribe link is not frozen and not sent; it goes out with its headers once the secret is there', async (_name, secret) => {
    if (secret === undefined) delete process.env.NOTIFICATION_UNSUBSCRIBE_SECRET;
    else vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', secret);
    const db = createDb(ENROLLED);
    const row = queue(db, 'course_assigned', COURSE);
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ status: 'ok', claimed: 1, retried: 1, sent: 0 });
    expect(transport).not.toHaveBeenCalled();
    expect(row).toMatchObject({ status: 'pending', last_error_code: 'unsubscribe_unavailable', send_snapshot: null, attempt_count: 0 });
    expect(db.calls).not.toContain('rpc:begin_notification_email_attempt');
    expect(db.calls).not.toContain('user_notification_category_prefs:upsert');

    vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', UNSUBSCRIBE_SECRET);
    db.now = row.next_attempt_at;
    expect(await run(db, transport)).toMatchObject({ claimed: 1, sent: 1 });
    expect(tokenOf(transport.mock.calls[0][0])).toBeTruthy();
  });

  it.each([['missing', null], ['not a number', '7'], ['negative', -1], ['zero', 0]])(
    'a stored version that is %s signs nothing: the email is not frozen and not sent',
    async (_name, version) => {
      const db = createDb({ ...ENROLLED, ...prefs(version) });
      const row = queue(db, 'course_assigned', COURSE);
      const transport = accepted();

      expect(await run(db, transport)).toMatchObject({ claimed: 1, retried: 1, sent: 0 });
      expect(transport).not.toHaveBeenCalled();
      expect(row).toMatchObject({ status: 'pending', last_error_code: 'unsubscribe_unavailable', send_snapshot: null });
    }
  );

  it('a mandatory email has no unsubscribe link: it goes out without the headers, and without the secret', async () => {
    delete process.env.NOTIFICATION_UNSUBSCRIBE_SECRET;
    const db = createDb(MANDATORY);
    const row = queue(db, 'session_cancelled', ['session', RECORD]);
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ claimed: 1, sent: 1 });
    expect(row.status).toBe('sent');
    expect(transport.mock.calls[0][0]).not.toHaveProperty('headers');
  });

  it('flag off and no signing secret: the worker stays inert, as before', async () => {
    delete process.env.NOTIFICATION_UNSUBSCRIBE_SECRET;
    vi.stubEnv('NOTIFICATION_OUTBOX_DELIVERY', '');
    const db = createDb(ENROLLED);
    queue(db, 'course_assigned', COURSE);
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ enabled: false, status: 'disabled', claimed: 0 });
    expect(db.calls).toEqual([]);
    expect(transport).not.toHaveBeenCalled();
  });

  it('a snapshot whose headers are not plain text is not a message', () => {
    const key = Buffer.alloc(32, 7);
    const message = { to: ADDRESS, subject: 'Asunto', html: '<p>Cuerpo</p>' };
    const headers = { 'List-Unsubscribe': '<https://genera.test/x>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };

    expect(openSnapshot(key, sealSnapshot(key, { ...message, headers }))).toEqual({ ...message, headers });
    expect(openSnapshot(key, sealSnapshot(key, message))).toEqual(message);
    for (const bad of [null, 'texto', { 'List-Unsubscribe': 5 }]) {
      expect(openSnapshot(key, sealSnapshot(key, { ...message, headers: bad as never }))).toBeNull();
    }
  });
});
