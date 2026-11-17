// @vitest-environment node
/**
 * GC-1: «Duplicar» and «Editar (Nueva Versión)» inside the template editor.
 *
 * The editor used to POST to the duplicate route with no body, and the route
 * (which requires a name) answered 400 «El nombre es requerido» every time.
 * These tests drive the real duplicate route with the body the editor sends
 * now (built by the editor's own `buildEditorDuplicateBody`) and with the body
 * it used to send. Synthetic ids only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { ADMIN_UUID, TEMPLATE_PUBLISHED, buildChainableQuery } from './_helpers';

const { mockGetApiUser, mockCreateApiSupabaseClient, mockHasWritePerm } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockHasWritePerm: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  sendAuthError: vi.fn((res: any, msg?: string) => {
    res.status(401).json({ error: msg || 'Authentication required' });
  }),
  handleMethodNotAllowed: vi.fn((res: any) => {
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

vi.mock('../../../lib/assessment-permissions', () => ({
  hasAssessmentReadPermission: vi.fn().mockResolvedValue(true),
  hasAssessmentWritePermission: mockHasWritePerm,
}));

// The editor page pulls in its layout; only its pure body builder is used here.
vi.mock('../../../components/layout/MainLayout', () => ({ default: () => null }));
vi.mock('../../../components/layout/FunctionalPageHeader', () => ({ ResponsiveFunctionalPageHeader: () => null }));

import handler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/duplicate';
import { buildEditorDuplicateBody } from '../../../pages/admin/assessment-builder/[templateId]/index';

const NEW_ID = 'ab000002-0000-0000-0000-0000000000f1';

function sourceTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: TEMPLATE_PUBLISHED,
    name: 'Instrumento Sintético',
    description: null,
    area: 'evaluacion',
    grade_id: 9,
    status: 'published',
    is_archived: false,
    version: '1.1.0',
    scoring_config: {},
    ...overrides,
  };
}

/** Records every insert payload; the source template is returned for selects. */
function clientFor(source: Record<string, any>) {
  const inserts: Array<{ table: string; payload: any }> = [];
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'ab_via_assignment_rules') {
        return buildChainableQuery([
          { area: 'evaluacion', target: 'course_docente' },
          { area: 'liderazgo', target: 'school_responsible' },
        ]);
      }
      if (table === 'assessment_templates') {
        const q: any = buildChainableQuery(source);
        return new Proxy(q, {
          get(t, prop) {
            if (prop === 'insert') {
              return (payload: any) => {
                inserts.push({ table, payload });
                return buildChainableQuery({ ...payload, id: NEW_ID, grade: null });
              };
            }
            if (prop === 'select') {
              // version scan (.select('id, version, name')...range) and source read (.select('*').single())
              return (cols?: string) =>
                cols === 'id, version, name' ? buildChainableQuery([source]) : buildChainableQuery(source);
            }
            return (t as any)[prop];
          },
        });
      }
      return buildChainableQuery([], null, 0);
    }),
  };
  return { client, inserts };
}

function adminSession(client: unknown) {
  mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
  mockCreateApiSupabaseClient.mockResolvedValue(client);
  mockHasWritePerm.mockResolvedValue(true);
}

async function post(body: unknown) {
  const { req, res } = createMocks({ method: 'POST', query: { templateId: TEMPLATE_PUBLISHED }, body: body as any });
  await handler(req as any, res as any);
  return res;
}

describe('GC-1 editor duplicate body', () => {
  it('«Duplicar» sends «<name> (copia)» and the instrument\'s own grade', () => {
    expect(buildEditorDuplicateBody({ name: 'Instrumento Sintético', grade_id: 9, is_archived: false })).toEqual({
      name: 'Instrumento Sintético (copia)',
      grade_id: 9,
    });
  });

  it('«Editar (Nueva Versión)» on an archived instrument keeps its name and grade', () => {
    expect(buildEditorDuplicateBody({ name: 'Instrumento Sintético', grade_id: 9, is_archived: true })).toEqual({
      name: 'Instrumento Sintético',
      grade_id: 9,
    });
  });

  it('a school-level instrument (no grade) sends grade_id null; names are trimmed', () => {
    expect(buildEditorDuplicateBody({ name: '  Liderazgo Sintético  ', grade_id: null, is_archived: true })).toEqual({
      name: 'Liderazgo Sintético',
      grade_id: null,
    });
    expect(buildEditorDuplicateBody({ name: 'Liderazgo Sintético ', grade_id: undefined, is_archived: false })).toEqual({
      name: 'Liderazgo Sintético (copia)',
      grade_id: null,
    });
  });
});

describe('GC-1 duplicate route with the editor\'s bodies', () => {
  beforeEach(() => vi.clearAllMocks());

  it('the body the editor used to send (none) is refused with 400 «El nombre es requerido»', async () => {
    const { client, inserts } = clientFor(sourceTemplate());
    adminSession(client);
    const res = await post(undefined);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe('El nombre es requerido');
    expect(inserts).toHaveLength(0);
  });

  it('an empty name is still refused', async () => {
    const { client } = clientFor(sourceTemplate());
    adminSession(client);
    const res = await post({ name: '   ', grade_id: 9 });
    expect(res._getStatusCode()).toBe(400);
  });

  it('«Duplicar» from the editor creates the copy', async () => {
    const source = sourceTemplate();
    const { client, inserts } = clientFor(source);
    adminSession(client);
    const res = await post(buildEditorDuplicateBody(source));
    expect(res._getStatusCode()).toBe(201);
    const created = inserts.find((i) => i.table === 'assessment_templates')!.payload;
    expect(created).toMatchObject({ name: 'Instrumento Sintético (copia)', grade_id: 9, area: 'evaluacion', status: 'draft' });
  });

  it('«Editar (Nueva Versión)» on an archived instrument creates the next version under the same name', async () => {
    const source = sourceTemplate({ is_archived: true });
    const { client, inserts } = clientFor(source);
    adminSession(client);
    const res = await post(buildEditorDuplicateBody(source));
    expect(res._getStatusCode()).toBe(201);
    const created = inserts.find((i) => i.table === 'assessment_templates')!.payload;
    expect(created).toMatchObject({ name: 'Instrumento Sintético', grade_id: 9, status: 'draft', version: '1.1.1' });
  });

  it('a school-level archived instrument gets its next version in its own (name) scope', async () => {
    const source = sourceTemplate({ area: 'liderazgo', grade_id: null, is_archived: true, name: 'Liderazgo Sintético' });
    const { client, inserts } = clientFor(source);
    adminSession(client);
    const res = await post(buildEditorDuplicateBody(source));
    expect(res._getStatusCode()).toBe(201);
    const created = inserts.find((i) => i.table === 'assessment_templates')!.payload;
    expect(created).toMatchObject({ name: 'Liderazgo Sintético', grade_id: null, version: '1.1.1' });
  });
});
