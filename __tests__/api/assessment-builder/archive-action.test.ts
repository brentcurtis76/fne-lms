// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';

const { mockGetApiUser, mockCreateApiSupabaseClient, mockHasWritePerm } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockHasWritePerm: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  sendAuthError: vi.fn((res: NextApiResponse, msg?: string) => {
    res.status(401).json({ error: msg || 'Authentication required' });
  }),
}));

vi.mock('../../../lib/assessment-permissions', () => ({
  hasAssessmentWritePermission: mockHasWritePerm,
}));

import archiveHandler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/archive';

// Synthetic fixtures only.
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const DOCENTE_ID = '33333333-3333-4333-8333-333333333333';
const TEMPLATE_ID = '22222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown>;
interface RecordedQuery {
  table: string;
  select?: string;
  update?: Row;
  eqs: Array<[string, unknown]>;
}
interface QueryMock {
  select: (cols: string) => QueryMock;
  update: (payload: Row) => QueryMock;
  eq: (col: string, val: unknown) => QueryMock;
  single: () => Promise<{ data: Row | null; error: Error | null }>;
  then: (resolve: (value: { error: Error | null }) => unknown) => unknown;
}

/** Lightweight Supabase client mock that records every query issued by the handler. */
function mockClient(
  template: Row | null,
  outcomes: { lookupError?: Error; updateError?: Error; throwOnLookup?: Error } = {},
) {
  const queries: RecordedQuery[] = [];
  const from = vi.fn((table: string) => {
    const recorded: RecordedQuery = { table, eqs: [] };
    queries.push(recorded);
    const query: QueryMock = {
      select: (cols) => {
        recorded.select = cols;
        return query;
      },
      update: (payload) => {
        recorded.update = payload;
        return query;
      },
      eq: (col, val) => {
        recorded.eqs.push([col, val]);
        return query;
      },
      single: async () => {
        if (outcomes.throwOnLookup) throw outcomes.throwOnLookup;
        return { data: template, error: outcomes.lookupError ?? null };
      },
      then: (resolve) => resolve({ error: outcomes.updateError ?? null }),
    };
    return query;
  });
  mockCreateApiSupabaseClient.mockResolvedValue({ from });
  return { from, queries };
}

async function callHandler(query: Record<string, unknown>, method = 'POST') {
  const { req, res } = createMocks({ method, query });
  await archiveHandler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return res;
}

const PUBLISHED = { id: TEMPLATE_ID, name: 'Plantilla sintética', status: 'published', is_archived: false };
const ARCHIVED = { ...PUBLISHED, is_archived: true };

describe('POST /api/.../templates/[id]/archive — action query validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_ID }, error: null });
    mockHasWritePerm.mockResolvedValue(true);
  });

  const INVALID_ACTIONS: Array<{ label: string; action: string | string[] }> = [
    { label: 'unknown value', action: 'restroe' },
    { label: 'empty string', action: '' },
    { label: 'whitespace only', action: '   ' },
    { label: 'padded restore', action: ' restore ' },
    { label: 'upper-case restore', action: 'RESTORE' },
    { label: 'capitalized archive', action: 'Archive' },
    { label: 'one-element restore array', action: ['restore'] },
    { label: 'one-element archive array', action: ['archive'] },
    { label: 'multi-element array', action: ['restore', 'archive'] },
    { label: 'empty array', action: [] },
  ];

  it.each(INVALID_ACTIONS)('rejects $label with 400 before any template read or write', async ({ action }) => {
    const { from } = mockClient(PUBLISHED);

    const res = await callHandler({ templateId: TEMPLATE_ID, action });

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toMatch(/acción no válida/i);
    expect(from).not.toHaveBeenCalled();
  });

  it('still requires authentication for an invalid action', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });
    const { from } = mockClient(PUBLISHED);

    const res = await callHandler({ templateId: TEMPLATE_ID, action: 'restroe' });

    expect(res._getStatusCode()).toBe(401);
    expect(mockHasWritePerm).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('still returns 403 for a user without write permission and an invalid action', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_ID }, error: null });
    mockHasWritePerm.mockResolvedValue(false);
    const { from } = mockClient(PUBLISHED);

    const res = await callHandler({ templateId: TEMPLATE_ID, action: ['restore'] });

    expect(res._getStatusCode()).toBe(403);
    expect(mockHasWritePerm).toHaveBeenCalledWith(expect.anything(), DOCENTE_ID);
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'omitted action (admin UI archive call)', query: { templateId: TEMPLATE_ID } },
    { label: 'explicit action=archive', query: { templateId: TEMPLATE_ID, action: 'archive' } },
  ])('archives a published template for $label', async ({ query }) => {
    const { queries } = mockClient(PUBLISHED);
    const before = Date.now();

    const res = await callHandler(query);
    const after = Date.now();

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      success: true,
      message: 'Template archivado correctamente',
      template: { id: TEMPLATE_ID, name: PUBLISHED.name, is_archived: true },
    });

    expect(queries).toHaveLength(2);
    expect(queries[0]).toEqual({
      table: 'assessment_templates',
      select: 'id, name, status, is_archived',
      eqs: [['id', TEMPLATE_ID]],
    });
    expect(queries[1].table).toBe('assessment_templates');
    expect(queries[1].eqs).toEqual([['id', TEMPLATE_ID]]);
    expect(queries[1].select).toBeUndefined();

    const update = queries[1].update as Row;
    expect(update).toEqual({ is_archived: true, archived_at: expect.any(String), archived_by: ADMIN_ID });
    const archivedAt = update.archived_at as string;
    expect(new Date(archivedAt).toISOString()).toBe(archivedAt);
    expect(Date.parse(archivedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(archivedAt)).toBeLessThanOrEqual(after);
  });

  it('restores an archived published template for action=restore (admin UI restore call)', async () => {
    const { queries } = mockClient(ARCHIVED);

    const res = await callHandler({ templateId: TEMPLATE_ID, action: 'restore' });

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      success: true,
      message: 'Template restaurado correctamente',
      template: { id: TEMPLATE_ID, name: ARCHIVED.name, is_archived: false },
    });

    expect(queries).toHaveLength(2);
    expect(queries[0].select).toBe('id, name, status, is_archived');
    expect(queries[0].update).toBeUndefined();
    expect(queries[1]).toEqual({
      table: 'assessment_templates',
      update: { is_archived: false, archived_at: null, archived_by: null },
      eqs: [['id', TEMPLATE_ID]],
    });
  });

  it.each([
    { label: 'lookup error', template: PUBLISHED, lookupError: new Error('synthetic lookup failure') },
    { label: 'missing row', template: null, lookupError: undefined },
  ])('returns 404 without updating for $label', async ({ template, lookupError }) => {
    const { queries } = mockClient(template, { lookupError });

    const res = await callHandler({ templateId: TEMPLATE_ID });

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({ error: 'Template no encontrado' });
    expect(queries).toEqual([{
      table: 'assessment_templates',
      select: 'id, name, status, is_archived',
      eqs: [['id', TEMPLATE_ID]],
    }]);
  });

  it.each([
    { label: 'archive', action: 'archive', template: PUBLISHED, message: 'Error al archivar el template' },
    { label: 'restore', action: 'restore', template: ARCHIVED, message: 'Error al restaurar el template' },
  ])('returns 500 without a second update when $label update fails', async ({ action, template, message }) => {
    const error = new Error('synthetic update failure');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { queries } = mockClient(template, { updateError: error });

    try {
      const res = await callHandler({ templateId: TEMPLATE_ID, action });

      expect(res._getStatusCode()).toBe(500);
      expect(res._getJSONData()).toEqual({ error: message });
      expect(queries).toHaveLength(2);
      expect(queries[1].update).toBeDefined();
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('Error'), error);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('returns a fixed Spanish 500 without the exception text or an update when the lookup throws', async () => {
    const marker = 'SYNTHETIC_TEST_ONLY_MARKER_9d41';
    const error = new Error(`synthetic query exception ${marker}`);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { queries } = mockClient(PUBLISHED, { throwOnLookup: error });

    try {
      const res = await callHandler({ templateId: TEMPLATE_ID });

      expect(res._getStatusCode()).toBe(500);
      expect(res._getJSONData()).toEqual({ error: 'Error interno del servidor' });
      expect(res._getData()).not.toContain(marker);
      expect(res._getData()).not.toContain('synthetic query exception');
      expect(queries).toHaveLength(1);
      expect(queries[0].update).toBeUndefined();
      expect(consoleError).toHaveBeenCalledWith('Unexpected error:', error);
    } finally {
      consoleError.mockRestore();
    }
  });

  it.each(['GET', 'PUT', 'DELETE'])('rejects %s with a Spanish 405 before authentication or template access', async (method) => {
    const { from } = mockClient(PUBLISHED);

    const res = await callHandler({ templateId: TEMPLATE_ID }, method);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({ error: 'Método no permitido' });
    expect(res.getHeader('Allow')).toBe('POST');
    expect(mockGetApiUser).not.toHaveBeenCalled();
    expect(mockHasWritePerm).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'missing ID', templateId: undefined },
    { label: 'empty ID', templateId: '' },
    { label: 'array ID', templateId: [TEMPLATE_ID] },
  ])('rejects $label before template access', async ({ templateId }) => {
    const { from } = mockClient(PUBLISHED);

    const res = await callHandler({ templateId });

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'templateId es requerido' });
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'already archived', template: ARCHIVED, message: 'El template ya está archivado' },
    {
      label: 'draft',
      template: { ...PUBLISHED, status: 'draft' },
      message: 'Los templates en borrador deben ser eliminados, no archivados',
    },
  ])('refuses to archive an $label template without a write', async ({ template, message }) => {
    const { queries } = mockClient(template);

    const res = await callHandler({ templateId: TEMPLATE_ID });

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: message });
    expect(queries).toHaveLength(1);
    expect(queries[0].update).toBeUndefined();
  });
});
