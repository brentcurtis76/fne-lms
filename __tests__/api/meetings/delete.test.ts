// @vitest-environment node
/**
 * F4 — meeting deletion moved to a server boundary so the audit row can exist.
 *
 * WHAT WAS BROKEN. `utils/meetingDeletion.ts` ran the whole deletion in the
 * browser and then called `recordSecurityAudit` with the browser's own
 * user-scoped client. `security_audit_events` grants `authenticated` SELECT and
 * nothing else, so that insert failed with 42501 every single time.
 * `recordSecurityAudit` does not throw, so the failure was a console line and
 * the deletion reported success — `meeting_deleted` was typed, constrained,
 * indexed, and never once written.
 *
 * The repair is NOT "let the browser write the row": an audit row a browser can
 * write is an audit row a browser can forge. The operation moved instead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServiceRoleClient, mockCreatePagesServerClient, mockCanDelete, mockPerform } =
  vi.hoisted(() => ({
    mockCreateServiceRoleClient: vi.fn(),
    mockCreatePagesServerClient: vi.fn(),
    mockCanDelete: vi.fn(),
    mockPerform: vi.fn(),
  }));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, createServiceRoleClient: mockCreateServiceRoleClient };
});

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: (...args: unknown[]) => mockCreatePagesServerClient(...args),
}));

vi.mock('../../../lib/meetings/deletion', () => ({
  canDeleteMeeting: (...args: unknown[]) => mockCanDelete(...args),
  performMeetingDeletion: (...args: unknown[]) => mockPerform(...args),
}));

import handler from '../../../pages/api/meetings/delete';

const USER = '11111111-1111-4111-8111-111111111111';
const IMPOSTOR = '99999999-9999-4999-8999-999999999999';
const MEETING = '22222222-2222-4222-8222-222222222222';

function setup(opts: { user?: { id: string } | null; auditError?: { message: string } | null } = {}) {
  const audits: Array<Record<string, unknown>> = [];
  const userClient = { marker: 'user-scoped' };

  mockCreatePagesServerClient.mockReturnValue({
    ...userClient,
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: 'user' in opts ? opts.user : { id: USER } },
        error: null,
      })),
      getSession: vi.fn(async () => {
        throw new Error('getSession must not be used to authenticate a deletion');
      }),
    },
  });

  const adminClient = {
    from: vi.fn(() => ({
      insert: vi.fn(async (row: Record<string, unknown>) => {
        audits.push(row);
        return { error: opts.auditError ?? null };
      }),
    })),
  };
  mockCreateServiceRoleClient.mockReturnValue(adminClient);

  return { audits, adminClient };
}

async function run(
  body: unknown = { meetingId: MEETING },
  method = 'POST'
) {
  const { req, res } = createMocks({ method, body });
  await handler(req as never, res as never);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mockCanDelete.mockResolvedValue(true);
  mockPerform.mockResolvedValue({ success: true, deletedFiles: 2, errors: [] });
});

describe('authentication and authorization', () => {
  it('405 for a non-POST method', async () => {
    setup();
    expect((await run({}, 'GET'))._getStatusCode()).toBe(405);
  });

  it('400 for a malformed meetingId, before any lookup', async () => {
    setup();
    const res = await run({ meetingId: 'not-a-uuid' });
    expect(res._getStatusCode()).toBe(400);
    expect(mockCanDelete).not.toHaveBeenCalled();
  });

  it('401 when the auth server names nobody', async () => {
    setup({ user: null });
    const res = await run();
    expect(res._getStatusCode()).toBe(401);
    expect(mockPerform).not.toHaveBeenCalled();
  });

  it('takes the actor from auth.getUser(), never from the request body', async () => {
    // The browser function accepted `userId` as an argument and passed it
    // straight into the audit metadata: the actor was whatever the caller said.
    const { audits } = setup();
    await run({ meetingId: MEETING, userId: IMPOSTOR });

    expect(mockCanDelete).toHaveBeenCalledWith(expect.anything(), USER, MEETING);
    expect(audits[0].actor_user_id).toBe(USER);
    expect(JSON.stringify(audits)).not.toContain(IMPOSTOR);
  });

  it('403 for a caller who may not delete — and the refusal IS audited', async () => {
    mockCanDelete.mockResolvedValue(false);
    const { audits } = setup();

    const res = await run();

    expect(res._getStatusCode()).toBe(403);
    expect(mockPerform).not.toHaveBeenCalled();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'meeting_deleted',
      outcome: 'denied',
      actor_user_id: USER,
    });
  });

  it('re-checks authorization SERVER-SIDE even though the modal checks it too', async () => {
    setup();
    await run();
    expect(mockCanDelete).toHaveBeenCalledTimes(1);
  });
});

describe('the deletion itself', () => {
  it('runs on the USER-scoped client, so RLS still governs it', async () => {
    // Nothing about who may delete changes here — quietly widening deletion
    // rights while fixing an audit bug is how a repair becomes an incident.
    setup();
    await run();

    const [client] = mockPerform.mock.calls[0];
    expect(client.marker).toBe('user-scoped');
  });

  it('200 with the file count on success', async () => {
    setup();
    const res = await run();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({ success: true, deletedFiles: 2 });
  });

  it('404 when the meeting does not exist', async () => {
    mockPerform.mockResolvedValue({ success: false, deletedFiles: 0, errors: ['no'], code: 'NOT_FOUND' });
    setup();
    expect((await run())._getStatusCode()).toBe(404);
  });

  it('403 when RLS refused the delete (zero rows)', async () => {
    mockPerform.mockResolvedValue({ success: false, deletedFiles: 0, errors: ['no'], code: 'FORBIDDEN' });
    setup();
    expect((await run())._getStatusCode()).toBe(403);
  });

  it('500 when the delete itself failed', async () => {
    mockPerform.mockResolvedValue({ success: false, deletedFiles: 0, errors: ['boom'], code: 'DELETE_FAILED' });
    setup();
    expect((await run())._getStatusCode()).toBe(500);
  });
});

describe('the audit row', () => {
  it('is written with the SERVICE-ROLE client', async () => {
    const { audits, adminClient } = setup();
    await run();
    expect(mockCreateServiceRoleClient).toHaveBeenCalled();
    expect(adminClient.from).toHaveBeenCalledWith('security_audit_events');
    expect(audits).toHaveLength(1);
  });

  it('records the outcome the SERVER established, not one the caller claimed', async () => {
    const { audits } = setup();
    await run();
    expect(audits[0]).toMatchObject({
      action: 'meeting_deleted',
      outcome: 'success',
      actor_user_id: USER,
    });
    expect((audits[0].metadata as Record<string, unknown>).meeting_id).toBe(MEETING);
    expect((audits[0].metadata as Record<string, unknown>).deleted_file_count).toBe(2);
  });

  it('records `partial_failure` when files could not be removed', async () => {
    mockPerform.mockResolvedValue({
      success: true,
      deletedFiles: 1,
      errors: ['Error al eliminar archivo acta.pdf'],
    });
    const { audits } = setup();
    await run();
    expect(audits[0].outcome).toBe('partial_failure');
  });

  it('records `failure` when the deletion failed outright', async () => {
    mockPerform.mockResolvedValue({ success: false, deletedFiles: 0, errors: ['boom'], code: 'DELETE_FAILED' });
    const { audits } = setup();
    await run();
    expect(audits[0].outcome).toBe('failure');
  });

  it('carries no meeting title — that is session content, not a security fact', async () => {
    const { audits } = setup();
    await run({ meetingId: MEETING, title: 'Consejo de profesores — casos sensibles' });
    expect(JSON.stringify(audits)).not.toContain('Consejo de profesores');
  });

  it('reports an unrecorded audit rather than failing a deletion that happened', async () => {
    setup({ auditError: { message: 'relation does not exist' } });
    const res = await run();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().audited).toBe(false);
  });
});
