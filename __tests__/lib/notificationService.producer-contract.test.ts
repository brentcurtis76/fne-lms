// @vitest-environment node
/**
 * N2-02 — the producer contract on the live synchronous path, through
 * `triggerNotification`: the fallback templates render the payloads the
 * messaging routes persist, in-app rows carry the catalog category and an
 * existing `notification_types` id, and `meeting_finalized` reaches exactly the
 * finalize route's recipients, in-app only. The real finalize route derives
 * those recipients from the meeting's audience before any email filtering.
 * Synthetic data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const db = vi.hoisted(() => ({
  triggers: [] as Array<Record<string, unknown>>,
  rows: [] as Array<Record<string, any>>,
  types: new Set<string>(),
  typeFailure: null as null | 'error' | 'throws',
  insertFailsFor: null as null | string,
  categoryMode: null as null | string,
  legacyPref: null as null | { email_enabled: boolean; in_app_enabled: boolean },
  // The finalize route's world: one meeting, its attendees, the community's active members.
  meeting: null as null | Record<string, any>,
  meetingSelects: [] as string[],
  attendees: [] as Array<{ user_id: string; attendance_status: string }>,
  members: [] as string[],
  memberFailure: false,
  roles: {} as Record<string, Array<Record<string, unknown>>>,
  emails: {} as Record<string, string | null>,
  modes: {} as Record<string, string>,
}));

vi.mock('@supabase/supabase-js', () => {
  const answer = (table: string, op: string, columns: string | undefined, payload: any, filters: unknown[][]) => {
    const eq = (column: string) => filters.find(([c]) => c === column)?.[1];
    const inList = (filters.find(([, v]) => Array.isArray(v))?.[1] ?? null) as string[] | null;
    if (table === 'community_meetings') {
      if (op === 'update') {
        if (!db.meeting || db.meeting.finalized_at) return { data: null, error: null };
        Object.assign(db.meeting, { status: payload.status, finalized_at: payload.finalized_at });
        return { data: { id: db.meeting.id, finalized_at: payload.finalized_at }, error: null };
      }
      db.meetingSelects.push(columns ?? '');
      return db.meeting ? { data: db.meeting, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    }
    if (table === 'meeting_attendees') {
      const status = eq('attendance_status');
      return { data: db.attendees.filter((a) => !status || a.attendance_status === status).map((a) => ({ ...a, role: 'attendee', user_profile: null })), error: null };
    }
    if (table === 'user_roles' && eq('community_id')) {
      return db.memberFailure ? { data: null, error: { code: '57014', message: 'timeout' } } : { data: db.members.map((user_id) => ({ user_id })), error: null };
    }
    if (table === 'user_roles' && eq('user_id')) return { data: db.roles[eq('user_id') as string] ?? [], error: null };
    if (table === 'profiles' && inList) return { data: inList.map((id) => ({ id, email: db.emails[id] ?? null, first_name: 'Sintetica' })), error: null };
    if (table === 'user_notification_preferences' && inList) return { data: [], error: null };
    if (table === 'user_notification_category_prefs' && inList) {
      return { data: inList.filter((id) => db.modes[id]).map((id) => ({ user_id: id, email_mode: db.modes[id] })), error: null };
    }
    if (table === 'notification_types') {
      if (db.typeFailure === 'throws') throw new Error('socket hang up for destinataria@qa.local.test');
      if (db.typeFailure === 'error') return { data: null, error: { code: '57014', message: 'canceling statement for destinataria@qa.local.test' } };
      const id = filters.find(([column]) => column === 'id')?.[1] as string;
      return { data: db.types.has(id) ? { id } : null, error: null };
    }
    if (table === 'user_notifications' && op === 'insert') {
      if (payload.user_id === db.insertFailsFor) {
        return { data: null, error: { code: '23503', message: `Key (user_id)=(${payload.user_id}) is not present` } };
      }
      if (db.rows.some((row) => row.idempotency_key === payload.idempotency_key)) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "unique_notification_idempotency_key"' } };
      }
      db.rows.push(payload);
      return { data: { id: `row-${db.rows.length}`, ...payload }, error: null };
    }
    if (table === 'user_notifications') return { data: [], error: null };
    if (table === 'user_notification_preferences') return { data: db.legacyPref, error: null };
    if (table === 'user_notification_category_prefs') {
      const mode = db.modes[eq('user_id') as string] ?? db.categoryMode;
      return { data: mode ? { email_mode: mode } : null, error: null };
    }
    if (table === 'profiles') return { data: columns === 'email' ? { email: 'destinataria@qa.local.test' } : { school_id: null }, error: null };
    if (table === 'user_roles') return { data: [], error: null };
    return { data: null, error: null };
  };
  const from = (table: string) => {
    let op = 'select';
    let columns: string | undefined;
    let payload: any;
    const filters: unknown[][] = [];
    const done = () => {
      try {
        return Promise.resolve(answer(table, op, columns, payload, filters));
      } catch (error) {
        return Promise.reject(error);
      }
    };
    const builder: any = {
      select: (c?: string) => ((columns = op === 'select' ? c : columns), builder),
      insert: (p: unknown) => ((op = 'insert'), (payload = p), builder),
      update: (p: unknown) => ((op = 'update'), (payload = p), builder),
      eq: (column: string, value: unknown) => (filters.push([column, value]), builder),
      in: (column: string, values: unknown[]) => (filters.push([column, values]), builder),
      is: () => builder,
      not: () => builder,
      gte: () => builder,
      limit: () => builder,
      order: () => builder,
      range: () => builder,
      single: done,
      maybeSingle: done,
      then: (resolve: any, reject: any) => done().then(resolve, reject),
    };
    return builder;
  };
  const client = {
    from,
    rpc: (fn: string) => Promise.resolve({ data: fn === 'get_active_triggers' ? db.triggers : null, error: null }),
  };
  return { createClient: () => client };
});

const route = vi.hoisted(() => ({ caller: '', summary: vi.fn() }));

vi.mock('../../lib/emailService', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendMeetingSummary: route.summary,
}));

vi.mock('../../lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getApiUser: async () => ({ user: { id: route.caller }, error: null }),
}));

import { createMocks } from 'node-mocks-http';
import NotificationService from '../../lib/notificationService';
import finalize from '../../pages/api/meetings/[id]/finalize';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const MESSAGE_ID = '0b7c2c1e-5d1a-4c6e-9f00-0000000000a1';
const MEETING_ID = '0b7c2c1e-5d1a-4c6e-9f00-0000000000e1';
const PRIVATE_BODY = 'cuerpo privado del mensaje';

let sends: Array<{ to: string; key: string }>;
let transportFails: boolean;
let logs: ReturnType<typeof vi.spyOn>[];

const loggedText = () => logs.flatMap((spy) => spy.mock.calls.map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))).join('\n');

/** The payload `/api/messaging/send` persists (pages/api/messaging/send.ts). */
const messagePayload = (overrides: Record<string, unknown> = {}) => ({
  message_id: MESSAGE_ID,
  sender_id: USER_B,
  recipient_id: USER_A,
  sender_name: 'Ana Pérez',
  content: 'Tienes un nuevo mensaje',
  context: 'direct_message',
  ...overrides,
});

/** The payload `/api/messaging/mention` persists (pages/api/messaging/mention.ts). */
const mentionPayload = (overrides: Record<string, unknown> = {}) => ({
  mention_id: '0b7c2c1e-5d1a-4c6e-9f00-0000000000b1',
  author_id: USER_B,
  mentioned_user_id: USER_A,
  author_name: 'Ana Pérez',
  context: 'community_post',
  discussion_id: '0b7c2c1e-5d1a-4c6e-9f00-0000000000b2',
  workspace_id: '0b7c2c1e-5d1a-4c6e-9f00-0000000000b3',
  content_preview: 'Te mencionaron en una publicación',
  ...overrides,
});

/** The payload `/api/meetings/[id]/finalize` persists. */
const meetingPayload = (recipientIds: unknown) => ({
  meeting_id: MEETING_ID,
  title: 'Reunión de ciclo',
  finalizer_name: 'Facilitadora Sintética',
  audience: 'attended',
  recipient_ids: recipientIds,
});

beforeEach(() => {
  Object.assign(db, {
    triggers: [], rows: [], types: new Set(), typeFailure: null, insertFailsFor: null, categoryMode: null, legacyPref: null,
    meeting: null, meetingSelects: [], attendees: [], members: [], memberFailure: false, roles: {}, emails: {}, modes: {},
  });
  sends = [];
  transportFails = false;
  delete process.env.NOTIFICATION_EMAIL_ENABLED;
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://genera.test');
  const transport = vi.fn(async (message: any, options: any) => {
    if (transportFails) throw new Error(`provider down for ${message.to} key re_synthetic_not_a_key`);
    sends.push({ to: message.to, key: options.idempotencyKey });
    return { data: { id: `provider-${sends.length}` }, error: null };
  });
  const create = NotificationService.createNotification.bind(NotificationService);
  vi.spyOn(NotificationService, 'createNotification').mockImplementation((data: any) => create(data, { transport }));
  logs = (['log', 'warn', 'error'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  delete process.env.NOTIFICATION_EMAIL_ENABLED;
});

describe('D1 · fallback templates render the persisted producer payloads', () => {
  it('D1: a message renders sender_name and content, and the body the route never passes is not logged', async () => {
    const result = await NotificationService.triggerNotification('message_sent', messagePayload());
    expect(result).toEqual({ success: true, notificationsCreated: 1 });
    expect(db.rows[0]).toMatchObject({ user_id: USER_A, title: 'Mensaje de Ana Pérez', description: 'Tienes un nuevo mensaje' });
    await NotificationService.triggerNotification('message_sent', messagePayload({ message_id: MESSAGE_ID.replace('a1', 'a2'), content: PRIVATE_BODY }));
    expect(loggedText()).not.toContain(PRIVATE_BODY);
    expect(loggedText()).not.toContain('Ana Pérez');
  });

  it('D1: a mention renders author_name and content_preview', async () => {
    await NotificationService.triggerNotification('user_mentioned', mentionPayload());
    expect(db.rows[0]).toMatchObject({ title: 'Ana Pérez te ha mencionado', description: 'Te mencionaron en una publicación' });
  });

  it.each([
    ['absent', {}],
    ['blank', { sender_name: '   ', content: ' \n ', author_name: '', content_preview: '\t' }],
    ['not text', { sender_name: 42, content: { html: '<b>x</b>' }, author_name: ['x'], content_preview: null }],
  ])('D1: %s optional names and previews fall back to the generic copy', async (_label, fields) => {
    const strip = { sender_name: undefined, content: undefined, author_name: undefined, content_preview: undefined, ...fields };
    await NotificationService.triggerNotification('message_sent', messagePayload(strip));
    await NotificationService.triggerNotification('user_mentioned', mentionPayload(strip));
    expect(db.rows.map((r) => [r.title, r.description])).toEqual([
      ['Nuevo mensaje', 'Has recibido un nuevo mensaje.'],
      ['Te han mencionado', 'Has sido mencionado en una conversación.'],
    ]);
  });

  it('D1: long names and previews are collapsed and cut to a bounded length', async () => {
    const name = `Ana\n${'Pérez '.repeat(40)}`;
    const preview = `Hola   ${'texto '.repeat(60)}`;
    await NotificationService.triggerNotification('message_sent', messagePayload({ sender_name: name, content: preview }));
    await NotificationService.triggerNotification('user_mentioned', mentionPayload({ author_name: name, content_preview: preview }));
    const [message, mention] = db.rows;
    expect(message.title).toMatch(/^Mensaje de Ana Pérez Pérez .*…$/);
    expect(message.title.length).toBeLessThanOrEqual('Mensaje de '.length + 80);
    expect(message.description).toMatch(/^Hola texto texto .*…$/);
    expect(message.description.length).toBeLessThanOrEqual(120);
    expect(mention.title.length).toBeLessThanOrEqual(80 + ' te ha mencionado'.length);
    expect(mention.description).toBe(message.description);
    for (const row of db.rows) expect(`${row.title}${row.description}`).not.toMatch(/\s{2}|\n/);
  });
});

describe('D2 · catalog category and an existing notification type id', () => {
  it('D2: a mapped event with a matching type row stores that id and the catalog category, not the trigger one', async () => {
    db.types = new Set(['message_sent']);
    db.triggers = [{ trigger_id: 't-msg', category: 'messaging', template: null }];
    await NotificationService.triggerNotification('message_sent', messagePayload());
    await NotificationService.triggerNotification('meeting_finalized', meetingPayload([USER_B]));
    expect(db.rows.map((r) => [r.notification_type_id, r.category])).toEqual([
      ['message_sent', 'community'],
      [null, 'community'],
    ]);
  });

  it.each([['absent', null], ['error', 'error'], ['throws', 'throws']] as const)(
    'D2: a %s type lookup leaves the foreign key unset and keeps the bell',
    async (_label, failure) => {
      db.typeFailure = failure;
      const result = await NotificationService.triggerNotification('user_mentioned', mentionPayload());
      expect(result).toEqual({ success: true, notificationsCreated: 1 });
      expect(db.rows).toEqual([expect.objectContaining({ user_id: USER_A, notification_type_id: null, category: 'community' })]);
      expect(loggedText()).not.toContain('qa.local.test');
      if (failure === 'error') expect(loggedText()).toContain('"code":"57014"');
    }
  );

  it('D2: an event the catalog does not map keeps its trigger category (DB trigger or code default)', async () => {
    vi.spyOn(NotificationService, 'getRecipients').mockResolvedValue([{ id: USER_A }]);
    db.triggers = [{ trigger_id: 't-legacy', category: 'legacy_cat', template: { title_template: 'Aviso heredado' } }];
    await NotificationService.triggerNotification('evento_heredado', { ref: 1 });
    db.triggers = [];
    await NotificationService.triggerNotification('evento_heredado', { ref: 2 });
    expect(db.rows.map((r) => r.category)).toEqual(['legacy_cat', 'system']);
  });
});

describe('D3 · meeting_finalized reaches exactly the finalize route recipients', () => {
  it('D3: duplicate, differently cased, malformed and empty ids give one bell per valid distinct recipient', async () => {
    const ids = [USER_A, USER_A, USER_A.toUpperCase(), '', '   ', 'no-es-uuid', `${USER_B}x`, null, 42, { id: USER_B }, USER_B];
    const result = await NotificationService.triggerNotification('meeting_finalized', meetingPayload(ids));
    expect(result).toEqual({ success: true, notificationsCreated: 2 });
    expect(db.rows.map((r) => r.user_id)).toEqual([USER_A, USER_B]);
    for (const row of db.rows) {
      expect(row).toMatchObject({
        title: 'Reunión finalizada: Reunión de ciclo',
        description: 'La reunión "Reunión de ciclo" fue finalizada por Facilitadora Sintética. Enviada a quienes asistieron.',
        related_url: '/community/workspace?section=meetings',
        category: 'community',
      });
    }
  });

  it.each([['empty', []], ['missing', undefined], ['not a list', USER_A], ['only invalid', ['', 'x', null]]])(
    'D3: %s recipient_ids notify nobody, whatever the title or audience',
    async (_label, ids) => {
      const result = await NotificationService.triggerNotification('meeting_finalized', { ...meetingPayload(ids), audience: 'community', title: USER_A });
      expect(result).toEqual({ success: true, notificationsCreated: 0 });
      expect(db.rows).toEqual([]);
    }
  );
});

describe('D5 · idempotency and truthful nonfatal results', () => {
  it('D5: a retried finalize occurrence writes no second bell and never mails, even under an immediate category mode', async () => {
    db.categoryMode = 'immediate';
    await NotificationService.triggerNotification('meeting_finalized', meetingPayload([USER_A, USER_B]));
    const retry = await NotificationService.triggerNotification('meeting_finalized', meetingPayload([USER_B, USER_A, USER_A]));
    expect(db.rows).toHaveLength(2);
    expect(retry).toEqual({ success: true, notificationsCreated: 2 });
    expect(sends).toEqual([]);
  });

  it('D5: two independent messages with the same text are two bells and two mails with distinct keys', async () => {
    await NotificationService.triggerNotification('message_sent', messagePayload());
    await NotificationService.triggerNotification('message_sent', messagePayload({ message_id: MESSAGE_ID.replace('a1', 'a3') }));
    expect(db.rows).toHaveLength(2);
    expect(db.rows[0].title).toBe(db.rows[1].title);
    expect(sends).toHaveLength(2);
    expect(new Set(sends.map((s) => s.key)).size).toBe(2);
  });

  it('D5: a type lookup failure and one failed insert count only the bell written, and add no recipient', async () => {
    db.typeFailure = 'error';
    db.insertFailsFor = USER_A;
    const result = await NotificationService.triggerNotification('meeting_finalized', meetingPayload([USER_A, USER_B]));
    expect(result).toEqual({ success: true, notificationsCreated: 1 });
    expect(db.rows.map((r) => [r.user_id, r.notification_type_id])).toEqual([[USER_B, null]]);
    expect(sends).toEqual([]);
    expect(loggedText()).not.toContain(USER_A);
  });

  it('D5: a provider failure keeps the bell and the result, and logs no address or credential', async () => {
    transportFails = true;
    const result = await NotificationService.triggerNotification('message_sent', messagePayload());
    expect(result).toEqual({ success: true, notificationsCreated: 1 });
    expect(db.rows).toHaveLength(1);
    expect(loggedText()).not.toMatch(/qa\.local\.test|re_synthetic|provider down/);
  });
});

describe('D4 · meeting_finalized never mails; the in-app preference still applies', () => {
  it.each([
    ['immediate', 'immediate', null],
    ['digest', 'digest', null],
    ['default', 'default', null],
    ['no category row', null, null],
    ['legacy email_enabled=false', null, { email_enabled: false, in_app_enabled: true }],
  ])('D4: %s with the kill switch unset gives zero provider attempts and still writes the bell', async (_label, mode, legacyPref) => {
    Object.assign(db, { categoryMode: mode, legacyPref });
    const result = await NotificationService.triggerNotification('meeting_finalized', meetingPayload([USER_A]));
    expect(result).toEqual({ success: true, notificationsCreated: 1 });
    expect(db.rows).toEqual([expect.objectContaining({ user_id: USER_A, category: 'community' })]);
    expect(sends).toEqual([]);
    expect(loggedText()).toContain('in_app_only');
  });

  it('D4: with the in-app preference off nothing is written and nothing is sent', async () => {
    Object.assign(db, { categoryMode: 'immediate', legacyPref: { email_enabled: true, in_app_enabled: false } });
    await NotificationService.triggerNotification('meeting_finalized', meetingPayload([USER_A]));
    expect(db.rows).toEqual([]);
    expect(sends).toEqual([]);
  });
});

describe('D2/D3 · the real finalize route picks bell recipients from the audience, not the summary email list', () => {
  const COMMUNITY = '0b7c2c1e-5d1a-4c6e-9f00-0000000000c1';
  const LEADER = '33333333-3333-4333-8333-333333333333';
  const EMAIL_OFF = '44444444-4444-4444-8444-444444444444';
  const NO_EMAIL = '55555555-5555-4555-8555-555555555555';
  const MAILED = '66666666-6666-4666-8666-666666666666';
  const ABSENT = '77777777-7777-4777-8777-777777777777';
  const OUTSIDER = '88888888-8888-4888-8888-888888888888';
  const role = (role_type: string, community_id: string | null = COMMUNITY) => [{ role_type, community_id, school_id: null, is_active: true }];

  const post = async (audience: string, caller = LEADER) => {
    route.caller = caller;
    const { req, res } = createMocks({ method: 'POST', query: { id: MEETING_ID }, body: { audience } });
    await finalize(req as any, res as any);
    return { status: res._getStatusCode(), body: JSON.parse(res._getData()) };
  };
  const summaryIds = () => (route.summary.mock.calls[0]?.[1] ?? []).map((r: { id: string }) => r.id).sort();
  const bellIds = () => db.rows.map((r) => r.user_id).sort();

  beforeEach(() => {
    process.env.NOTIFICATION_EMAIL_ENABLED = 'on';
    route.summary.mockReset();
    route.summary.mockImplementation(async (_data: unknown, recipients: unknown[]) => ({ sent: recipients.length, failed: 0, errors: [] }));
    Object.assign(db, {
      meeting: {
        id: MEETING_ID, title: 'Reunión de ciclo', status: 'borrador', created_by: LEADER, facilitator_id: null, secretary_id: null,
        meeting_date: null, summary: null, summary_doc: null, notes: null, notes_doc: null, finalized_at: null, version: 1,
        workspace: { community_id: COMMUNITY, community: { id: COMMUNITY, name: 'Comunidad Sintética', school_id: null } },
      },
      attendees: [
        { user_id: EMAIL_OFF, attendance_status: 'attended' },
        { user_id: NO_EMAIL, attendance_status: 'attended' },
        { user_id: MAILED, attendance_status: 'attended' },
        { user_id: ABSENT, attendance_status: 'absent' },
      ],
      members: [LEADER, EMAIL_OFF, NO_EMAIL, MAILED, ABSENT],
      roles: { [LEADER]: role('lider_comunidad'), [OUTSIDER]: role('docente', '0b7c2c1e-5d1a-4c6e-9f00-0000000000c2') },
      emails: { [LEADER]: 'lider@qa.local.test', [EMAIL_OFF]: 'sin-correo@qa.local.test', [MAILED]: 'asistente@qa.local.test', [ABSENT]: 'ausente@qa.local.test' },
      modes: { [EMAIL_OFF]: 'off', [MAILED]: 'immediate', [ABSENT]: 'digest' },
    });
  });

  it('D2/D3: attended audience — email-off and no-email attendees get a bell, the absent member none, the summary keeps its filter, no notification mail', async () => {
    const { status, body } = await post('attended');
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ ok: true, recipients_count: 1, sent: 1, failed: 0, summary_email_sent: true, summary_email_error: null });
    expect(db.meetingSelects[0]).toContain('community:growth_communities!community_workspaces_community_id_fkey(id, name, school_id)');
    expect(db.meeting).toMatchObject({ status: 'completada' });
    expect(bellIds()).toEqual([EMAIL_OFF, NO_EMAIL, MAILED].sort());
    for (const row of db.rows) expect(row).toMatchObject({ title: 'Reunión finalizada: Reunión de ciclo', related_url: '/community/workspace?section=meetings', category: 'community' });
    expect(summaryIds()).toEqual([MAILED]);
    expect(sends).toEqual([]);
  });

  it('D3: community audience — every active member gets a bell whatever their email; digest and immediate still get the summary', async () => {
    const { status, body } = await post('community');
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ recipients_count: 3, summary_email_sent: true });
    expect(bellIds()).toEqual([LEADER, EMAIL_OFF, NO_EMAIL, MAILED, ABSENT].sort());
    expect(summaryIds()).toEqual([LEADER, MAILED, ABSENT].sort());
    expect(sends).toEqual([]);
  });

  it('D3: a failed member lookup notifies nobody and the finalize still succeeds', async () => {
    db.memberFailure = true;
    const { status } = await post('community');
    expect(status).toBe(200);
    expect(db.rows).toEqual([]);
    expect(loggedText()).not.toMatch(/qa\.local\.test|4444-4444/);
  });

  it('D2: a summary email failure is reported truthfully and the bells are still written', async () => {
    route.summary.mockRejectedValue(new Error('provider_down'));
    const { status, body } = await post('attended');
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ ok: true, summary_email_sent: false, summary_email_error: 'provider_down' });
    expect(bellIds()).toEqual([EMAIL_OFF, NO_EMAIL, MAILED].sort());
    expect(sends).toEqual([]);
  });

  it('D2: an outsider gets 403 and a repeat is refused as before (403 once finalized, 409 for the race loser); only one finalize writes bells', async () => {
    const outsider = await post('community', OUTSIDER);
    expect(outsider.status).toBe(403);
    expect(db.meeting).toMatchObject({ status: 'borrador', finalized_at: null });
    expect(db.rows).toEqual([]);

    expect((await post('attended')).status).toBe(200);
    // The finalize policy only admits a borrador meeting, for every role.
    expect((await post('attended')).status).toBe(403);
    // A concurrent caller that read the draft before the winner's update loses the guarded update.
    db.meeting!.status = 'borrador';
    const loser = await post('attended');
    expect(loser).toMatchObject({ status: 409, body: { code: 'meeting_already_finalized' } });
    expect(db.rows).toHaveLength(3);
    expect(route.summary).toHaveBeenCalledTimes(1);
  });
});
