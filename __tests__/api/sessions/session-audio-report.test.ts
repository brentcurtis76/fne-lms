// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// Hoisted mock functions
const {
  mockGetApiUser,
  mockCreateServiceRoleClient,
  mockGetUserRoles,
  mockGetHighestRole,
  mockTranscribeAudio,
  mockGenerateReportSummary,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockGetUserRoles: vi.fn(),
  mockGetHighestRole: vi.fn(),
  mockTranscribeAudio: vi.fn(),
  mockGenerateReportSummary: vi.fn(),
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
  getHighestRole: mockGetHighestRole,
}));

vi.mock('../../../lib/services/audio-transcription', () => ({
  transcribeAudio: mockTranscribeAudio,
  generateReportSummary: mockGenerateReportSummary,
}));

// Mock formidable
vi.mock('formidable', () => {
  return {
    default: vi.fn(() => ({
      parse: vi.fn((_req: unknown, callback: (err: unknown, fields: Record<string, unknown>, files: Record<string, unknown>) => void) => {
        callback(null, { visibility: ['facilitators_only'] }, {
          audio: [{
            filepath: '/tmp/test-audio.mp3',
            originalFilename: 'test-audio.mp3',
            mimetype: 'audio/mpeg',
            size: 1024 * 1024, // 1 MB
          }],
        });
      }),
    })),
  };
});

// Mock fs
vi.mock('fs', () => ({
  readFileSync: vi.fn(() => Buffer.from('fake audio data')),
}));

// Mock crypto
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'mock-uuid-1234'),
}));

// Import handler AFTER mocks
import handler from '../../../pages/api/sessions/[id]/audio-report';

// Valid UUIDs for test data
const CONSULTOR_ID = '22222222-2222-4222-8222-222222222222';
const DOCENTE_ID = '33333333-3333-4333-8333-333333333333';
const SESSION_ID = '44444444-4444-4444-8444-444444444444';

/**
 * Build a chainable Supabase mock that properly handles .single()
 * When .single() is called, the resolved data is data[0] || null instead of the array
 */
function buildChainableQuery(data: unknown[] | null = [], error: unknown = null) {
  let useSingle = false;

  const getResult = () => {
    if (useSingle) {
      return { data: data && data.length > 0 ? data[0] : null, error };
    }
    return { data, error };
  };

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (value: unknown) => void) => resolve(getResult());
      }
      if (prop === 'single') {
        return vi.fn(() => {
          useSingle = true;
          return new Proxy({}, handler);
        });
      }
      if (prop === 'maybeSingle') {
        return vi.fn(() => {
          useSingle = true;
          return new Proxy({}, handler);
        });
      }
      // All other chainable methods return the proxy
      return vi.fn(() => new Proxy({}, handler));
    },
  };

  return new Proxy({}, handler);
}

function createMockStorageClient() {
  return {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({
        data: { path: `sessions/${SESSION_ID}/mock-uuid-1234_test-audio.mp3` },
        error: null,
      }),
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://storage.example.com/signed-url' },
        error: null,
      }),
      remove: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  };
}

interface SessionData {
  id: string;
  status: string;
  title: string;
  session_date: string;
  objectives: string;
  schools: { name: string };
  growth_communities: { name: string };
}

const DEFAULT_SESSION: SessionData = {
  id: SESSION_ID,
  status: 'programada',
  title: 'Test Session',
  session_date: '2026-02-15',
  objectives: 'Test objectives',
  schools: { name: 'Test School' },
  growth_communities: { name: 'Test GC' },
};

function createMockSupabaseClient(options: {
  session?: SessionData | null;
  sessionError?: unknown;
  facilitator?: boolean;
  existingReport?: boolean;
  insertResult?: { data: unknown; error: unknown };
  activityLogInsert?: ReturnType<typeof vi.fn>;
} = {}) {
  const {
    session = DEFAULT_SESSION,
    sessionError = null,
    facilitator = true,
    existingReport = false,
    insertResult = {
      data: {
        id: 'new-report-id',
        session_id: SESSION_ID,
        author_id: CONSULTOR_ID,
        content: 'Resumen generado por IA',
        audio_url: `storage://session-audio/sessions/${SESSION_ID}/mock-uuid-1234_test-audio.mp3`,
        transcript: 'Esta es una transcripción de prueba.',
        visibility: 'facilitators_only',
        report_type: 'session_report',
      },
      error: null,
    },
    activityLogInsert,
  } = options;

  const fromMock = vi.fn((table: string) => {
    if (table === 'consultor_sessions') {
      const sessionData = session ? [session] : null;
      return buildChainableQuery(sessionData, sessionError);
    }

    if (table === 'session_facilitators') {
      if (facilitator) {
        return buildChainableQuery([{ id: '1', user_id: CONSULTOR_ID, session_id: SESSION_ID }]);
      }
      return buildChainableQuery(null);
    }

    if (table === 'session_reports') {
      // This table is called twice: once for uniqueness check (.single()), once for insert
      // We use a call counter to differentiate
      const reportCallState = { callCount: 0 };

      const reportHandler: ProxyHandler<Record<string, unknown>> = {
        get(_target, prop) {
          if (prop === 'then') {
            // Uniqueness check result
            if (existingReport) {
              return (resolve: (v: unknown) => void) =>
                resolve({ data: { id: 'existing-id' }, error: null });
            }
            return (resolve: (v: unknown) => void) =>
              resolve({ data: null, error: null });
          }
          if (prop === 'insert') {
            return vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue(insertResult),
              })),
            }));
          }
          if (prop === 'select' || prop === 'eq' || prop === 'single' || prop === 'maybeSingle') {
            return vi.fn(() => new Proxy({}, reportHandler));
          }
          return vi.fn(() => new Proxy({}, reportHandler));
        },
      };

      return new Proxy({}, reportHandler);
    }

    if (table === 'session_activity_log') {
      if (activityLogInsert) {
        return { insert: activityLogInsert };
      }
      return {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }

    return buildChainableQuery([]);
  });

  return {
    from: fromMock,
    storage: createMockStorageClient(),
  };
}

describe('/api/sessions/[id]/audio-report', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockTranscribeAudio.mockResolvedValue('Esta es una transcripción de prueba.');
    mockGenerateReportSummary.mockResolvedValue({
      summary: 'Resumen generado por IA',
      keyPoints: ['Punto clave 1', 'Punto clave 2'],
      actionItems: ['Acción 1'],
    });
  });

  it('should return 401 if user is not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No autenticado' });

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: SESSION_ID },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    const jsonData = JSON.parse(res._getData());
    expect(jsonData.error).toContain('Autenticación requerida');
  });

  it('should return 400 if session ID is invalid', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      query: { id: 'invalid-uuid' },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const jsonData = JSON.parse(res._getData());
    expect(jsonData.error).toContain('ID de sesión inválido');
  });

  it('should return 405 for non-POST methods', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { id: SESSION_ID },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  it('should return 404 if session is not found', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: CONSULTOR_ID },
      error: null,
    });

    const mockClient = createMockSupabaseClient({
      session: null,
      sessionError: { message: 'Not found' },
    });
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: SESSION_ID },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  it('should return 403 if session status is completada', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: CONSULTOR_ID },
      error: null,
    });

    const mockClient = createMockSupabaseClient({
      session: { ...DEFAULT_SESSION, status: 'completada' },
    });
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: SESSION_ID },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const jsonData = JSON.parse(res._getData());
    expect(jsonData.error).toContain('completadas o canceladas');
  });

  it('should return 403 if session status is cancelada', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: CONSULTOR_ID },
      error: null,
    });

    const mockClient = createMockSupabaseClient({
      session: { ...DEFAULT_SESSION, status: 'cancelada' },
    });
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: SESSION_ID },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });

  it('should return 403 if user is not a facilitator', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: DOCENTE_ID },
      error: null,
    });

    mockGetUserRoles.mockResolvedValue([{ role_type: 'docente' }]);
    mockGetHighestRole.mockReturnValue('docente');

    const mockClient = createMockSupabaseClient({ facilitator: false });
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: SESSION_ID },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const jsonData = JSON.parse(res._getData());
    expect(jsonData.error).toContain('Solo facilitadores');
  });

  it('should return 400 if report already exists for this author', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: CONSULTOR_ID },
      error: null,
    });

    mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor', school_id: 1 }]);
    mockGetHighestRole.mockReturnValue('consultor');

    const mockClient = createMockSupabaseClient({ existingReport: true });
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: SESSION_ID },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const jsonData = JSON.parse(res._getData());
    expect(jsonData.error).toContain('Ya existe un informe');
  });

  it('should successfully create audio report for facilitator', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: CONSULTOR_ID },
      error: null,
    });

    mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor', school_id: 1 }]);
    mockGetHighestRole.mockReturnValue('consultor');

    const mockClient = createMockSupabaseClient();
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: SESSION_ID },
      headers: { 'content-type': 'multipart/form-data' },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    const jsonData = JSON.parse(res._getData());
    expect(jsonData.data.report).toBeDefined();
    expect(jsonData.data.transcript).toBe('Esta es una transcripción de prueba.');
    expect(jsonData.data.summary.keyPoints).toHaveLength(2);
    expect(jsonData.data.audio_url).toContain('signed-url');

    expect(mockTranscribeAudio).toHaveBeenCalled();
    expect(mockGenerateReportSummary).toHaveBeenCalledWith(
      'Esta es una transcripción de prueba.',
      expect.objectContaining({
        title: 'Test Session',
        school: 'Test School',
      })
    );
  });

  it('should create activity log entry with source: audio', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: CONSULTOR_ID },
      error: null,
    });

    mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor', school_id: 1 }]);
    mockGetHighestRole.mockReturnValue('consultor');

    const activityLogInsertMock = vi.fn().mockResolvedValue({ data: null, error: null });

    const mockClient = createMockSupabaseClient({ activityLogInsert: activityLogInsertMock });
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: SESSION_ID },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(activityLogInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: SESSION_ID,
        user_id: CONSULTOR_ID,
        action: 'report_filed',
        details: expect.objectContaining({
          source: 'audio',
        }),
      })
    );
  });
});
