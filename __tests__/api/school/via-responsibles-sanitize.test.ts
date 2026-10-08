// @vitest-environment node
/**
 * GET /api/school/transversal-context/via-responsibles through the REAL
 * schoolViaAssignmentService (Codex B2 r2 note): a rule-read failure — returned
 * error or thrown exception — answers 500 with a fixed es-CL message and never
 * the database text.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockGetApiUser, mockSupabaseAdmin } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockSupabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createServiceRoleClient: () => ({}),
  sendAuthError: (res: any) => res.status(401).json({ error: 'auth' }),
  handleMethodNotAllowed: (res: any) => res.status(405).json({ error: 'method' }),
}));

vi.mock('../../../lib/permissions/directivo', async () => {
  const actual = await vi.importActual<any>('../../../lib/permissions/directivo');
  return {
    ...actual,
    hasDirectivoPermissionForSchool: vi.fn(async () => ({ hasPermission: true, schoolId: 42, isAdmin: false, via: 'equipo_directivo' })),
  };
});

vi.mock('../../../lib/supabaseAdmin', () => ({ supabaseAdmin: mockSupabaseAdmin }));

import handler from '../../../pages/api/school/transversal-context/via-responsibles';

const DB_TEXT = 'permission denied for table ab_via_assignment_rules';

async function get() {
  const { req, res } = createMocks({ method: 'GET', query: { school_id: '42' } });
  await handler(req as any, res as any);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockGetApiUser.mockResolvedValue({ user: { id: 'u1' }, error: null });
});

describe('via-responsibles GET sanitization', () => {
  it('a returned rule-read error answers 500 without the database message', async () => {
    mockSupabaseAdmin.from.mockImplementation(() => ({
      select: () => Promise.resolve({ data: null, error: { message: DB_TEXT } }),
    }));
    const res = await get();
    expect(res._getStatusCode()).toBe(500);
    expect(res._getData()).not.toContain('permission denied');
    expect(JSON.parse(res._getData()).error).toContain('No se pudieron leer las reglas');
  });

  it('a thrown rule-read exception answers 500 without the exception text', async () => {
    mockSupabaseAdmin.from.mockImplementation(() => {
      throw new Error(DB_TEXT);
    });
    const res = await get();
    expect(res._getStatusCode()).toBe(500);
    expect(res._getData()).not.toContain('permission denied');
  });
});
