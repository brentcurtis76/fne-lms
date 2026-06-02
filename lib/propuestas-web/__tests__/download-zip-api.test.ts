// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';
import type { NextApiRequest, NextApiResponse } from 'next';

vi.mock('@/lib/api-auth', () => ({
  createServiceRoleClient: vi.fn(),
  checkIsAdmin: vi.fn(),
}));

vi.mock('@/lib/propuestas-web/access-code', () => ({
  verifyAccessCode: vi.fn(),
}));

vi.mock('@/lib/propuestas/storage', () => ({
  getSignedUrl: vi.fn(),
}));

import { checkIsAdmin, createServiceRoleClient } from '@/lib/api-auth';
import { verifyAccessCode } from '@/lib/propuestas-web/access-code';
import { getSignedUrl } from '@/lib/propuestas/storage';
import zipHandler from '../../../pages/api/propuestas/web/[slug]/download-zip';
import docHandler from '../../../pages/api/propuestas/web/[slug]/download-doc';

const mockCreateServiceRoleClient = vi.mocked(createServiceRoleClient);
const mockCheckIsAdmin = vi.mocked(checkIsAdmin);
const mockVerifyAccessCode = vi.mocked(verifyAccessCode);
const mockGetSignedUrl = vi.mocked(getSignedUrl);

type MockResponse = NextApiResponse & {
  _status: number;
  _body: unknown;
  _headers: Map<string, string | number>;
};

function mockReq(method: string, body: unknown = {}, slug = 'colegio-test-evoluciona-2026-v1'): NextApiRequest {
  return {
    method,
    body,
    query: { slug },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as NextApiRequest;
}

function mockRes(): MockResponse {
  const res = {
    _status: 0,
    _body: null,
    _headers: new Map<string, string | number>(),
  } as MockResponse;

  res.setHeader = vi.fn((key: string, value: string | number) => {
    res._headers.set(key, value);
    return res;
  }) as MockResponse['setHeader'];
  res.status = vi.fn((statusCode: number) => {
    res._status = statusCode;
    return res;
  }) as MockResponse['status'];
  res.json = vi.fn((body: unknown) => {
    res._body = body;
    return res;
  }) as MockResponse['json'];
  res.end = vi.fn((body?: unknown) => {
    res._body = body;
    return res;
  }) as MockResponse['end'];

  return res;
}

function arrayBufferFromBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function makeStorageBlob(buffer: Buffer) {
  return {
    arrayBuffer: vi.fn().mockResolvedValue(arrayBufferFromBuffer(buffer)),
  };
}

function makeMockServiceClient(
  propuesta: Record<string, unknown> | null,
  files: Record<string, Buffer>,
  options: { rateLimitCount?: number; rateLimitError?: unknown } = {}
) {
  const proposalChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(
      propuesta
        ? { data: propuesta, error: null }
        : { data: null, error: { message: 'not found' } }
    ),
  };

  const rateLimitChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockResolvedValue({
      count: options.rateLimitCount ?? 0,
      error: options.rateLimitError ?? null,
    }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  };

  const download = vi.fn(async (storagePath: string) => {
    const file = files[storagePath];
    if (!file) {
      return { data: null, error: { message: 'not found' } };
    }
    return { data: makeStorageBlob(file), error: null };
  });

  return {
    from: vi.fn((table: string) =>
      table === 'propuesta_rate_limits' ? rateLimitChain : proposalChain
    ),
    storage: {
      from: vi.fn().mockReturnValue({ download }),
    },
    _chain: proposalChain,
    _rateLimitChain: rateLimitChain,
    _download: download,
  };
}

function makeCompletedProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proposal-id',
    access_code: 'hashed-code',
    web_status: 'published',
    archivo_path: 'generadas/proposal-id.pdf',
    version: 2,
    snapshot_json: {
      licitacion: { numero: 'LIC 2026/1' },
      documents: [
        {
          id: 'doc-1',
          nombre: 'Certificado FNE',
          tipo: 'certificado_pertenencia',
          archivoPath: 'documentos/certificado.pdf',
        },
        {
          id: 'doc-2',
          nombre: 'Carta.pdf',
          tipo: 'carta_recomendacion',
          archivoPath: 'documentos/carta.pdf',
        },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: null, error: null });
});

describe('POST /api/propuestas/web/[slug]/download-zip', () => {
  it('includes the generated proposal PDF and supporting documents in the ZIP', async () => {
    mockVerifyAccessCode.mockResolvedValue(true);
    const serviceClient = makeMockServiceClient(makeCompletedProposal(), {
      'generadas/proposal-id.pdf': Buffer.from('proposal pdf'),
      'documentos/certificado.pdf': Buffer.from('certificado'),
      'documentos/carta.pdf': Buffer.from('carta'),
    });
    mockCreateServiceRoleClient.mockReturnValue(serviceClient as never);

    const req = mockReq('POST', { sessionCode: 'ABC123' });
    const res = mockRes();

    await zipHandler(req, res);

    expect(res._status).toBe(200);
    expect(res._headers.get('Content-Type')).toBe('application/zip');
    expect(res._headers.get('Content-Disposition')).toBe('attachment; filename="LIC_2026_1.zip"');

    const zip = await JSZip.loadAsync(res._body as Buffer);
    await expect(zip.file('LIC_2026_1/00-propuesta/propuesta-v2.pdf')!.async('string'))
      .resolves.toBe('proposal pdf');
    await expect(zip.file('LIC_2026_1/01-documentos-respaldo/01-certificados/Certificado_FNE.pdf')!.async('string'))
      .resolves.toBe('certificado');
    await expect(zip.file('LIC_2026_1/01-documentos-respaldo/02-cartas-recomendacion/Carta.pdf')!.async('string'))
      .resolves.toBe('carta');
  });

  it('rejects invalid access codes before downloading files', async () => {
    mockVerifyAccessCode.mockResolvedValue(false);
    const serviceClient = makeMockServiceClient(makeCompletedProposal(), {
      'generadas/proposal-id.pdf': Buffer.from('proposal pdf'),
    });
    mockCreateServiceRoleClient.mockReturnValue(serviceClient as never);

    const req = mockReq('POST', { sessionCode: 'BAD123' });
    const res = mockRes();

    await zipHandler(req, res);

    expect(res._status).toBe(401);
    expect(res._body).toEqual({ error: 'Codigo de sesion invalido', remaining: 4 });
    expect(serviceClient._rateLimitChain.insert).toHaveBeenCalledWith({
      ip_address: '127.0.0.1',
      slug: 'colegio-test-evoluciona-2026-v1',
    });
    expect(serviceClient._download).not.toHaveBeenCalled();
  });

  it('rate limits ZIP access-code attempts before bcrypt or storage work', async () => {
    const serviceClient = makeMockServiceClient(
      makeCompletedProposal(),
      { 'generadas/proposal-id.pdf': Buffer.from('proposal pdf') },
      { rateLimitCount: 5 }
    );
    mockCreateServiceRoleClient.mockReturnValue(serviceClient as never);

    const req = mockReq('POST', { sessionCode: 'BAD123' });
    const res = mockRes();

    await zipHandler(req, res);

    expect(res._status).toBe(429);
    expect(res._body).toEqual({
      error: 'Demasiados intentos. Intente nuevamente en una hora.',
      remaining: 0,
    });
    expect(mockVerifyAccessCode).not.toHaveBeenCalled();
    expect(serviceClient._rateLimitChain.insert).not.toHaveBeenCalled();
    expect(serviceClient._download).not.toHaveBeenCalled();
  });

  it('keeps the proposal PDF and adds a missing-file manifest when a supporting doc is unavailable', async () => {
    mockVerifyAccessCode.mockResolvedValue(true);
    const serviceClient = makeMockServiceClient(makeCompletedProposal(), {
      'generadas/proposal-id.pdf': Buffer.from('proposal pdf'),
      'documentos/carta.pdf': Buffer.from('carta'),
    });
    mockCreateServiceRoleClient.mockReturnValue(serviceClient as never);

    const req = mockReq('POST', { sessionCode: 'ABC123' });
    const res = mockRes();

    await zipHandler(req, res);

    expect(res._status).toBe(200);
    const zip = await JSZip.loadAsync(res._body as Buffer);
    await expect(zip.file('LIC_2026_1/00-propuesta/propuesta-v2.pdf')!.async('string'))
      .resolves.toBe('proposal pdf');
    await expect(zip.file('LIC_2026_1/_archivos_faltantes.txt')!.async('string'))
      .resolves.toContain('Certificado FNE');
  });

  it('fails when the required generated proposal PDF is missing from storage', async () => {
    mockVerifyAccessCode.mockResolvedValue(true);
    const serviceClient = makeMockServiceClient(makeCompletedProposal(), {
      'documentos/certificado.pdf': Buffer.from('certificado'),
      'documentos/carta.pdf': Buffer.from('carta'),
    });
    mockCreateServiceRoleClient.mockReturnValue(serviceClient as never);

    const req = mockReq('POST', { sessionCode: 'ABC123' });
    const res = mockRes();

    await zipHandler(req, res);

    expect(res._status).toBe(422);
    expect(res._body).toEqual({ error: 'No se pudo descargar el PDF de la propuesta' });
  });

  it('allows authenticated admin preview downloads when no session code is present', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: 'admin-user' } as never, error: null });
    const serviceClient = makeMockServiceClient(makeCompletedProposal(), {
      'generadas/proposal-id.pdf': Buffer.from('proposal pdf'),
      'documentos/certificado.pdf': Buffer.from('certificado'),
      'documentos/carta.pdf': Buffer.from('carta'),
    });
    mockCreateServiceRoleClient.mockReturnValue(serviceClient as never);

    const req = mockReq('POST', {});
    const res = mockRes();

    await zipHandler(req, res);

    expect(res._status).toBe(200);
    expect(mockVerifyAccessCode).not.toHaveBeenCalled();
    expect(mockCheckIsAdmin).toHaveBeenCalled();
    expect(serviceClient._rateLimitChain.gte).not.toHaveBeenCalled();
  });

  it('returns 410 for expired proposals', async () => {
    const serviceClient = makeMockServiceClient(
      makeCompletedProposal({ web_status: 'expired' }),
      { 'generadas/proposal-id.pdf': Buffer.from('proposal pdf') }
    );
    mockCreateServiceRoleClient.mockReturnValue(serviceClient as never);

    const req = mockReq('POST', { sessionCode: 'ABC123' });
    const res = mockRes();

    await zipHandler(req, res);

    expect(res._status).toBe(410);
    expect(res._body).toEqual({ error: 'Esta propuesta ha expirado' });
    expect(mockVerifyAccessCode).not.toHaveBeenCalled();
  });

  it('returns 422 and skips storage when the generated PDF path is unsafe', async () => {
    mockVerifyAccessCode.mockResolvedValue(true);
    const serviceClient = makeMockServiceClient(
      makeCompletedProposal({ archivo_path: '../bad.pdf' }),
      { '../bad.pdf': Buffer.from('proposal pdf') }
    );
    mockCreateServiceRoleClient.mockReturnValue(serviceClient as never);

    const req = mockReq('POST', { sessionCode: 'ABC123' });
    const res = mockRes();

    await zipHandler(req, res);

    expect(res._status).toBe(422);
    expect(res._body).toEqual({ error: 'La propuesta PDF no esta disponible' });
    expect(serviceClient._download).not.toHaveBeenCalled();
  });

  it('uniquifies duplicate supporting document filenames', async () => {
    mockVerifyAccessCode.mockResolvedValue(true);
    const serviceClient = makeMockServiceClient(
      makeCompletedProposal({
        snapshot_json: {
          licitacion: { numero: 'LIC 2026/1' },
          documents: [
            { id: 'doc-a', nombre: 'Documento', tipo: 'otro', archivoPath: 'documentos/a.pdf' },
            { id: 'doc-b', nombre: 'Documento', tipo: 'otro', archivoPath: 'documentos/b.pdf' },
          ],
        },
      }),
      {
        'generadas/proposal-id.pdf': Buffer.from('proposal pdf'),
        'documentos/a.pdf': Buffer.from('a'),
        'documentos/b.pdf': Buffer.from('b'),
      }
    );
    mockCreateServiceRoleClient.mockReturnValue(serviceClient as never);

    const req = mockReq('POST', { sessionCode: 'ABC123' });
    const res = mockRes();

    await zipHandler(req, res);

    expect(res._status).toBe(200);
    const zip = await JSZip.loadAsync(res._body as Buffer);
    await expect(zip.file('LIC_2026_1/01-documentos-respaldo/99-otros/Documento.pdf')!.async('string'))
      .resolves.toBe('a');
    await expect(zip.file('LIC_2026_1/01-documentos-respaldo/99-otros/Documento-2.pdf')!.async('string'))
      .resolves.toBe('b');
  });
});

describe('POST /api/propuestas/web/[slug]/download-doc', () => {
  it('records failed individual-document access-code attempts before signing URLs', async () => {
    mockVerifyAccessCode.mockResolvedValue(false);
    mockGetSignedUrl.mockResolvedValue('https://example.com/signed-doc.pdf');
    const serviceClient = makeMockServiceClient(makeCompletedProposal(), {});
    mockCreateServiceRoleClient.mockReturnValue(serviceClient as never);

    const req = mockReq('POST', { documentId: 'doc-1', sessionCode: 'BAD123' });
    const res = mockRes();

    await docHandler(req, res);

    expect(res._status).toBe(401);
    expect(res._body).toEqual({ error: 'Codigo de sesion invalido', remaining: 4 });
    expect(serviceClient._rateLimitChain.insert).toHaveBeenCalledWith({
      ip_address: '127.0.0.1',
      slug: 'colegio-test-evoluciona-2026-v1',
    });
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('rate limits individual-document access-code attempts before bcrypt or signing work', async () => {
    mockGetSignedUrl.mockResolvedValue('https://example.com/signed-doc.pdf');
    const serviceClient = makeMockServiceClient(
      makeCompletedProposal(),
      {},
      { rateLimitCount: 5 }
    );
    mockCreateServiceRoleClient.mockReturnValue(serviceClient as never);

    const req = mockReq('POST', { documentId: 'doc-1', sessionCode: 'BAD123' });
    const res = mockRes();

    await docHandler(req, res);

    expect(res._status).toBe(429);
    expect(res._body).toEqual({
      error: 'Demasiados intentos. Intente nuevamente en una hora.',
      remaining: 0,
    });
    expect(mockVerifyAccessCode).not.toHaveBeenCalled();
    expect(serviceClient._rateLimitChain.insert).not.toHaveBeenCalled();
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('allows authenticated admin preview downloads when no session code is present', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: 'admin-user' } as never, error: null });
    mockGetSignedUrl.mockResolvedValue('https://example.com/signed-doc.pdf');
    const serviceClient = makeMockServiceClient(makeCompletedProposal(), {});
    mockCreateServiceRoleClient.mockReturnValue(serviceClient as never);

    const req = mockReq('POST', { documentId: 'doc-1' });
    const res = mockRes();

    await docHandler(req, res);

    expect(res._status).toBe(200);
    expect(res._body).toEqual({
      data: {
        url: 'https://example.com/signed-doc.pdf',
        filename: 'Certificado FNE',
      },
    });
    expect(mockVerifyAccessCode).not.toHaveBeenCalled();
    expect(mockCheckIsAdmin).toHaveBeenCalled();
    expect(serviceClient._rateLimitChain.gte).not.toHaveBeenCalled();
    expect(mockGetSignedUrl).toHaveBeenCalledWith('documentos/certificado.pdf');
  });
});
