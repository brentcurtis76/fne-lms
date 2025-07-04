import {
  getAvailableSchools,
  getAvailableCommunitiesForSchool,
  getAvailableGenerationsForSchool,
  updateFilterDependencies,
  getActiveFilterCount,
  clearAllFilters
} from '../../utils/assignmentFilters';
import { supabase } from '../../lib/supabase';

// Mock Supabase
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn()
  }
}));

describe('Assignment Filters Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAvailableSchools', () => {
    it('should return all schools for admin users', async () => {
      const mockSchools = [
        { id: 'school-1', name: 'School A' },
        { id: 'school-2', name: 'School B' }
      ];

      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: mockSchools,
              error: null
            })
          })
        })
      });

      supabase.from.mockImplementation(mockFrom);

      const result = await getAvailableSchools('admin-123', 'admin');

      expect(mockFrom).toHaveBeenCalledWith('schools');
      expect(result).toEqual(mockSchools);
    });

    it('should return only assigned schools for consultants', async () => {
      const mockAssignments = [
        { school_id: 'school-1', school: { id: 'school-1', name: 'School A' } },
        { school_id: 'school-1', school: { id: 'school-1', name: 'School A' } }, // Duplicate
        { school_id: 'school-2', school: { id: 'school-2', name: 'School B' } }
      ];

      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              not: jest.fn().mockResolvedValue({
                data: mockAssignments,
                error: null
              })
            })
          })
        })
      });

      supabase.from.mockImplementation(mockFrom);

      const result = await getAvailableSchools('consultant-123', 'consultor');

      expect(mockFrom).toHaveBeenCalledWith('consultant_assignments');
      expect(result).toHaveLength(2); // Should deduplicate
      expect(result[0].name).toBe('School A');
      expect(result[1].name).toBe('School B');
    });

    it('should return empty array for other roles', async () => {
      const result = await getAvailableSchools('user-123', 'docente');
      expect(result).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: null,
              error: new Error('Database error')
            })
          })
        })
      });

      supabase.from.mockImplementation(mockFrom);

      const result = await getAvailableSchools('admin-123', 'admin');
      expect(result).toEqual([]);
    });
  });

  describe('getAvailableCommunitiesForSchool', () => {
    it('should return all communities for a school for admin', async () => {
      const mockCommunities = [
        { id: 'comm-1', name: 'Community A', school_id: 'school-1' },
        { id: 'comm-2', name: 'Community B', school_id: 'school-1' }
      ];

      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: mockCommunities,
                error: null
              })
            })
          })
        })
      });

      supabase.from.mockImplementation(mockFrom);

      const result = await getAvailableCommunitiesForSchool('admin-123', 'admin', 'school-1');

      expect(result).toEqual(mockCommunities);
    });

    it('should filter communities for consultants', async () => {
      const mockAssignments = [
        { community_id: 'comm-1' },
        { community_id: 'comm-2' }
      ];

      const mockCommunities = [
        { id: 'comm-1', name: 'Community A', school_id: 'school-1' },
        { id: 'comm-2', name: 'Community B', school_id: 'school-1' }
      ];

      const mockFrom = jest.fn();
      
      // First call - consultant assignments
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              not: jest.fn().mockResolvedValue({
                data: mockAssignments,
                error: null
              })
            })
          })
        })
      });

      // Second call - communities
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              in: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                  data: mockCommunities,
                  error: null
                })
              })
            })
          })
        })
      });

      supabase.from.mockImplementation(mockFrom);

      const result = await getAvailableCommunitiesForSchool('consultant-123', 'consultor', 'school-1');

      expect(result).toEqual(mockCommunities);
    });

    it('should return all communities when no school is specified', async () => {
      const mockCommunities = [
        { id: 'comm-1', name: 'Community A', school_id: 'school-1' },
        { id: 'comm-2', name: 'Community B', school_id: 'school-2' }
      ];

      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: mockCommunities,
              error: null
            })
          })
        })
      });

      supabase.from.mockImplementation(mockFrom);

      const result = await getAvailableCommunitiesForSchool('admin-123', 'admin', null);

      expect(result).toEqual(mockCommunities);
    });
  });

  describe('getAvailableGenerationsForSchool', () => {
    it('should return empty array if no school is provided', async () => {
      const result = await getAvailableGenerationsForSchool('admin-123', 'admin', null);
      expect(result).toEqual([]);
    });

    it('should return empty array if school has no generations', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { has_generations: false },
              error: null
            })
          })
        })
      });

      supabase.from.mockImplementation(mockFrom);

      const result = await getAvailableGenerationsForSchool('admin-123', 'admin', 'school-1');
      expect(result).toEqual([]);
    });

    it('should return generations for schools that have them', async () => {
      const mockGenerations = [
        { id: 'gen-1', name: 'Generation 2023' },
        { id: 'gen-2', name: 'Generation 2024' }
      ];

      const mockFrom = jest.fn();

      // School query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { has_generations: true },
              error: null
            })
          })
        })
      });

      // Generations query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: mockGenerations,
                error: null
              })
            })
          })
        })
      });

      supabase.from.mockImplementation(mockFrom);

      const result = await getAvailableGenerationsForSchool('admin-123', 'admin', 'school-1');
      expect(result).toEqual(mockGenerations);
    });

    it('should filter generations for consultants', async () => {
      const mockAssignments = [
        { generation_id: 'gen-1' }
      ];

      const mockGenerations = [
        { id: 'gen-1', name: 'Generation 2023' }
      ];

      const mockFrom = jest.fn();

      // School query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { has_generations: true },
              error: null
            })
          })
        })
      });

      // Consultant assignments query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                not: jest.fn().mockResolvedValue({
                  data: mockAssignments,
                  error: null
                })
              })
            })
          })
        })
      });

      // Generations query
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              in: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                  data: mockGenerations,
                  error: null
                })
              })
            })
          })
        })
      });

      supabase.from.mockImplementation(mockFrom);

      const result = await getAvailableGenerationsForSchool('consultant-123', 'consultor', 'school-1');
      expect(result).toEqual(mockGenerations);
    });
  });

  describe('updateFilterDependencies', () => {
    it('should clear dependent filters when school is cleared', () => {
      const currentFilters = {
        school_id: 'school-1',
        community_id: 'comm-1',
        generation_id: 'gen-1'
      };

      const result = updateFilterDependencies(currentFilters, 'school_id', null);

      expect(result).toEqual({
        school_id: null,
        community_id: null,
        generation_id: null
      });
    });

    it('should update school_id when changed', () => {
      const currentFilters = {
        school_id: 'school-1',
        community_id: null,
        generation_id: null
      };

      const result = updateFilterDependencies(currentFilters, 'school_id', 'school-2');

      expect(result).toEqual({
        school_id: 'school-2',
        community_id: null,
        generation_id: null
      });
    });

    it('should update community_id when changed', () => {
      const currentFilters = {
        school_id: 'school-1',
        community_id: null,
        generation_id: null
      };

      const result = updateFilterDependencies(currentFilters, 'community_id', 'comm-1');

      expect(result).toEqual({
        school_id: 'school-1',
        community_id: 'comm-1',
        generation_id: null
      });
    });

    it('should update generation_id when changed', () => {
      const currentFilters = {
        school_id: 'school-1',
        community_id: 'comm-1',
        generation_id: null
      };

      const result = updateFilterDependencies(currentFilters, 'generation_id', 'gen-1');

      expect(result).toEqual({
        school_id: 'school-1',
        community_id: 'comm-1',
        generation_id: 'gen-1'
      });
    });
  });

  describe('getActiveFilterCount', () => {
    it('should return 0 when no filters are active', () => {
      const filters = {
        school_id: null,
        community_id: null,
        generation_id: null
      };

      expect(getActiveFilterCount(filters)).toBe(0);
    });

    it('should count active filters correctly', () => {
      const filters = {
        school_id: 'school-1',
        community_id: 'comm-1',
        generation_id: null
      };

      expect(getActiveFilterCount(filters)).toBe(2);
    });

    it('should count all filters when all are active', () => {
      const filters = {
        school_id: 'school-1',
        community_id: 'comm-1',
        generation_id: 'gen-1'
      };

      expect(getActiveFilterCount(filters)).toBe(3);
    });
  });

  describe('clearAllFilters', () => {
    it('should return all filters as null', () => {
      const result = clearAllFilters();

      expect(result).toEqual({
        school_id: null,
        community_id: null,
        generation_id: null
      });
    });
  });
});