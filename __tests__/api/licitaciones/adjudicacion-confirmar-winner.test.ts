// @vitest-environment node
/**
 * LIC-D2 (GENERA fixes F20c): the confirmation route refuses a provider id that
 * is not the stored winner (409, nothing changed); without an id (an older
 * client) it confirms as before. Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { h } = vi.hoisted(() => ({
  h: {
    licitacion: {} as Record<string, unknown>,
    updates: [] as Array<{ table: string; payload: unknown }>,
    inserts: [] as string[],
    winnerAtUpdate: null as string | null, // set: the stored winner when the award update runs
  },
}));

vi.mock('@/lib/api-auth', async () => {
  const { createRecordingSupabase, has, opArgs } = await import('../../helpers/recordingSupabase');
  const fake = createRecordingSupabase();
  fake.state.respond = (req) => {
    if (has(req, 'update')) {
      const guard = req.ops.find(o => o.method === 'eq' && o.args[0] === 'ganador_ate_id');
      if (guard && h.winnerAtUpdate && guard.args[1] !== h.winnerAtUpdate) return { data: null, error: null };
      h.updates.push({ table: req.target, payload: opArgs(req, 'update')?.[0] });
      return { data: { ...h.licitacion, ...(opArgs(req, 'update')?.[0] as object) }, error: null };
    }
    if (has(req, 'insert')) { h.inserts.push(req.target); return { data: null, error: null }; }
    if (req.target === 'licitaciones') return { data: h.licitacion, error: null };
    if (req.target === 'licitacion_ates') return { data: { nombre_ate: 'ATE Sintética' }, error: null };
    if (req.target === 'schools') return { data: { name: 'Escuela Inventada' }, error: null };
    return { data: null, error: null };
  };
  return {
    getApiUser: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, error: null }),
    createServiceRoleClient: () => fake.client,
    sendAuthError: (res: any, error: string, status: number) => res.status(status).json({ error }),
    sendApiResponse: (res: any, data: unknown) => res.status(200).json({ data }),
    logApiRequest: vi.fn(),
    handleMethodNotAllowed: (res: any) => res.status(405).json({ error: 'method' }),
  };
});
vi.mock('@/utils/roleUtils', () => ({
  getUserRoles: vi.fn(async () => [{ role_type: 'encargado_licitacion', is_active: true, school_id: 1 }]),
}));
vi.mock('@/lib/notificationService', () => ({ default: { triggerNotification: vi.fn(async () => undefined) } }));

import notificationService from '@/lib/notificationService';
import confirmar from '@/pages/api/licitaciones/[id]/adjudicacion-confirmar';

const LIC = '22222222-2222-4222-8222-222222222222';
const ATE_A = '33333333-3333-4333-8333-333333333333';
const ATE_B = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  h.updates = []; h.inserts = []; h.winnerAtUpdate = null;
  h.licitacion = {
    id: LIC, estado: 'adjudicacion_pendiente', school_id: 1, ganador_ate_id: ATE_A,
    carta_adjudicacion_url: 'licitaciones/x/adjudicacion/c.docx', numero_licitacion: 'LIC-1-2026-001',
  };
});

async function call(body: unknown) {
  const { req, res } = createMocks({ method: 'POST', query: { id: LIC }, body: body as never });
  await confirmar(req, res);
  return { status: res._getStatusCode(), json: res._getJSONData() };
}

describe('adjudicacion-confirmar — the selected provider must be the stored winner (LIC-D2)', () => {
  it('answers 409 with the sentence and changes nothing when the id is not the stored winner', async () => {
    const r = await call({ es_fne: true, ganador_ate_id: ATE_B });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('El ganador seleccionado no está guardado. Guarde la adjudicación y vuelva a confirmar.');
    expect(h.updates).toHaveLength(0);
    expect(h.inserts).toHaveLength(0);
  });

  it('confirms when the id is the stored winner', async () => {
    const r = await call({ es_fne: true, ganador_ate_id: ATE_A });
    expect(r.status).toBe(200);
    expect(h.updates[0]).toMatchObject({ table: 'licitaciones', payload: { estado: 'contrato_pendiente' } });
  });

  it('confirms as before when no id is sent (an older client)', async () => {
    const r = await call({ es_fne: false });
    expect(r.status).toBe(200);
    expect(h.updates[0]).toMatchObject({ table: 'licitaciones', payload: { estado: 'adjudicada_externo' } });
  });

  it('refuses an id that is not a UUID as invalid input', async () => {
    const r = await call({ es_fne: true, ganador_ate_id: 'not-a-uuid' });
    expect(r.status).toBe(400);
    expect(h.updates).toHaveLength(0);
  });

  it('answers 409 with the sentence and sends no notification when the winner changes after the route\'s check (send-back 1)', async () => {
    h.winnerAtUpdate = ATE_B; // another person saved B between the comparison and the award
    vi.mocked(notificationService.triggerNotification).mockClear();
    const r = await call({ es_fne: false, ganador_ate_id: ATE_A });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('El ganador seleccionado no está guardado. Guarde la adjudicación y vuelva a confirmar.');
    expect(h.updates).toHaveLength(0);
    expect(h.inserts).toHaveLength(0);
    await new Promise(r2 => setTimeout(r2, 0));
    expect(notificationService.triggerNotification).not.toHaveBeenCalled();
  });
});
