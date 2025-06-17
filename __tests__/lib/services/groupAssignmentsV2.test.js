import { vi } from 'vitest';
import { groupAssignmentsV2Service } from '@/lib/services/groupAssignmentsV2';
import { supabase } from '@/lib/supabase';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn()
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn()
    }))
  }
}));

describe('groupAssignmentsV2Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getGroupAssignmentsForUser', () => {
    const mockUser = { id: 'user-123' };
    const mockProfile = { 
      id: 'profile-123',
      community_id: 'community-123',
      user_role: 'docente'
    };

    const mockLessonsWithGroupAssignments = [
      {
        id: 'lesson-1',
        title: 'Lesson 1',
        course: {
          id: 'course-1',
          title: 'Test Course'
        },
        created_at: '2024-01-01',
        content: {
          blocks: [
            {
              type: 'text',
              payload: { content: 'Some text' }
            },
            {
              type: 'group-assignment',
              payload: {
                title: 'Group Task 1',
                description: 'Description 1',
                instructions: 'Instructions 1',
                resources: [
                  {
                    id: 'res-1',
                    type: 'link',
                    title: 'Resource Link',
                    url: 'https://example.com',
                    description: 'A helpful link'
                  },
                  {
                    id: 'res-2',
                    type: 'document',
                    title: 'PDF Guide',
                    url: 'https://example.com/guide.pdf'
                  }
                ]
              }
            },
            {
              type: 'group_assignment', // Test alternate type name
              payload: {
                title: 'Group Task 2',
                description: 'Description 2',
                instructions: 'Instructions 2'
                // No resources for this one
              }
            }
          ]
        }
      }
    ];

    beforeEach(() => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: mockUser } });
      
      // Mock profile query
      supabase.from.mockImplementation((table) => {
        if (table === 'user_profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null })
          };
        }
        if (table === 'course_community_assignments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ 
              data: [{ course_id: 'course-1' }], 
              error: null 
            })
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn()
        };
      });
    });

    it('extracts group assignments with resources from lessons', async () => {
      // Mock the complex query for lessons
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis()
      };
      
      supabase.from.mockImplementation((table) => {
        if (table === 'user_profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null })
          };
        }
        if (table === 'course_community_assignments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ 
              data: [{ course_id: 'course-1' }], 
              error: null 
            })
          };
        }
        if (table === 'lessons') {
          const mockLessonsQuery = {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn()
          };
          // First order call returns this, second resolves with data
          mockLessonsQuery.order.mockImplementationOnce(() => mockLessonsQuery)
                                 .mockImplementationOnce(() => Promise.resolve({ 
                                   data: mockLessonsWithGroupAssignments, 
                                   error: null 
                                 }));
          return mockLessonsQuery;
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
        return mockQuery;
      });

      const { assignments } = await groupAssignmentsV2Service.getGroupAssignmentsForUser('user-123');

      expect(assignments).toHaveLength(2);
      
      // Check first assignment (with resources)
      expect(assignments[0]).toMatchObject({
        id: 'lesson-1_block_1',
        lesson_id: 'lesson-1',
        lesson_title: 'Lesson 1',
        course_id: 'course-1',
        course_title: 'Test Course',
        block_index: 1,
        title: 'Group Task 1',
        description: 'Description 1',
        instructions: 'Instructions 1',
        resources: [
          {
            id: 'res-1',
            type: 'link',
            title: 'Resource Link',
            url: 'https://example.com',
            description: 'A helpful link'
          },
          {
            id: 'res-2',
            type: 'document',
            title: 'PDF Guide',
            url: 'https://example.com/guide.pdf'
          }
        ],
        community_id: 'community-123'
      });

      // Check second assignment (without resources)
      expect(assignments[1]).toMatchObject({
        id: 'lesson-1_block_2',
        title: 'Group Task 2',
        description: 'Description 2',
        instructions: 'Instructions 2',
        resources: [] // Should be empty array when no resources
      });
    });

    it('returns empty array when no lessons found', async () => {
      supabase.from.mockImplementation((table) => {
        if (table === 'user_profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null })
          };
        }
        if (table === 'course_community_assignments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ 
              data: [{ course_id: 'course-1' }], 
              error: null 
            })
          };
        }
        if (table === 'lessons') {
          const mockLessonsQuery = {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn()
          };
          mockLessonsQuery.order.mockImplementationOnce(() => mockLessonsQuery)
                                 .mockImplementationOnce(() => Promise.resolve({ 
                                   data: [], 
                                   error: null 
                                 }));
          return mockLessonsQuery;
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
        return { select: vi.fn().mockReturnThis() };
      });

      const { assignments } = await groupAssignmentsV2Service.getGroupAssignmentsForUser('user-123');
      
      expect(assignments).toEqual([]);
    });

    it('handles lessons without group assignment blocks', async () => {
      const lessonsWithoutGroupAssignments = [
        {
          id: 'lesson-1',
          title: 'Lesson 1',
          course: { id: 'course-1', title: 'Test Course' },
          content: {
            blocks: [
              { type: 'text', payload: { content: 'Text only' } },
              { type: 'video', payload: { url: 'video.mp4' } }
            ]
          }
        }
      ];

      supabase.from.mockImplementation((table) => {
        if (table === 'user_profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null })
          };
        }
        if (table === 'course_community_assignments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ 
              data: [{ course_id: 'course-1' }], 
              error: null 
            })
          };
        }
        if (table === 'lessons') {
          const mockLessonsQuery = {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn()
          };
          mockLessonsQuery.order.mockImplementationOnce(() => mockLessonsQuery)
                                 .mockImplementationOnce(() => Promise.resolve({ 
                                   data: lessonsWithoutGroupAssignments, 
                                   error: null 
                                 }));
          return mockLessonsQuery;
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
        return { select: vi.fn().mockReturnThis() };
      });

      const { assignments } = await groupAssignmentsV2Service.getGroupAssignmentsForUser('user-123');
      
      expect(assignments).toEqual([]);
    });

    it('handles malformed block payloads gracefully', async () => {
      const lessonsWithMalformedBlocks = [
        {
          id: 'lesson-1',
          title: 'Lesson 1',
          course: { id: 'course-1', title: 'Test Course' },
          content: {
            blocks: [
              {
                type: 'group-assignment',
                payload: null // Malformed payload
              },
              {
                type: 'group-assignment',
                // Missing payload entirely
              },
              {
                type: 'group-assignment',
                payload: {
                  // Has payload but missing all fields
                }
              }
            ]
          }
        }
      ];

      supabase.from.mockImplementation((table) => {
        if (table === 'user_profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null })
          };
        }
        if (table === 'course_community_assignments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ 
              data: [{ course_id: 'course-1' }], 
              error: null 
            })
          };
        }
        if (table === 'lessons') {
          const mockLessonsQuery = {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn()
          };
          mockLessonsQuery.order.mockImplementationOnce(() => mockLessonsQuery)
                                 .mockImplementationOnce(() => Promise.resolve({ 
                                   data: lessonsWithMalformedBlocks, 
                                   error: null 
                                 }));
          return mockLessonsQuery;
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
        return { select: vi.fn().mockReturnThis() };
      });

      const { assignments } = await groupAssignmentsV2Service.getGroupAssignmentsForUser('user-123');
      
      expect(assignments).toHaveLength(3);
      
      // Should use default values
      expect(assignments[0].title).toBe('Tarea Grupal Sin Título');
      expect(assignments[0].description).toBe('');
      expect(assignments[0].instructions).toBe('');
      expect(assignments[0].resources).toEqual([]);
    });
  });

  describe('getOrCreateGroup', () => {
    const mockProfile = {
      id: 'profile-123',
      community_id: 'community-123',
      full_name: 'Test Student'
    };

    it('returns existing group if found', async () => {
      const existingGroup = {
        id: 'group-123',
        assignment_id: 'assignment-123',
        name: 'Existing Group'
      };

      const mockGroupMembersQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ 
          data: [{ group_id: 'group-123', group: existingGroup }], 
          error: null 
        })
      };

      supabase.from.mockImplementation((table) => {
        if (table === 'group_assignment_members') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ 
              data: { group_id: 'group-123', group: existingGroup }, 
              error: null 
            })
          };
        }
        if (table === 'user_profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null })
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const { group } = await groupAssignmentsV2Service.getOrCreateGroup('assignment-123', 'user-123');
      
      expect(group).toEqual(existingGroup);
    });

    it('creates new group when none exists', async () => {
      const newGroup = {
        id: 'new-group-123',
        assignment_id: 'assignment-123',
        name: 'Grupo 1234567890'
      };

      // Mock no existing group
      const mockGroupMembersQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null })
      };

      // Mock group creation
      const mockGroupsInsert = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: newGroup, error: null })
      };

      // Mock member addition
      const mockMembersInsert = {
        insert: vi.fn().mockResolvedValue({ data: {}, error: null })
      };

      supabase.from.mockImplementation((table) => {
        if (table === 'group_assignment_members') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            insert: vi.fn().mockResolvedValue({ data: {}, error: null })
          };
        }
        if (table === 'user_profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null })
          };
        }
        if (table === 'group_assignment_groups') {
          return mockGroupsInsert;
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const { group } = await groupAssignmentsV2Service.getOrCreateGroup('assignment-123', 'user-123');
      
      expect(group).toEqual(newGroup);
      expect(mockGroupsInsert.insert).toHaveBeenCalledWith({
        assignment_id: 'assignment-123',
        community_id: 'community-123',
        name: expect.stringMatching(/^Grupo \d+$/)
      });
    });
  });
});