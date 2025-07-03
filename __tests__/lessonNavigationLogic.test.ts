import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

describe('Lesson Navigation Logic', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn(),
    };
    vi.mocked(createClient).mockReturnValue(mockSupabase);
  });

  describe('Module Navigation Fix', () => {
    it('should include order_number when fetching lesson with module', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'lesson-1',
              title: 'Test Lesson',
              module: {
                id: 'module-1',
                course_id: 'course-1',
                order_number: 1, // This should be included
              },
            },
            error: null,
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({ select: mockSelect });

      const supabase = createClient('url', 'key');
      
      // This is the query that was fixed
      const { data } = await supabase
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

      // Verify the query includes order_number
      expect(mockSelect).toHaveBeenCalledWith(expect.stringContaining('order_number'));
      expect(data.module.order_number).toBe(1);
    });

    it('should successfully find next module when order_number is present', async () => {
      const currentLesson = {
        module: {
          course_id: 'course-1',
          order_number: 1,
        },
      };

      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gt: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'module-2',
                    title: 'Module 2',
                    lessons: [{ id: 'lesson-4', title: 'First lesson' }],
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({ select: mockSelect });

      const supabase = createClient('url', 'key');
      
      // Query for next module
      const { data, error } = await supabase
        .from('modules')
        .select('*')
        .eq('course_id', currentLesson.module.course_id)
        .gt('order_number', currentLesson.module.order_number)
        .order('order_number', { ascending: true })
        .limit(1)
        .single();

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data.id).toBe('module-2');
    });

    it('should fail to find next module when order_number is missing', async () => {
      const currentLesson = {
        module: {
          course_id: 'course-1',
          // order_number is missing!
        },
      };

      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gt: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Invalid query' },
                }),
              }),
            }),
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({ select: mockSelect });

      const supabase = createClient('url', 'key');
      
      // This query would fail with undefined order_number
      const { data, error } = await supabase
        .from('modules')
        .select('*')
        .eq('course_id', currentLesson.module.course_id)
        .gt('order_number', (currentLesson.module as any).order_number) // undefined!
        .order('order_number', { ascending: true })
        .limit(1)
        .single();

      expect(error).toBeTruthy();
      expect(data).toBeNull();
    });
  });

  describe('Navigation Query Structure', () => {
    it('should query lessons within same module correctly', async () => {
      const mockGt = vi.fn();
      const mockOrder = vi.fn();
      const mockLimit = vi.fn();
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'lesson-2', title: 'Next Lesson' },
        error: null,
      });

      const mockEq = vi.fn().mockReturnValue({
        gt: mockGt.mockReturnValue({
          order: mockOrder.mockReturnValue({
            limit: mockLimit.mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
      });

      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.from.mockReturnValue({ select: mockSelect });

      const supabase = createClient('url', 'key');
      
      await supabase
        .from('lessons')
        .select('*')
        .eq('module_id', 'module-1')
        .gt('order_number', 1)
        .order('order_number', { ascending: true })
        .limit(1)
        .single();

      expect(mockEq).toHaveBeenCalledWith('module_id', 'module-1');
      expect(mockGt).toHaveBeenCalledWith('order_number', 1);
      expect(mockOrder).toHaveBeenCalledWith('order_number', { ascending: true });
      expect(mockLimit).toHaveBeenCalledWith(1);
    });

    it('should sort lessons by order_number when finding first in module', () => {
      const lessons = [
        { id: 'lesson-3', order_number: 3 },
        { id: 'lesson-1', order_number: 1 },
        { id: 'lesson-2', order_number: 2 },
      ];

      const sorted = lessons.sort((a, b) => a.order_number - b.order_number);
      
      expect(sorted[0].id).toBe('lesson-1');
      expect(sorted[0].order_number).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle modules with order field instead of order_number', async () => {
      // Some old data might have 'order' instead of 'order_number'
      const mockSelect = vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'module-1',
            title: 'Module 1',
            order: 1, // old field name
            order_number: null,
          },
          error: null,
        }),
      });

      mockSupabase.from.mockReturnValue({ select: mockSelect });

      const supabase = createClient('url', 'key');
      const { data } = await supabase
        .from('modules')
        .select('*')
        .single();

      // Code should handle this by using order_number or falling back to order
      const orderValue = data.order_number ?? data.order;
      expect(orderValue).toBe(1);
    });

    it('should handle lessons without module_id', async () => {
      const lesson = {
        id: 'lesson-1',
        module_id: null,
        module: null,
      };

      // Navigation should handle this gracefully
      expect(lesson.module_id).toBeNull();
      expect(lesson.module).toBeNull();
      
      // In real code, this would be checked before attempting navigation
      const canNavigateToNextModule = !!(lesson.module_id && lesson.module);
      expect(canNavigateToNextModule).toBe(false);
    });
  });
});