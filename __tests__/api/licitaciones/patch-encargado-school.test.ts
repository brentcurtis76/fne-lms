// @vitest-environment node

/**
 * PATCH /api/licitaciones/[id] — non-timeline branch (LIC-C2b).
 * An encargado may set only publicacion_imagen_url, only on a tender of their own
 * school, and the write is made server-side with the service client (their own
 * session no longer has an UPDATE rule on licitaciones). Admin behaviour and the
 * timeline branch stay as they were. Synthetic data only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

type Call = { client: 'service' | 'user'; table: string; op: string; args: unknown[] };

const { state, calls, makeClient, createApiSupabaseClient, getUserRoles, updateTimelineDates } = vi.hoisted(() => {
  const state = {
    roles: [] as Array<{ role_type: string; school_id: number | null; is_active: boolean }>,
    tender: { id: '', school_id: 1 } as { id: string; school_id: number } | null,
  };
  const calls: Call[] = [];
  const makeClient = (name: 'service' | 'user') => ({
    from(table: string) {
      let op = 'select';
      let payload: Record<string, unknown> | null = null;
      const query: any = {
        select: (...args: unknown[]) => { calls.push({ client: name, table, op: op === 'update' ? 'update.select' : 'select', args }); return query; },
        update: (p: Record<string, unknown>) => { op = 'update'; payload = p; calls.push({ client: name, table, op: 'update', args: [p] }); return query; },
        eq: (...args: unknown[]) => { calls.push({ client: name, table, op: 'eq', args }); return query; },
        single: async () => {
          if (table !== 'licitaciones') return { data: null, error: null };
          if (op === 'update') {
            return { data: { ...(state.tender ?? {}), ...(payload ?? {}) }, error: null };
          }
          return state.tender
            ? { data: { school_id: state.tender.school_id }, error: null }
            : { data: null, error: { message: 'Synthetic not found' } };
        },
      };
      return query;
    },
  });
  const createApiSupabaseClient = vi.fn(async () => makeClient('user'));
  const getUserRoles = vi.fn(async () => state.roles);
  const updateTimelineDates = vi.fn(async () => ({ id: 'synthetic-timeline-result' }));
  return { state, calls, makeClient, createApiSupabaseClient, getUserRoles, updateTimelineDates };
});

vi.mock('@/lib/api-auth', () => ({
  getApiUser: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, error: null }),
  createServiceRoleClient: () => makeClient('service'),
  createApiSupabaseClient,
  sendAuthError: (res: any, error: string, status: number) => res.status(status).json({ error }),
  sendApiResponse: (res: any, data: unknown, status = 200) => res.status(status).json({ data }),
  logApiRequest: vi.fn(),
  handleMethodNotAllowed: (res: any) => res.status(405).json({ error: 'Method not allowed' }),
}));
vi.mock('@/utils/roleUtils', () => ({ getUserRoles }));
vi.mock('@/lib/licitacionService', () => ({ getLicitacionDetail: vi.fn(), updateTimelineDates }));

import handler from '@/pages/api/licitaciones/[id]';

const TENDER_ID = '22222222-2222-4222-8222-222222222222';
const IMAGE = 'licitaciones/synthetic/imagen.jpg';

const encargado = (school: number) => [{ role_type: 'encargado_licitacion', school_id: school, is_active: true }];
const admin = [{ role_type: 'admin', school_id: null, is_active: true }];

async function patch(body: Record<string, unknown>) {
  const { req, res } = createMocks({ method: 'PATCH', query: { id: TENDER_ID }, body });
  await handler(req as any, res as any);
  return res;
}

const updates = () => calls.filter(c => c.op === 'update');

beforeEach(() => {
  calls.length = 0;
  state.roles = [];
  state.tender = { id: TENDER_ID, school_id: 1 };
  vi.clearAllMocks();
});

describe('PATCH /api/licitaciones/[id] — encargado school check (LIC-C2b)', () => {
  it('refuses an encargado of another school with 403 and attempts no update with any client', async () => {
    state.roles = encargado(2);
    const res = await patch({ publicacion_imagen_url: IMAGE });
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'No tiene permisos para esta licitacion' });
    expect(updates()).toEqual([]);
  });

  it('answers 404 when the tender does not exist for an encargado, with no update', async () => {
    state.roles = encargado(1);
    state.tender = null;
    const res = await patch({ publicacion_imagen_url: IMAGE });
    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({ error: 'Licitacion no encontrada' });
    expect(updates()).toEqual([]);
  });

  it('reads the tender school with the service client before deciding', async () => {
    state.roles = encargado(2);
    await patch({ publicacion_imagen_url: IMAGE });
    expect(calls).toContainEqual({ client: 'service', table: 'licitaciones', op: 'select', args: ['school_id'] });
    expect(calls).toContainEqual({ client: 'service', table: 'licitaciones', op: 'eq', args: ['id', TENDER_ID] });
  });

  it('lets an encargado of the same school set publicacion_imagen_url, written with the SERVICE client', async () => {
    state.roles = encargado(1);
    const res = await patch({ publicacion_imagen_url: IMAGE });
    expect(res._getStatusCode()).toBe(200);
    expect(updates()).toEqual([
      { client: 'service', table: 'licitaciones', op: 'update', args: [{ publicacion_imagen_url: IMAGE }] },
    ]);
    expect(calls.filter(c => c.client === 'user')).toEqual([]);
    expect(calls).toContainEqual({ client: 'service', table: 'licitaciones', op: 'update.select', args: ['*'] });
    expect(res._getJSONData()).toEqual({
      data: { licitacion: { id: TENDER_ID, school_id: 1, publicacion_imagen_url: IMAGE } },
    });
  });

  it('accepts a school_id held as a string on the role row (same comparison as publicacion.ts)', async () => {
    state.roles = [{ role_type: 'encargado_licitacion', school_id: '1' as unknown as number, is_active: true }];
    const res = await patch({ publicacion_imagen_url: IMAGE });
    expect(res._getStatusCode()).toBe(200);
    expect(updates()).toHaveLength(1);
  });

  it('still sends only publicacion_imagen_url when an encargado also sends other fields', async () => {
    state.roles = encargado(1);
    const res = await patch({ publicacion_imagen_url: IMAGE, estado: 'cerrada', monto_maximo: 999, notas: 'x' });
    expect(res._getStatusCode()).toBe(200);
    expect(updates()).toEqual([
      { client: 'service', table: 'licitaciones', op: 'update', args: [{ publicacion_imagen_url: IMAGE }] },
    ]);
  });

  it('still answers 400 when an encargado sends only other fields, with no update', async () => {
    state.roles = encargado(1);
    const res = await patch({ nombre_licitacion: 'Synthetic', monto_maximo: 10 });
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'Sin campos válidos para actualizar' });
    expect(updates()).toEqual([]);
  });
});

describe('PATCH /api/licitaciones/[id] — must still work', () => {
  it('admin updates the eleven allowed fields on their own session, as today', async () => {
    state.roles = admin;
    const body = {
      nombre_licitacion: 'Synthetic tender', email_licitacion: 'synthetic@example.test', monto_minimo: 10,
      monto_maximo: 20, tipo_moneda: 'UF', duracion_minima: '1 mes', duracion_maxima: '2 meses',
      participantes_estimados: 30, modalidad_preferida: 'presencial', notas: 'Synthetic notes',
      publicacion_imagen_url: IMAGE, estado: 'cerrada', school_id: 99,
    };
    const res = await patch(body);
    expect(res._getStatusCode()).toBe(200);
    const { estado: _e, school_id: _s, ...allowed } = body;
    expect(updates()).toEqual([{ client: 'user', table: 'licitaciones', op: 'update', args: [allowed] }]);
    expect(calls.filter(c => c.client === 'service' && c.table === 'licitaciones')).toEqual([]);
  });

  it('timeline branch: admin goes through updateTimelineDates with the service client', async () => {
    state.roles = admin;
    const res = await patch({ timeline: { fecha_limite_consultas: '2026-03-23' } });
    expect(res._getStatusCode()).toBe(200);
    expect(updateTimelineDates).toHaveBeenCalledTimes(1);
    expect(updates()).toEqual([]);
  });

  it('timeline branch: encargado still refused with 403', async () => {
    state.roles = encargado(1);
    const res = await patch({ timeline: { fecha_limite_consultas: '2026-03-23' } });
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'Solo administradores pueden ajustar las fechas del cronograma' });
    expect(updateTimelineDates).not.toHaveBeenCalled();
  });

  it('a caller who is neither admin nor encargado is refused with 403', async () => {
    state.roles = [{ role_type: 'docente', school_id: 1, is_active: true }];
    const res = await patch({ publicacion_imagen_url: IMAGE });
    expect(res._getStatusCode()).toBe(403);
    expect(updates()).toEqual([]);
  });
});
