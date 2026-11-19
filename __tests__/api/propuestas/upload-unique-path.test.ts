// @vitest-environment node
/**
 * LIC-E1: an upload to the proposals' library never replaces another file.
 * Two uploads with the same name in the same folder get two different stored
 * paths, and the storage call never uses upsert.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockGetApiUser, mockCreateServiceRoleClient, mockGetUserRoles, mockUpload } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockGetUserRoles: vi.fn(),
  mockUpload: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getApiUser: mockGetApiUser,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

vi.mock('../../../utils/roleUtils', () => ({
  getUserRoles: mockGetUserRoles,
}));

vi.mock('formidable', () => ({
  default: vi.fn(() => ({
    parse: vi.fn(
      (
        _req: unknown,
        callback: (err: unknown, fields: Record<string, unknown>, files: Record<string, unknown>) => void,
      ) => {
        callback(null, { subfolder: ['documentos/certificado_pertenencia'] }, {
          file: [{
            filepath: '/nonexistent/fake-upload.pdf',
            originalFilename: 'certificado.pdf',
            mimetype: 'application/pdf',
            size: 1024,
          }],
        });
      },
    ),
  })),
}));

vi.mock('file-type', () => ({
  fromFile: vi.fn(async () => ({ mime: 'application/pdf', ext: 'pdf' })),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    readFileSync: vi.fn(() => Buffer.from('%PDF-1.4 fake')),
  };
});

import handler from '../../../pages/api/propuestas/upload';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

async function upload() {
  const { req, res } = createMocks({ method: 'POST' });
  await handler(req as any, res as any);
  return res;
}

describe('POST /api/propuestas/upload — LIC-E1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_ID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockUpload.mockResolvedValue({ data: {}, error: null });
    mockCreateServiceRoleClient.mockReturnValue({
      storage: { from: vi.fn(() => ({ upload: mockUpload })) },
    });
  });

  it('two uploads of the same name and folder get two different paths, never upsert', async () => {
    const first = await upload();
    const second = await upload();

    expect(first._getStatusCode()).toBe(201);
    expect(second._getStatusCode()).toBe(201);

    const firstPath = JSON.parse(first._getData()).data.path as string;
    const secondPath = JSON.parse(second._getData()).data.path as string;

    expect(firstPath).not.toBe(secondPath);
    for (const p of [firstPath, secondPath]) {
      expect(p.startsWith('documentos/certificado_pertenencia/')).toBe(true);
      expect(p.endsWith('_certificado.pdf')).toBe(true);
    }

    expect(mockUpload).toHaveBeenCalledTimes(2);
    const storedPaths = mockUpload.mock.calls.map((c) => c[0]);
    expect(storedPaths).toEqual([firstPath, secondPath]);
    for (const call of mockUpload.mock.calls) {
      expect(call[2]?.upsert).not.toBe(true);
      expect(call[2]?.upsert).toBe(false);
    }
  });
});
