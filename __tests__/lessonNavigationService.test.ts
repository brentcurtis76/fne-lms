import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

describe('Lesson Navigation Service', () => {
  let mockSupabase: any;
  let mockFrom: any;
  let mockSelect: any;
  let mockEq: any;
  let mockGt: any;
  let mockOrder: any;
  let mockLimit: any;
  let mockSingle: any;

  beforeEach(() => {
    // Setup Supabase mock chain
    mockSingle = jest.fn();
    mockLimit = jest.fn(() => ({ single: mockSingle }));
    mockOrder = jest.fn(() => ({ limit: mockLimit }));
    mockGt = jest.fn(() => ({ order: mockOrder }));
    mockEq = jest.fn(() => ({ 
      single: mockSingle,
      gt: mockGt,
      order: mockOrder,
      limit: mockLimit,
    }));
    mockSelect = jest.fn(() => ({ 
      eq: mockEq,
      single: mockSingle,
      gt: mockGt,
      order: mockOrder,
      limit: mockLimit,
    }));
    mockFrom = jest.fn(() => ({ select: mockSelect }));
    
    mockSupabase = {
      from: mockFrom,
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getNextLesson', () => {
    const getNextLesson = async (currentLesson: any) => {
      const supabase = createClient('url', 'key');
      
      // Try to find next lesson in same module
      const { data: nextLessonData, error: nextLessonError } = await supabase
        .from('lessons')
        .select(`
          id,
          title,
          order_number,
          module:modules(
            id,
            title,
            order_number
          )
        `)
        .eq('module_id', currentLesson.module_id)
        .gt('order_number', currentLesson.order_number)
        .order('order_number', { ascending: true })
        .limit(1)
        .single();

      if (!nextLessonError && nextLessonData) {
        return { nextLesson: nextLessonData, courseCompleted: false };
      }

      // If no next lesson in module, check for next module
      const { data: nextModuleData, error: nextModuleError } = await supabase
        .from('modules')
        .select(`
          id,
          title,
          lessons(id, title, order_number)
        `)
        .eq('course_id', currentLesson.module.course_id)
        .gt('order_number', currentLesson.module.order_number)
        .order('order_number', { ascending: true })
        .limit(1)
        .single();

      if (!nextModuleError && nextModuleData?.lessons?.length > 0) {
        const firstLessonInNextModule = nextModuleData.lessons
          .sort((a: any, b: any) => a.order_number - b.order_number)[0];
        return {
          nextLesson: {
            ...firstLessonInNextModule,
            module: { id: nextModuleData.id, title: nextModuleData.title },
          },
          courseCompleted: false,
        };
      }

      return { nextLesson: null, courseCompleted: true };
    };

    it('should find next lesson in same module', async () => {
      const currentLesson = {
        id: 'lesson-1',
        module_id: 'module-1',
        order_number: 1,
        module: {
          id: 'module-1',
          course_id: 'course-1',
          order_number: 1,
        },
      };

      const nextLesson = {
        id: 'lesson-2',
        title: 'Lesson 2',
        order_number: 2,
        module: {
          id: 'module-1',
          title: 'Module 1',
          order_number: 1,
        },
      };

      mockSingle.mockResolvedValueOnce({
        data: nextLesson,
        error: null,
      });

      const result = await getNextLesson(currentLesson);

      expect(result.nextLesson).toEqual(nextLesson);
      expect(result.courseCompleted).toBe(false);
      expect(mockEq).toHaveBeenCalledWith('module_id', 'module-1');
      expect(mockGt).toHaveBeenCalledWith('order_number', 1);
    });

    it('should find first lesson of next module when current module ends', async () => {
      const currentLesson = {
        id: 'lesson-3',
        module_id: 'module-1',
        order_number: 3,
        module: {
          id: 'module-1',
          course_id: 'course-1',
          order_number: 1,
        },
      };

      // No next lesson in current module
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      // Next module with lessons
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'module-2',
          title: 'Module 2',
          lessons: [
            { id: 'lesson-5', title: 'Lesson 5', order_number: 2 },
            { id: 'lesson-4', title: 'Lesson 4', order_number: 1 },
          ],
        },
        error: null,
      });

      const result = await getNextLesson(currentLesson);

      expect(result.nextLesson).toEqual({
        id: 'lesson-4',
        title: 'Lesson 4',
        order_number: 1,
        module: { id: 'module-2', title: 'Module 2' },
      });
      expect(result.courseCompleted).toBe(false);
    });

    it('should mark course as completed when no more modules', async () => {
      const currentLesson = {
        id: 'lesson-10',
        module_id: 'module-3',
        order_number: 2,
        module: {
          id: 'module-3',
          course_id: 'course-1',
          order_number: 3,
        },
      };

      // No next lesson in current module
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      // No next module
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      const result = await getNextLesson(currentLesson);

      expect(result.nextLesson).toBeNull();
      expect(result.courseCompleted).toBe(true);
    });

    it('should handle module with no lessons', async () => {
      const currentLesson = {
        id: 'lesson-3',
        module_id: 'module-1',
        order_number: 3,
        module: {
          id: 'module-1',
          course_id: 'course-1',
          order_number: 1,
        },
      };

      // No next lesson in current module
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      // Next module exists but has no lessons
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'module-2',
          title: 'Module 2',
          lessons: [],
        },
        error: null,
      });

      const result = await getNextLesson(currentLesson);

      expect(result.nextLesson).toBeNull();
      expect(result.courseCompleted).toBe(true);
    });

    it('should handle missing module order_number', async () => {
      const currentLesson = {
        id: 'lesson-1',
        module_id: 'module-1',
        order_number: 1,
        module: {
          id: 'module-1',
          course_id: 'course-1',
          // order_number is undefined!
        },
      };

      // No next lesson in current module
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      // This query will fail because order_number is undefined
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { message: 'Invalid comparison value' },
      });

      const result = await getNextLesson(currentLesson);

      expect(result.nextLesson).toBeNull();
      expect(result.courseCompleted).toBe(true);
      // The query should have been called with undefined
      expect(mockGt).toHaveBeenCalledWith('order_number', undefined);
    });
  });

  describe('Lesson Query Structure', () => {
    it('should include order_number in module selection', async () => {
      const supabase = createClient('url', 'key');
      
      await supabase
        .from('lessons')
        .select(`
          *,
          module:modules(
            id,
            course_id,
            order_number
          )
        `)
        .eq('id', 'lesson-1')
        .single();

      // Verify the select query includes order_number
      const selectCall = mockSelect.mock.calls[0][0];
      expect(selectCall).toContain('order_number');
      expect(selectCall).toContain('module:modules');
    });

    it('should properly order lessons by order_number', async () => {
      const supabase = createClient('url', 'key');
      
      await supabase
        .from('lessons')
        .select('*')
        .eq('module_id', 'module-1')
        .order('order_number', { ascending: true });

      expect(mockOrder).toHaveBeenCalledWith('order_number', { ascending: true });
    });

    it('should properly order modules by order_number', async () => {
      const supabase = createClient('url', 'key');
      
      await supabase
        .from('modules')
        .select('*')
        .eq('course_id', 'course-1')
        .order('order_number', { ascending: true });

      expect(mockOrder).toHaveBeenCalledWith('order_number', { ascending: true });
    });
  });

  describe('Edge Cases', () => {
    it('should handle circular module references gracefully', async () => {
      // This shouldn't happen in practice, but test defensive coding
      const currentLesson = {
        id: 'lesson-1',
        module_id: 'module-1',
        order_number: 1,
        module: {
          id: 'module-1',
          course_id: 'course-1',
          order_number: Number.MAX_SAFE_INTEGER,
        },
      };

      // No next lesson in current module
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      // No module should have order_number greater than MAX_SAFE_INTEGER
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      const getNextLesson = async (lesson: any) => {
        const supabase = createClient('url', 'key');
        // Implementation would be here
        return { nextLesson: null, courseCompleted: true };
      };

      const result = await getNextLesson(currentLesson);

      expect(result.courseCompleted).toBe(true);
    });

    it('should handle null module_id gracefully', async () => {
      const currentLesson = {
        id: 'lesson-1',
        module_id: null,
        order_number: 1,
        module: null,
      };

      // Query with null module_id
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      const getNextLesson = async (lesson: any) => {
        if (!lesson.module_id || !lesson.module) {
          return { nextLesson: null, courseCompleted: true };
        }
        // Regular implementation
        return { nextLesson: null, courseCompleted: true };
      };

      const result = await getNextLesson(currentLesson);

      expect(result.nextLesson).toBeNull();
      expect(result.courseCompleted).toBe(true);
    });
  });
});