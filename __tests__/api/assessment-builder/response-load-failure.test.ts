// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { buildChainableQuery } from './_helpers';
const { auth, client } = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ getApiUser: auth, createApiSupabaseClient: client,
  sendAuthError: vi.fn(), handleMethodNotAllowed: vi.fn() }));
import handler from '@/pages/api/docente/assessments/[instanceId]';

beforeEach(() => vi.clearAllMocks());
describe('assessment response loading', () => {
  it('returns an error rather than an empty editable assessment when the responses query fails', async () => {
    auth.mockResolvedValue({ user: { id: 'synthetic-adult' } });
    client.mockResolvedValue({ from: (table: string) => {
      if (table === 'assessment_instance_assignees') return buildChainableQuery({ id: 'assignee' });
      if (table === 'assessment_instances') return buildChainableQuery({ id: 'instance', status: 'in_progress' });
      if (table === 'assessment_responses') return buildChainableQuery(null, { message: 'Synthetic query failure' });
      throw new Error(`Unexpected table ${table}`);
    } });
    const { req, res } = createMocks({ method: 'GET', query: { instanceId: 'instance' } });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'No se pudieron recuperar las respuestas guardadas. Intenta nuevamente.' });
    expect(res._getJSONData()).not.toHaveProperty('responses');
  });
});
