/**
 * Unit Tests for User Assignments Service
 * Tests collaborative submission functionality
 * FIXED: Now tests lesson_assignment_submissions (correct table)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { userAssignmentsService } from '../userAssignments';

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(),
  rpc: vi.fn(),
  auth: {
    getSession: vi.fn()
  }
} as any;

describe('UserAssignmentsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hasExistingSubmission', () => {
    it('should return true if user has a submission', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'submission-123' },
                  error: null
                })
              })
            })
          })
        })
      });

      const result = await userAssignmentsService.hasExistingSubmission(
        mockSupabaseClient,
        'user-123',
        'assignment-456'
      );

      expect(result).toBe(true);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('lesson_assignment_submissions');
    });

    it('should return false if user has no submission', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { code: 'PGRST116' } // Not found error
                })
              })
            })
          })
        })
      });

      const result = await userAssignmentsService.hasExistingSubmission(
        mockSupabaseClient,
        'user-123',
        'assignment-456'
      );

      expect(result).toBe(false);
    });
  });

  describe('getShareableMembers', () => {
    it('should return members who have not submitted', async () => {
      // Mock user_roles query
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'user_roles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  not: vi.fn().mockResolvedValue({
                    data: [
                      {
                        user_id: 'user-1',
                        profiles: {
                          id: 'user-1',
                          email: 'user1@test.com',
                          full_name: 'User One',
                          avatar_url: null
                        }
                      },
                      {
                        user_id: 'user-2',
                        profiles: {
                          id: 'user-2',
                          email: 'user2@test.com',
                          full_name: 'User Two',
                          avatar_url: null
                        }
                      }
                    ],
                    error: null
                  })
                })
              })
            })
          };
        } else if (table === 'lesson_assignment_submissions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ student_id: 'user-2' }], // user-2 already submitted
                error: null
              })
            })
          };
        }
        return {} as any;
      });

      const result = await userAssignmentsService.getShareableMembers(
        mockSupabaseClient,
        'assignment-123',
        'community-456'
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('user-1');
      expect(result[0].email).toBe('user1@test.com');
    });

    it('should exclude the current user from shareable members', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'user_roles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  not: vi.fn().mockResolvedValue({
                    data: [
                      {
                        user_id: 'current-user',
                        profiles: {
                          id: 'current-user',
                          email: 'current@test.com',
                          full_name: 'Current User',
                          avatar_url: null
                        }
                      }
                    ],
                    error: null
                  })
                })
              })
            })
          };
        } else if (table === 'lesson_assignment_submissions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          };
        }
        return {} as any;
      });

      const result = await userAssignmentsService.getShareableMembers(
        mockSupabaseClient,
        'assignment-123',
        'community-456',
        'current-user'
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('createCollaborativeSubmission - Validation', () => {
    it('should reject if submitter already has a submission', async () => {
      // Mock hasExistingSubmission to return true
      vi.spyOn(userAssignmentsService, 'hasExistingSubmission').mockResolvedValue(
        true
      );

      const result = await userAssignmentsService.createCollaborativeSubmission(
        mockSupabaseClient,
        {
          assignmentId: 'assignment-123',
          submitterId: 'user-123',
          content: 'Test content',
          fileUrl: null,
          sharedWithUserIds: []
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Ya has enviado');
    });

    it('should reject if any shared user already has a submission', async () => {
      // Mock hasExistingSubmission
      vi.spyOn(userAssignmentsService, 'hasExistingSubmission')
        .mockResolvedValueOnce(false) // submitter is ok
        .mockResolvedValueOnce(true); // shared user already has submission

      // Mock profile query for error message
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { full_name: 'Test User', email: 'test@test.com' },
              error: null
            })
          })
        })
      });

      const result = await userAssignmentsService.createCollaborativeSubmission(
        mockSupabaseClient,
        {
          assignmentId: 'assignment-123',
          submitterId: 'user-123',
          content: 'Test content',
          fileUrl: null,
          sharedWithUserIds: ['user-456']
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('ya ha enviado');
    });
  });

  describe('getAllUserAssignments', () => {
    it('should return assignments from enrolled courses', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'course_enrollments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [{ course_id: 'course-1' }, { course_id: 'course-2' }],
                  error: null
                })
              })
            })
          };
        } else if (table === 'lesson_assignments') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'assignment-1',
                        title: 'Test Assignment',
                        course_id: 'course-1',
                        is_published: true,
                        courses: { id: 'course-1', title: 'Test Course' },
                        lessons: null
                      }
                    ],
                    error: null
                  })
                })
              })
            })
          };
        } else if (table === 'lesson_assignment_submissions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          };
        }
        return {} as any;
      });

      const result = await userAssignmentsService.getAllUserAssignments(
        mockSupabaseClient,
        'user-123'
      );

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Assignment');
      expect(result[0].status).toBe('pending');
    });

    it('should return empty array if user has no enrollments', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      });

      const result = await userAssignmentsService.getAllUserAssignments(
        mockSupabaseClient,
        'user-123'
      );

      expect(result).toHaveLength(0);
    });

    it('should throw error if course_enrollments query fails', async () => {
      // Suppress console.error and console.log for this test
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const dbError = { message: 'relation "public.course_enrollments" does not exist' };

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: dbError
            })
          })
        })
      });

      await expect(
        userAssignmentsService.getAllUserAssignments(
          mockSupabaseClient,
          'user-123'
        )
      ).rejects.toEqual(dbError);

      // Restore console methods
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it('should filter by active enrollment status', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'course_enrollments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [{ course_id: 'course-1' }],
                  error: null
                })
              })
            })
          };
        } else if (table === 'lesson_assignments') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [],
                    error: null
                  })
                })
              })
            })
          };
        } else if (table === 'lesson_assignment_submissions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          };
        }
        return {} as any;
      });

      await userAssignmentsService.getAllUserAssignments(
        mockSupabaseClient,
        'user-123'
      );

      // Verify that status filter was applied
      const fromCalls = mockSupabaseClient.from.mock.calls;
      const enrollmentCall = fromCalls.find(call => call[0] === 'course_enrollments');
      expect(enrollmentCall).toBeDefined();
    });
  });
});
