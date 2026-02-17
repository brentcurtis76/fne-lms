// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// Hoisted mock functions
const {
  mockCheckIsAdmin,
  mockCreateServiceRoleClient,
} = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdmin: mockCheckIsAdmin,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

// Mock NotificationService to avoid side effects
vi.mock('../../../lib/notificationService', () => ({
  default: { triggerNotification: vi.fn() },
}));

import handler from '../../../pages/api/admin/consultant-assignments';

// Test UUIDs
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CONSULTANT_ID = '22222222-2222-4222-8222-222222222222';
const STUDENT_Y = '33333333-3333-4333-8333-333333333333';
const STUDENT_Z = '44444444-4444-4444-8444-444444444444';
const ASSIGNMENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ASSIGNMENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SCHOOL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const GENERATION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const COMMUNITY_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

/**
 * Build a chainable Supabase query mock that resolves to the given result.
 * Supports single() and maybeSingle() terminal methods explicitly.
 */
function buildTerminalQuery(data: unknown, error: unknown = null) {
  const chainHandler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve({ data, error });
      }
      // All chainable methods return the same proxy
      return vi.fn(() => new Proxy({}, chainHandler));
    },
  };
  return new Proxy({}, chainHandler);
}

/**
 * Build a mock Supabase client where consultant_assignments queries
 * return results in sequence (call order), and profiles always succeeds.
 */
function buildSequencedClient(
  assignmentResults: Array<{ data: unknown; error?: unknown }>,
  options?: { updateCapture?: { ref: { updateData: unknown } } }
) {
  let assignmentCallIndex = 0;

  return {
    from: vi.fn((table: string) => {
      if (table === 'consultant_assignments') {
        const resultIndex = assignmentCallIndex++;
        const result = assignmentResults[resultIndex] || { data: null, error: null };

        // Build a proxy that captures .update() argument when needed
        const chainHandler: ProxyHandler<Record<string, unknown>> = {
          get(_target, prop) {
            if (prop === 'then') {
              return (resolve: (v: unknown) => void) =>
                resolve({ data: result.data, error: result.error || null });
            }
            if (prop === 'update' && options?.updateCapture) {
              return vi.fn((updateArg: unknown) => {
                options.updateCapture!.ref.updateData = updateArg;
                return new Proxy({}, chainHandler);
              });
            }
            return vi.fn(() => new Proxy({}, chainHandler));
          },
        };
        return new Proxy({}, chainHandler);
      }
      if (table === 'profiles') {
        // Profiles validation always succeeds
        return buildTerminalQuery({ id: 'valid-profile' });
      }
      return buildTerminalQuery(null);
    }),
  };
}

function setupAdminAuth() {
  mockCheckIsAdmin.mockResolvedValueOnce({
    isAdmin: true,
    user: { id: ADMIN_ID },
    error: null,
  });
}

describe('PUT /api/admin/consultant-assignments — scope transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Test 1: Scope transition individual → school nulls student_id ───
  it('should null student_id when transitioning from individual to school scope', async () => {
    setupAdminAuth();

    const captureRef = { updateData: null as unknown };
    const mockClient = buildSequencedClient(
      [
        // Query 1: fetch existing assignment (individual scope with student_id)
        {
          data: {
            id: ASSIGNMENT_A,
            consultant_id: CONSULTANT_ID,
            student_id: STUDENT_Y,
            school_id: null,
            generation_id: null,
            community_id: null,
            is_active: true,
            assignment_data: { assignment_scope: 'individual' },
          },
        },
        // Query 2: duplicate-conflict check (no conflict)
        { data: null },
        // Query 3: update result
        {
          data: {
            id: ASSIGNMENT_A,
            consultant_id: CONSULTANT_ID,
            student_id: null,
            school_id: SCHOOL_ID,
            assignment_data: { assignment_scope: 'school' },
          },
        },
      ],
      { updateCapture: { ref: captureRef } }
    );
    mockCreateServiceRoleClient.mockReturnValueOnce(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      body: {
        id: ASSIGNMENT_A,
        assignment_scope: 'school',
        school_id: SCHOOL_ID,
        student_id: null,
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    // Verify the update payload nulled student_id and set school_id
    const update = captureRef.updateData as Record<string, unknown>;
    expect(update).toBeTruthy();
    expect(update.student_id).toBeNull();
    expect(update.school_id).toBe(SCHOOL_ID);
    expect(update.generation_id).toBeNull();
    expect(update.community_id).toBeNull();
  });

  // ─── Test 1b: school → generation ───
  it('should null student_id and community_id when transitioning from school to generation', async () => {
    setupAdminAuth();

    const captureRef = { updateData: null as unknown };
    const mockClient = buildSequencedClient(
      [
        {
          data: {
            id: ASSIGNMENT_A,
            consultant_id: CONSULTANT_ID,
            student_id: null,
            school_id: SCHOOL_ID,
            generation_id: null,
            community_id: null,
            is_active: true,
            assignment_data: { assignment_scope: 'school' },
          },
        },
        { data: null }, // no conflict
        {
          data: {
            id: ASSIGNMENT_A,
            assignment_data: { assignment_scope: 'generation' },
          },
        },
      ],
      { updateCapture: { ref: captureRef } }
    );
    mockCreateServiceRoleClient.mockReturnValueOnce(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      body: {
        id: ASSIGNMENT_A,
        assignment_scope: 'generation',
        school_id: SCHOOL_ID,
        generation_id: GENERATION_ID,
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const update = captureRef.updateData as Record<string, unknown>;
    expect(update.student_id).toBeNull();
    expect(update.school_id).toBe(SCHOOL_ID);
    expect(update.generation_id).toBe(GENERATION_ID);
    expect(update.community_id).toBeNull();
  });

  // ─── Test 1c: generation → community ───
  it('should null student_id when transitioning from generation to community', async () => {
    setupAdminAuth();

    const captureRef = { updateData: null as unknown };
    const mockClient = buildSequencedClient(
      [
        {
          data: {
            id: ASSIGNMENT_A,
            consultant_id: CONSULTANT_ID,
            student_id: null,
            school_id: SCHOOL_ID,
            generation_id: GENERATION_ID,
            community_id: null,
            is_active: true,
            assignment_data: { assignment_scope: 'generation' },
          },
        },
        { data: null },
        {
          data: {
            id: ASSIGNMENT_A,
            assignment_data: { assignment_scope: 'community' },
          },
        },
      ],
      { updateCapture: { ref: captureRef } }
    );
    mockCreateServiceRoleClient.mockReturnValueOnce(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      body: {
        id: ASSIGNMENT_A,
        assignment_scope: 'community',
        school_id: SCHOOL_ID,
        generation_id: GENERATION_ID,
        community_id: COMMUNITY_ID,
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const update = captureRef.updateData as Record<string, unknown>;
    expect(update.student_id).toBeNull();
    expect(update.school_id).toBe(SCHOOL_ID);
    expect(update.community_id).toBe(COMMUNITY_ID);
  });

  // ─── Test 1d: community → individual ───
  it('should null school/generation/community when transitioning from community to individual', async () => {
    setupAdminAuth();

    const captureRef = { updateData: null as unknown };
    const mockClient = buildSequencedClient(
      [
        {
          data: {
            id: ASSIGNMENT_A,
            consultant_id: CONSULTANT_ID,
            student_id: null,
            school_id: SCHOOL_ID,
            generation_id: GENERATION_ID,
            community_id: COMMUNITY_ID,
            is_active: true,
            assignment_data: { assignment_scope: 'community' },
          },
        },
        { data: null }, // no conflict
        {
          data: {
            id: ASSIGNMENT_A,
            assignment_data: { assignment_scope: 'individual' },
          },
        },
      ],
      { updateCapture: { ref: captureRef } }
    );
    mockCreateServiceRoleClient.mockReturnValueOnce(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      body: {
        id: ASSIGNMENT_A,
        assignment_scope: 'individual',
        student_id: STUDENT_Y,
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const update = captureRef.updateData as Record<string, unknown>;
    expect(update.student_id).toBe(STUDENT_Y);
    expect(update.school_id).toBeNull();
    expect(update.generation_id).toBeNull();
    expect(update.community_id).toBeNull();
  });
});

describe('PUT /api/admin/consultant-assignments — duplicate conflict', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Test 2: Duplicate conflict returns 409 ───
  it('should return 409 when PUT would create duplicate active individual assignment', async () => {
    setupAdminAuth();

    const mockClient = buildSequencedClient([
      // Query 1: fetch existing assignment B (consultant X → student Z)
      {
        data: {
          id: ASSIGNMENT_B,
          consultant_id: CONSULTANT_ID,
          student_id: STUDENT_Z,
          school_id: null,
          generation_id: null,
          community_id: null,
          is_active: true,
          assignment_data: { assignment_scope: 'individual' },
        },
      },
      // Query 2: duplicate-conflict check finds assignment A
      { data: { id: ASSIGNMENT_A } },
    ]);
    mockCreateServiceRoleClient.mockReturnValueOnce(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      body: {
        id: ASSIGNMENT_B,
        student_id: STUDENT_Y, // would duplicate assignment A (consultant X → student Y)
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(409);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('already exists');
  });
});

describe('PUT /api/admin/consultant-assignments — assignment_data merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Test 3: assignment_data merge preserves existing keys ───
  it('should preserve existing assignment_data keys when changing scope', async () => {
    setupAdminAuth();

    const captureRef = { updateData: null as unknown };
    const mockClient = buildSequencedClient(
      [
        // Query 1: existing assignment has custom_note in assignment_data
        {
          data: {
            id: ASSIGNMENT_A,
            consultant_id: CONSULTANT_ID,
            student_id: STUDENT_Y,
            school_id: null,
            generation_id: null,
            community_id: null,
            is_active: true,
            assignment_data: {
              custom_note: 'keep me',
              assignment_scope: 'individual',
            },
          },
        },
        // Query 2: no conflict
        { data: null },
        // Query 3: update result
        {
          data: {
            id: ASSIGNMENT_A,
            assignment_data: {
              custom_note: 'keep me',
              assignment_scope: 'school',
            },
          },
        },
      ],
      { updateCapture: { ref: captureRef } }
    );
    mockCreateServiceRoleClient.mockReturnValueOnce(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      body: {
        id: ASSIGNMENT_A,
        assignment_scope: 'school',
        school_id: SCHOOL_ID,
        student_id: null,
        // No assignment_data sent — existing keys should survive
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const update = captureRef.updateData as Record<string, unknown>;
    const mergedData = update.assignment_data as Record<string, unknown>;
    expect(mergedData.custom_note).toBe('keep me');
    expect(mergedData.assignment_scope).toBe('school');
  });
});

describe('PUT /api/admin/consultant-assignments — validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Test 4: Missing required field returns 400 ───
  it('should return 400 when changing to generation scope without generation_id', async () => {
    setupAdminAuth();

    const mockClient = buildSequencedClient([
      // Query 1: existing assignment is individual scope
      {
        data: {
          id: ASSIGNMENT_A,
          consultant_id: CONSULTANT_ID,
          student_id: STUDENT_Y,
          school_id: null,
          generation_id: null,
          community_id: null,
          is_active: true,
          assignment_data: { assignment_scope: 'individual' },
        },
      },
    ]);
    mockCreateServiceRoleClient.mockReturnValueOnce(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      body: {
        id: ASSIGNMENT_A,
        assignment_scope: 'generation',
        school_id: SCHOOL_ID,
        // generation_id intentionally omitted
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('generation_id');
  });

  it('should return 400 for invalid assignment_scope value', async () => {
    setupAdminAuth();

    const { req, res } = createMocks({
      method: 'PUT',
      body: {
        id: ASSIGNMENT_A,
        assignment_scope: 'galaxy',
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('Invalid assignment_scope');
  });
});
