/**
 * Unit tests for teammate invitation features in groupAssignmentsV2Service
 *
 * NOTE: The getEligibleClassmatesForAssignment method is DEPRECATED.
 * Classmate eligibility logic is now handled server-side in:
 * - /pages/api/assignments/eligible-classmates.ts (school-based + course enrollment filtering)
 * - /pages/api/assignments/add-classmates.ts (validation logic)
 *
 * These tests remain for the client-side service methods that are still in use.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { groupAssignmentsV2Service } from '../groupAssignmentsV2';
import { supabase } from '../../supabase-wrapper';

// Mock supabase
vi.mock('../../supabase-wrapper', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn()
    }
  }
}));

describe('GroupAssignmentsV2Service - Classmate Invitations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('addClassmatesToGroup (deprecated - now uses API)', () => {
    it('should add classmates to non-consultant-managed group', async () => {
      const mockGroup = {
        is_consultant_managed: false,
        max_members: 8,
        community_id: 'community-1'
      };

      const mockInsertedMembers = [
        { id: 'member-1', user_id: 'user-2', group_id: 'group-1', role: 'member' },
        { id: 'member-2', user_id: 'user-3', group_id: 'group-1', role: 'member' }
      ];

      // Mock group query
      const groupSelect = vi.fn().mockReturnThis();
      const groupEq = vi.fn().mockReturnThis();
      const groupSingle = vi.fn().mockResolvedValue({ data: mockGroup, error: null });

      // Mock count query
      const countSelect = vi.fn().mockReturnThis();
      const countEq = vi.fn().mockResolvedValue({ count: 2, error: null });

      // Mock insert query
      const insertFn = vi.fn().mockReturnThis();
      const selectFn = vi.fn().mockResolvedValue({ data: mockInsertedMembers, error: null });

      vi.mocked(supabase.from).mockImplementation((table) => {
        if (table === 'group_assignment_groups') {
          return {
            select: groupSelect.mockReturnValue({
              eq: groupEq.mockReturnValue({
                single: groupSingle
              })
            })
          };
        }
        if (table === 'group_assignment_members') {
          // First call is count, second is insert
          let callCount = 0;
          return {
            select: countSelect.mockReturnValue({
              eq: countEq
            }),
            insert: insertFn.mockReturnValue({
              select: selectFn
            })
          };
        }
        return {};
      });

      // Mock notifyClassmatesAdded
      vi.spyOn(groupAssignmentsV2Service, 'notifyClassmatesAdded').mockResolvedValue();

      const result = await groupAssignmentsV2Service.addClassmatesToGroup(
        'group-1',
        'assignment-1',
        ['user-2', 'user-3'],
        'user-1'
      );

      expect(result.error).toBeNull();
      expect(result.members).toHaveLength(2);
      expect(insertFn).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            group_id: 'group-1',
            assignment_id: 'assignment-1',
            user_id: 'user-2',
            role: 'member',
            added_by: 'user-1'
          })
        ])
      );
    });

    it('should reject adding to consultant-managed group', async () => {
      const mockGroup = {
        is_consultant_managed: true,
        max_members: 8
      };

      const groupSelect = vi.fn().mockReturnThis();
      const groupEq = vi.fn().mockReturnThis();
      const groupSingle = vi.fn().mockResolvedValue({ data: mockGroup, error: null });

      supabase.from.mockReturnValue({
        select: groupSelect.mockReturnValue({
          eq: groupEq.mockReturnValue({
            single: groupSingle
          })
        })
      });

      const result = await groupAssignmentsV2Service.addClassmatesToGroup(
        'group-1',
        'assignment-1',
        ['user-2'],
        'user-1'
      );

      expect(result.members).toBeNull();
      expect(result.error).toBeTruthy();
      expect(result.error.message).toContain('consultor');
    });

    it('should reject when exceeding max group size', async () => {
      const mockGroup = {
        is_consultant_managed: false,
        max_members: 8
      };

      const groupSelect = vi.fn().mockReturnThis();
      const groupEq = vi.fn().mockReturnThis();
      const groupSingle = vi.fn().mockResolvedValue({ data: mockGroup, error: null });

      const countSelect = vi.fn().mockReturnThis();
      const countEq = vi.fn().mockResolvedValue({ count: 7, error: null }); // Already 7 members

      vi.mocked(supabase.from).mockImplementation((table) => {
        if (table === 'group_assignment_groups') {
          return {
            select: groupSelect.mockReturnValue({
              eq: groupEq.mockReturnValue({
                single: groupSingle
              })
            })
          };
        }
        if (table === 'group_assignment_members') {
          return {
            select: countSelect.mockReturnValue({
              eq: countEq
            })
          };
        }
        return {};
      });

      const result = await groupAssignmentsV2Service.addClassmatesToGroup(
        'group-1',
        'assignment-1',
        ['user-2', 'user-3'], // Trying to add 2 more when only 1 spot left
        'user-1'
      );

      expect(result.members).toBeNull();
      expect(result.error).toBeTruthy();
      expect(result.error.message).toContain('límite');
    });
  });

  describe('notifyClassmatesAdded', () => {
    it('should send notifications to added classmates', async () => {
      const mockAdderProfile = {
        first_name: 'Juan',
        last_name: 'Pérez'
      };

      const mockAssignment = {
        title: 'Tarea de Matemáticas'
      };

      // Mock profile query
      const profileSelect = vi.fn().mockReturnThis();
      const profileEq = vi.fn().mockReturnThis();
      const profileSingle = vi.fn().mockResolvedValue({ data: mockAdderProfile, error: null });

      // Mock notifications insert
      const notificationsInsert = vi.fn().mockResolvedValue({ error: null });

      vi.mocked(supabase.from).mockImplementation((table) => {
        if (table === 'profiles') {
          return {
            select: profileSelect.mockReturnValue({
              eq: profileEq.mockReturnValue({
                single: profileSingle
              })
            })
          };
        }
        if (table === 'notifications') {
          return {
            insert: notificationsInsert
          };
        }
        return {};
      });

      // Mock getGroupAssignment
      vi.spyOn(groupAssignmentsV2Service, 'getGroupAssignment').mockResolvedValue({
        assignment: mockAssignment,
        error: null
      });

      await groupAssignmentsV2Service.notifyClassmatesAdded(
        'group-1',
        'assignment-1',
        ['user-2', 'user-3'],
        'user-1'
      );

      expect(notificationsInsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: 'user-2',
            type: 'group_invitation',
            title: 'Te agregaron a un grupo',
            message: expect.stringContaining('Juan Pérez')
          }),
          expect.objectContaining({
            user_id: 'user-3'
          })
        ])
      );
    });
  });
});
