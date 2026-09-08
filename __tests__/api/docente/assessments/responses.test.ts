// @vitest-environment node
/**
 * PUT /api/docente/assessments/[instanceId]/responses — progress flags.
 *
 * PR 2 (Procesos de Cambio): the user client never writes
 * assessment_instance_assignees (admin-write-only table; the write silently
 * no-op'd). has_started is derived by the assessment_instance_progress_flags_trg
 * trigger from the pending -> in_progress transition, which this handler
 * performs and error-checks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const DOCENTE_UUID = '2a2b2c2d-2e2f-4a2b-8c2d-2e2f2a2b2c2d';
const INSTANCE_ID = '44444444-4444-4444-8444-444444444444';
const IND_ID = '55555555-5555-4555-8555-555555555555';

const { mockGetApiUser, mockCreateApiSupabaseClient } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  sendAuthError: vi.fn((res: any, msg?: string) => res.status(401).json({ error: msg })),
  handleMethodNotAllowed: vi.fn((res: any) => res.status(405).json({ error: 'Método no permitido' })),
}));

import handler from '@/pages/api/docente/assessments/[instanceId]/responses';

type Call = { method: string; args: unknown[] };

function recordingChain(outcome: { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const proxyHandler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(outcome);
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return new Proxy({}, proxyHandler);
      };
    },
  };
  return { chain: new Proxy({}, proxyHandler) as any, calls };
}

function buildClient(opts: { instanceStatus?: string; statusUpdateError?: unknown } = {}) {
  const assignee = { id: 'asg-1', instance_id: INSTANCE_ID, user_id: DOCENTE_UUID, can_edit: true, has_started: false };
  const instance = { id: INSTANCE_ID, status: opts.instanceStatus ?? 'pending', template_snapshot_id: 'snap-1' };
  const snapshot = { snapshot_data: { modules: [{ indicators: [{ id: IND_ID, category: 'cobertura' }] }] } };
  const chains: Array<{ table: string; calls: Call[] }> = [];
  const seen: Record<string, number> = {};

  const from = vi.fn((table: string) => {
    seen[table] = (seen[table] || 0) + 1;
    let outcome: { data: unknown; error: unknown } = { data: null, error: null };
    if (table === 'assessment_instance_assignees') outcome = { data: assignee, error: null };
    if (table === 'assessment_instances' && seen[table] === 1) outcome = { data: instance, error: null };
    if (table === 'assessment_instances' && seen[table] === 2) outcome = { data: null, error: opts.statusUpdateError ?? null };
    if (table === 'assessment_template_snapshots') outcome = { data: snapshot, error: null };
    if (table === 'assessment_responses') outcome = { data: [{ id: 'r1', indicator_id: IND_ID }], error: null };
    const { chain, calls } = recordingChain(outcome);
    chains.push({ table, calls });
    return chain;
  });
  return { from, chains };
}

const isWrite = (calls: Call[]) => calls.some(c => ['insert', 'update', 'delete', 'upsert'].includes(c.method));

async function put(client: ReturnType<typeof buildClient>) {
  mockCreateApiSupabaseClient.mockResolvedValue(client);
  const { req, res } = createMocks({
    method: 'PUT',
    query: { instanceId: INSTANCE_ID },
    body: { responses: [{ indicator_id: IND_ID, coverage_value: true }] },
  });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), json: JSON.parse(res._getData()) };
}

describe('PUT /api/docente/assessments/[instanceId]/responses — progress flags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
  });

  it('moves a pending instance to in_progress and never writes assessment_instance_assignees', async () => {
    const client = buildClient();
    const r = await put(client);
    expect(r.status).toBe(200);
    expect(r.json.saved).toBe(1);

    const assigneeWrites = client.chains.filter(c => c.table === 'assessment_instance_assignees' && isWrite(c.calls));
    expect(assigneeWrites).toHaveLength(0);

    const statusUpdate = client.chains.find(c => c.table === 'assessment_instances' && isWrite(c.calls));
    expect(statusUpdate).toBeDefined();
    const update = statusUpdate!.calls.find(c => c.method === 'update');
    expect(update?.args[0]).toMatchObject({ status: 'in_progress' });
    expect((update?.args[0] as any).started_at).toEqual(expect.any(String));
    expect(statusUpdate!.calls.find(c => c.method === 'eq')?.args).toEqual(['id', INSTANCE_ID]);
  });

  it('does not touch the instance status when it is already in_progress', async () => {
    const client = buildClient({ instanceStatus: 'in_progress' });
    const r = await put(client);
    expect(r.status).toBe(200);
    expect(client.chains.filter(c => c.table === 'assessment_instances')).toHaveLength(1);
    expect(client.chains.filter(c => c.table === 'assessment_instance_assignees' && isWrite(c.calls))).toHaveLength(0);
  });

  it('still answers 200 (responses saved) when the in_progress transition fails, and logs it', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = buildClient({ statusUpdateError: { code: '42501', message: 'rls' } });
    const r = await put(client);
    expect(r.status).toBe(200);
    expect(spy).toHaveBeenCalledWith('Error moving instance to in_progress:', expect.objectContaining({ code: '42501' }));
    spy.mockRestore();
  });

  it('refuses a completed instance with 400', async () => {
    const client = buildClient({ instanceStatus: 'completed' });
    const r = await put(client);
    expect(r.status).toBe(400);
  });
});

describe('PUT /api/docente/assessments/[instanceId]/responses — frecuencia value validation (PR 3)', () => {
  const FREQ_ID = '77777777-7777-4777-8777-777777777777';

  function buildFrequencyClient() {
    const assignee = { id: 'asg-1', instance_id: INSTANCE_ID, user_id: DOCENTE_UUID, can_edit: true };
    const instance = { id: INSTANCE_ID, status: 'in_progress', template_snapshot_id: 'snap-1' };
    const snapshot = { snapshot_data: { modules: [{ indicators: [{ id: FREQ_ID, category: 'frecuencia' }] }] } };
    const upserts: unknown[] = [];
    const from = vi.fn((table: string) => {
      let outcome: { data: unknown; error: unknown } = { data: null, error: null };
      if (table === 'assessment_instance_assignees') outcome = { data: assignee, error: null };
      if (table === 'assessment_instances') outcome = { data: instance, error: null };
      if (table === 'assessment_template_snapshots') outcome = { data: snapshot, error: null };
      if (table === 'assessment_responses') outcome = { data: [{ id: 'r1', indicator_id: FREQ_ID }], error: null };
      const { chain, calls } = recordingChain(outcome);
      if (table === 'assessment_responses') {
        // Capture the upsert payload lazily via the recorded calls.
        Object.defineProperty(chain, '__calls', { value: calls });
        upserts.push(calls);
      }
      return chain;
    });
    return { from, upserts: upserts as Call[][] };
  }

  async function putFrequency(frequency_value: unknown) {
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    const client = buildFrequencyClient();
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    const { req, res } = createMocks({
      method: 'PUT',
      query: { instanceId: INSTANCE_ID },
      body: { responses: [{ indicator_id: FREQ_ID, frequency_value, frequency_unit: 'semana' }] },
    });
    // node-mocks-http keeps the body object as-is, so NaN/Infinity survive
    // (a real JSON body could not carry them, but a string could).
    await handler(req as any, res as any);
    return { status: res._getStatusCode(), json: JSON.parse(res._getData()), client };
  }

  beforeEach(() => vi.clearAllMocks());

  it('rejects NaN with 400 and an es-CL message', async () => {
    const r = await putFrequency(Number.NaN);
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('No hay respuestas válidas para guardar');
    expect(r.json.details).toEqual([`Indicador ${FREQ_ID}: frecuencia debe ser un número válido`]);
    expect(r.client.upserts).toHaveLength(0);
  });

  it('rejects Infinity and non-numeric strings with 400', async () => {
    expect((await putFrequency(Number.POSITIVE_INFINITY)).status).toBe(400);
    expect((await putFrequency('3')).status).toBe(400);
  });

  it('accepts null as a cleared value (partial save) and persists it as null', async () => {
    const r = await putFrequency(null);
    expect(r.status).toBe(200);
    const upsert = r.client.upserts[0].find(c => c.method === 'upsert');
    expect(upsert).toBeDefined();
    const rows = upsert!.args[0] as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ indicator_id: FREQ_ID, frequency_value: null, frequency_unit: 'semana' });
  });

  it('accepts a finite number', async () => {
    const r = await putFrequency(2.5);
    expect(r.status).toBe(200);
    const upsert = r.client.upserts[0].find(c => c.method === 'upsert');
    expect((upsert!.args[0] as Array<Record<string, unknown>>)[0]).toMatchObject({ frequency_value: 2.5 });
  });
});

describe('PUT /api/docente/assessments/[instanceId]/responses — frecuencia constraints from the snapshot (R7)', () => {
  const FREQ_ID = '77777777-7777-4777-8777-777777777777';
  const COB_ID = '88888888-8888-4888-8888-888888888888';

  function buildClient(frequencyConfig: unknown) {
    const assignee = { id: 'asg-1', instance_id: INSTANCE_ID, user_id: DOCENTE_UUID, can_edit: true };
    const instance = { id: INSTANCE_ID, status: 'in_progress', template_snapshot_id: 'snap-1' };
    const snapshot = {
      snapshot_data: {
        objectives: [{ modules: [{ indicators: [
          { id: FREQ_ID, category: 'frecuencia', frequency_config: frequencyConfig },
          { id: COB_ID, category: 'cobertura' },
        ] }] }],
      },
    };
    const upserts: Call[][] = [];
    const from = vi.fn((table: string) => {
      let outcome: { data: unknown; error: unknown } = { data: null, error: null };
      if (table === 'assessment_instance_assignees') outcome = { data: assignee, error: null };
      if (table === 'assessment_instances') outcome = { data: instance, error: null };
      if (table === 'assessment_template_snapshots') outcome = { data: snapshot, error: null };
      if (table === 'assessment_responses') outcome = { data: [{ id: 'r1' }], error: null };
      const { chain, calls } = recordingChain(outcome);
      if (table === 'assessment_responses') upserts.push(calls);
      return chain;
    });
    return { from, upserts };
  }

  async function save(frequencyConfig: unknown, responses: unknown[]) {
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    const client = buildClient(frequencyConfig);
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    const { req, res } = createMocks({ method: 'PUT', query: { instanceId: INSTANCE_ID }, body: { responses } });
    await handler(req as any, res as any);
    return { status: res._getStatusCode(), json: JSON.parse(res._getData()), client };
  }
  const freq = (frequency_value: unknown, frequency_unit: unknown = 'semana') => ({ indicator_id: FREQ_ID, frequency_value, frequency_unit });
  const savedRows = (r: { client: ReturnType<typeof buildClient> }) =>
    (r.client.upserts[0]?.find(c => c.method === 'upsert')?.args[0] as Array<Record<string, unknown>>) ?? [];

  const FULL = { type: 'count', min: 0, max: 10, step: 2, unit: 'semana', allowed_units: ['semana', 'mes'] };

  beforeEach(() => vi.clearAllMocks());

  it('accepts a value inside the range, on the step, with an allowed unit', async () => {
    const r = await save(FULL, [freq(4, 'mes')]);
    expect(r.status).toBe(200);
    expect(savedRows(r)[0]).toMatchObject({ frequency_value: 4, frequency_unit: 'mes' });
  });

  it.each([
    ['below min', freq(-2), 'mayor o igual a 0'],
    ['above max', freq(12), 'menor o igual a 10'],
    ['off the step grid', freq(3), 'de 2 en 2'],
    ['a unit outside the platform enum', freq(4, 'veces'), 'período de frecuencia no es válido'],
    ['a platform unit the snapshot does not allow', freq(4, 'dia'), 'no está permitido'],
    ['a value without a unit', freq(4, null), 'indicar el período'],
    ['a string value', freq('4'), 'número válido'],
  ])('refuses %s (400, nothing saved, indicator named in details)', async (_label, response, fragment) => {
    const r = await save(FULL, [response]);
    expect(r.status).toBe(400);
    expect(r.json.details[0]).toContain(`Indicador ${FREQ_ID}`);
    expect(r.json.details[0]).toContain(fragment);
    expect(r.client.upserts).toHaveLength(0);
  });

  it('keeps the valid sibling and reports the refused frecuencia row in errors (client keeps it dirty)', async () => {
    const r = await save(FULL, [{ indicator_id: COB_ID, coverage_value: true }, freq(11)]);
    expect(r.status).toBe(200);
    expect(r.json.errors).toEqual([expect.stringContaining(`Indicador ${FREQ_ID}: frecuencia debe ser menor o igual a 10`)]);
    expect(savedRows(r).map(row => row.indicator_id)).toEqual([COB_ID]);
  });

  it('still accepts a cleared value (null) under a full config, and a bare unit change is not required', async () => {
    const r = await save(FULL, [freq(null, 'semana')]);
    expect(r.status).toBe(200);
    expect(savedRows(r)[0]).toMatchObject({ frequency_value: null, frequency_unit: 'semana' });
  });

  it('accepts the valid legacy cases: no config, and the exact { unit: "veces" } shape', async () => {
    expect((await save(undefined, [freq(7.5, 'año')])).status).toBe(200);
    expect((await save({ unit: 'veces' }, [freq(3, 'mes')])).status).toBe(200);
    expect((await save({ type: 'count', unit: 'veces' }, [freq(3, 'mes')])).status).toBe(200);
  });

  it('steps are anchored at min (min 1, step 2 → 1, 3, 5 ...)', async () => {
    const anchored = { min: 1, max: 9, step: 2, unit: 'semana', allowed_units: ['semana'] };
    expect((await save(anchored, [freq(3)])).status).toBe(200);
    expect((await save(anchored, [freq(4)])).status).toBe(400);
  });

  it.each([
    ['min is a string', { ...FULL, min: '0' }],
    ['max is NaN', { ...FULL, max: Number.NaN }],
    ['step is zero', { ...FULL, step: 0 }],
    ['step wider than the range', { ...FULL, step: 11 }],
    ['min >= max', { ...FULL, min: 10, max: 10 }],
    ['allowed_units carries an unknown unit', { ...FULL, allowed_units: ['semana', 'veces'] }],
    ['allowed_units is empty', { ...FULL, allowed_units: [] }],
    ['the unit is not a platform period', { ...FULL, unit: 'week', allowed_units: ['semana'] }],
    ['the unit is the legacy one inside a modern config', { ...FULL, unit: 'veces' }],
    ['a platform unit alone (partial modern shape)', { unit: 'semana' }],
    ['min + max only (partial modern shape)', { min: 0, max: 10 }],
    ['min + max + step without periods (partial modern shape)', { min: 0, max: 10, step: 1 }],
    ['everything but allowed_units (partial modern shape)', { min: 0, max: 10, step: 1, unit: 'semana' }],
    ['everything but unit (partial modern shape)', { min: 0, max: 10, step: 1, allowed_units: ['semana'] }],
    ['the legacy unit next to a constraint', { unit: 'veces', max: 10 }],
    ['an empty object', {}],
    ['an unknown key', { ...FULL, tolerance: 1 }],
    ['config is an array', [1, 2]],
  ])('refuses the whole request with 422 when the snapshot config is malformed (%s) — never clamps', async (_label, config) => {
    const r = await save(config, [{ indicator_id: COB_ID, coverage_value: true }, freq(4)]);
    expect(r.status).toBe(422);
    expect(r.json.code).toBe('invalid_snapshot_frequency_config');
    expect(r.client.upserts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Codex round 2, finding A — the REAL responses endpoint enforces the shared
// contract: every modern config the publish service accepts lets a docente
// answer; every one it refuses answers 422 and writes nothing.
// ---------------------------------------------------------------------------
import { FREQUENCY_CONTRACT_CASES } from '../../../fixtures/frequency-config-contract';

describe('PUT /api/docente/assessments/[instanceId]/responses — frequency contract parity with publish', () => {
  const FREQ_ID = '77777777-7777-4777-8777-777777777777';

  function buildClient(frequencyConfig: unknown) {
    const assignee = { id: 'asg-1', instance_id: INSTANCE_ID, user_id: DOCENTE_UUID, can_edit: true };
    const instance = { id: INSTANCE_ID, status: 'in_progress', template_snapshot_id: 'snap-1' };
    const snapshot = { snapshot_data: { modules: [{ indicators: [{ id: FREQ_ID, category: 'frecuencia', frequency_config: frequencyConfig }] }] } };
    const upserts: Call[][] = [];
    const from = vi.fn((table: string) => {
      let outcome: { data: unknown; error: unknown } = { data: null, error: null };
      if (table === 'assessment_instance_assignees') outcome = { data: assignee, error: null };
      if (table === 'assessment_instances') outcome = { data: instance, error: null };
      if (table === 'assessment_template_snapshots') outcome = { data: snapshot, error: null };
      if (table === 'assessment_responses') outcome = { data: [{ id: 'r1' }], error: null };
      const { chain, calls } = recordingChain(outcome);
      if (table === 'assessment_responses') upserts.push(calls);
      return chain;
    });
    return { from, upserts };
  }

  async function save(frequencyConfig: unknown, frequency_value: unknown, frequency_unit: unknown) {
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    const client = buildClient(frequencyConfig);
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    const { req, res } = createMocks({
      method: 'PUT',
      query: { instanceId: INSTANCE_ID },
      body: { responses: [{ indicator_id: FREQ_ID, frequency_value, frequency_unit }] },
    });
    await handler(req as any, res as any);
    return { status: res._getStatusCode(), json: JSON.parse(res._getData()), client };
  }

  beforeEach(() => vi.clearAllMocks());

  it('a historical snapshot holding the Codex example still fails closed: 422, nothing written', async () => {
    const r = await save({ type: 'count', min: 0, max: 1, step: 2, unit: 'dia', allowed_units: ['dia'] }, 0, 'dia');
    expect(r.status).toBe(422);
    expect(r.json.code).toBe('invalid_snapshot_frequency_config');
    expect(r.client.upserts).toHaveLength(0);
  });

  it('the boundary config (step == max − min) accepts min and max and refuses the midpoint', async () => {
    const boundary = { type: 'count', min: 0, max: 1, step: 1, unit: 'dia', allowed_units: ['dia'] };
    expect((await save(boundary, 0, 'dia')).status).toBe(200);
    expect((await save(boundary, 1, 'dia')).status).toBe(200);
    const mid = await save(boundary, 0.5, 'dia');
    expect(mid.status).toBe(400);
    expect(mid.client.upserts).toHaveLength(0);
  });

  it('the Codex decimal boundary (0.1..0.3, step 0.2; finding 2): both endpoints save, the midpoint and an overshoot are refused', async () => {
    const decimal = { type: 'count', min: 0.1, max: 0.3, step: 0.2, unit: 'dia', allowed_units: ['dia'] };
    const lo = await save(decimal, 0.1, 'dia');
    expect(lo.status).toBe(200);
    expect(lo.client.upserts).toHaveLength(1);
    const hi = await save(decimal, 0.3, 'dia');
    expect(hi.status).toBe(200);
    expect(hi.client.upserts).toHaveLength(1);
    const computed = await save(decimal, 0.1 + 0.2, 'dia'); // 0.30000000000000004
    expect(computed.status).toBe(200);
    const mid = await save(decimal, 0.2, 'dia');
    expect(mid.status).toBe(400);
    expect(mid.client.upserts).toHaveLength(0);
    const over = await save(decimal, 0.31, 'dia');
    expect(over.status).toBe(400);
    expect(over.client.upserts).toHaveLength(0);
  });

  it('a historical snapshot whose decimal step is wider than the range by 2e-7 still fails closed (422, nothing written)', async () => {
    const r = await save({ type: 'count', min: 0.1, max: 0.3, step: 0.2000002, unit: 'dia', allowed_units: ['dia'] }, 0.1, 'dia');
    expect(r.status).toBe(422);
    expect(r.json.code).toBe('invalid_snapshot_frequency_config');
    expect(r.client.upserts).toHaveLength(0);
  });

  it.each(FREQUENCY_CONTRACT_CASES.map((c) => [c.label, c.valid, c.config] as const))(
    '%s → a min-valued answer is accepted iff the contract accepts the config (valid=%s)',
    async (_label, valid, config) => {
      const c = config as Record<string, unknown> | null;
      const unit = c && typeof c === 'object' && !Array.isArray(c) && typeof c.unit === 'string' ? c.unit : 'semana';
      const value = c && typeof c === 'object' && !Array.isArray(c) && typeof c.min === 'number' ? c.min : 0;
      const r = await save(config, value, unit);
      if (valid) {
        expect(r.status).toBe(200);
        expect(r.client.upserts).toHaveLength(1);
      } else {
        expect(r.status).toBe(422);
        expect(r.json.code).toBe('invalid_snapshot_frequency_config');
        expect(r.client.upserts).toHaveLength(0);
      }
    }
  );
});
