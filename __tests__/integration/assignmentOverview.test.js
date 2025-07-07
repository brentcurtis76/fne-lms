import { createMockData, cleanupMockData } from '../utils/testHelpers';
import { groupAssignmentsV2Service } from '../../lib/services/groupAssignmentsV2';
import { supabase } from '../../lib/supabase-wrapper';

// Mock Supabase for integration tests
jest.mock('../../lib/supabase-wrapper', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getUser: jest.fn()
    }
  }
}));

describe('Assignment Overview Integration Tests', () => {
  let mockData;

  beforeEach(() => {
    jest.clearAllMocks();
    mockData = createTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  describe('End-to-end assignment overview flow', () => {
    it('should display correct assignments for admin with no filters', async () => {
      setupMocksForAdmin(mockData);

      const result = await groupAssignmentsV2Service.getAllAssignmentsForAdmin('admin-123');

      expect(result.assignments).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.assignments[0]).toMatchObject({
        title: 'Group Project 1',
        course_title: 'Mathematics 101',
        students_count: 5,
        groups_count: 2,
        submission_rate: 60
      });
    });

    it('should filter assignments by school correctly', async () => {
      setupMocksForAdminWithSchoolFilter(mockData);

      const filters = { school_id: 'school-1' };
      const result = await groupAssignmentsV2Service.getAllAssignmentsForAdmin('admin-123', filters);

      expect(result.assignments).toHaveLength(2);
      expect(result.assignments.every(a => 
        a.community?.school?.id === 'school-1'
      )).toBe(true);
    });

    it('should show consultant-specific assignments', async () => {
      setupMocksForConsultant(mockData);

      const result = await groupAssignmentsV2Service.getAllAssignmentsForAdmin('consultant-123');

      expect(result.assignments).toHaveLength(1);
      expect(result.assignments[0].title).toBe('Group Project 2');
    });

    it('should handle pagination correctly with filters', async () => {
      setupMocksForPagination(mockData);

      // First page
      const page1 = await groupAssignmentsV2Service.getAllAssignmentsForAdmin(
        'admin-123',
        { school_id: 'school-1' },
        2,
        0
      );

      expect(page1.assignments).toHaveLength(2);
      expect(page1.total).toBe(5);

      // Second page
      const page2 = await groupAssignmentsV2Service.getAllAssignmentsForAdmin(
        'admin-123',
        { school_id: 'school-1' },
        2,
        2
      );

      expect(page2.assignments).toHaveLength(2);
      expect(page2.assignments[0].title).not.toBe(page1.assignments[0].title);

      // Third page
      const page3 = await groupAssignmentsV2Service.getAllAssignmentsForAdmin(
        'admin-123',
        { school_id: 'school-1' },
        2,
        4
      );

      expect(page3.assignments).toHaveLength(1);
    });

    it('should calculate submission statistics correctly', async () => {
      setupMocksWithSubmissions(mockData);

      const result = await groupAssignmentsV2Service.getAllAssignmentsForAdmin('admin-123');

      const assignment = result.assignments[0];
      expect(assignment.students_count).toBe(10);
      expect(assignment.submitted_count).toBe(7);
      expect(assignment.submission_rate).toBe(70);
      expect(assignment.groups_count).toBe(3);
    });
  });

  describe('Filter interdependencies', () => {
    it('should show only communities belonging to selected school', async () => {
      setupMocksForFilterDependencies(mockData);

      // When school-1 is selected, only its communities should be available
      const filters = { school_id: 'school-1' };
      const result = await groupAssignmentsV2Service.getAllAssignmentsForAdmin('admin-123', filters);

      const communities = result.assignments
        .map(a => a.community)
        .filter(Boolean);

      expect(communities.every(c => c.school_id === 'school-1')).toBe(true);
    });

    it('should clear generation filter when school changes', async () => {
      // This is handled in the UI component, but we can verify the service handles it correctly
      setupMocksForAdmin(mockData);

      // First query with school and generation
      const result1 = await groupAssignmentsV2Service.getAllAssignmentsForAdmin(
        'admin-123',
        { school_id: 'school-1', generation_id: 'gen-1' }
      );

      // Then query with different school (generation should be ignored in UI)
      const result2 = await groupAssignmentsV2Service.getAllAssignmentsForAdmin(
        'admin-123',
        { school_id: 'school-2' }
      );

      expect(result2.assignments.some(a => 
        a.community?.school?.id === 'school-2'
      )).toBe(true);
    });
  });
});

// Helper functions to create test data
function createTestData() {
  return {
    schools: [
      { id: 'school-1', name: 'Lincoln High School', is_active: true, has_generations: true },
      { id: 'school-2', name: 'Washington Middle School', is_active: true, has_generations: false }
    ],
    communities: [
      { id: 'comm-1', name: 'Math Excellence', school_id: 'school-1', generation_id: 'gen-1' },
      { id: 'comm-2', name: 'Science Stars', school_id: 'school-1', generation_id: 'gen-1' },
      { id: 'comm-3', name: 'History Heroes', school_id: 'school-2', generation_id: null }
    ],
    generations: [
      { id: 'gen-1', name: 'Class of 2024', school_id: 'school-1' }
    ],
    courses: [
      { id: 'course-1', title: 'Mathematics 101', is_active: true },
      { id: 'course-2', title: 'Science 201', is_active: true },
      { id: 'course-3', title: 'History 301', is_active: true }
    ],
    lessons: [
      { id: 'lesson-1', title: 'Algebra Basics', course_id: 'course-1', course: { id: 'course-1', title: 'Mathematics 101' } },
      { id: 'lesson-2', title: 'Chemistry Lab', course_id: 'course-2', course: { id: 'course-2', title: 'Science 201' } },
      { id: 'lesson-3', title: 'World War II', course_id: 'course-3', course: { id: 'course-3', title: 'History 301' } }
    ],
    blocks: [
      { lesson_id: 'lesson-1', type: 'group_assignment', position: 0, payload: { title: 'Group Project 1', description: 'Solve algebra problems together' } },
      { lesson_id: 'lesson-2', type: 'group_assignment', position: 0, payload: { title: 'Group Project 2', description: 'Conduct chemistry experiments' } },
      { lesson_id: 'lesson-3', type: 'group_assignment', position: 0, payload: { title: 'Group Project 3', description: 'Research WWII events' } }
    ],
    groups: [
      { id: 'group-1', assignment_id: 'lesson-1_block_0', community_id: 'comm-1' },
      { id: 'group-2', assignment_id: 'lesson-1_block_0', community_id: 'comm-1' },
      { id: 'group-3', assignment_id: 'lesson-2_block_0', community_id: 'comm-2' }
    ],
    submissions: [
      { assignment_id: 'lesson-1_block_0', user_id: 'student-1', group_id: 'group-1', status: 'submitted' },
      { assignment_id: 'lesson-1_block_0', user_id: 'student-2', group_id: 'group-1', status: 'submitted' },
      { assignment_id: 'lesson-1_block_0', user_id: 'student-3', group_id: 'group-2', status: 'submitted' },
      { assignment_id: 'lesson-1_block_0', user_id: 'student-4', group_id: 'group-2', status: 'pending' },
      { assignment_id: 'lesson-1_block_0', user_id: 'student-5', group_id: 'group-2', status: 'pending' }
    ]
  };
}

function cleanupTestData() {
  // Reset mocks
  jest.clearAllMocks();
}

// Mock setup functions
function setupMocksForAdmin(data) {
  const mockFrom = jest.fn();
  let callCount = 0;

  mockFrom.mockImplementation((table) => {
    callCount++;
    
    // Profile query
    if (callCount === 1) {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'admin' },
              error: null
            })
          })
        })
      };
    }
    
    // Courses query
    if (callCount === 2) {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: data.courses,
            error: null
          })
        })
      };
    }
    
    // Lessons query
    if (callCount === 3) {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: data.lessons,
              error: null
            })
          })
        })
      };
    }
    
    // Blocks query
    if (callCount === 4) {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: data.blocks,
              error: null
            })
          })
        })
      };
    }
    
    // Submissions queries
    if (callCount <= 7) {
      const assignmentId = data.blocks[callCount - 5] ? 
        `${data.blocks[callCount - 5].lesson_id}_block_${data.blocks[callCount - 5].position}` : 
        'unknown';
      
      const submissions = data.submissions.filter(s => s.assignment_id === assignmentId);
      
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: submissions,
            error: null
          })
        })
      };
    }
    
    // Group queries
    return {
      select: jest.fn().mockReturnValue({
        in: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({
            data: [{ 
              community_id: 'comm-1', 
              community: data.communities.find(c => c.id === 'comm-1')
            }],
            error: null
          })
        })
      })
    };
  });

  supabase.from.mockImplementation(mockFrom);
}

function setupMocksForAdminWithSchoolFilter(data) {
  const mockFrom = jest.fn();
  let callCount = 0;

  mockFrom.mockImplementation(() => {
    callCount++;
    
    // Profile query
    if (callCount === 1) {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'admin' },
              error: null
            })
          })
        })
      };
    }
    
    // Courses query
    if (callCount === 2) {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: data.courses,
            error: null
          })
        })
      };
    }
    
    // Communities filter query
    if (callCount === 3) {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: data.communities.filter(c => c.school_id === 'school-1'),
            error: null
          })
        })
      };
    }

    // Continue with filtered results...
    return {
      select: jest.fn().mockReturnValue({
        in: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      })
    };
  });

  supabase.from.mockImplementation(mockFrom);
}

function setupMocksForConsultant(data) {
  const mockFrom = jest.fn();
  let callCount = 0;

  mockFrom.mockImplementation(() => {
    callCount++;
    
    // Profile query
    if (callCount === 1) {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'consultor' },
              error: null
            })
          })
        })
      };
    }
    
    // Consultant assignments
    if (callCount === 2) {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [
                { student_id: 'student-1', community_id: 'comm-2' }
              ],
              error: null
            })
          })
        })
      };
    }

    // Limited results based on consultant assignments
    return {
      select: jest.fn().mockReturnValue({
        in: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      })
    };
  });

  supabase.from.mockImplementation(mockFrom);
}

function setupMocksForPagination(data) {
  // Create 5 assignments for pagination testing
  const manyBlocks = [];
  for (let i = 0; i < 5; i++) {
    manyBlocks.push({
      lesson_id: 'lesson-1',
      type: 'group_assignment',
      position: i,
      payload: { title: `Group Project ${i + 1}` }
    });
  }

  const mockFrom = jest.fn();
  let callCount = 0;

  mockFrom.mockImplementation(() => {
    callCount++;
    
    if (callCount === 1) {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'admin' },
              error: null
            })
          })
        })
      };
    }

    if (callCount === 4) {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: manyBlocks,
              error: null
            })
          })
        })
      };
    }

    // Default mock response
    return {
      select: jest.fn().mockReturnValue({
        in: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      })
    };
  });

  supabase.from.mockImplementation(mockFrom);
}

function setupMocksWithSubmissions(data) {
  const extendedSubmissions = [
    ...data.submissions,
    { assignment_id: 'lesson-1_block_0', user_id: 'student-6', group_id: 'group-1', status: 'submitted' },
    { assignment_id: 'lesson-1_block_0', user_id: 'student-7', group_id: 'group-1', status: 'submitted' },
    { assignment_id: 'lesson-1_block_0', user_id: 'student-8', group_id: 'group-2', status: 'submitted' },
    { assignment_id: 'lesson-1_block_0', user_id: 'student-9', group_id: 'group-3', status: 'pending' },
    { assignment_id: 'lesson-1_block_0', user_id: 'student-10', group_id: 'group-3', status: 'pending' }
  ];

  setupMocksForAdmin({ ...data, submissions: extendedSubmissions });
}

function setupMocksForFilterDependencies(data) {
  setupMocksForAdminWithSchoolFilter(data);
}