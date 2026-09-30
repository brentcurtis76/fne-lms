// @vitest-environment node
/**
 * N3-03 worker core, through its real entry point `runNotificationEmailWorker`.
 *
 * The database is an in-memory stand-in: plain tables behind the query calls the
 * worker makes, and the three worker RPCs with the semantics pgTAP 100 proves for
 * the real functions (claim under a lease, live-owner freeze and finish, a stored
 * snapshot never replaced). The provider is a captured transport. Everything is
 * synthetic: no real address, tenant or credential appears here.
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
import { runNotificationEmailWorker } from '../../../lib/email/notification-worker';

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

const role = (role_type: string, extra: Row = {}): Row => ({
  user_id: U, role_type, school_id: null, generation_id: null, community_id: null, is_active: true, ...extra,
});

function createDb(tables: Tables) {
  const db = {
    tables: {
      outbox: [],
      sources: [],
      profiles: [{ id: U, email: ADDRESS, school_id: null }],
      schools: [SCHOOL, OTHER_SCHOOL].map((id) => ({ id, tenant_kind: 'client', internal_zoom_testing_enabled: false })),
      ...tables,
    } as Tables,
    /** Table or RPC names whose next calls fail. */
    failing: new Set<string>(),
    /** Every table read and RPC, in order. */
    calls: [] as string[],
    now: 1000,
    /** Runs after an RPC returns, to move the clock or the lease mid-run. */
    afterRpc: (_name: string) => undefined as void,
    client: null as any,
  };
  const failure = { data: null, error: { message: `synthetic failure naming ${U}` } };
  const live = (row: Row | undefined, owner: string) =>
    !!row && row.status === 'sending' && row.lease_owner === owner && row.lease_expires_at > db.now;

  const rpcs: Record<string, (args: Row) => unknown> = {
    claim_notification_emails: ({ p_owner, p_limit, p_lease_seconds }) =>
      db.tables.outbox
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
      if (!live(row, p_owner) || !(row!.send_snapshot ?? p_snapshot)) return null;
      row!.send_snapshot ??= p_snapshot;
      row!.attempt_count += 1;
      return row!.send_snapshot;
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
    next_attempt_at: 0, lease_owner: null, lease_expires_at: null, last_error_code: null,
    provider_message_id: null, send_snapshot: null, ...extra,
  };
  db.tables.outbox.push(row);
  if (source) db.tables.sources.push({ outbox_id: id, source_kind: source[0], source_id: source[1] });
  return row;
}

const accepted = () => vi.fn(async (_message: Row, _options?: Row) => ({ data: { id: 'provider-message-1' }, error: null }));
const run = (db: ReturnType<typeof createDb>, transport: any) => runNotificationEmailWorker(db.client, { transport });

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
      user_notification_category_prefs: [{ user_id: U, category: 'courses', email_mode: 'immediate' }],
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
    // The retry read neither the source record nor the address again.
    expect(db.calls.filter((c) => c === 'course_enrollments')).toHaveLength(1);
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
    expect(row.next_attempt_at).toBe(db.now + 900);
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
