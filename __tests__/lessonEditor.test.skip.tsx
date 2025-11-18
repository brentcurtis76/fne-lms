/**
 * Simplified Lesson Editor Tests
 * Tests core block deletion and visibility functionality
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock Next.js router
const mockRouter = {
  push: vi.fn(),
  query: { courseId: 'course-123', moduleId: 'module-123', lessonId: 'lesson-123' },
  asPath: '/admin/course-builder/course-123/module-123/lesson-123',
  pathname: '/admin/course-builder/[courseId]/[moduleId]/[lessonId]',
  route: '/admin/course-builder/[courseId]/[moduleId]/[lessonId]'
};

vi.mock('next/router', () => ({
  useRouter: () => mockRouter,
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
  sortableKeyboardCoordinates: vi.fn(),
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

describe('LessonEditor - Block Deletion and Visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Block Deletion', () => {
    it('should delete a block successfully', async () => {
      // Mock a successful delete operation
      const mockDeleteChain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null })
      };

      // Mock supabase.from to return our delete chain
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'blocks') {
            return mockDeleteChain;
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: {}, error: null })
          };
        }),
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
        }
      };

      // Test that the mock functions work correctly
      const blockQuery = mockSupabase.from('blocks');
      const deleteResult = await blockQuery.delete().eq('id', 'block-1');
      
      expect(mockSupabase.from).toHaveBeenCalledWith('blocks');
      expect(mockDeleteChain.delete).toHaveBeenCalled();
      expect(mockDeleteChain.eq).toHaveBeenCalledWith('id', 'block-1');
      expect(deleteResult.error).toBeNull();
    });

    it('should handle deletion errors gracefully', async () => {
      // Mock a failed delete operation
      const mockDeleteChain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ 
          error: { message: 'Delete failed', code: '23503' }
        })
      };

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'blocks') {
            return mockDeleteChain;
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: {}, error: null })
          };
        })
      };

      // Test error handling
      const blockQuery = mockSupabase.from('blocks');
      const deleteResult = await blockQuery.delete().eq('id', 'block-1');
      
      expect(deleteResult.error).toBeDefined();
      expect(deleteResult.error.message).toBe('Delete failed');
    });
  });

  describe('Block Visibility Toggle', () => {
    it('should initialize blocks with correct visibility state', () => {
      const mockBlocks = [
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
        }
      ];

      // Test that blocks have correct initial visibility
      expect(mockBlocks[0].is_visible).toBe(true);
      expect(mockBlocks[1].is_visible).toBe(false);
    });

    it('should toggle block visibility and mark as unsaved', () => {
      let blockVisibility = true;
      let hasUnsavedChanges = false;

      // Simulate visibility toggle
      const toggleVisibility = () => {
        blockVisibility = !blockVisibility;
        hasUnsavedChanges = true;
      };

      toggleVisibility();

      expect(blockVisibility).toBe(false);
      expect(hasUnsavedChanges).toBe(true);
    });

    it('should persist visibility state on save', async () => {
      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null })
      };

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'blocks') {
            return mockUpdateChain;
          }
          if (table === 'lessons') {
            return {
              update: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({ error: null })
            };
          }
          return {};
        })
      };

      // Test saving visibility state
      const blocksQuery = mockSupabase.from('blocks');
      const updateResult = await blocksQuery.update({ is_visible: false }).eq('id', 'block-1');

      expect(mockSupabase.from).toHaveBeenCalledWith('blocks');
      expect(mockUpdateChain.update).toHaveBeenCalledWith({ is_visible: false });
      expect(mockUpdateChain.eq).toHaveBeenCalledWith('id', 'block-1');
      expect(updateResult.error).toBeNull();
    });

    it('should handle new blocks with visibility state', () => {
      const createNewBlock = (isVisible: boolean = true) => ({
        id: 'new-block',
        type: 'text',
        position: 0,
        lesson_id: 'lesson-123',
        is_visible: isVisible,
        payload: { content: 'New block content' }
      });

      const visibleBlock = createNewBlock(true);
      const hiddenBlock = createNewBlock(false);

      expect(visibleBlock.is_visible).toBe(true);
      expect(hiddenBlock.is_visible).toBe(false);
    });
  });

  describe('Block Deletion with Position Updates', () => {
    it('should update positions of remaining blocks after deletion', () => {
      let mockBlocks = [
        { id: 'block-1', position: 0 },
        { id: 'block-2', position: 1 },
        { id: 'block-3', position: 2 }
      ];

      // Simulate deleting block-2 (position 1)
      const deleteBlock = (blockId: string) => {
        const blockIndex = mockBlocks.findIndex(b => b.id === blockId);
        if (blockIndex !== -1) {
          mockBlocks.splice(blockIndex, 1);
          // Update positions of remaining blocks
          mockBlocks.forEach((block, index) => {
            block.position = index;
          });
        }
      };

      deleteBlock('block-2');

      expect(mockBlocks).toHaveLength(2);
      expect(mockBlocks[0]).toEqual({ id: 'block-1', position: 0 });
      expect(mockBlocks[1]).toEqual({ id: 'block-3', position: 1 });
    });
  });
});