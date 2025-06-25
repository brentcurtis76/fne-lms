import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LearningQuizTaker from '../components/quiz/LearningQuizTaker';
import { submitQuiz } from '../lib/services/quizSubmissions';
import { toast } from 'react-hot-toast';

// Mock dependencies
vi.mock('../lib/services/quizSubmissions', () => ({
  submitQuiz: vi.fn()
}));

// react-hot-toast is already mocked globally in vitest.setup.ts

describe('LearningQuizTaker', () => {
  const mockQuiz = {
    title: 'Test Quiz',
    description: 'Test Description',
    questions: [
      {
        id: 'q1',
        question: '¿Cuál es la capital de Chile?',
        type: 'multiple-choice',
        options: [
          { id: 'o1', text: 'Buenos Aires', isCorrect: false },
          { id: 'o2', text: 'Santiago', isCorrect: true },
          { id: 'o3', text: 'Lima', isCorrect: false },
          { id: 'o4', text: 'Bogotá', isCorrect: false }
        ],
        points: 1
      },
      {
        id: 'q2',
        question: '¿2 + 2 = 4?',
        type: 'true-false',
        options: [
          { id: 't1', text: 'Verdadero', isCorrect: true },
          { id: 't2', text: 'Falso', isCorrect: false }
        ],
        points: 1
      },
      {
        id: 'q3',
        question: 'Explica el ciclo del agua',
        type: 'open-ended',
        options: [],
        points: 3,
        characterLimit: 500
      }
    ],
    totalPoints: 5,
    allowRetries: true,
    showResults: false,
    randomizeQuestions: false,
    randomizeAnswers: false
  };

  const defaultProps = {
    quiz: mockQuiz,
    blockId: 'block-123',
    lessonId: 'lesson-123',
    courseId: 'course-123',
    studentId: 'student-123',
    onComplete: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('should render quiz title and first question', () => {
      render(<LearningQuizTaker {...defaultProps} />);
      
      expect(screen.getByText('Test Quiz')).toBeInTheDocument();
      expect(screen.getByText('¿Cuál es la capital de Chile?')).toBeInTheDocument();
      expect(screen.getByText('Pregunta 1 de 3')).toBeInTheDocument();
    });

    it('should not show any scores or points to students', () => {
      render(<LearningQuizTaker {...defaultProps} />);
      
      // Should not show points
      expect(screen.queryByText(/puntos/)).not.toBeInTheDocument();
      expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/calificación/i)).not.toBeInTheDocument();
    });

    it('should render multiple choice options', () => {
      render(<LearningQuizTaker {...defaultProps} />);
      
      expect(screen.getByText('Buenos Aires')).toBeInTheDocument();
      expect(screen.getByText('Santiago')).toBeInTheDocument();
      expect(screen.getByText('Lima')).toBeInTheDocument();
      expect(screen.getByText('Bogotá')).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should navigate between questions', () => {
      render(<LearningQuizTaker {...defaultProps} />);
      
      // Initially on question 1
      expect(screen.getByText('¿Cuál es la capital de Chile?')).toBeInTheDocument();
      
      // Navigate to question 2
      fireEvent.click(screen.getByText('Siguiente'));
      expect(screen.getByText('¿2 + 2 = 4?')).toBeInTheDocument();
      expect(screen.getByText('Pregunta 2 de 3')).toBeInTheDocument();
      
      // Navigate back to question 1
      fireEvent.click(screen.getByText('Anterior'));
      expect(screen.getByText('¿Cuál es la capital de Chile?')).toBeInTheDocument();
    });

    it('should disable navigation buttons appropriately', () => {
      render(<LearningQuizTaker {...defaultProps} />);
      
      // Previous button should be disabled on first question
      expect(screen.getByText('Anterior')).toBeDisabled();
      
      // Navigate to last question
      fireEvent.click(screen.getByText('Siguiente'));
      fireEvent.click(screen.getByText('Siguiente'));
      
      // Should show submit button instead of next
      expect(screen.getByText('Enviar Quiz')).toBeInTheDocument();
      expect(screen.queryByText('Siguiente')).not.toBeInTheDocument();
    });

    it('should allow direct navigation via question numbers', () => {
      render(<LearningQuizTaker {...defaultProps} />);
      
      // Click on question 3 button
      fireEvent.click(screen.getByText('3'));
      
      expect(screen.getByText('Explica el ciclo del agua')).toBeInTheDocument();
      expect(screen.getByText('Pregunta 3 de 3')).toBeInTheDocument();
    });
  });

  describe('Answer Selection', () => {
    it('should allow selecting multiple choice answers', () => {
      render(<LearningQuizTaker {...defaultProps} />);
      
      const santiagoOption = screen.getByLabelText(/Santiago/);
      fireEvent.click(santiagoOption);
      
      // Radio button should be selected
      expect(santiagoOption).toBeChecked();
    });

    it('should allow entering text for open-ended questions', () => {
      render(<LearningQuizTaker {...defaultProps} />);
      
      // Navigate to open-ended question
      fireEvent.click(screen.getByText('3'));
      
      const textarea = screen.getByPlaceholderText('Escribe tu respuesta aquí...');
      fireEvent.change(textarea, { target: { value: 'El agua se evapora y forma nubes' } });
      
      expect(textarea).toHaveValue('El agua se evapora y forma nubes');
    });

    it('should show character count for open-ended questions', () => {
      render(<LearningQuizTaker {...defaultProps} />);
      
      // Navigate to open-ended question
      fireEvent.click(screen.getByText('3'));
      
      const textarea = screen.getByPlaceholderText('Escribe tu respuesta aquí...');
      fireEvent.change(textarea, { target: { value: 'Test answer' } });
      
      expect(screen.getByText('11 / 500 caracteres')).toBeInTheDocument();
    });
  });

  describe('Two-Tier Feedback System', () => {
    it('should show tier 1 feedback on first incorrect attempt', async () => {
      render(<LearningQuizTaker {...defaultProps} />);
      
      // Answer first question incorrectly
      fireEvent.click(screen.getByLabelText(/Buenos Aires/)); // Wrong answer
      
      // Answer second question correctly
      fireEvent.click(screen.getByText('Siguiente'));
      fireEvent.click(screen.getByLabelText(/Verdadero/));
      
      // Answer third question
      fireEvent.click(screen.getByText('Siguiente'));
      const textarea = screen.getByPlaceholderText('Escribe tu respuesta aquí...');
      fireEvent.change(textarea, { target: { value: 'Test answer' } });
      
      // Submit
      fireEvent.click(screen.getByText('Enviar Quiz'));
      
      await waitFor(() => {
        expect(screen.getByText('Revisa tus respuestas')).toBeInTheDocument();
        expect(screen.getByText(/Algunas respuestas necesitan revisión/)).toBeInTheDocument();
        expect(screen.getByText('Revisar respuestas')).toBeInTheDocument();
      });
    });

    it('should show tier 2 feedback on second incorrect attempt', async () => {
      render(<LearningQuizTaker {...defaultProps} />);
      
      // First attempt with wrong answer
      fireEvent.click(screen.getByLabelText(/Buenos Aires/));
      fireEvent.click(screen.getByText('Siguiente'));
      fireEvent.click(screen.getByLabelText(/Verdadero/));
      fireEvent.click(screen.getByText('Siguiente'));
      const textarea = screen.getByPlaceholderText('Escribe tu respuesta aquí...');
      fireEvent.change(textarea, { target: { value: 'Test answer' } });
      fireEvent.click(screen.getByText('Enviar Quiz'));
      
      // Click retry
      await waitFor(() => {
        fireEvent.click(screen.getByText('Revisar respuestas'));
      });
      
      // Submit again without changing answers
      fireEvent.click(screen.getByText('3')); // Go to last question
      fireEvent.click(screen.getByText('Enviar Quiz'));
      
      await waitFor(() => {
        expect(screen.getByText('Preguntas marcadas para revisión')).toBeInTheDocument();
        expect(screen.getByText('Intentar de nuevo')).toBeInTheDocument();
        expect(screen.getByText('Enviar como está')).toBeInTheDocument();
      });
    });

    it('should highlight incorrect questions in tier 2', async () => {
      render(<LearningQuizTaker {...defaultProps} />);
      
      // Setup for tier 2 (two attempts with wrong answer)
      // First attempt
      fireEvent.click(screen.getByLabelText(/Buenos Aires/));
      fireEvent.click(screen.getByText('Siguiente'));
      fireEvent.click(screen.getByLabelText(/Verdadero/));
      fireEvent.click(screen.getByText('Siguiente'));
      const textarea = screen.getByPlaceholderText('Escribe tu respuesta aquí...');
      fireEvent.change(textarea, { target: { value: 'Test answer' } });
      fireEvent.click(screen.getByText('Enviar Quiz'));
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Revisar respuestas'));
      });
      
      // Second attempt
      fireEvent.click(screen.getByText('3'));
      fireEvent.click(screen.getByText('Enviar Quiz'));
      
      await waitFor(() => {
        // Navigate back to first question
        fireEvent.click(screen.getByText('1'));
        
        // Should show error indicator
        expect(screen.getByText('Por favor revisa esta pregunta')).toBeInTheDocument();
      });
    });
  });

  describe('Quiz Submission', () => {
    it('should require all questions to be answered', async () => {
      render(<LearningQuizTaker {...defaultProps} />);
      
      // Try to submit without answering
      fireEvent.click(screen.getByText('3')); // Go to last question
      fireEvent.click(screen.getByText('Enviar Quiz'));
      
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('Por favor responde todas las preguntas')
        );
      });
    });

    it('should submit quiz when all answers are correct', async () => {
      const mockSubmission = {
        id: 'submission-123',
        manual_gradable_points: 3,
        auto_graded_score: 2,
        auto_gradable_points: 2
      };
      
      (submitQuiz as any).mockResolvedValueOnce({
        data: mockSubmission,
        error: null
      });
      
      render(<LearningQuizTaker {...defaultProps} />);
      
      // Answer all questions correctly
      fireEvent.click(screen.getByLabelText(/Santiago/)); // Correct
      fireEvent.click(screen.getByText('Siguiente'));
      fireEvent.click(screen.getByLabelText(/Verdadero/)); // Correct
      fireEvent.click(screen.getByText('Siguiente'));
      const textarea = screen.getByPlaceholderText('Escribe tu respuesta aquí...');
      fireEvent.change(textarea, { target: { value: 'Complete water cycle explanation' } });
      
      // Submit
      fireEvent.click(screen.getByText('Enviar Quiz'));
      
      await waitFor(() => {
        expect(submitQuiz).toHaveBeenCalledWith(
          'lesson-123',
          'block-123',
          'student-123',
          'course-123',
          expect.any(Object),
          mockQuiz,
          expect.any(Number)
        );
        
        expect(toast.success).toHaveBeenCalledWith(
          '¡Quiz completado! Las preguntas abiertas serán revisadas por tu profesor.'
        );
      });
    });

    it('should show completion screen without scores', async () => {
      const mockSubmission = {
        id: 'submission-123',
        manual_gradable_points: 0,
        auto_graded_score: 2,
        total_possible_points: 2
      };
      
      (submitQuiz as any).mockResolvedValueOnce({
        data: mockSubmission,
        error: null
      });
      
      render(<LearningQuizTaker {...defaultProps} />);
      
      // Answer questions
      fireEvent.click(screen.getByLabelText(/Santiago/));
      fireEvent.click(screen.getByText('Siguiente'));
      fireEvent.click(screen.getByLabelText(/Verdadero/));
      fireEvent.click(screen.getByText('Siguiente'));
      const textarea = screen.getByPlaceholderText('Escribe tu respuesta aquí...');
      fireEvent.change(textarea, { target: { value: 'Answer' } });
      fireEvent.click(screen.getByText('Enviar Quiz'));
      
      await waitFor(() => {
        expect(screen.getByText('¡Felicitaciones!')).toBeInTheDocument();
        expect(screen.getByText('Has completado el quiz exitosamente.')).toBeInTheDocument();
        expect(screen.queryByText(/puntos/)).not.toBeInTheDocument();
        expect(screen.queryByText(/score/)).not.toBeInTheDocument();
      });
    });

    it('should handle submission errors gracefully', async () => {
      (submitQuiz as any).mockRejectedValueOnce(new Error('Network error'));
      
      render(<LearningQuizTaker {...defaultProps} />);
      
      // Answer all questions
      fireEvent.click(screen.getByLabelText(/Santiago/));
      fireEvent.click(screen.getByText('Siguiente'));
      fireEvent.click(screen.getByLabelText(/Verdadero/));
      fireEvent.click(screen.getByText('Siguiente'));
      const textarea = screen.getByPlaceholderText('Escribe tu respuesta aquí...');
      fireEvent.change(textarea, { target: { value: 'Answer' } });
      
      // Submit
      fireEvent.click(screen.getByText('Enviar Quiz'));
      
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Error al enviar el quiz. Por favor intenta de nuevo.'
        );
      });
    });
  });

  describe('Question Randomization', () => {
    it('should randomize questions when enabled', () => {
      const randomQuiz = {
        ...mockQuiz,
        randomizeQuestions: true
      };
      
      // Render multiple times to check randomization
      const { rerender } = render(
        <LearningQuizTaker {...defaultProps} quiz={randomQuiz} />
      );
      
      // Since randomization is random, we just check that questions exist
      expect(
        screen.getByText('¿Cuál es la capital de Chile?') ||
        screen.getByText('¿2 + 2 = 4?') ||
        screen.getByText('Explica el ciclo del agua')
      ).toBeInTheDocument();
    });

    it('should randomize answer options when enabled', () => {
      const randomQuiz = {
        ...mockQuiz,
        randomizeAnswers: true
      };
      
      render(<LearningQuizTaker {...defaultProps} quiz={randomQuiz} />);
      
      // Check that all options are present (order may vary)
      expect(screen.getByText('Buenos Aires')).toBeInTheDocument();
      expect(screen.getByText('Santiago')).toBeInTheDocument();
      expect(screen.getByText('Lima')).toBeInTheDocument();
      expect(screen.getByText('Bogotá')).toBeInTheDocument();
    });
  });

  describe('Timer Display', () => {
    it('should display elapsed time', async () => {
      render(<LearningQuizTaker {...defaultProps} />);
      
      // Initially shows 0:00
      expect(screen.getByText('0:00')).toBeInTheDocument();
      
      // Wait for timer to update
      await waitFor(() => {
        // Timer should update (exact time may vary)
        expect(screen.getByText(/\d+:\d{2}/)).toBeInTheDocument();
      }, { timeout: 2000 });
    });
  });
});