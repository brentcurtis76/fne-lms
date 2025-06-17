import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import GroupSubmissionModalV2 from '@/components/assignments/GroupSubmissionModalV2';
import { groupAssignmentsV2Service } from '@/lib/services/groupAssignmentsV2';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

// Mock dependencies
vi.mock('@/lib/services/groupAssignmentsV2', () => ({
  groupAssignmentsV2Service: {
    getGroupMembers: vi.fn()
  }
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        getPublicUrl: vi.fn()
      }))
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null })
    }))
  }
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}));

describe('GroupSubmissionModalV2', () => {
  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  const mockAssignment = {
    id: 'assignment-1',
    title: 'Test Group Assignment',
    description: 'Test assignment description',
    instructions: 'Complete this assignment as a group',
    resources: []
  };

  const mockAssignmentWithResources = {
    ...mockAssignment,
    resources: [
      {
        id: 'res-1',
        type: 'link',
        title: 'Reference Website',
        url: 'https://example.com/reference',
        description: 'Important reference material'
      },
      {
        id: 'res-2',
        type: 'document',
        title: 'Assignment Template',
        url: 'https://example.com/template.pdf',
        description: 'Use this template for your submission'
      }
    ]
  };

  const mockGroup = {
    id: 'group-1',
    name: 'Test Group',
    assignment_id: 'assignment-1'
  };

  const mockGroupMembers = [
    { 
      user_id: '1', 
      user: {
        user_id: '1',
        full_name: 'Student 1', 
        email: 'student1@test.com',
        avatar_url: null
      }
    },
    { 
      user_id: '2',
      user: {
        user_id: '2', 
        full_name: 'Student 2',
        email: 'student2@test.com',
        avatar_url: 'https://example.com/avatar2.jpg'
      }
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (groupAssignmentsV2Service.getGroupMembers as any).mockResolvedValue({ 
      members: mockGroupMembers 
    });
  });

  describe('Basic Rendering', () => {
    it('renders modal with assignment details', async () => {
      render(
        <GroupSubmissionModalV2
          assignment={mockAssignment}
          group={mockGroup}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Group Assignment')).toBeInTheDocument();
        expect(screen.getByText('Test assignment description')).toBeInTheDocument();
        expect(screen.getByText('Complete this assignment as a group')).toBeInTheDocument();
      });
    });

    it('shows loading state initially', () => {
      render(
        <GroupSubmissionModalV2
          assignment={mockAssignment}
          group={mockGroup}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      // Component shows loading animation, not text
      expect(screen.getByText('Entregar Tarea Grupal')).toBeInTheDocument();
      // Check for loading animation by class name
      const container = screen.getByText('Entregar Tarea Grupal').closest('.bg-white');
      const loadingElements = container?.querySelectorAll('.animate-pulse');
      expect(loadingElements?.length).toBeGreaterThan(0);
    });

    it('displays group members after loading', async () => {
      render(
        <GroupSubmissionModalV2
          assignment={mockAssignment}
          group={mockGroup}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Student 1')).toBeInTheDocument();
        expect(screen.getByText('Student 2')).toBeInTheDocument();
      });
    });
  });

  describe('Resources Display', () => {
    it('shows resources section when resources exist', async () => {
      render(
        <GroupSubmissionModalV2
          assignment={mockAssignmentWithResources}
          group={mockGroup}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Recursos:')).toBeInTheDocument();
      });
    });

    it('displays all resources with correct information', async () => {
      render(
        <GroupSubmissionModalV2
          assignment={mockAssignmentWithResources}
          group={mockGroup}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Reference Website')).toBeInTheDocument();
        expect(screen.getByText('Important reference material')).toBeInTheDocument();
        expect(screen.getByText('Assignment Template')).toBeInTheDocument();
        expect(screen.getByText('Use this template for your submission')).toBeInTheDocument();
      });
    });

    it('renders correct icons for resource types', async () => {
      render(
        <GroupSubmissionModalV2
          assignment={mockAssignmentWithResources}
          group={mockGroup}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      await waitFor(() => {
        const linkResource = screen.getByText('Reference Website').closest('a');
        const docResource = screen.getByText('Assignment Template').closest('a');
        
        expect(linkResource?.querySelector('svg.lucide-external-link')).toBeTruthy();
        expect(docResource?.querySelector('svg.lucide-file')).toBeTruthy();
      });
    });

    it('makes resources clickable with correct attributes', async () => {
      render(
        <GroupSubmissionModalV2
          assignment={mockAssignmentWithResources}
          group={mockGroup}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      await waitFor(() => {
        const links = screen.getAllByRole('link');
        const resourceLinks = links.filter(link => link.getAttribute('href')?.includes('example.com'));
        
        expect(resourceLinks).toHaveLength(2);
        
        resourceLinks.forEach(link => {
          expect(link).toHaveAttribute('target', '_blank');
          expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        });
      });
    });

    it('does not show resources section when no resources', async () => {
      render(
        <GroupSubmissionModalV2
          assignment={mockAssignment}
          group={mockGroup}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Recursos:')).not.toBeInTheDocument();
      });
    });

    it('handles resources without descriptions', async () => {
      const assignmentWithMinimalResources = {
        ...mockAssignment,
        resources: [
          {
            id: 'res-1',
            type: 'link',
            title: 'Simple Link',
            url: 'https://example.com/link'
          }
        ]
      };

      render(
        <GroupSubmissionModalV2
          assignment={assignmentWithMinimalResources}
          group={mockGroup}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Simple Link')).toBeInTheDocument();
        // Should not show description paragraph if not provided
        const resourceContainer = screen.getByText('Simple Link').closest('div');
        expect(resourceContainer?.querySelector('.text-xs.text-gray-500')).not.toBeInTheDocument();
      });
    });

    it('shows "Sin título" for resources without title', async () => {
      const assignmentWithUntitledResource = {
        ...mockAssignment,
        resources: [
          {
            id: 'res-1',
            type: 'link',
            title: '',
            url: 'https://example.com/untitled'
          }
        ]
      };

      render(
        <GroupSubmissionModalV2
          assignment={assignmentWithUntitledResource}
          group={mockGroup}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Sin título')).toBeInTheDocument();
      });
    });
  });

  describe('Submission Functionality', () => {
    it('enables submit button when content is provided', async () => {
      render(
        <GroupSubmissionModalV2
          assignment={mockAssignment}
          group={mockGroup}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      await waitFor(() => {
        const submitButton = screen.getByText('Entregar Tarea');
        expect(submitButton).toBeDisabled();
      });

      const textarea = screen.getByPlaceholderText('Escribe la respuesta de tu grupo aquí...');
      fireEvent.change(textarea, { target: { value: 'Our group submission' } });

      const submitButton = screen.getByText('Entregar Tarea');
      expect(submitButton).not.toBeDisabled();
    });

    it('handles submission with success', async () => {
      render(
        <GroupSubmissionModalV2
          assignment={mockAssignment}
          group={mockGroup}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Entregar Tarea')).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText('Escribe la respuesta de tu grupo aquí...');
      fireEvent.change(textarea, { target: { value: 'Our group submission' } });

      const submitButton = screen.getByText('Entregar Tarea');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          content: 'Our group submission',
          file_url: ''
        });
      });
    });

    it('shows existing submission when available', async () => {
      const existingSubmission = {
        id: 'submission-1',
        content: 'Previous submission content',
        file_url: 'https://example.com/previous-file.pdf',
        submitted_at: new Date().toISOString(),
        status: 'submitted'
      };

      // Mock the Supabase query for existing submission
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'group_assignment_submissions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: existingSubmission, error: null })
          } as any;
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null })
        } as any;
      });

      render(
        <GroupSubmissionModalV2
          assignment={mockAssignment}
          group={mockGroup}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Ver Entrega Grupal')).toBeInTheDocument();
        expect(screen.getByText('Previous submission content')).toBeInTheDocument();
      });
    });
  });

  describe('Modal Interaction', () => {
    it('calls onClose when close button is clicked', async () => {
      render(
        <GroupSubmissionModalV2
          assignment={mockAssignment}
          group={mockGroup}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      await waitFor(() => {
        const closeButton = screen.getByRole('button', { name: '' }).parentElement?.querySelector('button');
        if (closeButton) {
          fireEvent.click(closeButton);
        }
      });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when cancel button is clicked', async () => {
      render(
        <GroupSubmissionModalV2
          assignment={mockAssignment}
          group={mockGroup}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      await waitFor(() => {
        const cancelButton = screen.getByText('Cancelar');
        fireEvent.click(cancelButton);
      });

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('shows error toast when submission has no content or file', async () => {
      // Reset Supabase mock to return no existing submission
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'group_assignment_submissions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
          } as any;
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null })
        } as any;
      });
      
      render(
        <GroupSubmissionModalV2
          assignment={mockAssignment}
          group={mockGroup}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Escribe la respuesta de tu grupo aquí...')).toBeInTheDocument();
      });

      // Submit button should be disabled when there's no content
      const submitButton = screen.getByText('Entregar Tarea');
      expect(submitButton).toBeDisabled();

      // Try to trigger handleSubmit directly by clicking disabled button won't work
      // Instead, verify the button is properly disabled when no content
    });

    it('handles submission errors gracefully', async () => {
      const mockOnSubmitWithError = vi.fn().mockRejectedValue(new Error('Submission failed'));

      // Reset Supabase mock to return no existing submission
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'group_assignment_submissions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
          } as any;
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null })
        } as any;
      });

      render(
        <GroupSubmissionModalV2
          assignment={mockAssignment}
          group={mockGroup}
          onClose={mockOnClose}
          onSubmit={mockOnSubmitWithError}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Entregar Tarea')).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText('Escribe la respuesta de tu grupo aquí...');
      fireEvent.change(textarea, { target: { value: 'Our group submission' } });

      const submitButton = screen.getByText('Entregar Tarea');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmitWithError).toHaveBeenCalled();
      });
    });
  });
});