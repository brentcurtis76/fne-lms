// @vitest-environment node
/**
 * LIC-B7 (GENERA fixes F24a): the Carta is signed by the «Representante legal»
 * with the sostenedor's legal name. The route reads clientes.nombre_legal and
 * passes it to the generator. Same mocking style as carta-stuck-tender.test.ts.
 * Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { h, generateCartaDocument } = vi.hoisted(() => {
  const h = {
    licitacion: {} as Record<string, unknown>,
    clienteSelects: [] as unknown[],
  };
  const generateCartaDocument = vi.fn(async (_data: unknown) => Buffer.from('synthetic-docx'));
  return { h, generateCartaDocument };
});

vi.mock('@/lib/api-auth', async () => {
  const { createRecordingSupabase, has, opArgs } = await import('../../helpers/recordingSupabase');
  const fake = createRecordingSupabase();
  fake.state.respond = (req) => {
    if (has(req, 'update')) {
      return { data: { ...h.licitacion, ...(opArgs(req, 'update')?.[0] as object) }, error: null };
    }
    if (req.target === 'licitaciones') return { data: h.licitacion, error: null };
    if (req.target === 'licitacion_ates') return { data: { nombre_ate: 'ATE Sintética', rut_ate: '1-9', nombre_contacto: 'Persona Inventada' }, error: null };
    if (req.target === 'schools') return { data: { name: 'Escuela Inventada' }, error: null };
    if (req.target === 'clientes') {
      h.clienteSelects.push(opArgs(req, 'select')?.[0]);
      return {
        data: { ciudad: 'Ciudad Ficticia', nombre_representante: 'Representante Inventado', nombre_legal: 'Sostenedor Inventado SpA' },
        error: null,
      };
    }
    if (req.target === 'licitacion_documentos' && has(req, 'insert')) return { data: { id: 'doc-1' }, error: null };
    return { data: null, error: null };
  };
  const client = {
    ...fake.client,
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async () => ({ error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: 'http://localhost/signed' } }),
      }),
    },
  };
  return {
    getApiUser: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, error: null }),
    createServiceRoleClient: () => client,
    getForcedPasswordChangeVerdict: async () => 'allowed',
    sendForcedPasswordChangeResponse: () => false,
    sendAuthError: (res: any, error: string, status: number) => res.status(status).json({ error }),
    sendApiResponse: (res: any, data: unknown) => res.status(200).json({ data }),
    logApiRequest: vi.fn(),
    handleMethodNotAllowed: (res: any) => res.status(405).json({ error: 'method' }),
  };
});
vi.mock('@/utils/roleUtils', () => ({
  getUserRoles: vi.fn(async () => [{ role_type: 'admin', is_active: true, from_cache: false, school_id: 1 }]),
}));
vi.mock('@/lib/cartaGenerator', () => ({ generateCartaDocument }));
vi.mock('@/lib/notificationService', () => ({ default: { triggerNotification: vi.fn(async () => undefined) } }));

import carta from '@/pages/api/licitaciones/[id]/generate-carta';

const LIC = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  h.clienteSelects = [];
  generateCartaDocument.mockClear();
  h.licitacion = {
    id: LIC, estado: 'adjudicacion_pendiente', ganador_es_fne: false, ganador_ate_id: '33333333-3333-4333-8333-333333333333',
    carta_adjudicacion_url: null, contrato_id: null, school_id: 1, cliente_id: 'cliente-1',
    numero_licitacion: 'LIC-1-2026-001', nombre_licitacion: 'Licitación inventada',
  };
});

describe('generate-carta — the signer is the legal representative of the sostenedor (LIC-B7)', () => {
  it('reads the client’s nombre_legal and passes it to the generator', async () => {
    const { req, res } = createMocks({ method: 'GET', query: { id: LIC } });
    await carta(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(h.clienteSelects).toHaveLength(1);
    expect(String(h.clienteSelects[0])).toMatch(/\bnombre_legal\b/);
    expect(generateCartaDocument).toHaveBeenCalledTimes(1);
    const data = generateCartaDocument.mock.calls[0][0] as { school: Record<string, unknown> };
    expect(data.school).toMatchObject({
      director_nombre: 'Representante Inventado',
      sostenedor_nombre_legal: 'Sostenedor Inventado SpA',
    });
  });
});
