import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useRouter } from 'next/router';

// Mock Next.js router
vi.mock('next/router', () => ({
  useRouter: vi.fn(),
}));

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { 
          session: { 
            user: { 
              id: 'test-user-id',
              user_metadata: { role: 'admin' }
            } 
          } 
        }
      }),
      signOut: vi.fn(),
    },
    from: vi.fn(),
  },
  createPagesServerClient: vi.fn(),
}));

// Mock toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock DnD Kit
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => children,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => children,
  verticalListSortingStrategy: vi.fn(),
  arrayMove: vi.fn((arr: any[], from: number, to: number) => {
    const newArr = [...arr];
    const [removed] = newArr.splice(from, 1);
    newArr.splice(to, 0, removed);
    return newArr;
  }),
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
  })),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: vi.fn(),
    },
  },
}));

// Import after mocks
import LessonEditorPage from '../pages/admin/course-builder/[courseId]/[moduleId]/[lessonId]';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

describe('LessonEditor - Block Deletion and Visibility', () => {
  let mockRouter: any;

  const mockLesson = {
    id: 'lesson-123',
    title: 'Test Lesson',
    module_id: 'module-123',
    blocks: [
      {
        id: 'block-1',
        type: 'text',
        position: 0,
        lesson_id: 'lesson-123',
        is_visible: true,
        payload: { content: 'Block 1 content' }
      },
      {
        id: 'block-2',
        type: 'text',
        position: 1,
        lesson_id: 'lesson-123',
        is_visible: false, // This block should start collapsed
        payload: { content: 'Block 2 content' }
      },
      {
        id: 'block-3',
        type: 'text',
        position: 2,
        lesson_id: 'lesson-123',
        is_visible: true,
        payload: { content: 'Block 3 content' }
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockRouter = {
      push: vi.fn(),
      query: { courseId: 'course-123', moduleId: 'module-123', lessonId: 'lesson-123' },
    };
    (useRouter as any).mockReturnValue(mockRouter);
    
    // Mock profile fetch
    (supabase.from as any) = vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { avatar_url: 'test-avatar.jpg' } })
        };
      }
      if (table === 'courses') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { title: 'Test Course' } })
        };
      }
      if (table === 'modules') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { title: 'Test Module' } })
        };
      }
      if (table === 'blocks') {
        return {
          delete: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: {}, error: null })
        };
      }
      if (table === 'lessons') {
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis()
        };
      }
      return {};
    });
  });

  describe('Block Deletion', () => {
    it('should delete a block successfully', async () => {
      const deleteChain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null })
      };
      
      (supabase.from as any) = vi.fn((table: string) => {
        if (table === 'blocks') {
          return deleteChain;
        }
        return supabase.from(table);
      });

      const { container } = render(
        <LessonEditorPage 
          initialLessonData={mockLesson}
          courseId="course-123"
          moduleId="module-123"
          lessonIdString="lesson-123"
        />
      );

      // Wait for component to load
      await waitFor(() => {
        expect(screen.getByText('Test Lesson')).toBeInTheDocument();
      });

      // Find and click delete button for block-2
      const deleteButtons = container.querySelectorAll('[aria-label*="Eliminar"]');
      expect(deleteButtons.length).toBeGreaterThan(0);
      
      fireEvent.click(deleteButtons[1]); // Delete second block

      await waitFor(() => {
        expect(deleteChain.delete).toHaveBeenCalled();
        expect(deleteChain.eq).toHaveBeenCalledWith('id', 'block-2');
        expect(toast.success).toHaveBeenCalledWith('Bloque eliminado exitosamente.');
      });
    });

    it('should handle deletion errors gracefully', async () => {
      const deleteError = new Error('Database error');
      const deleteChain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: deleteError })
      };
      
      (supabase.from as any) = vi.fn((table: string) => {
        if (table === 'blocks') {
          return deleteChain;
        }
        return supabase.from(table);
      });

      const { container } = render(
        <LessonEditorPage 
          initialLessonData={mockLesson}
          courseId="course-123"
          moduleId="module-123"
          lessonIdString="lesson-123"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Lesson')).toBeInTheDocument();
      });

      const deleteButtons = container.querySelectorAll('[aria-label*="Eliminar"]');
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Error al eliminar el bloque: Database error');
      });
    });
  });

  describe('Block Visibility Toggle', () => {
    it('should initialize blocks with correct visibility state', async () => {
      render(
        <LessonEditorPage 
          initialLessonData={mockLesson}
          courseId="course-123"
          moduleId="module-123"
          lessonIdString="lesson-123"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Lesson')).toBeInTheDocument();
      });

      // Block 2 should be collapsed (is_visible: false)
      const collapseButtons = screen.getAllByLabelText(/Expandir|Colapsar/);
      expect(collapseButtons).toHaveLength(3);
      
      // The second block should have the collapsed state
      expect(collapseButtons[1]).toHaveAttribute('aria-label', expect.stringContaining('Expandir'));
    });

    it('should toggle block visibility and mark as unsaved', async () => {
      const { container } = render(
        <LessonEditorPage 
          initialLessonData={mockLesson}
          courseId="course-123"
          moduleId="module-123"
          lessonIdString="lesson-123"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Lesson')).toBeInTheDocument();
      });

      // Find collapse/expand buttons
      const toggleButtons = container.querySelectorAll('[aria-label*="Colapsar"], [aria-label*="Expandir"]');
      expect(toggleButtons.length).toBeGreaterThan(0);

      // Click to toggle first block (should collapse)
      fireEvent.click(toggleButtons[0]);

      // Should show unsaved changes indicator
      await waitFor(() => {
        const saveButton = screen.getByText(/Guardar/);
        expect(saveButton).toBeInTheDocument();
      });
    });

    it('should persist visibility state on save', async () => {
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: {}, error: null })
      };

      mockSupabase.from = vi.fn((table: string) => {
        if (table === 'blocks') {
          return updateChain;
        }
        if (table === 'lessons') {
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null })
          };
        }
        return supabase.from(table);
      });

      const { container } = render(
        <LessonEditorPage 
          initialLessonData={mockLesson}
          courseId="course-123"
          moduleId="module-123"
          lessonIdString="lesson-123"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Lesson')).toBeInTheDocument();
      });

      // Toggle visibility of first block
      const toggleButtons = container.querySelectorAll('[aria-label*="Colapsar"], [aria-label*="Expandir"]');
      fireEvent.click(toggleButtons[0]);

      // Save changes
      const saveButton = screen.getByText(/Guardar/);
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(updateChain.update).toHaveBeenCalled();
        // Check that is_visible was included in the update
        const updateCall = updateChain.update.mock.calls[0][0];
        expect(updateCall).toHaveProperty('is_visible');
        expect(updateCall.is_visible).toBe(false); // First block should now be collapsed
      });
    });

    it('should handle new blocks with visibility state', async () => {
      const insertChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ 
          data: { 
            id: 'new-block-id',
            type: 'text',
            is_visible: true,
            payload: { content: 'New block' }
          }, 
          error: null 
        })
      };

      mockSupabase.from = vi.fn((table: string) => {
        if (table === 'blocks') {
          return insertChain;
        }
        if (table === 'lessons') {
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null })
          };
        }
        return supabase.from(table);
      });

      render(
        <LessonEditorPage 
          initialLessonData={mockLesson}
          courseId="course-123"
          moduleId="module-123"
          lessonIdString="lesson-123"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Lesson')).toBeInTheDocument();
      });

      // Add a new text block
      const addBlockButton = screen.getByText(/Agregar Bloque de Texto/);
      fireEvent.click(addBlockButton);

      // Save
      const saveButton = screen.getByText(/Guardar/);
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(insertChain.insert).toHaveBeenCalled();
        const insertData = insertChain.insert.mock.calls[0][0];
        expect(insertData).toHaveProperty('is_visible', true); // New blocks default to visible
      });
    });
  });

  describe('Block Deletion with Position Updates', () => {
    it('should update positions of remaining blocks after deletion', async () => {
      const deleteChain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null })
      };
      
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null })
      };

      let callCount = 0;
      mockSupabase.from = vi.fn((table: string) => {
        if (table === 'blocks') {
          callCount++;
          if (callCount === 1) {
            return deleteChain;
          } else {
            return updateChain;
          }
        }
        return supabase.from(table);
      });

      const { container } = render(
        <LessonEditorPage 
          initialLessonData={mockLesson}
          courseId="course-123"
          moduleId="module-123"
          lessonIdString="lesson-123"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Lesson')).toBeInTheDocument();
      });

      // Delete the middle block (block-2)
      const deleteButtons = container.querySelectorAll('[aria-label*="Eliminar"]');
      fireEvent.click(deleteButtons[1]);

      await waitFor(() => {
        expect(deleteChain.delete).toHaveBeenCalled();
        expect(deleteChain.eq).toHaveBeenCalledWith('id', 'block-2');
        
        // Should update positions for remaining blocks
        expect(updateChain.update).toHaveBeenCalledTimes(2);
        expect(updateChain.update).toHaveBeenCalledWith({ position: 1 }); // block-3 moves to position 1
      });
    });
  });
});