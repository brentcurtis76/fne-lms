import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { groupAssignmentsV2Service } from '../groupAssignmentsV2';
import { supabase } from '../../supabase';

// Mock Supabase client
vi.mock('../../supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn()
    }
  }
}));

describe('GroupAssignmentsV2Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getGroupAssignmentsForUser', () => {
    it('should return empty array when user has no profile', async () => {
      const mockFrom = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ 
          data: null, 
          error: { message: 'Profile not found' } 
        })
      };
      
      supabase.from.mockImplementation((table) => {
        if (table === 'user_roles') {
          return mockFrom;
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ 
              data: null, 
              error: null 
            })
          };
        }
        if (table === 'course_assignments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ 
              data: [],
              error: null 
            })
          };
        }
        if (table === 'consultant_assignments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ 
                data: [],
                error: null 
              })
            }))
          };
        }
        if (table === 'courses') {
          return {
            select: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ 
                data: [],
                error: null 
              })
            }))
          };
        }
        return mockFrom;
      });
      
      const result = await groupAssignmentsV2Service.getGroupAssignmentsForUser('test-user-id');
      
      expect(result.assignments).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should fetch assignments from directly assigned courses', async () => {
      const mockUserId = 'test-user-id';
      const mockCourseId = 'test-course-id';
      
      // Mock user profile lookup
      supabase.from.mockImplementation((table) => {
        if (table === 'user_roles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ 
              data: { community_id: 'test-community' },
              error: null 
            })
          };
        }
        
        if (table === 'course_assignments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ 
              data: [{ course_id: mockCourseId }],
              error: null 
            })
          };
        }
        
        if (table === 'lessons') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [{
                id: 'lesson-1',
                title: 'Test Lesson',
                order_number: 1,
                created_at: '2024-01-01',
                content: {
                  blocks: [
                    {
                      type: 'text',
                      payload: { content: 'Introduction' }
                    },
                    {
                      type: 'group-assignment',
                      payload: {
                        title: 'Test Group Assignment',
                        description: 'Test description',
                        instructions: 'Test instructions'
                      }
                    }
                  ]
                },
                course: {
                  id: mockCourseId,
                  title: 'Test Course',
                  description: 'Test course description'
                }
              }],
              error: null
              })
            }))
          };
        }
        
        if (table === 'group_assignment_submissions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ 
              data: [],
              error: null 
            })
          };
        }
        
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null })
        };
      });
      
      const result = await groupAssignmentsV2Service.getGroupAssignmentsForUser(mockUserId);
      
      expect(result.error).toBeNull();
      expect(result.assignments).toHaveLength(1);
      expect(result.assignments[0]).toMatchObject({
        id: 'lesson-1_block_1',
        lesson_id: 'lesson-1',
        lesson_title: 'Test Lesson',
        course_id: mockCourseId,
        course_title: 'Test Course',
        title: 'Test Group Assignment',
        description: 'Test description',
        status: 'pending'
      });
    });

    it('should handle submission status correctly', async () => {
      const mockUserId = 'test-user-id';
      const mockAssignmentId = 'lesson-1_block_0';
      
      // Setup mocks for a successful flow with submission
      supabase.from.mockImplementation((table) => {
        if (table === 'user_roles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ 
              data: { community_id: 'test-community' },
              error: null 
            })
          };
        }
        
        if (table === 'courses') {
          return {
            select: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ 
                data: [{ id: 'course-1' }],
                error: null 
              })
            }))
          };
        }
        
        if (table === 'lessons') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [{
                id: 'lesson-1',
                title: 'Test Lesson',
                content: {
                  blocks: [{
                    type: 'group-assignment',
                    payload: { title: 'Test Assignment' }
                  }]
                },
                course: { id: 'course-1', title: 'Test Course' }
              }],
              error: null
              })
            }))
          };
        }
        
        if (table === 'group_assignment_submissions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ 
              data: [{
                assignment_id: mockAssignmentId,
                status: 'submitted',
                grade: 85
              }],
              error: null 
            })
          };
        }
        
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: [], error: null })
        };
      });
      
      const result = await groupAssignmentsV2Service.getGroupAssignmentsForUser(mockUserId);
      
      expect(result.assignments[0].status).toBe('submitted');
      expect(result.assignments[0].grade).toBe(85);
    });
  });

  describe('getGroupAssignmentsForConsultant', () => {
    it('should return empty array for non-consultant users', async () => {
      supabase.from.mockImplementation((table) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ 
              data: { role: 'docente' },
              error: null 
            })
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null })
        };
      });
      
      const result = await groupAssignmentsV2Service.getGroupAssignmentsForConsultant('non-consultant-id');
      
      expect(result.assignments).toEqual([]);
      expect(result.students).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should fetch assignments for consultant\'s students', async () => {
      const mockConsultantId = 'consultant-id';
      const mockStudentId = 'student-id';
      
      supabase.from.mockImplementation((table) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ 
              data: { role: 'consultor' },
              error: null 
            })
          };
        }
        
        if (table === 'consultant_assignments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{
                  student_id: mockStudentId,
                  assignment_type: 'monitoring',
                  profiles: {
                    id: mockStudentId,
                    first_name: 'Test',
                    last_name: 'Student',
                    email: 'student@test.com'
                  }
                }],
                error: null
              })
            })
          };
        }
        
        if (table === 'course_assignments') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ 
              data: [{ course_id: 'course-1', teacher_id: mockStudentId }],
              error: null 
            })
          };
        }
        
        if (table === 'lessons') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [{
                id: 'lesson-1',
                title: 'Test Lesson',
                content: {
                  blocks: [{
                    type: 'group-assignment',
                    payload: { title: 'Consultant View Assignment' }
                  }]
                },
                course: { id: 'course-1', title: 'Test Course' }
              }],
              error: null
              })
            }))
          };
        }
        
        if (table === 'group_assignment_submissions') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          };
        }
        
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null })
        };
      });
      
      const result = await groupAssignmentsV2Service.getGroupAssignmentsForConsultant(mockConsultantId);
      
      expect(result.error).toBeNull();
      expect(result.assignments).toHaveLength(1);
      expect(result.students).toHaveLength(1);
      expect(result.assignments[0].title).toBe('Consultant View Assignment');
      expect(result.assignments[0].students_with_access).toHaveLength(1);
      expect(result.assignments[0].students_count).toBe(1);
    });
  });

  describe('getOrCreateGroup', () => {
    it('should return existing group if user already belongs to one', async () => {
      const mockGroupId = 'existing-group-id';
      
      supabase.from.mockImplementation((table) => {
        if (table === 'group_assignment_members') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: {
                  group_id: mockGroupId,
                  group: {
                    id: mockGroupId,
                    name: 'Existing Group',
                    assignment_id: 'test-assignment',
                    community_id: 'test-community'
                  }
                },
                error: null
              })
            })
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null })
        };
      });
      
      const result = await groupAssignmentsV2Service.getOrCreateGroup('test-assignment', 'test-user');
      
      expect(result.group).toBeDefined();
      expect(result.group.id).toBe(mockGroupId);
      expect(result.group.name).toBe('Existing Group');
      expect(result.error).toBeNull();
    });

    it('should create new group if user has no group', async () => {
      const mockNewGroupId = 'new-group-id';
      const mockUserId = 'test-user';
      
      supabase.from.mockImplementation((table) => {
        if (table === 'group_assignment_members') {
          const mockMembers = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' } // Not found error
              })
            }),
            insert: vi.fn().mockResolvedValue({ error: null })
          };
          return mockMembers;
        }
        
        if (table === 'user_roles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { community_id: 'test-community' },
              error: null
            })
          };
        }
        
        if (table === 'group_assignment_groups') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: mockNewGroupId,
                assignment_id: 'test-assignment',
                community_id: 'test-community',
                name: expect.stringContaining('Grupo')
              },
              error: null
            })
          };
        }
        
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null })
        };
      });
      
      const result = await groupAssignmentsV2Service.getOrCreateGroup('test-assignment', mockUserId);
      
      expect(result.group).toBeDefined();
      expect(result.group.id).toBe(mockNewGroupId);
      expect(result.error).toBeNull();
    });
  });

  describe('submitGroupAssignment', () => {
    it('should create submissions for all group members', async () => {
      const mockAssignmentId = 'test-assignment';
      const mockGroupId = 'test-group';
      const mockSubmissionData = {
        content: 'Test submission content',
        file_url: 'https://example.com/file.pdf'
      };
      
      let insertedSubmissions = [];
      
      supabase.from.mockImplementation((table) => {
        if (table === 'group_assignment_members') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [
                { user_id: 'user-1' },
                { user_id: 'user-2' }
              ],
              error: null
            })
          };
        }
        
        if (table === 'group_assignment_submissions') {
          return {
            upsert: vi.fn((data) => {
              insertedSubmissions = data;
              return Promise.resolve({ error: null });
            })
          };
        }
        
        if (table === 'group_assignment_groups') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { community_id: 'test-community', name: 'Test Group' },
              error: null
            })
          };
        }
        
        if (table === 'consultant_assignments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          };
        }
        
        if (table === 'notifications') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null })
          };
        }
        
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null })
        };
      });
      
      // Mock getGroupAssignment method
      vi.spyOn(groupAssignmentsV2Service, 'getGroupAssignment').mockResolvedValue({
        assignment: {
          id: mockAssignmentId,
          title: 'Test Assignment',
          course_title: 'Test Course',
          course_id: 'course-1'
        },
        error: null
      });
      
      const result = await groupAssignmentsV2Service.submitGroupAssignment(
        mockAssignmentId,
        mockGroupId,
        mockSubmissionData
      );
      
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(insertedSubmissions).toHaveLength(2);
      expect(insertedSubmissions[0]).toMatchObject({
        assignment_id: mockAssignmentId,
        group_id: mockGroupId,
        content: mockSubmissionData.content,
        file_url: mockSubmissionData.file_url,
        status: 'submitted'
      });
    });

    it('should handle submission errors gracefully', async () => {
      supabase.from.mockImplementation((table) => {
        if (table === 'group_assignment_members') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null })
        };
      });
      
      const result = await groupAssignmentsV2Service.submitGroupAssignment(
        'test-assignment',
        'test-group',
        {}
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});