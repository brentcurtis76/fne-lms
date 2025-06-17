import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import StudentBlockRenderer from '../components/student/StudentBlockRenderer';

// Mock the LearningQuizTaker component
vi.mock('../components/quiz/LearningQuizTaker', () => ({
  default: vi.fn(({ quiz, onComplete }) => (
    <div data-testid="learning-quiz-taker">
      <h3>{quiz.title}</h3>
      <button onClick={() => onComplete({ quizCompleted: true })}>
        Complete Quiz
      </button>
    </div>
  ))
}));

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn()
    }
  }
}));

describe('StudentBlockRenderer - Quiz Block', () => {
  const mockOnComplete = vi.fn();
  const mockOnProgressUpdate = vi.fn();

  const quizBlock = {
    id: 'quiz-block-1',
    type: 'quiz',
    payload: {
      title: 'Test Quiz',
      description: 'A test quiz',
      questions: [
        {
          id: 'q1',
          question: 'Test question?',
          type: 'multiple-choice',
          options: [
            { id: 'o1', text: 'Option 1', isCorrect: true },
            { id: 'o2', text: 'Option 2', isCorrect: false }
          ],
          points: 1
        }
      ],
      totalPoints: 1,
      allowRetries: true,
      showResults: false
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Quiz Rendering with Required Props', () => {
    it('should render LearningQuizTaker when all required props are provided', () => {
      render(
        <StudentBlockRenderer
          block={quizBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
          isAdmin={false}
          lessonId="lesson-123"
          courseId="course-123"
          studentId="student-123"
        />
      );

      expect(screen.getByTestId('learning-quiz-taker')).toBeInTheDocument();
      expect(screen.getByText('Test Quiz')).toBeInTheDocument();
    });

    it('should pass correct props to LearningQuizTaker', () => {
      const LearningQuizTaker = vi.requireMock('../components/quiz/LearningQuizTaker').default;
      
      render(
        <StudentBlockRenderer
          block={quizBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
          isAdmin={false}
          lessonId="lesson-123"
          courseId="course-123"
          studentId="student-123"
        />
      );

      expect(LearningQuizTaker).toHaveBeenCalledWith(
        expect.objectContaining({
          quiz: quizBlock.payload,
          blockId: 'quiz-block-1',
          lessonId: 'lesson-123',
          courseId: 'course-123',
          studentId: 'student-123',
          onComplete: expect.any(Function)
        }),
        expect.any(Object)
      );
    });

    it('should show fallback message when required props are missing', () => {
      render(
        <StudentBlockRenderer
          block={quizBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
          isAdmin={false}
          // Missing lessonId, courseId, studentId
        />
      );

      expect(screen.queryByTestId('learning-quiz-taker')).not.toBeInTheDocument();
      expect(screen.getByText('Test Quiz')).toBeInTheDocument();
      expect(screen.getByText(/El sistema de quiz está siendo actualizado/)).toBeInTheDocument();
    });

    it('should show fallback when lessonId is missing', () => {
      render(
        <StudentBlockRenderer
          block={quizBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
          isAdmin={false}
          courseId="course-123"
          studentId="student-123"
          // Missing lessonId
        />
      );

      expect(screen.queryByTestId('learning-quiz-taker')).not.toBeInTheDocument();
      expect(screen.getByText(/El sistema de quiz está siendo actualizado/)).toBeInTheDocument();
    });

    it('should show fallback when courseId is missing', () => {
      render(
        <StudentBlockRenderer
          block={quizBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
          isAdmin={false}
          lessonId="lesson-123"
          studentId="student-123"
          // Missing courseId
        />
      );

      expect(screen.queryByTestId('learning-quiz-taker')).not.toBeInTheDocument();
      expect(screen.getByText(/El sistema de quiz está siendo actualizado/)).toBeInTheDocument();
    });

    it('should show fallback when studentId is missing', () => {
      render(
        <StudentBlockRenderer
          block={quizBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
          isAdmin={false}
          lessonId="lesson-123"
          courseId="course-123"
          // Missing studentId
        />
      );

      expect(screen.queryByTestId('learning-quiz-taker')).not.toBeInTheDocument();
      expect(screen.getByText(/El sistema de quiz está siendo actualizado/)).toBeInTheDocument();
    });
  });

  describe('Quiz Completion Handling', () => {
    it('should call onComplete with correct data when quiz is completed', () => {
      render(
        <StudentBlockRenderer
          block={quizBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
          isAdmin={false}
          lessonId="lesson-123"
          courseId="course-123"
          studentId="student-123"
        />
      );

      // Simulate quiz completion
      const completeButton = screen.getByText('Complete Quiz');
      completeButton.click();

      expect(mockOnComplete).toHaveBeenCalledWith({
        quizCompleted: true,
        submissionId: undefined,
        hasOpenEndedQuestions: undefined
      });
    });

    it('should not show scores in completion data', () => {
      render(
        <StudentBlockRenderer
          block={quizBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
          isAdmin={false}
          lessonId="lesson-123"
          courseId="course-123"
          studentId="student-123"
        />
      );

      const completeButton = screen.getByText('Complete Quiz');
      completeButton.click();

      // Verify that no score data is passed
      expect(mockOnComplete).toHaveBeenCalledWith(
        expect.not.objectContaining({
          score: expect.any(Number),
          correctAnswers: expect.any(Number),
          totalQuestions: expect.any(Number)
        })
      );
    });

    it('should show completion status when quiz is already completed', () => {
      render(
        <StudentBlockRenderer
          block={quizBlock}
          isCompleted={true}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
          isAdmin={false}
          lessonId="lesson-123"
          courseId="course-123"
          studentId="student-123"
        />
      );

      // Component should still render normally
      expect(screen.getByTestId('learning-quiz-taker')).toBeInTheDocument();
    });
  });

  describe('Admin Mode', () => {
    it('should render quiz for admin users', () => {
      render(
        <StudentBlockRenderer
          block={quizBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
          isAdmin={true}
          lessonId="lesson-123"
          courseId="course-123"
          studentId="admin-123"
        />
      );

      expect(screen.getByTestId('learning-quiz-taker')).toBeInTheDocument();
      expect(screen.getByText('Test Quiz')).toBeInTheDocument();
    });
  });

  describe('Different Quiz Types', () => {
    it('should handle quiz with no title', () => {
      const noTitleQuiz = {
        ...quizBlock,
        payload: {
          ...quizBlock.payload,
          title: undefined
        }
      };

      render(
        <StudentBlockRenderer
          block={noTitleQuiz}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
          isAdmin={false}
          lessonId="lesson-123"
          courseId="course-123"
          studentId="student-123"
        />
      );

      expect(screen.getByTestId('learning-quiz-taker')).toBeInTheDocument();
    });

    it('should handle quiz with mixed question types', () => {
      const mixedQuiz = {
        ...quizBlock,
        payload: {
          ...quizBlock.payload,
          questions: [
            {
              id: 'q1',
              question: 'MC Question',
              type: 'multiple-choice',
              options: [{ id: 'o1', text: 'Option', isCorrect: true }],
              points: 1
            },
            {
              id: 'q2',
              question: 'TF Question',
              type: 'true-false',
              options: [
                { id: 't1', text: 'True', isCorrect: true },
                { id: 't2', text: 'False', isCorrect: false }
              ],
              points: 1
            },
            {
              id: 'q3',
              question: 'Open Question',
              type: 'open-ended',
              options: [],
              points: 3,
              characterLimit: 500
            }
          ]
        }
      };

      render(
        <StudentBlockRenderer
          block={mixedQuiz}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
          isAdmin={false}
          lessonId="lesson-123"
          courseId="course-123"
          studentId="student-123"
        />
      );

      expect(screen.getByTestId('learning-quiz-taker')).toBeInTheDocument();
    });
  });

  describe('Progress Tracking', () => {
    it('should track time spent on quiz', () => {
      vi.useFakeTimers();

      render(
        <StudentBlockRenderer
          block={quizBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
          isAdmin={false}
          lessonId="lesson-123"
          courseId="course-123"
          studentId="student-123"
        />
      );

      // Advance time by 1 second
      vi.advanceTimersByTime(1000);

      expect(mockOnProgressUpdate).toHaveBeenCalledWith({ timeSpent: 1 });

      vi.useRealTimers();
    });
  });
});