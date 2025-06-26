import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { groupAssignmentsV2Service } from '../../lib/services/groupAssignmentsV2';

// Mock Next.js router
vi.mock('next/router', () => ({
  useRouter: vi.fn()
}));

// Mock Supabase client
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn()
    }
  }
}));

// Mock groupAssignmentsV2Service
vi.mock('../../lib/services/groupAssignmentsV2', () => ({
  groupAssignmentsV2Service: {
    getGroupAssignmentsForUser: vi.fn(),
    getOrCreateGroup: vi.fn()
  }
}));

// Mock other dependencies
vi.mock('react-hot-toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}));

// Import component after mocks
import GroupAssignmentsContent from '../../pages/community/workspace';

describe('GroupAssignmentsContent - Comment Count Feature', () => {
  const mockRouter = {
    push: vi.fn(),
    pathname: '/community/workspace',
    query: { section: 'group-assignments' }
  };

  const mockUser = {
    id: 'test-user-123',
    email: 'test@example.com'
  };

  const mockWorkspace = {
    id: 'workspace-123',
    name: 'Test Workspace',
    community_id: 'community-123'
  };

  const mockAssignments = [
    {
      id: 'assignment-1',
      title: 'Tarea Grupal 1',
      description: 'Primera tarea grupal',
      course_title: 'Curso Test',
      lesson_title: 'Lección 1',
      status: 'pending'
    },
    {
      id: 'assignment-2',
      title: 'Tarea Grupal 2',
      description: 'Segunda tarea grupal',
      course_title: 'Curso Test',
      lesson_title: 'Lección 2',
      status: 'submitted'
    }
  ];

  const mockGroups = new Map([
    ['assignment-1', { id: 'group-1', name: 'Grupo 1', assignment_id: 'assignment-1' }],
    ['assignment-2', { id: 'group-2', name: 'Grupo 2', assignment_id: 'assignment-2' }]
  ]);

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup router mock
    (useRouter as any).mockReturnValue(mockRouter);
    
    // Setup default supabase mocks
    const fromMock = vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: 'docente' }, error: null })
        };
      }
      if (table === 'community_threads') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn()
        };
      }
      if (table === 'community_messages') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis()
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null })
      };
    });

    (supabase.from as any).mockImplementation(fromMock);
    
    // Setup groupAssignmentsV2Service mocks
    (groupAssignmentsV2Service.getGroupAssignmentsForUser as any).mockResolvedValue({
      assignments: mockAssignments,
      error: null
    });
    
    (groupAssignmentsV2Service.getOrCreateGroup as any).mockImplementation((assignmentId) => {
      return Promise.resolve({ group: mockGroups.get(assignmentId), error: null });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Comment Count Loading', () => {
    it('should load and display comment counts for assignments', async () => {
      // Mock thread and message counts
      const threadMock = {
        data: { id: 'thread-1' },
        error: null
      };
      
      const messageCountMock = {
        count: 5,
        error: null
      };

      // Setup specific mocks for this test
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'community_threads') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue(threadMock)
          };
        }
        if (table === 'community_messages') {
          return {
            select: vi.fn(() => ({ count: 'exact', head: true })).mockReturnThis(),
            eq: vi.fn().mockReturnValue(messageCountMock)
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: 'docente' }, error: null })
        };
      });

      const { container } = render(
        <GroupAssignmentsContent
          workspace={mockWorkspace}
          workspaceAccess={{ availableCommunities: [], role: 'member' }}
          user={mockUser}
          searchQuery=""
          router={mockRouter}
        />
      );

      // Wait for assignments to load
      await waitFor(() => {
        expect(screen.getByText('Tarea Grupal 1')).toBeInTheDocument();
      });

      // Wait for comment counts to load
      await waitFor(() => {
        const commentBadge = screen.getByText('5 comentarios');
        expect(commentBadge).toBeInTheDocument();
        expect(commentBadge).toHaveClass('bg-[#fdb933]/20', 'text-[#00365b]');
      });
    });

    it('should show "0 comentarios" when no comments exist', async () => {
      // Mock no thread found
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'community_threads') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: 'docente' }, error: null })
        };
      });

      render(
        <GroupAssignmentsContent
          workspace={mockWorkspace}
          workspaceAccess={{ availableCommunities: [], role: 'member' }}
          user={mockUser}
          searchQuery=""
          router={mockRouter}
        />
      );

      await waitFor(() => {
        const zeroBadge = screen.getByText('0 comentarios');
        expect(zeroBadge).toBeInTheDocument();
        expect(zeroBadge).toHaveClass('bg-gray-100', 'text-gray-500');
      });
    });

    it('should handle singular/plural correctly', async () => {
      // Mock 1 comment
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'community_threads') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'thread-1' }, error: null })
          };
        }
        if (table === 'community_messages') {
          return {
            select: vi.fn(() => ({ count: 'exact', head: true })).mockReturnThis(),
            eq: vi.fn().mockReturnValue({ count: 1, error: null })
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: 'docente' }, error: null })
        };
      });

      render(
        <GroupAssignmentsContent
          workspace={mockWorkspace}
          workspaceAccess={{ availableCommunities: [], role: 'member' }}
          user={mockUser}
          searchQuery=""
          router={mockRouter}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('1 comentario')).toBeInTheDocument();
      });
    });
  });

  describe('Discussion Link Navigation', () => {
    it('should navigate to discussion page when clicking discussion link', async () => {
      render(
        <GroupAssignmentsContent
          workspace={mockWorkspace}
          workspaceAccess={{ availableCommunities: [], role: 'member' }}
          user={mockUser}
          searchQuery=""
          router={mockRouter}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Tarea Grupal 1')).toBeInTheDocument();
      });

      // Find and click the discussion button
      const discussionButton = screen.getByText('Discusión del grupo');
      fireEvent.click(discussionButton);

      // Verify navigation
      expect(mockRouter.push).toHaveBeenCalledWith(
        '/community/workspace/assignments/assignment-1/discussion'
      );
    });

    it('should prevent main card click when clicking discussion link', async () => {
      const handleAssignmentClick = vi.fn();

      render(
        <GroupAssignmentsContent
          workspace={mockWorkspace}
          workspaceAccess={{ availableCommunities: [], role: 'member' }}
          user={mockUser}
          searchQuery=""
          router={mockRouter}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Tarea Grupal 1')).toBeInTheDocument();
      });

      // Click discussion button
      const discussionButton = screen.getByText('Discusión del grupo');
      const clickEvent = new MouseEvent('click', { bubbles: true });
      
      // Spy on stopPropagation
      const stopPropagationSpy = vi.spyOn(clickEvent, 'stopPropagation');
      
      // Trigger the click
      Object.defineProperty(discussionButton, 'onclick', {
        value: (e: MouseEvent) => {
          e.stopPropagation();
          mockRouter.push(`/community/workspace/assignments/assignment-1/discussion`);
        }
      });
      
      discussionButton.dispatchEvent(clickEvent);

      // Verify stopPropagation was called
      expect(stopPropagationSpy).toHaveBeenCalled();
      
      // Verify assignment click handler was not called
      expect(handleAssignmentClick).not.toHaveBeenCalled();
    });
  });

  describe('UI Display', () => {
    it('should show chat icon next to discussion text', async () => {
      render(
        <GroupAssignmentsContent
          workspace={mockWorkspace}
          workspaceAccess={{ availableCommunities: [], role: 'member' }}
          user={mockUser}
          searchQuery=""
          router={mockRouter}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Discusión del grupo')).toBeInTheDocument();
      });

      // Check for chat icon (using class or aria-label)
      const discussionSection = screen.getByText('Discusión del grupo').parentElement;
      expect(discussionSection).toContainHTML('ChatIcon');
    });

    it('should apply hover styles to discussion link', async () => {
      render(
        <GroupAssignmentsContent
          workspace={mockWorkspace}
          workspaceAccess={{ availableCommunities: [], role: 'member' }}
          user={mockUser}
          searchQuery=""
          router={mockRouter}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Discusión del grupo')).toBeInTheDocument();
      });

      const discussionButton = screen.getByText('Discusión del grupo').parentElement?.parentElement;
      expect(discussionButton).toHaveClass('group', 'hover:bg-gray-50');
    });
  });

  describe('Error Handling', () => {
    it('should handle errors when loading discussion counts', async () => {
      // Mock error in loading threads
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'community_threads') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockRejectedValue(new Error('Database error'))
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: 'docente' }, error: null })
        };
      });

      // Spy on console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <GroupAssignmentsContent
          workspace={mockWorkspace}
          workspaceAccess={{ availableCommunities: [], role: 'member' }}
          user={mockUser}
          searchQuery=""
          router={mockRouter}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Tarea Grupal 1')).toBeInTheDocument();
      });

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error loading discussion counts:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Consultant View', () => {
    it('should not show discussion links for consultants', async () => {
      // Mock consultant role
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { role: 'consultor' }, error: null })
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null })
        };
      });

      // Mock consultant assignments
      (groupAssignmentsV2Service as any).getGroupAssignmentsForConsultant = vi.fn().mockResolvedValue({
        assignments: mockAssignments,
        students: [],
        error: null
      });

      render(
        <GroupAssignmentsContent
          workspace={mockWorkspace}
          workspaceAccess={{ availableCommunities: [], role: 'member' }}
          user={mockUser}
          searchQuery=""
          router={mockRouter}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Tareas Grupales de Mis Estudiantes')).toBeInTheDocument();
      });

      // Verify discussion links are not present for consultants
      expect(screen.queryByText('Discusión del grupo')).not.toBeInTheDocument();
    });
  });
});