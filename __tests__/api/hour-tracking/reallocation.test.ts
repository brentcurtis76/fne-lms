// @vitest-environment node
/**
 * Unit tests for PATCH /api/contracts/[id]/hours/reallocate
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_UUID = '550e8400-e29b-41d4-a716-446655440001';
const CONTRACT_UUID = '550e8400-e29b-41d4-a716-446655440002';

// Hoisted mocks
const { mockCheckIsAdmin, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  checkIsAdmin: mockCheckIsAdmin,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: vi.fn((res: { status: (code: number) => { json: (data: unknown) => void } }, msg?: string, status?: number) => {
    res.status(status || 401).json({ error: msg || 'Authentication required' });
  }),
  sendApiResponse: vi.fn((res: { status: (code: number) => { json: (data: unknown) => void } }, data: unknown, status?: number) => {
    res.status(status || 200).json({ data });
  }),
  logApiRequest: vi.fn(),
  handleMethodNotAllowed: vi.fn((res: { status: (code: number) => { json: (data: unknown) => void } }) => {
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

import handler from '../../../pages/api/contracts/[id]/hours/reallocate';

const BUCKET_SUMMARY = [
  {
    hour_type_key: 'asesoria_tecnica_presencial',
    display_name: 'Asesoría Técnica Presencial',
    allocated_hours: 20,
    reserved_hours: 0,
    consumed_hours: 0,
    available_hours: 20,
    is_fixed_allocation: false,
    annex_hours: 0,
  },
  {
    hour_type_key: 'asesoria_directiva_presencial',
    display_name: 'Asesoría Directiva Presencial',
    allocated_hours: 10,
    reserved_hours: 0,
    consumed_hours: 0,
    available_hours: 10,
    is_fixed_allocation: false,
    annex_hours: 0,
  },
];

type RpcError = { code?: string; message: string; details?: string | null };

/**
 * The route makes ONE write: rpc('reallocate_contract_hours'), which moves both
 * allocation rows and writes the history line in one database transaction
 * (migration 20261119103000_reallocate_hours_atomic.sql). It then reads
 * rpc('get_bucket_summary') for its answer. It never touches a table itself.
 */
function buildMockClient(
  moveError: RpcError | null = null,
  bucketSummaryResult = BUCKET_SUMMARY
) {
  const rpc = vi.fn((fn: string) => {
    if (fn === 'reallocate_contract_hours') {
      return Promise.resolve(
        moveError
          ? { data: null, error: moveError }
          : {
              data: { log_id: 'log-1', from_allocated_hours: 15, to_allocated_hours: 15 },
              error: null,
            }
      );
    }
    if (fn === 'get_bucket_summary') {
      return Promise.resolve({ data: bucketSummaryResult, error: null });
    }
    return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
  });
  const from = vi.fn(() => {
    throw new Error('the route must not touch a table directly');
  });
  return { rpc, from };
}

const VALID_BODY = {
  from_hour_type_key: 'asesoria_tecnica_presencial',
  to_hour_type_key: 'asesoria_directiva_presencial',
  hours: 5,
  reason: 'Ajuste por necesidades del programa',
};

async function patch(body: Record<string, unknown> = VALID_BODY) {
  const { req, res } = createMocks({
    method: 'PATCH',
    query: { id: CONTRACT_UUID },
    body,
  });
  await handler(req as never, res as never);
  return res;
}

describe('PATCH /api/contracts/[id]/hours/reallocate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when user is not admin', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: null, error: null });
    const client = buildMockClient();
    mockCreateServiceRoleClient.mockReturnValue(client);

    const res = await patch();
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error).toBe(
      'Solo administradores pueden redistribuir horas de contrato'
    );
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('returns 200 with updated bucket summary on valid reallocation', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });
    const client = buildMockClient();
    mockCreateServiceRoleClient.mockReturnValue(client);

    const res = await patch();
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.data.buckets).toEqual([
      {
        hour_type_key: 'asesoria_tecnica_presencial',
        display_name: 'Asesoría Técnica Presencial',
        allocated: 20,
        reserved: 0,
        consumed: 0,
        available: 20,
        is_fixed: false,
        annex_hours: 0,
      },
      {
        hour_type_key: 'asesoria_directiva_presencial',
        display_name: 'Asesoría Directiva Presencial',
        allocated: 10,
        reserved: 0,
        consumed: 0,
        available: 10,
        is_fixed: false,
        annex_hours: 0,
      },
    ]);
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'get_bucket_summary', {
      p_contrato_id: CONTRACT_UUID,
    });
  });

  it('returns 400 when from bucket available hours < requested hours', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });
    // The function refuses inside its lock and names the hours available in DETAIL.
    const client = buildMockClient({ code: 'P0001', message: 'insufficient_hours', details: '2.00' });
    mockCreateServiceRoleClient.mockReturnValue(client);

    const res = await patch(); // requesting 5 but only 2 available
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.error).toMatch(/No hay suficientes horas disponibles/);
    expect(body.error).toBe(
      'No hay suficientes horas disponibles en la categoría origen (disponibles: 2).'
    );
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when trying to reallocate from or to online_learning', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });
    const client = buildMockClient();
    mockCreateServiceRoleClient.mockReturnValue(client);

    const res = await patch({ ...VALID_BODY, from_hour_type_key: 'online_learning' });
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.error).toMatch(/Cursos Online \(LMS\)/);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('returns 400 when from equals to', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });
    const client = buildMockClient();
    mockCreateServiceRoleClient.mockReturnValue(client);

    const res = await patch({ ...VALID_BODY, to_hour_type_key: 'asesoria_tecnica_presencial' });
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.error).toMatch(/origen y destino deben ser diferentes/);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('moves the hours and writes the history line in one database function call', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });
    const client = buildMockClient();
    mockCreateServiceRoleClient.mockReturnValue(client);

    const res = await patch({ ...VALID_BODY, reason: 'Ajuste por necesidades del programa educativo' });
    expect(res._getStatusCode()).toBe(200);
    expect(client.rpc).toHaveBeenNthCalledWith(1, 'reallocate_contract_hours', {
      p_contrato_id: CONTRACT_UUID,
      p_from: 'asesoria_tecnica_presencial',
      p_to: 'asesoria_directiva_presencial',
      p_hours: 5,
      p_reason: 'Ajuste por necesidades del programa educativo',
      p_actor: ADMIN_UUID,
    });
    expect(client.rpc).toHaveBeenCalledTimes(2);
    expect(client.from).not.toHaveBeenCalled();
  });

  it.each([
    ['same_category', 400, 'Las categorías de origen y destino deben ser diferentes.'],
    ['reserved_category', 400, 'No se pueden redistribuir horas desde/hacia Cursos Online (LMS).'],
    ['from_category_not_found', 400, "La categoría de origen 'asesoria_tecnica_presencial' no existe."],
    ['to_category_not_found', 400, "La categoría de destino 'asesoria_directiva_presencial' no existe."],
    [
      'from_allocation_missing',
      404,
      "El contrato no tiene asignación para la categoría de origen 'asesoria_tecnica_presencial'.",
    ],
    [
      'to_allocation_missing',
      404,
      "El contrato no tiene asignación para la categoría de destino 'asesoria_directiva_presencial'.",
    ],
    ['invalid_hours', 400, 'Datos inválidos: Las horas deben ser un número positivo'],
  ])('maps the function refusal %s to the sentence the route answers', async (message, status, sentence) => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });
    const client = buildMockClient({ code: 'P0001', message });
    mockCreateServiceRoleClient.mockReturnValue(client);

    const res = await patch();
    expect(res._getStatusCode()).toBe(status);
    expect(res._getJSONData().error).toBe(sentence);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it('answers 500 and reads no summary when the function fails otherwise (nothing was changed)', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });
    const client = buildMockClient({ code: '23503', message: 'insert or update violates foreign key' });
    mockCreateServiceRoleClient.mockReturnValue(client);

    const res = await patch();
    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData().error).toBe('Error inesperado al redistribuir horas');
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });
});
