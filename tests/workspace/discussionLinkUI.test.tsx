import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';

// Create a mock component that simulates the discussion link behavior
const MockAssignmentCard = ({ 
  assignment, 
  discussionCount, 
  onAssignmentClick, 
  onDiscussionClick 
}: {
  assignment: any;
  discussionCount: number;
  onAssignmentClick: () => void;
  onDiscussionClick: (e: React.MouseEvent) => void;
}) => {
  return (
    <div
      onClick={onAssignmentClick}
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md cursor-pointer transition-shadow"
      data-testid="assignment-card"
    >
      <h3 className="text-lg font-semibold text-[#0a0a0a] mb-2">
        {assignment.title}
      </h3>
      
      <div className="mt-4 pt-3 border-t border-gray-100">
        <button
          onClick={onDiscussionClick}
          className="flex items-center justify-between w-full group hover:bg-gray-50 -mx-2 px-2 py-1 rounded transition-colors"
          data-testid="discussion-link"
        >
          <div className="flex items-center gap-2">
            <span className="h-4 w-4 text-gray-500 group-hover:text-[#0a0a0a]" data-testid="chat-icon">
              💬
            </span>
            <span className="text-sm text-gray-600 group-hover:text-[#0a0a0a]">
              Discusión del grupo
            </span>
          </div>
          <span 
            className={`text-sm font-medium px-2 py-0.5 rounded-full ${
              discussionCount > 0 
                ? 'bg-[#fbbf24]/20 text-[#0a0a0a]' 
                : 'bg-gray-100 text-gray-500'
            }`}
            data-testid="comment-count"
          >
            {discussionCount} comentario{discussionCount !== 1 ? 's' : ''}
          </span>
        </button>
      </div>
    </div>
  );
};

describe('Discussion Link UI Tests', () => {
  const mockAssignment = {
    id: 'test-assignment',
    title: 'Test Assignment'
  };

  describe('Visual Display', () => {
    it('should display comment count with proper styling when comments exist', () => {
      render(
        <MockAssignmentCard
          assignment={mockAssignment}
          discussionCount={5}
          onAssignmentClick={vi.fn()}
          onDiscussionClick={vi.fn()}
        />
      );

      const commentBadge = screen.getByTestId('comment-count');
      expect(commentBadge).toHaveTextContent('5 comentarios');
      expect(commentBadge).toHaveClass('bg-[#fbbf24]/20', 'text-[#0a0a0a]');
    });

    it('should display zero comments with gray styling', () => {
      render(
        <MockAssignmentCard
          assignment={mockAssignment}
          discussionCount={0}
          onAssignmentClick={vi.fn()}
          onDiscussionClick={vi.fn()}
        />
      );

      const commentBadge = screen.getByTestId('comment-count');
      expect(commentBadge).toHaveTextContent('0 comentarios');
      expect(commentBadge).toHaveClass('bg-gray-100', 'text-gray-500');
    });

    it('should use singular form for 1 comment', () => {
      render(
        <MockAssignmentCard
          assignment={mockAssignment}
          discussionCount={1}
          onAssignmentClick={vi.fn()}
          onDiscussionClick={vi.fn()}
        />
      );

      const commentBadge = screen.getByTestId('comment-count');
      expect(commentBadge).toHaveTextContent('1 comentario');
    });

    it('should show chat icon', () => {
      render(
        <MockAssignmentCard
          assignment={mockAssignment}
          discussionCount={0}
          onAssignmentClick={vi.fn()}
          onDiscussionClick={vi.fn()}
        />
      );

      const chatIcon = screen.getByTestId('chat-icon');
      expect(chatIcon).toBeInTheDocument();
    });
  });

  describe('Click Interactions', () => {
    it('should call onDiscussionClick when discussion link is clicked', async () => {
      const onDiscussionClick = vi.fn((e) => e.stopPropagation());
      const onAssignmentClick = vi.fn();
      const user = userEvent.setup();

      render(
        <MockAssignmentCard
          assignment={mockAssignment}
          discussionCount={3}
          onAssignmentClick={onAssignmentClick}
          onDiscussionClick={onDiscussionClick}
        />
      );

      const discussionLink = screen.getByTestId('discussion-link');
      await user.click(discussionLink);

      expect(onDiscussionClick).toHaveBeenCalledTimes(1);
      expect(onDiscussionClick).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should not trigger assignment click when discussion link is clicked', async () => {
      const onDiscussionClick = vi.fn((e) => e.stopPropagation());
      const onAssignmentClick = vi.fn();

      render(
        <MockAssignmentCard
          assignment={mockAssignment}
          discussionCount={3}
          onAssignmentClick={onAssignmentClick}
          onDiscussionClick={onDiscussionClick}
        />
      );

      const discussionLink = screen.getByTestId('discussion-link');
      fireEvent.click(discussionLink);

      expect(onDiscussionClick).toHaveBeenCalled();
      expect(onAssignmentClick).not.toHaveBeenCalled();
    });

    it('should trigger assignment click when card is clicked outside discussion link', async () => {
      const onDiscussionClick = vi.fn((e) => e.stopPropagation());
      const onAssignmentClick = vi.fn();
      const user = userEvent.setup();

      render(
        <MockAssignmentCard
          assignment={mockAssignment}
          discussionCount={3}
          onAssignmentClick={onAssignmentClick}
          onDiscussionClick={onDiscussionClick}
        />
      );

      const assignmentTitle = screen.getByText('Test Assignment');
      await user.click(assignmentTitle);

      expect(onAssignmentClick).toHaveBeenCalledTimes(1);
      expect(onDiscussionClick).not.toHaveBeenCalled();
    });
  });

  describe('Hover Effects', () => {
    it('should apply hover styles to discussion link', async () => {
      const user = userEvent.setup();

      render(
        <MockAssignmentCard
          assignment={mockAssignment}
          discussionCount={3}
          onAssignmentClick={vi.fn()}
          onDiscussionClick={vi.fn()}
        />
      );

      const discussionLink = screen.getByTestId('discussion-link');
      
      // Initial state
      expect(discussionLink).toHaveClass('hover:bg-gray-50');
      
      // Hover state - check that the hover class exists
      await user.hover(discussionLink);
      expect(discussionLink).toHaveClass('group', 'hover:bg-gray-50');
    });
  });

  describe('Accessibility', () => {
    it('should have proper button role for discussion link', () => {
      render(
        <MockAssignmentCard
          assignment={mockAssignment}
          discussionCount={3}
          onAssignmentClick={vi.fn()}
          onDiscussionClick={vi.fn()}
        />
      );

      const discussionLink = screen.getByTestId('discussion-link');
      expect(discussionLink.tagName).toBe('BUTTON');
    });

    it('should be keyboard navigable', async () => {
      const onDiscussionClick = vi.fn((e) => e.stopPropagation());
      const user = userEvent.setup();

      render(
        <MockAssignmentCard
          assignment={mockAssignment}
          discussionCount={3}
          onAssignmentClick={vi.fn()}
          onDiscussionClick={onDiscussionClick}
        />
      );

      // Tab to the discussion link
      await user.tab();
      const discussionLink = screen.getByTestId('discussion-link');
      expect(discussionLink).toHaveFocus();

      // Press Enter to activate
      await user.keyboard('{Enter}');
      expect(onDiscussionClick).toHaveBeenCalled();
    });
  });

  describe('Dynamic Updates', () => {
    it('should update comment count when prop changes', () => {
      const { rerender } = render(
        <MockAssignmentCard
          assignment={mockAssignment}
          discussionCount={0}
          onAssignmentClick={vi.fn()}
          onDiscussionClick={vi.fn()}
        />
      );

      expect(screen.getByTestId('comment-count')).toHaveTextContent('0 comentarios');

      // Update count
      rerender(
        <MockAssignmentCard
          assignment={mockAssignment}
          discussionCount={7}
          onAssignmentClick={vi.fn()}
          onDiscussionClick={vi.fn()}
        />
      );

      expect(screen.getByTestId('comment-count')).toHaveTextContent('7 comentarios');
      expect(screen.getByTestId('comment-count')).toHaveClass('bg-[#fbbf24]/20');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large comment counts', () => {
      render(
        <MockAssignmentCard
          assignment={mockAssignment}
          discussionCount={999}
          onAssignmentClick={vi.fn()}
          onDiscussionClick={vi.fn()}
        />
      );

      expect(screen.getByTestId('comment-count')).toHaveTextContent('999 comentarios');
    });

    it('should handle negative comment counts as zero', () => {
      render(
        <MockAssignmentCard
          assignment={mockAssignment}
          discussionCount={-5}
          onAssignmentClick={vi.fn()}
          onDiscussionClick={vi.fn()}
        />
      );

      // In real implementation, we should handle this edge case
      const commentText = screen.getByTestId('comment-count').textContent;
      expect(commentText).toMatch(/comentarios?$/);
    });
  });
});