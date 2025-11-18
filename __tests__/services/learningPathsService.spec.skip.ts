/**
 * Comprehensive service-layer tests for LearningPathsService
 * Validates core business logic, calculations, and data transformations
 */

import { LearningPathsService } from '../../lib/services/learningPathsService';

describe('LearningPathsService', () => {
  let mockSupabaseClient: any;
  
  beforeEach(() => {
    // Create a fresh mock for each test
    const mockChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      single: jest.fn(),
      delete: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis()
    };

    mockSupabaseClient = {
      from: jest.fn(() => mockChain),
      rpc: jest.fn()
    };
  });

  describe('getLearningPathDetailsForUser', () => {
    const userId = 'user-123';
    const pathId = 'path-456';

    it('should return complete path details with progress when RPC succeeds', async () => {
      // Mock successful RPC response with realistic data
      const mockRpcResponse = {
        id: pathId,
        name: 'Test Learning Path',
        description: 'A comprehensive test path',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-15T10:30:00.000Z',
        courses: [
          {
            sequence: 1,
            course_id: 'course-1',
            title: 'Introduction Course',
            description: 'Basic introduction',
            category: 'fundamentals',
            duration_hours: 2,
            difficulty_level: 'beginner',
            status: 'completed',
            completion_rate: 100,
            last_accessed: '2025-01-10T15:00:00.000Z',
            enrolled_at: '2025-01-05T09:00:00.000Z',
            enrollment_status: 'completed',
            buttonText: 'Revisar',
            buttonVariant: 'secondary'
          },
          {
            sequence: 2,
            course_id: 'course-2',
            title: 'Advanced Course',
            description: 'Advanced concepts',
            category: 'advanced',
            duration_hours: 4,
            difficulty_level: 'advanced',
            status: 'in_progress',
            completion_rate: 60,
            last_accessed: null,
            enrolled_at: '2025-01-12T14:00:00.000Z',
            enrollment_status: 'in_progress',
            buttonText: 'Continuar',
            buttonVariant: 'primary'
          },
          {
            sequence: 3,
            course_id: 'course-3',
            title: 'Final Course',
            description: 'Final concepts',
            category: 'final',
            duration_hours: 3,
            difficulty_level: 'intermediate',
            status: 'not_started',
            completion_rate: 0,
            last_accessed: null,
            enrolled_at: null,
            enrollment_status: null,
            buttonText: 'Iniciar Curso',
            buttonVariant: 'default'
          }
        ],
        progress: {
          total_courses: 3,
          completed_courses: 1,
          progress_percentage: 33
        },
        timeTracking: {
          totalTimeSpent: 120,
          estimatedCompletion: 540,
          startedAt: '2025-01-05T09:00:00.000Z',
          completedAt: null,
          lastActivity: '2025-01-15T16:30:00.000Z'
        }
      };

      mockSupabaseClient.rpc.mockResolvedValue({
        data: mockRpcResponse,
        error: null
      });

      const result = await LearningPathsService.getLearningPathDetailsForUser(
        mockSupabaseClient,
        userId,
        pathId
      );

      // Verify RPC was called with correct parameters
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_user_path_details_with_progress', {
        p_user_id: userId,
        p_path_id: pathId
      });

      // Validate the returned structure and data
      expect(result).toEqual(mockRpcResponse);
      expect(result.id).toBe(pathId);
      expect(result.name).toBe('Test Learning Path');
      expect(result.courses).toHaveLength(3);

      // Validate progress calculations
      expect(result.progress.total_courses).toBe(3);
      expect(result.progress.completed_courses).toBe(1);
      expect(result.progress.progress_percentage).toBe(33);

      // Validate time tracking
      expect(result.timeTracking.totalTimeSpent).toBe(120);
      expect(result.timeTracking.estimatedCompletion).toBe(540);

      // Validate course-specific data
      const completedCourse = result.courses[0];
      expect(completedCourse.status).toBe('completed');
      expect(completedCourse.completion_rate).toBe(100);
      expect(completedCourse.buttonText).toBe('Revisar');
      expect(completedCourse.buttonVariant).toBe('secondary');

      const inProgressCourse = result.courses[1];
      expect(inProgressCourse.status).toBe('in_progress');
      expect(inProgressCourse.completion_rate).toBe(60);
      expect(inProgressCourse.buttonText).toBe('Continuar');
      expect(inProgressCourse.buttonVariant).toBe('primary');

      const notStartedCourse = result.courses[2];
      expect(notStartedCourse.status).toBe('not_started');
      expect(notStartedCourse.completion_rate).toBe(0);
      expect(notStartedCourse.buttonText).toBe('Iniciar Curso');
      expect(notStartedCourse.buttonVariant).toBe('default');
    });

    it('should handle path with no courses correctly', async () => {
      const mockEmptyPathResponse = {
        id: pathId,
        name: 'Empty Learning Path',
        description: 'A path with no courses',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        courses: [],
        progress: {
          total_courses: 0,
          completed_courses: 0,
          progress_percentage: 0
        },
        timeTracking: {
          totalTimeSpent: 0,
          estimatedCompletion: null,
          startedAt: null,
          completedAt: null,
          lastActivity: null
        }
      };

      mockSupabaseClient.rpc.mockResolvedValue({
        data: mockEmptyPathResponse,
        error: null
      });

      const result = await LearningPathsService.getLearningPathDetailsForUser(
        mockSupabaseClient,
        userId,
        pathId
      );

      expect(result.courses).toHaveLength(0);
      expect(result.progress.total_courses).toBe(0);
      expect(result.progress.completed_courses).toBe(0);
      expect(result.progress.progress_percentage).toBe(0);
      expect(result.timeTracking.totalTimeSpent).toBe(0);
    });

    it('should throw error when learning path not found', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: null
      });

      await expect(
        LearningPathsService.getLearningPathDetailsForUser(mockSupabaseClient, userId, pathId)
      ).rejects.toThrow('Learning path not found');

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_user_path_details_with_progress', {
        p_user_id: userId,
        p_path_id: pathId
      });
    });

    it('should handle RPC database errors gracefully', async () => {
      const mockDatabaseError = {
        code: 'PGRST204',
        message: 'Database connection failed',
        details: null,
        hint: null
      };

      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: mockDatabaseError
      });

      await expect(
        LearningPathsService.getLearningPathDetailsForUser(mockSupabaseClient, userId, pathId)
      ).rejects.toThrow('Failed to fetch learning path details: Database connection failed');
    });
  });

  describe('getUserPathProgress', () => {
    const userId = 'user-123';
    const pathId = 'path-456';

    it('should calculate progress correctly for mixed completion states', async () => {
      // Mock the first query for path courses
      const pathCoursesChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [
            { course_id: 'course-1' },
            { course_id: 'course-2' },
            { course_id: 'course-3' },
            { course_id: 'course-4' }
          ],
          error: null
        })
      };

      // Mock the second query for enrollments
      const enrollmentsChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({
          data: [
            { course_id: 'course-1', progress_percentage: 100, completed_at: '2025-01-10T00:00:00.000Z' },
            { course_id: 'course-2', progress_percentage: 100, completed_at: '2025-01-12T00:00:00.000Z' },
            { course_id: 'course-3', progress_percentage: 50, completed_at: null },
            // course-4 not enrolled (no enrollment record)
          ],
          error: null
        })
      };

      // Setup the from() mock to return different chains
      mockSupabaseClient.from
        .mockReturnValueOnce(pathCoursesChain)
        .mockReturnValueOnce(enrollmentsChain);

      const result = await LearningPathsService.getUserPathProgress(
        mockSupabaseClient,
        userId,
        pathId
      );

      expect(result.path_id).toBe(pathId);
      expect(result.total_courses).toBe(4);
      expect(result.completed_courses).toBe(2); // Only courses with 100% completion
      expect(result.progress_percentage).toBe(50); // 2 out of 4 = 50%
      expect(result.last_accessed).toBe('2025-01-12T00:00:00.000Z'); // Most recent completion
    });

    it('should return zero progress for path with no courses', async () => {
      const pathCoursesChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      };

      mockSupabaseClient.from.mockReturnValueOnce(pathCoursesChain);

      const result = await LearningPathsService.getUserPathProgress(
        mockSupabaseClient,
        userId,
        pathId
      );

      expect(result.total_courses).toBe(0);
      expect(result.completed_courses).toBe(0);
      expect(result.progress_percentage).toBe(0);
      expect(result.last_accessed).toBeNull();
    });
  });

  describe('hasManagePermission', () => {
    const userId = 'user-123';

    it('should return true for admin user', async () => {
      const roleChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({
          data: [{ role_type: 'admin' }],
          error: null
        })
      };

      mockSupabaseClient.from.mockReturnValueOnce(roleChain);

      const result = await LearningPathsService.hasManagePermission(mockSupabaseClient, userId);
      
      expect(result).toBe(true);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_roles');
    });

    it('should return false for regular user', async () => {
      const roleChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({
          data: [], // No matching roles (docente would be filtered out by the .in() query)
          error: null
        })
      };

      mockSupabaseClient.from.mockReturnValueOnce(roleChain);

      const result = await LearningPathsService.hasManagePermission(mockSupabaseClient, userId);
      expect(result).toBe(false);
    });
  });
});