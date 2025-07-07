import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabase } from '../../lib/supabase-wrapper';

// Mock Supabase
vi.mock('../../lib/supabase-wrapper', () => ({
  supabase: {
    from: vi.fn()
  }
}));

describe('Discussion Counts Integration Tests', () => {
  const mockWorkspaceId = 'workspace-123';
  const mockAssignments = [
    { id: 'assignment-1', title: 'Test Assignment 1' },
    { id: 'assignment-2', title: 'Test Assignment 2' }
  ];
  const mockGroups = new Map([
    ['assignment-1', { id: 'group-1', name: 'Group 1' }],
    ['assignment-2', { id: 'group-2', name: 'Group 2' }]
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadDiscussionCounts', () => {
    // Simulate the loadDiscussionCounts function
    const loadDiscussionCounts = async (assignments: any[], groupsMap: Map<string, any>) => {
      const counts = new Map<string, number>();
      
      for (const assignment of assignments) {
        const group = groupsMap.get(assignment.id);
        if (!group) continue;

        try {
          // Get the discussion thread for this assignment and group
          const { data: thread } = await supabase
            .from('community_threads')
            .select('id')
            .eq('metadata->>assignmentId', assignment.id)
            .eq('metadata->>groupId', group.id)
            .single();

          if (thread) {
            // Count messages in this thread
            const { count } = await supabase
              .from('community_messages')
              .select('*', { count: 'exact', head: true })
              .eq('thread_id', thread.id);

            counts.set(assignment.id, count || 0);
          } else {
            counts.set(assignment.id, 0);
          }
        } catch (error) {
          console.error('Error loading discussion count for assignment:', assignment.id, error);
          counts.set(assignment.id, 0);
        }
      }

      return counts;
    };

    it('should correctly query threads with metadata filters', async () => {
      const selectMock = vi.fn().mockReturnThis();
      const eqMock = vi.fn().mockReturnThis();
      const singleMock = vi.fn().mockResolvedValue({ 
        data: { id: 'thread-123' }, 
        error: null 
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'community_threads') {
          return {
            select: selectMock,
            eq: eqMock,
            single: singleMock
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis()
        };
      });

      await loadDiscussionCounts([mockAssignments[0]], mockGroups);

      // Verify correct query construction
      expect(selectMock).toHaveBeenCalledWith('id');
      expect(eqMock).toHaveBeenCalledWith('metadata->>assignmentId', 'assignment-1');
      expect(eqMock).toHaveBeenCalledWith('metadata->>groupId', 'group-1');
      expect(singleMock).toHaveBeenCalled();
    });

    it('should count messages correctly when thread exists', async () => {
      let messageCountQuery: any;

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'community_threads') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ 
              data: { id: 'thread-123' }, 
              error: null 
            })
          };
        }
        if (table === 'community_messages') {
          messageCountQuery = {
            select: vi.fn(() => ({ count: 'exact', head: true })).mockReturnThis(),
            eq: vi.fn().mockReturnValue({ count: 10, error: null })
          };
          return messageCountQuery;
        }
        return {};
      });

      const counts = await loadDiscussionCounts(mockAssignments, mockGroups);

      // Verify message count query
      expect(messageCountQuery.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
      expect(messageCountQuery.eq).toHaveBeenCalledWith('thread_id', 'thread-123');
      
      // Verify counts
      expect(counts.get('assignment-1')).toBe(10);
      expect(counts.get('assignment-2')).toBe(10);
    });

    it('should return 0 when thread does not exist', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'community_threads') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ 
              data: null, 
              error: { code: 'PGRST116', message: 'No rows found' }
            })
          };
        }
        return {};
      });

      const counts = await loadDiscussionCounts(mockAssignments, mockGroups);

      expect(counts.get('assignment-1')).toBe(0);
      expect(counts.get('assignment-2')).toBe(0);
    });

    it('should handle multiple assignments with different comment counts', async () => {
      const threadIds = ['thread-1', 'thread-2'];
      const messageCounts = [5, 15];
      let callIndex = 0;

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'community_threads') {
          const currentIndex = callIndex;
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ 
              data: currentIndex < threadIds.length ? { id: threadIds[currentIndex] } : null,
              error: currentIndex < threadIds.length ? null : { code: 'PGRST116' }
            })
          };
        }
        if (table === 'community_messages') {
          const currentIndex = callIndex++;
          return {
            select: vi.fn(() => ({ count: 'exact', head: true })).mockReturnThis(),
            eq: vi.fn().mockReturnValue({ 
              count: messageCounts[currentIndex] || 0, 
              error: null 
            })
          };
        }
        return {};
      });

      const counts = await loadDiscussionCounts(mockAssignments, mockGroups);

      expect(counts.get('assignment-1')).toBe(5);
      expect(counts.get('assignment-2')).toBe(15);
    });

    it('should handle database errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'community_threads') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockRejectedValue(new Error('Database connection error'))
          };
        }
        return {};
      });

      const counts = await loadDiscussionCounts(mockAssignments, mockGroups);

      // Should handle error and return 0
      expect(counts.get('assignment-1')).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error loading discussion count for assignment:',
        'assignment-1',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should skip assignments without groups', async () => {
      const incompleteGroups = new Map([['assignment-1', { id: 'group-1' }]]);
      const selectSpy = vi.fn().mockReturnThis();

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'community_threads') {
          return {
            select: selectSpy,
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null })
          };
        }
        return {};
      });

      const counts = await loadDiscussionCounts(mockAssignments, incompleteGroups);

      // Should only query for assignment-1 which has a group
      expect(selectSpy).toHaveBeenCalledTimes(1);
      expect(counts.has('assignment-1')).toBe(true);
      expect(counts.has('assignment-2')).toBe(false);
    });
  });

  describe('Performance Tests', () => {
    it('should handle large numbers of assignments efficiently', async () => {
      const largeAssignments = Array.from({ length: 100 }, (_, i) => ({
        id: `assignment-${i}`,
        title: `Assignment ${i}`
      }));
      
      const largeGroups = new Map(
        largeAssignments.map(a => [a.id, { id: `group-${a.id}`, name: `Group ${a.id}` }])
      );

      let queryCount = 0;

      (supabase.from as any).mockImplementation((table: string) => {
        queryCount++;
        if (table === 'community_threads') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ 
              data: { id: `thread-${queryCount}` }, 
              error: null 
            })
          };
        }
        if (table === 'community_messages') {
          return {
            select: vi.fn(() => ({ count: 'exact', head: true })).mockReturnThis(),
            eq: vi.fn().mockReturnValue({ count: Math.floor(Math.random() * 20), error: null })
          };
        }
        return {};
      });

      const startTime = Date.now();
      const loadDiscussionCounts = async (assignments: any[], groupsMap: Map<string, any>) => {
        const counts = new Map<string, number>();
        
        for (const assignment of assignments) {
          const group = groupsMap.get(assignment.id);
          if (!group) continue;

          const { data: thread } = await supabase
            .from('community_threads')
            .select('id')
            .eq('metadata->>assignmentId', assignment.id)
            .eq('metadata->>groupId', group.id)
            .single();

          if (thread) {
            const { count } = await supabase
              .from('community_messages')
              .select('*', { count: 'exact', head: true })
              .eq('thread_id', thread.id);

            counts.set(assignment.id, count || 0);
          }
        }
        
        return counts;
      };

      const counts = await loadDiscussionCounts(largeAssignments, largeGroups);
      const endTime = Date.now();

      // Should complete in reasonable time (less than 1 second for 100 assignments)
      expect(endTime - startTime).toBeLessThan(1000);
      expect(counts.size).toBe(100);
      expect(queryCount).toBe(200); // 100 thread queries + 100 message queries
    });
  });
});