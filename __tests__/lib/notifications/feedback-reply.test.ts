// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F27 (GES-2.18): a Soporte reply reaches the person who reported the ticket
 * through the bell only. Driven through the real `triggerNotification`; the
 * service-role client is an in-memory fake and `createNotification` receives
 * the same fake plus a capturing transport through its `deps` seam, the way
 * notificationService.occurrence.test.ts does. Synthetic data only.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const db = vi.hoisted(() => ({
  rows: [] as Array<Record<string, any>>,
  rpcs: [] as Array<{ fn: string; args: Record<string, any> }>,
  /** email_mode of the recipient's category row, by category; absent = no row. */
  categoryModes: {} as Record<string, string>,
  categoryReads: [] as string[],
}));

vi.mock('@supabase/supabase-js', () => {
  const answer = (table: string, op: string, columns: string | undefined, payload: any, filters: Array<[string, unknown]>) => {
    if (table === 'user_notifications' && op === 'insert') {
      if (db.rows.some((row) => row.idempotency_key && row.idempotency_key === payload.idempotency_key)) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "unique_notification_idempotency_key"' } };
      }
      db.rows.push(payload);
      return { data: { id: `row-${db.rows.length}`, ...payload }, error: null };
    }
    if (table === 'user_notifications') return { data: [], error: null };
    if (table === 'user_notification_preferences') return { data: null, error: null };
    if (table === 'user_notification_category_prefs') {
      const category = filters.find(([col]) => col === 'category')?.[1] as string;
      db.categoryReads.push(category);
      const mode = db.categoryModes[category];
      return { data: mode ? { email_mode: mode } : null, error: null };
    }
    if (table === 'profiles') return { data: columns === 'email' ? { email: 'reportante@qa.local.test' } : { school_id: null }, error: null };
    if (table === 'user_roles') return { data: [], error: null };
    return { data: null, error: null };
  };
  const from = (table: string) => {
    let op = 'select';
    let columns: string | undefined;
    let payload: any;
    const filters: Array<[string, unknown]> = [];
    const done = () => Promise.resolve(answer(table, op, columns, payload, filters));
    const builder: any = {
      select: (c?: string) => ((columns = op === 'insert' ? columns : c), builder),
      insert: (p: unknown) => ((op = 'insert'), (payload = p), builder),
      eq: (col: string, value: unknown) => (filters.push([col, value]), builder),
      in: () => builder,
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
    rpc: (fn: string, args: Record<string, any>) => {
      db.rpcs.push({ fn, args });
      if (fn === 'get_active_triggers') return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: null, error: null });
    },
  };
  return { createClient: () => client };
});

import { createClient } from '@supabase/supabase-js';
import NotificationService from '../../../lib/notificationService';

const REPORTER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const FEEDBACK_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const ACTIVITY_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

let sends: Array<{ to: string }>;

beforeEach(() => {
  Object.assign(db, { rows: [], rpcs: [], categoryModes: {}, categoryReads: [] });
  sends = [];
  delete process.env.NOTIFICATION_EMAIL_ENABLED;
  delete process.env.NOTIFICATION_OUTBOX_DELIVERY;
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://genera.test');
  const transport = vi.fn(async (message: any) => {
    sends.push({ to: message.to });
    return { data: { id: `provider-${sends.length}` }, error: null };
  });
  const create = NotificationService.createNotification.bind(NotificationService);
  vi.spyOn(NotificationService, 'createNotification').mockImplementation((data: any) =>
    create(data, { client: createClient('http://fake', 'fake'), transport })
  );
  (['log', 'warn', 'error'] as const).forEach((level) => vi.spyOn(console, level).mockImplementation(() => {}));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  delete process.env.NOTIFICATION_OUTBOX_DELIVERY;
});

const payload = (overrides: Record<string, unknown> = {}) => ({
  feedback_id: FEEDBACK_ID,
  activity_id: ACTIVITY_ID,
  reporter_id: REPORTER,
  assigned_users: [OTHER],
  ...overrides,
});

describe('feedback_reply — one bell row for the reporter, never a mail', () => {
  it('creates exactly one row, for the reporter, with the fixed texts, category and link', async () => {
    const result = await NotificationService.triggerNotification('feedback_reply', payload());
    expect(result).toMatchObject({ success: true, notificationsCreated: 1 });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      user_id: REPORTER,
      title: 'Tu reporte tiene una respuesta de Soporte',
      description: 'Soporte respondió a un problema que reportaste. Ábrelo en «Mis reportes».',
      category: 'qa_support',
      related_url: '/profile/reportes',
    });
    expect(db.rows.some((row) => row.user_id === OTHER)).toBe(false);
    expect(sends).toHaveLength(0);
  });

  it('sends nothing even when the reporter set «QA y soporte» to immediate', async () => {
    db.categoryModes = { qa_support: 'immediate' };
    await NotificationService.triggerNotification('feedback_reply', payload());
    expect(db.rows).toHaveLength(1);
    expect(sends).toHaveLength(0);
  });

  it('with NOTIFICATION_OUTBOX_DELIVERY on: no enqueue, the bell row is still written, nothing is sent', async () => {
    process.env.NOTIFICATION_OUTBOX_DELIVERY = 'on';
    db.categoryModes = { qa_support: 'immediate' };
    await NotificationService.triggerNotification('feedback_reply', payload());
    expect(db.rpcs.map((r) => r.fn)).not.toContain('enqueue_notification_with_source');
    expect(db.rpcs.map((r) => r.fn)).not.toContain('enqueue_notification');
    expect(db.rows).toHaveLength(1);
    expect(sends).toHaveLength(0);
  });

  it('a second call for the same reply (same activity_id) writes no second row', async () => {
    await NotificationService.triggerNotification('feedback_reply', payload());
    await NotificationService.triggerNotification('feedback_reply', payload());
    expect(db.rows).toHaveLength(1);
    expect(sends).toHaveLength(0);
  });

  it.each([
    ['missing', { reporter_id: undefined }],
    ['a number', { reporter_id: 42 }],
    ['an empty string', { reporter_id: '' }],
    ['a list', { reporter_id: [REPORTER] }],
  ])('a reporter_id that is %s creates nothing', async (_label, overrides) => {
    await NotificationService.triggerNotification('feedback_reply', payload(overrides));
    expect(db.rows).toHaveLength(0);
    expect(sends).toHaveLength(0);
  });
});
