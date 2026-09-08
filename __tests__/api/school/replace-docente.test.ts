// @vitest-environment node
/**
 * POST /api/school/transversal-context/replace-docente
 *
 * PR 2 item 2 — safe docente replacement. The route delegates the decision
 * and every write to the `replace_course_docente` RPC, called with the USER
 * client. These tests run the real handler against a mocked Supabase `rpc`
 * and prove: method / auth / permission gates (incl. the consultor 403),
 * UUID validation, the exact RPC arguments, every refusal mapping
 * (evaluation_started 409 with counts from DETAIL or from the message,
 * no_active_assignment / same_docente / assignment_invariant_violation 409,
 * docente_not_eligible_for_school 422, course_not_found 404, 42501 403,
 * unknown 500), the success shape, and that logs carry codes only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const {
  mockGetApiUser,
  mockCreateApiSupabaseClient,
  mockCreateServiceRoleClient,
  mockSendAuthError,
  mockHandleMethodNotAllowed,
  mockHasDirectivoPermission,
  mockHasContextWriteRole,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockSendAuthError: vi.fn(),
  mockHandleMethodNotAllowed: vi.fn(),
  mockHasDirectivoPermission: vi.fn(),
  mockHasContextWriteRole: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: mockSendAuthError,
  handleMethodNotAllowed: mockHandleMethodNotAllowed,
}));

vi.mock('../../../lib/permissions/directivo', () => ({
  hasDirectivoPermission: mockHasDirectivoPermission,
  hasContextWriteRole: mockHasContextWriteRole,
}));

import handler, { mapRpcError, parseEvaluationStartedCounts } from '../../../pages/api/school/transversal-context/replace-docente';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NEW_DOCENTE_ID = '2a2b2c2d-2e2f-4a2b-8c2d-2e2f2a2b2c2d';
const PREVIOUS_DOCENTE_ID = '33333333-3333-4333-8333-333333333333';
const COURSE_STRUCTURE_ID = '44444444-4444-4444-8444-444444444444';
const ASSIGNMENT_ID = '77777777-7777-4777-8777-777777777777';
const SCHOOL_ID = 42;

let userClient: { rpc: ReturnType<typeof vi.fn> };
let serviceClient: { rpc: ReturnType<typeof vi.fn>; from: ReturnType<typeof vi.fn> };
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

function rpcResolves(data: unknown, error: unknown = null) {
  userClient.rpc.mockResolvedValue({ data, error });
}

function pgError(code: string, message: string, details: string | null = null) {
  return { code, message, details, hint: null };
}

function authed() {
  mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
}
function directivo() {
  mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId: SCHOOL_ID, isAdmin: false });
  mockHasContextWriteRole.mockResolvedValue(true);
}
function admin() {
  mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId: null, isAdmin: true });
}
function consultor() {
  mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId: SCHOOL_ID, isAdmin: false });
  mockHasContextWriteRole.mockResolvedValue(false);
}

const VALID_BODY = { course_structure_id: COURSE_STRUCTURE_ID, docente_id: NEW_DOCENTE_ID };

/** `body: null` sends a request without a body. */
async function post(body: Record<string, unknown> | null = VALID_BODY) {
  const { req, res } = createMocks(body === null ? { method: 'POST' } : { method: 'POST', body });
  await handler(req as any, res as any);
  return { req, res, status: res._getStatusCode(), json: res._getJSONData() };
}

function successData() {
  return {
    previous_docente_id: PREVIOUS_DOCENTE_ID,
    new_docente_id: NEW_DOCENTE_ID,
    instances_reattached: 2,
    assignment_id: ASSIGNMENT_ID,
  };
}

/** Every logged argument, stringified, must be free of the identities in play. */
function expectLogsCarryNoIdentity() {
  const logged = [...warnSpy.mock.calls, ...errorSpy.mock.calls].flat().map(a => JSON.stringify(a) ?? String(a)).join(' ');
  expect(logged).not.toContain(NEW_DOCENTE_ID);
  expect(logged).not.toContain(PREVIOUS_DOCENTE_ID);
  expect(logged).not.toContain(USER_ID);
}

describe('POST /api/school/transversal-context/replace-docente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userClient = { rpc: vi.fn() };
    serviceClient = { rpc: vi.fn(), from: vi.fn() };
    mockCreateApiSupabaseClient.mockResolvedValue(userClient);
    mockCreateServiceRoleClient.mockReturnValue(serviceClient);
    mockHandleMethodNotAllowed.mockImplementation((res: any, methods: string[]) => {
      res.setHeader('Allow', methods.join(', '));
      res.status(405).json({ error: 'Method not allowed' });
    });
    mockSendAuthError.mockImplementation((res: any, message: string, status = 401) => {
      res.status(status).json({ error: message });
    });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // ── gates ───────────────────────────────────────────────────────
  it('answers 405 to anything but POST and never calls the RPC', async () => {
    for (const method of ['GET', 'DELETE', 'PUT'] as const) {
      const { req, res } = createMocks({ method });
      await handler(req as any, res as any);
      expect(res._getStatusCode()).toBe(405);
      expect(mockHandleMethodNotAllowed).toHaveBeenCalledWith(expect.anything(), ['POST']);
    }
    expect(mockGetApiUser).not.toHaveBeenCalled();
    expect(userClient.rpc).not.toHaveBeenCalled();
  });

  it('answers 401 when unauthenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'no session' });
    const { status } = await post();
    expect(status).toBe(401);
    expect(mockHasDirectivoPermission).not.toHaveBeenCalled();
    expect(userClient.rpc).not.toHaveBeenCalled();
  });

  it('answers 403 when the caller has no directivo permission', async () => {
    authed();
    mockHasDirectivoPermission.mockResolvedValue({ hasPermission: false, schoolId: null, isAdmin: false });
    const { status } = await post();
    expect(status).toBe(403);
    expect(userClient.rpc).not.toHaveBeenCalled();
  });

  it('answers 403 replacement_write_forbidden to an assigned consultor (stage-A restriction)', async () => {
    authed();
    consultor();
    const { status, json } = await post();
    expect(status).toBe(403);
    expect(json.code).toBe('replacement_write_forbidden');
    expect(mockHasContextWriteRole).toHaveBeenCalledWith(userClient, USER_ID);
    expect(userClient.rpc).not.toHaveBeenCalled();
  });

  it('skips the write-role read for an admin', async () => {
    authed();
    admin();
    rpcResolves(successData());
    const { status } = await post();
    expect(status).toBe(200);
    expect(mockHasContextWriteRole).not.toHaveBeenCalled();
  });

  it.each([
    ['missing body', null],
    ['missing docente', { course_structure_id: COURSE_STRUCTURE_ID }],
    ['missing course', { docente_id: NEW_DOCENTE_ID }],
    ['malformed docente', { course_structure_id: COURSE_STRUCTURE_ID, docente_id: 'not-a-uuid' }],
    ['malformed course', { course_structure_id: 'abc', docente_id: NEW_DOCENTE_ID }],
    ['non-string ids', { course_structure_id: 42, docente_id: { id: NEW_DOCENTE_ID } }],
  ])('answers 400 invalid_request on %s and never calls the RPC', async (_label, body) => {
    authed();
    directivo();
    const { status, json } = await post(body as any);
    expect(status).toBe(400);
    expect(json.code).toBe('invalid_request');
    expect(userClient.rpc).not.toHaveBeenCalled();
  });

  // ── RPC call ────────────────────────────────────────────────────
  it('calls replace_course_docente on the USER client with the two ids', async () => {
    authed();
    directivo();
    rpcResolves(successData());
    await post();
    expect(userClient.rpc).toHaveBeenCalledTimes(1);
    expect(userClient.rpc).toHaveBeenCalledWith('replace_course_docente', {
      p_course_structure_id: COURSE_STRUCTURE_ID,
      p_new_docente_id: NEW_DOCENTE_ID,
    });
    expect(serviceClient.rpc).not.toHaveBeenCalled();
    expect(serviceClient.from).not.toHaveBeenCalled();
  });

  // ── success ─────────────────────────────────────────────────────
  it('answers 200 docente_replaced with the replacement summary', async () => {
    authed();
    directivo();
    rpcResolves(successData());
    const { status, json } = await post();
    expect(status).toBe(200);
    expect(json).toEqual({
      success: true,
      code: 'docente_replaced',
      message: expect.stringContaining('2 evaluación(es)'),
      replacement: {
        previousDocenteId: PREVIOUS_DOCENTE_ID,
        newDocenteId: NEW_DOCENTE_ID,
        instancesReattached: 2,
      },
    });
    expect(json.message).toContain('ninguna respuesta fue transferida');
    expectLogsCarryNoIdentity();
  });

  // ── refusal mapping ─────────────────────────────────────────────
  it('maps evaluation_started to 409 with the counts from DETAIL', async () => {
    authed();
    directivo();
    rpcResolves(null, pgError('P0001',
      'evaluation_started: instances_started=1 instances_with_responses=3',
      '{"instances_started": 1, "instances_with_responses": 3}'));
    const { status, json } = await post();
    expect(status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.code).toBe('evaluation_started');
    expect(json.counts).toEqual({ instancesStarted: 1, instancesWithResponses: 3 });
    expect(json.message).toContain('ya comenzó');
    expect(json.message).toContain('nunca se transfieren');
    expect(json.error).toBe(json.message);
    expect(json.replacement).toEqual({ previousDocenteId: null, newDocenteId: null, instancesReattached: 0 });
    expect(warnSpy).toHaveBeenCalledWith('[replace-docente] refused:', 'evaluation_started');
    expectLogsCarryNoIdentity();
  });

  it('maps evaluation_started to 409 reading the counts from the message when DETAIL is absent', async () => {
    authed();
    directivo();
    rpcResolves(null, pgError('P0001', 'evaluation_started: instances_started=0 instances_with_responses=2'));
    const { status, json } = await post();
    expect(status).toBe(409);
    expect(json.code).toBe('evaluation_started');
    expect(json.counts).toEqual({ instancesStarted: 0, instancesWithResponses: 2 });
  });

  it.each([
    ['no_active_assignment', 409, 'no tiene un docente activo'],
    ['same_docente', 409, 'ya es el docente activo'],
    ['assignment_invariant_violation', 409, 'más de una asignación activa'],
    ['docente_not_eligible_for_school', 422, 'no está habilitada'],
    ['course_not_found', 404, 'Curso no encontrado'],
  ])('maps P0001 %s to %i', async (code, expectedStatus, fragment) => {
    authed();
    directivo();
    rpcResolves(null, pgError('P0001', code));
    const { status, json } = await post();
    expect(status).toBe(expectedStatus);
    expect(json.success).toBe(false);
    expect(json.code).toBe(code);
    expect(json.message).toContain(fragment);
    expect(json.counts).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith('[replace-docente] refused:', code);
    expectLogsCarryNoIdentity();
  });

  it('maps SQLSTATE 42501 to 403 replacement_forbidden', async () => {
    authed();
    directivo();
    rpcResolves(null, pgError('42501', 'permission_denied'));
    const { status, json } = await post();
    expect(status).toBe(403);
    expect(json.code).toBe('replacement_forbidden');
    expect(json.message).toContain('No tiene permiso');
  });

  it('maps an unknown database error to 500 with a generic message and logs only the SQLSTATE', async () => {
    authed();
    directivo();
    rpcResolves(null, pgError('XX000', `internal detail mentioning ${NEW_DOCENTE_ID}`));
    const { status, json } = await post();
    expect(status).toBe(500);
    expect(json.code).toBe('replacement_failed');
    expect(json.message).toContain('Intente nuevamente');
    expect(JSON.stringify(json)).not.toContain('internal detail');
    expect(errorSpy).toHaveBeenCalledWith('[replace-docente] rpc failed:', { pgCode: 'XX000' });
    expectLogsCarryNoIdentity();
  });

  it('maps an unknown P0001 message to 500 rather than guessing a refusal', async () => {
    authed();
    directivo();
    rpcResolves(null, pgError('P0001', 'something_else'));
    const { status, json } = await post();
    expect(status).toBe(500);
    expect(json.code).toBe('replacement_failed');
  });

  it('answers 500 replacement_failed when the RPC call throws', async () => {
    authed();
    directivo();
    userClient.rpc.mockRejectedValue(new Error(`boom ${NEW_DOCENTE_ID}`));
    const { status, json } = await post();
    expect(status).toBe(500);
    expect(json.code).toBe('replacement_failed');
    expectLogsCarryNoIdentity();
  });

  // ── pure helpers ────────────────────────────────────────────────
  describe('mapRpcError / parseEvaluationStartedCounts', () => {
    it('prefers DETAIL over the message and tolerates malformed DETAIL', () => {
      expect(parseEvaluationStartedCounts({
        message: 'evaluation_started: instances_started=9 instances_with_responses=9',
        details: '{"instances_started": 1, "instances_with_responses": 0}',
      })).toEqual({ instancesStarted: 1, instancesWithResponses: 0 });
      expect(parseEvaluationStartedCounts({
        message: 'evaluation_started: instances_started=4 instances_with_responses=5',
        details: 'not json',
      })).toEqual({ instancesStarted: 4, instancesWithResponses: 5 });
      expect(parseEvaluationStartedCounts({ message: 'evaluation_started' })).toEqual({ instancesStarted: 0, instancesWithResponses: 0 });
    });

    it('maps codes without trusting the message on non-P0001 states', () => {
      expect(mapRpcError({ code: '42501', message: 'same_docente' })).toEqual({ code: 'replacement_forbidden' });
      expect(mapRpcError({ code: '23505', message: 'same_docente' })).toEqual({ code: 'replacement_failed' });
      expect(mapRpcError({ code: 'P0001', message: 'same_docente' })).toEqual({ code: 'same_docente' });
      expect(mapRpcError({ code: 'P0001', message: null })).toEqual({ code: 'replacement_failed' });
      expect(mapRpcError({})).toEqual({ code: 'replacement_failed' });
    });
  });
});
