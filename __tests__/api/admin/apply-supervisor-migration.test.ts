// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { mockCheckIsAdmin } = vi.hoisted(() => ({ mockCheckIsAdmin: vi.fn() }));

vi.mock('../../../lib/api-auth', () => ({ checkIsAdmin: mockCheckIsAdmin }));

import handler from '../../../pages/api/admin/apply-supervisor-migration';

async function invoke(method = 'POST') {
  const { req, res } = createMocks({ method });
  await handler(req as never, res as never);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckIsAdmin.mockResolvedValue({
    isAdmin: true,
    user: { id: '12121212-1212-4212-8212-121212121212' },
    error: null,
  });
});

describe('/api/admin/apply-supervisor-migration retirement', () => {
  it('rejects non-POST methods before authentication', async () => {
    const response = await invoke('GET');
    expect(response._getStatusCode()).toBe(405);
    expect(mockCheckIsAdmin).not.toHaveBeenCalled();
  });

  it('retains the authentication boundary', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: null, error: null });
    const response = await invoke();
    expect(response._getStatusCode()).toBe(401);
  });

  it('retains the admin role boundary', async () => {
    mockCheckIsAdmin.mockResolvedValue({
      isAdmin: false,
      user: { id: 'not-admin' },
      error: null,
    });
    const response = await invoke();
    expect(response._getStatusCode()).toBe(403);
  });

  it('returns a deterministic non-mutating response to an admin', async () => {
    const response = await invoke();
    expect(response._getStatusCode()).toBe(410);
    expect(response._getJSONData()).toEqual({
      error: 'Endpoint retirado',
      message: 'Los cambios de esquema se aplican únicamente mediante migraciones revisadas.',
    });
  });

  it('contains no service client, RPC call, arbitrary SQL, or schema mutation', () => {
    const source = readFileSync(
      join(process.cwd(), 'pages/api/admin/apply-supervisor-migration.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/createServiceRoleClient|\.rpc\s*\(|exec_sql/i);
    expect(source).not.toMatch(/\b(?:CREATE|ALTER|DROP|TRUNCATE)\b/);
  });
});
