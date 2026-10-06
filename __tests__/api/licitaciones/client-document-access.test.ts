// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { state, client, getUserRoles } = vi.hoisted(() => {
  const state = { role: 'admin', held: false, cached: false, active: true, roleError: false, tables: [] as string[] };
  const client = {
    from(table: string) {
      state.tables.push(table);
      const query: any = {
        select: () => query, eq: () => query,
        single: async () => ({ data: null, error: null }),
      };
      return query;
    },
  };
  return { state, client, getUserRoles: vi.fn(async () => { if (state.roleError) throw new Error('Synthetic lookup failure'); return [{ role_type: state.role, is_active: state.active, from_cache: state.cached, school_id: 1 }]; }) };
});
vi.mock('@/lib/api-auth', () => ({
  getApiUser: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, error: null }),
  createServiceRoleClient: () => client,
  getForcedPasswordChangeVerdict: async () => state.held ? 'required' : 'allowed',
  sendForcedPasswordChangeResponse: (res: any, verdict: string) => {
    if (verdict === 'allowed') return false;
    res.status(403).json({ error: 'password_change_required' });
    return true;
  },
  sendAuthError: (res: any, error: string, status: number) => res.status(status).json({ error }),
  sendApiResponse: vi.fn(), logApiRequest: vi.fn(), handleMethodNotAllowed: vi.fn(),
}));
vi.mock('@/utils/roleUtils', () => ({ getUserRoles }));
vi.mock('@/lib/docxGenerator', () => ({ generateBasesDocument: vi.fn() }));
vi.mock('@/lib/cartaGenerator', () => ({ generateCartaDocument: vi.fn() }));
import bases from '@/pages/api/licitaciones/[id]/generate-bases';
import carta from '@/pages/api/licitaciones/[id]/generate-carta';
import contract from '@/pages/api/licitaciones/[id]/generate-contract';

beforeEach(() => { state.role = 'admin'; state.held = false; state.cached = false; state.active = true; state.roleError = false; state.tables = []; vi.clearAllMocks(); });
for (const [name, handler] of [['bases', bases], ['carta', carta], ['contract', contract]] as const) {
  describe(name, () => {
    for (const role of ['encargado_licitacion', 'consultor', 'equipo_directivo', 'docente']) {
      it(`denies ${role} before querying legal-client data or generating documents`, async () => {
        state.role = role;
        const { req, res } = createMocks({ method: name === 'contract' ? 'POST' : 'GET', query: { id: '22222222-2222-4222-8222-222222222222' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(403);
        expect(state.tables).toEqual([]);
      });
    }
    it('allows authoritative active admin to reach document lookup', async () => {
      const { req, res } = createMocks({ method: name === 'contract' ? 'POST' : 'GET', query: { id: '22222222-2222-4222-8222-222222222222' } });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(name === 'contract' ? 400 : 404);
      expect(state.tables).toEqual(name === 'contract' ? [] : ['licitaciones']);
    });
    for (const condition of ['cached', 'inactive', 'lookup-error'] as const) {
      it(`denies ${condition} admin before any client lookup`, async () => {
        state.cached = condition === 'cached'; state.active = condition !== 'inactive'; state.roleError = condition === 'lookup-error';
        const { req, res } = createMocks({ method: name === 'contract' ? 'POST' : 'GET', query: { id: '22222222-2222-4222-8222-222222222222' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(condition === 'lookup-error' ? 500 : 403);
        expect(state.tables).toEqual([]);
      });
    }
    it('holds a password-change admin before any service data read', async () => {
      state.held = true;
      const { req, res } = createMocks({ method: name === 'contract' ? 'POST' : 'GET', query: { id: '22222222-2222-4222-8222-222222222222' } });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(403);
      expect(state.tables).toEqual([]);
      expect(getUserRoles).not.toHaveBeenCalled();
    });
  });
}
