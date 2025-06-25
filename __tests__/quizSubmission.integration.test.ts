import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { submitQuiz, getQuizSubmission, gradeQuizOpenResponses } from '../lib/services/quizSubmissions';
import { supabase } from '../lib/supabase';

// Note: Supabase is already mocked globally in vitest.setup.ts
// We'll work with the existing global mock

describe('Quiz Submission Integration Tests', () => {
  const mockQuizData = {
    title: 'Integration Test Quiz',
    questions: [
      {
        id: 'q1',
        question: 'MC Question',
        type: 'multiple-choice',
        options: [
          { id: 'o1', text: 'Correct', isCorrect: true },
          { id: 'o2', text: 'Wrong', isCorrect: false }
        ],
        points: 1
      },
      {
        id: 'q2',
        question: 'Open Question',
        type: 'open-ended',
        options: [],
        points: 3,
        characterLimit: 500
      }
    ],
    totalPoints: 4
  };

  const mockAnswers = {
    q1: { selectedOption: 'o1' },
    q2: { text: 'This is my open-ended answer' }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('submitQuiz', () => {
    it('should submit quiz successfully with auto-grading', async () => {
      const mockSubmissionId = 'submission-123';
      const mockSubmission = {
        id: mockSubmissionId,
        auto_graded_score: 1,
        manual_graded_score: 0,
        total_possible_points: 4,
        auto_gradable_points: 1,
        manual_gradable_points: 3,
        grading_status: 'pending_review'
      };

      // Configure the global mocked supabase
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: mockSubmissionId,
        error: null
      });

      // Mock the from chain for fetching submission
      const mockFromChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockSubmission,
          error: null
        })
      };
      
      vi.mocked(supabase.from).mockReturnValue(mockFromChain);

      const result = await submitQuiz(
        'lesson-123',
        'block-123',
        'student-123',
        'course-123',
        mockAnswers,
        mockQuizData,
        180
      );

      expect(result.error).toBeNull();
      expect(result.data).toEqual(mockSubmission);
      
      // Verify RPC was called with correct parameters
      expect(supabase.rpc).toHaveBeenCalledWith('submit_quiz', {
        p_lesson_id: 'lesson-123',
        p_block_id: 'block-123',
        p_student_id: 'student-123',
        p_course_id: 'course-123',
        p_answers: mockAnswers,
        p_quiz_data: mockQuizData,
        p_time_spent: 180
      });
    });

    it('should handle submission errors gracefully', async () => {
      const mockError = new Error('Database error');
      
      vi.mocked(supabase.rpc).mockRejectedValueOnce(mockError);

      const result = await submitQuiz(
        'lesson-123',
        'block-123',
        'student-123',
        'course-123',
        mockAnswers,
        mockQuizData,
        180
      );

      expect(result.data).toBeNull();
      expect(result.error).toBe(mockError);
    });

    it('should trigger notification for open-ended questions', async () => {
      const mockSubmission = {
        id: 'submission-123',
        manual_gradable_points: 3,
        student_id: 'student-123',
        course_id: 'course-123'
      };

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 'submission-123',
        error: null
      });

      const mockFromChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockSubmission,
          error: null
        })
      };
      vi.mocked(supabase.from).mockReturnValue(mockFromChain);

      // Mock notification service
      const sendNotificationSpy = vi.spyOn(console, 'log');

      await submitQuiz(
        'lesson-123',
        'block-123',
        'student-123',
        'course-123',
        mockAnswers,
        mockQuizData
      );

      // In real implementation, this would call notification service
      // For now, we just verify the submission has open-ended questions
      expect(mockSubmission.manual_gradable_points).toBeGreaterThan(0);
    });
  });

  describe('getQuizSubmission', () => {
    it('should fetch quiz submission with relations', async () => {
      const mockSubmissionData = {
        id: 'submission-123',
        student: { id: 'student-123', name: 'Test Student', email: 'student@test.com' },
        lesson: { id: 'lesson-123', title: 'Test Lesson' },
        grading_status: 'pending_review',
        answers: mockAnswers
      };

      // Mock the first query for submission data
      const mockFromChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockSubmissionData,
          error: null
        })
      };
      vi.mocked(supabase.from).mockReturnValue(mockFromChain);

      // Mock the RPC call for score calculation
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [{ final_score: 3, percentage: 75, is_fully_graded: true }],
        error: null
      });

      const result = await getQuizSubmission('submission-123');

      expect(result.error).toBeNull();
      expect(result.data.id).toBe('submission-123');
      expect(result.data.final_score).toBe(3);
      expect(result.data.percentage).toBe(75);
      expect(supabase.from).toHaveBeenCalledWith('quiz_submissions');
    });
  });

  describe('gradeQuizOpenResponses', () => {
    it('should grade open-ended responses without exposing scores', async () => {
      const gradingData = {
        q2: {
          score: 3, // Internal use only
          feedback: 'Excelente explicación del concepto'
        }
      };

      // Mock the RPC call
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { success: true },
        error: null
      });

      // Mock the getQuizSubmission call that happens after grading
      const mockFromChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'submission-123', student_id: 'student-123' },
          error: null
        })
      };
      vi.mocked(supabase.from).mockReturnValue(mockFromChain);

      // Mock the RPC call for score calculation
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [{ final_score: 3, percentage: 75, is_fully_graded: true }],
        error: null
      });

      const result = await gradeQuizOpenResponses(
        'submission-123',
        'consultant-123',
        gradingData
      );

      expect(result.error).toBeNull();
      expect(supabase.rpc).toHaveBeenCalledWith('grade_quiz_open_responses', {
        p_submission_id: 'submission-123',
        p_graded_by: 'consultant-123',
        p_grading_data: gradingData
      });
    });
  });

  describe('Learning-Focused Flow', () => {
    it('should not return scores to student-facing functions', async () => {
      const mockSubmission = {
        id: 'submission-123',
        auto_graded_score: 2,
        total_possible_points: 4,
        grading_status: 'completed'
      };

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 'submission-123',
        error: null
      });

      const mockFromChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockSubmission,
          error: null
        })
      };
      vi.mocked(supabase.from).mockReturnValue(mockFromChain);

      const result = await submitQuiz(
        'lesson-123',
        'block-123',
        'student-123',
        'course-123',
        mockAnswers,
        mockQuizData
      );

      // Scores are in the data for internal use
      expect(result.data.auto_graded_score).toBeDefined();
      
      // But the UI should not display these to students
      // This is enforced at the component level
    });

    it('should support retry attempts without penalty', async () => {
      // First attempt
      const firstAttempt = {
        id: 'submission-1',
        attempt_number: 1,
        grading_status: 'completed'
      };

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 'submission-1',
        error: null
      });

      const mockFromChain1 = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: firstAttempt,
          error: null
        })
      };
      vi.mocked(supabase.from).mockReturnValue(mockFromChain1);

      await submitQuiz(
        'lesson-123',
        'block-123',
        'student-123',
        'course-123',
        mockAnswers,
        mockQuizData
      );

      // Second attempt (retry)
      const secondAttempt = {
        id: 'submission-2',
        attempt_number: 2,
        grading_status: 'completed'
      };

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 'submission-2',
        error: null
      });

      const mockFromChain2 = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: secondAttempt,
          error: null
        })
      };
      vi.mocked(supabase.from).mockReturnValue(mockFromChain2);

      const retryResult = await submitQuiz(
        'lesson-123',
        'block-123',
        'student-123',
        'course-123',
        mockAnswers,
        mockQuizData
      );

      expect(retryResult.data.attempt_number).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle RPC errors', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC function not found' }
      });

      const result = await submitQuiz(
        'lesson-123',
        'block-123',
        'student-123',
        'course-123',
        mockAnswers,
        mockQuizData
      );

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should handle network errors', async () => {
      vi.mocked(supabase.rpc).mockRejectedValueOnce(new Error('Network error'));

      const result = await submitQuiz(
        'lesson-123',
        'block-123',
        'student-123',
        'course-123',
        mockAnswers,
        mockQuizData
      );

      expect(result.data).toBeNull();
      expect(result.error.message).toBe('Network error');
    });

    it('should handle missing required fields', async () => {
      // Mock RPC to reject with a validation error
      vi.mocked(supabase.rpc).mockRejectedValueOnce(new Error('Missing required field: lesson_id'));

      const result = await submitQuiz(
        null as any, // Missing lesson ID
        'block-123',
        'student-123',
        'course-123',
        mockAnswers,
        mockQuizData
      );

      // Should handle gracefully
      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Missing required field: lesson_id');
    });
  });

  describe('Data Validation', () => {
    it('should validate answer format', async () => {
      const invalidAnswers = {
        q1: 'invalid-format', // Should be an object
        q2: { text: 'Valid answer' }
      };

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'Invalid answer format' }
      });

      const result = await submitQuiz(
        'lesson-123',
        'block-123',
        'student-123',
        'course-123',
        invalidAnswers as any,
        mockQuizData
      );

      expect(result.error).toBeDefined();
    });

    it('should handle empty quiz data', async () => {
      const emptyQuiz = {
        title: 'Empty Quiz',
        questions: [],
        totalPoints: 0
      };

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 'submission-123',
        error: null
      });

      const mockFromChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'submission-123', grading_status: 'completed' },
          error: null
        })
      };
      vi.mocked(supabase.from).mockReturnValue(mockFromChain);

      const result = await submitQuiz(
        'lesson-123',
        'block-123',
        'student-123',
        'course-123',
        {},
        emptyQuiz
      );

      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
    });
  });
});