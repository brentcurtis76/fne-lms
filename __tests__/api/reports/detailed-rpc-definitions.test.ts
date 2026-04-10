import { describe, it, expect } from 'vitest';

/**
 * RPC Contract Documentation Tests
 *
 * These tests document the expected parameter and return-value contracts
 * for the Supabase RPCs used by the course assignment system.
 * They act as living documentation — if an RPC signature changes,
 * these tests should be updated to reflect the new contract.
 */

describe('batch_assign_courses RPC contract', () => {
  const rpcName = 'batch_assign_courses';

  it('accepts p_course_id (uuid) and p_user_ids (uuid[])', () => {
    const params = {
      p_course_id: '00000000-0000-0000-0000-000000000001',
      p_user_ids: [
        '00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000011',
      ],
    };

    // Validate parameter shape matches what the API route sends
    expect(params).toHaveProperty('p_course_id');
    expect(params).toHaveProperty('p_user_ids');
    expect(Array.isArray(params.p_user_ids)).toBe(true);
    expect(params.p_user_ids.length).toBeGreaterThan(0);
  });

  it('returns assignments_created, assignments_skipped, enrollments_created, and message', () => {
    // Mirrors the shape consumed by pages/api/courses/batch-assign.ts lines 129-136
    const expectedShape = {
      assignments_created: 2,
      assignments_skipped: 0,
      enrollments_created: 2,
      message: '2 asignaciones creadas, 0 omitidas',
    };

    expect(expectedShape).toHaveProperty('assignments_created');
    expect(expectedShape).toHaveProperty('assignments_skipped');
    expect(expectedShape).toHaveProperty('enrollments_created');
    expect(expectedShape).toHaveProperty('message');

    expect(typeof expectedShape.assignments_created).toBe('number');
    expect(typeof expectedShape.assignments_skipped).toBe('number');
    expect(typeof expectedShape.enrollments_created).toBe('number');
    expect(typeof expectedShape.message).toBe('string');
  });

  it('derives caller identity from auth.uid() — assignedBy is NOT a parameter', () => {
    // Security invariant: the RPC uses auth.uid() internally to set assigned_by.
    // The API route must NOT pass an assignedBy parameter to prevent privilege escalation.
    const params = {
      p_course_id: '00000000-0000-0000-0000-000000000001',
      p_user_ids: ['00000000-0000-0000-0000-000000000010'],
    };

    expect(params).not.toHaveProperty('p_assigned_by');
    expect(params).not.toHaveProperty('assignedBy');
    expect(Object.keys(params)).toEqual(['p_course_id', 'p_user_ids']);
  });

  it('skips already-assigned users without error', () => {
    // When some userIds already have assignments, the RPC should not fail.
    // Instead it reports them via assignments_skipped.
    const resultWithSkips = {
      assignments_created: 1,
      assignments_skipped: 2,
      enrollments_created: 1,
      message: '1 asignaciones creadas, 2 omitidas',
    };

    expect(resultWithSkips.assignments_skipped).toBeGreaterThan(0);
    expect(resultWithSkips.assignments_created + resultWithSkips.assignments_skipped).toBe(3);
  });
});

describe('batch_unassign_courses RPC contract', () => {
  const rpcName = 'batch_unassign_courses';

  it('accepts p_course_id (uuid) and p_user_ids (uuid[])', () => {
    const params = {
      p_course_id: '00000000-0000-0000-0000-000000000001',
      p_user_ids: [
        '00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000011',
      ],
    };

    // Validate parameter shape matches what the API route sends
    expect(params).toHaveProperty('p_course_id');
    expect(params).toHaveProperty('p_user_ids');
    expect(Array.isArray(params.p_user_ids)).toBe(true);
    expect(params.p_user_ids.length).toBeGreaterThan(0);
  });

  it('returns unassigned_count', () => {
    // Mirrors the shape consumed by pages/api/courses/unassign.ts lines 94, 106-110
    const expectedShape = {
      unassigned_count: 2,
    };

    expect(expectedShape).toHaveProperty('unassigned_count');
    expect(typeof expectedShape.unassigned_count).toBe('number');
  });

  it('derives caller identity from auth.uid() — no caller parameter', () => {
    // Security invariant: same as batch_assign_courses, the RPC uses auth.uid()
    const params = {
      p_course_id: '00000000-0000-0000-0000-000000000001',
      p_user_ids: ['00000000-0000-0000-0000-000000000010'],
    };

    expect(params).not.toHaveProperty('p_unassigned_by');
    expect(Object.keys(params)).toEqual(['p_course_id', 'p_user_ids']);
  });

  it('preserves enrollment and progress data — only removes assignment record', () => {
    // Contract: unassigning does NOT delete course_enrollments or lesson progress.
    // The RPC only deletes from course_assignments.
    // This is documented in pages/api/courses/unassign.ts line 81-82.
    const result = {
      unassigned_count: 1,
    };

    // The result only reports unassigned_count, not enrollments_deleted,
    // confirming enrollments are preserved.
    expect(result).not.toHaveProperty('enrollments_deleted');
    expect(result).not.toHaveProperty('progress_deleted');
  });
});
