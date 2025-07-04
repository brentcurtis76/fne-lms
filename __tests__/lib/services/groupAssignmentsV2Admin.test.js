import { groupAssignmentsV2Service } from '../../../lib/services/groupAssignmentsV2';
import { supabase } from '../../../lib/supabase';

// Mock Supabase
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getUser: jest.fn()
    }
  }
}));

describe('getAllAssignmentsForAdmin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Role-based access control', () => {
    it('should return empty array for non-admin/consultant users', async () => {
      // Mock profile query
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'docente' },
              error: null
            })
          })
        })
      });
      supabase.from.mockImplementation(mockFrom);

      const result = await groupAssignmentsV2Service.getAllAssignmentsForAdmin('user-123');
      
      expect(result).toEqual({
        assignments: [],
        total: 0,
        error: null
      });
    });

    it('should allow access for admin users', async () => {
      // Mock profile query
      const mockFrom = jest.fn();
      
      // Profile query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'admin' },
              error: null
            })
          })
        })
      });

      // Courses query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [{ id: 'course-1' }, { id: 'course-2' }],
            error: null
          })
        })
      });

      // Lessons query  
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      });

      // Blocks query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      });

      supabase.from.mockImplementation(mockFrom);

      const result = await groupAssignmentsV2Service.getAllAssignmentsForAdmin('admin-123');
      
      expect(result.error).toBeNull();
      expect(mockFrom).toHaveBeenCalledWith('courses');
    });

    it('should filter courses for consultant users based on assignments', async () => {
      // Mock profile query
      const mockFrom = jest.fn();
      
      // Profile query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'consultor' },
              error: null
            })
          })
        })
      });

      // Consultant assignments query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [
                { student_id: 'student-1', community_id: 'comm-1' },
                { student_id: 'student-2', community_id: 'comm-1' }
              ],
              error: null
            })
          })
        })
      });

      // Course assignments query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            data: [{ course_id: 'course-1' }],
            error: null
          })
        })
      });

      // User roles query (for getStudentsInCommunities)
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [{ user_id: 'student-3' }],
              error: null
            })
          })
        })
      });

      // Course enrollments query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            data: [{ course_id: 'course-2' }],
            error: null
          })
        })
      });

      // Lessons query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      });

      // Blocks query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      });

      supabase.from.mockImplementation(mockFrom);

      const result = await groupAssignmentsV2Service.getAllAssignmentsForAdmin('consultant-123');
      
      expect(result.error).toBeNull();
      expect(mockFrom).toHaveBeenCalledWith('consultant_assignments');
    });
  });

  describe('Filtering functionality', () => {
    const setupMocksForFiltering = () => {
      const mockFrom = jest.fn();
      
      // Profile query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'admin' },
              error: null
            })
          })
        })
      });

      // Courses query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [{ id: 'course-1' }, { id: 'course-2' }],
            error: null
          })
        })
      });

      return mockFrom;
    };

    it('should filter by school_id', async () => {
      const mockFrom = setupMocksForFiltering();

      // Communities filtered by school
      const communityQuery = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [{ id: 'comm-1' }],
            error: null
          })
        })
      };
      
      mockFrom.mockReturnValueOnce(communityQuery);

      // Get students in communities
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [{ user_id: 'student-1' }],
              error: null
            })
          })
        })
      });

      // Course enrollments
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            data: [{ course_id: 'course-1' }],
            error: null
          })
        })
      });

      // Lessons query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      });

      // Blocks query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      });

      supabase.from.mockImplementation(mockFrom);

      const filters = { school_id: 'school-1' };
      await groupAssignmentsV2Service.getAllAssignmentsForAdmin('admin-123', filters);
      
      // Verify communities were filtered by school
      expect(communityQuery.select().eq).toHaveBeenCalledWith('school_id', 'school-1');
    });

    it('should filter by community_id', async () => {
      const mockFrom = setupMocksForFiltering();

      // Communities filtered by ID
      const communityQuery = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [{ id: 'comm-1' }],
            error: null
          })
        })
      };
      
      mockFrom.mockReturnValueOnce(communityQuery);

      // Get students in communities
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [{ user_id: 'student-1' }],
              error: null
            })
          })
        })
      });

      // Course enrollments
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            data: [{ course_id: 'course-1' }],
            error: null
          })
        })
      });

      // Lessons query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      });

      // Blocks query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      });

      supabase.from.mockImplementation(mockFrom);

      const filters = { community_id: 'comm-1' };
      await groupAssignmentsV2Service.getAllAssignmentsForAdmin('admin-123', filters);
      
      // Verify communities were filtered by ID
      expect(communityQuery.select().eq).toHaveBeenCalledWith('id', 'comm-1');
    });
  });

  describe('Pagination', () => {
    it('should paginate results correctly', async () => {
      const mockFrom = jest.fn();
      
      // Setup basic mocks
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'admin' },
              error: null
            })
          })
        })
      });

      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [{ id: 'course-1' }],
            error: null
          })
        })
      });

      // Create mock lessons
      const mockLessons = [
        { id: 'lesson-1', title: 'Lesson 1', course: { id: 'course-1', title: 'Course 1' } },
        { id: 'lesson-2', title: 'Lesson 2', course: { id: 'course-1', title: 'Course 1' } }
      ];

      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: mockLessons,
              error: null
            })
          })
        })
      });

      // Create mock blocks (3 assignments)
      const mockBlocks = [
        { lesson_id: 'lesson-1', type: 'group_assignment', position: 0, payload: { title: 'Assignment 1' } },
        { lesson_id: 'lesson-1', type: 'group_assignment', position: 1, payload: { title: 'Assignment 2' } },
        { lesson_id: 'lesson-2', type: 'group_assignment', position: 0, payload: { title: 'Assignment 3' } }
      ];

      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: mockBlocks,
              error: null
            })
          })
        })
      });

      // Mock submission queries
      for (let i = 0; i < 3; i++) {
        mockFrom.mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        });
      }

      supabase.from.mockImplementation(mockFrom);

      // Test first page
      const page1 = await groupAssignmentsV2Service.getAllAssignmentsForAdmin('admin-123', {}, 2, 0);
      expect(page1.assignments).toHaveLength(2);
      expect(page1.total).toBe(3);

      // Test second page
      const page2 = await groupAssignmentsV2Service.getAllAssignmentsForAdmin('admin-123', {}, 2, 2);
      expect(page2.assignments).toHaveLength(1);
      expect(page2.total).toBe(3);
    });

    it('should return empty array when offset exceeds total', async () => {
      const mockFrom = jest.fn();
      
      // Setup basic mocks
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'admin' },
              error: null
            })
          })
        })
      });

      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [{ id: 'course-1' }],
            error: null
          })
        })
      });

      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      });

      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      });

      supabase.from.mockImplementation(mockFrom);

      const result = await groupAssignmentsV2Service.getAllAssignmentsForAdmin('admin-123', {}, 50, 100);
      
      expect(result.assignments).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('Error handling', () => {
    it('should handle profile fetch errors', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: new Error('Profile not found')
            })
          })
        })
      });
      
      supabase.from.mockImplementation(mockFrom);

      const result = await groupAssignmentsV2Service.getAllAssignmentsForAdmin('user-123');
      
      expect(result.assignments).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.error).toBeTruthy();
    });

    it('should handle course fetch errors gracefully', async () => {
      const mockFrom = jest.fn();
      
      // Profile query succeeds
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'admin' },
              error: null
            })
          })
        })
      });

      // Courses query fails
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: null,
            error: new Error('Courses fetch failed')
          })
        })
      });

      supabase.from.mockImplementation(mockFrom);

      const result = await groupAssignmentsV2Service.getAllAssignmentsForAdmin('admin-123');
      
      expect(result.assignments).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.error).toBeTruthy();
    });
  });
});