import React, { useState, useEffect } from 'react';
import { QuizBlockPayload, QuizQuestion } from '@/types/blocks';
import { Clock, AlertCircle, Send, RefreshCw, CheckCircle } from 'lucide-react';
import { submitQuiz } from '@/lib/services/quizSubmissions';
import { toast } from 'react-hot-toast';
import { useSupabaseClient } from '@supabase/auth-helpers-react';

interface LearningQuizTakerProps {
  quiz: QuizBlockPayload;
  blockId: string;
  lessonId: string;
  courseId: string;
  studentId: string;
  onComplete?: (submission: any) => void;
}

interface QuizAnswer {
  questionId: string;
  selectedOption?: string; // For MC/TF
  text?: string; // For open-ended
}

type AttemptStage = 'answering' | 'tier1-feedback' | 'tier2-feedback' | 'completed';

export default function LearningQuizTaker({
  quiz,
  blockId,
  lessonId,
  courseId,
  studentId,
  onComplete
}: LearningQuizTakerProps) {
  const supabase = useSupabaseClient();
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeSpent, setTimeSpent] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attemptStage, setAttemptStage] = useState<AttemptStage>('answering');
  const [incorrectQuestions, setIncorrectQuestions] = useState<Set<string>>(new Set());
  const [attemptCount, setAttemptCount] = useState(0);
  
  const questions = quiz.randomizeQuestions 
    ? [...quiz.questions].sort(() => Math.random() - 0.5) 
    : quiz.questions;
  
  const currentQuestion = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  
  // Separate MC/TF questions from open-ended
  const mcTfQuestions = questions.filter(q => q.type !== 'open-ended');
  const openEndedQuestions = questions.filter(q => q.type === 'open-ended');
  
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeSpent(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);
  
  const handleOptionSelect = (questionId: string, optionId: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        questionId,
        selectedOption: optionId
      }
    }));
  };
  
  const handleTextAnswer = (questionId: string, text: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        questionId,
        text
      }
    }));
  };
  
  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };
  
  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };
  
  const checkMcTfAnswers = () => {
    const incorrect = new Set<string>();
    
    mcTfQuestions.forEach(question => {
      const answer = answers[question.id];
      const correctOption = question.options.find(opt => opt.isCorrect);
      
      if (!answer?.selectedOption || answer.selectedOption !== correctOption?.id) {
        incorrect.add(question.id);
      }
    });
    
    return incorrect;
  };
  
  const handleSubmit = async () => {
    // Check if all questions are answered
    const unansweredQuestions = questions.filter(q => {
      const answer = answers[q.id];
      if (q.type === 'open-ended') {
        return !answer?.text?.trim();
      }
      return !answer?.selectedOption;
    });
    
    if (unansweredQuestions.length > 0) {
      toast.error(`Por favor responde todas las preguntas. Faltan ${unansweredQuestions.length} preguntas.`);
      return;
    }
    
    // Check MC/TF answers
    const incorrectMcTf = checkMcTfAnswers();
    setIncorrectQuestions(incorrectMcTf);
    setAttemptCount(prev => prev + 1);
    
    if (incorrectMcTf.size > 0 && attemptCount === 0) {
      // First attempt with errors - Tier 1 feedback
      setAttemptStage('tier1-feedback');
      return;
    } else if (incorrectMcTf.size > 0 && attemptCount === 1) {
      // Second attempt with errors - Tier 2 feedback
      setAttemptStage('tier2-feedback');
      return;
    }
    
    // All MC/TF correct or max attempts reached - submit to database
    setIsSubmitting(true);
    
    try {
      // Format answers for submission — RPC expects object keyed by questionId
      const formattedAnswers: Record<string, any> = {};
      Object.entries(answers).forEach(([questionId, answer]) => {
        if (answer.selectedOption) {
          formattedAnswers[questionId] = { selectedOption: answer.selectedOption };
        } else if (answer.text) {
          formattedAnswers[questionId] = { text: answer.text };
        }
      });
      
      const { data, error } = await submitQuiz(
        supabase,
        lessonId,
        blockId,
        studentId,
        courseId,
        formattedAnswers,
        quiz,
        timeSpent
      );
      
      if (error) throw error;
      
      setAttemptStage('completed');
      
      if (onComplete) {
        onComplete(data);
      }
      
      // Show success message without mentioning scores
      if (openEndedQuestions.length > 0) {
        toast.success('¡Quiz completado! Las preguntas abiertas serán revisadas por tu profesor.');
      } else {
        toast.success('¡Excelente! Has completado el quiz correctamente.');
      }
    } catch (error) {
      console.error('Quiz submission failed:', error, { lessonId, blockId, studentId, courseId });
      toast.error('Error al enviar el quiz. Por favor intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleRetry = () => {
    setAttemptStage('answering');
    // Jump to first incorrect question
    const firstIncorrectIndex = questions.findIndex(q => incorrectQuestions.has(q.id));
    if (firstIncorrectIndex !== -1) {
      setCurrentQuestionIndex(firstIncorrectIndex);
    }
  };
  
  const renderQuestion = (question: QuizQuestion) => {
    const answer = answers[question.id];
    const options = quiz.randomizeAnswers && question.type !== 'open-ended'
      ? [...question.options].sort(() => Math.random() - 0.5)
      : question.options;
    
    const showError = attemptStage === 'tier2-feedback' && incorrectQuestions.has(question.id);
    
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 bg-brand_blue text-white rounded-full flex items-center justify-center text-sm font-medium">
            {currentQuestionIndex + 1}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              {question.question}
            </h3>
            {showError && (
              <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                Por favor revisa esta pregunta
              </p>
            )}
          </div>
        </div>
        
        {question.type === 'open-ended' ? (
          <div className="mt-4">
            <textarea
              value={answer?.text || ''}
              onChange={(e) => handleTextAnswer(question.id, e.target.value)}
              placeholder="Escribe tu respuesta aquí..."
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent resize-none"
              rows={6}
              maxLength={question.characterLimit || 5000}
              disabled={false}
              autoComplete="off"
            />
            {question.characterLimit && (
              <p className="text-sm text-gray-500 mt-1">
                {answer?.text?.length || 0} / {question.characterLimit} caracteres
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {options.map((option) => (
              <label
                key={option.id}
                className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                  answer?.selectedOption === option.id
                    ? showError 
                      ? 'border-red-500 bg-red-50' 
                      : 'border-brand_blue bg-brand_accent/10'
                    : 'border-gray-200 hover:border-gray-300'
                } ${attemptStage !== 'answering' && question.type !== 'open-ended' ? 'cursor-not-allowed' : ''}`}
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={option.id}
                  checked={answer?.selectedOption === option.id}
                  onChange={() => handleOptionSelect(question.id, option.id)}
                  className="sr-only"
                  disabled={attemptStage !== 'answering'}
                />
                <div className="flex items-center gap-3 flex-1">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    answer?.selectedOption === option.id
                      ? showError
                        ? 'border-red-500 bg-red-500'
                        : 'border-brand_blue bg-brand_blue'
                      : 'border-gray-300'
                  }`}>
                    {answer?.selectedOption === option.id && (
                      <div className="w-2 h-2 bg-white rounded-full" />
                    )}
                  </div>
                  <span className="text-gray-900">{option.text}</span>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  };
  
  const renderFeedback = () => {
    if (attemptStage === 'tier1-feedback') {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-900 mb-2">
                Revisa tus respuestas
              </h3>
              <p className="text-yellow-800">
                Algunas respuestas necesitan revisión. Te recomendamos revisar el material de la lección 
                y volver a intentar las preguntas. El aprendizaje es un proceso, ¡sigue adelante!
              </p>
              <button
                onClick={handleRetry}
                className="mt-4 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Revisar respuestas
              </button>
            </div>
          </div>
        </div>
      );
    }
    
    if (attemptStage === 'tier2-feedback') {
      return (
        <div className="bg-brand_accent/10 border border-brand_accent/30 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-brand_accent flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-brand_primary mb-2">
                Preguntas marcadas para revisión
              </h3>
              <p className="text-brand_gray_dark">
                Hemos marcado las preguntas que necesitan más atención. Tómate tu tiempo para 
                revisar estas preguntas específicas. Puedes continuar cuando estés listo.
              </p>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleRetry}
                  className="px-4 py-2 bg-brand_primary text-white rounded-md hover:bg-brand_gray_dark flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Intentar de nuevo
                </button>
                <button
                  onClick={handleSubmit}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Enviar como está
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    return null;
  };
  
  const renderCompleted = () => {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            ¡Felicitaciones!
          </h2>
          <p className="text-lg text-gray-600 mb-6">
            Has completado el quiz exitosamente.
          </p>
          {openEndedQuestions.length > 0 && (
            <div className="bg-brand_accent/10 border border-brand_accent/30 rounded-lg p-4 mb-6 max-w-md mx-auto">
              <p className="text-sm text-brand_gray_dark">
                Las preguntas abiertas serán revisadas por tu profesor. 
                Recibirás retroalimentación pronto.
              </p>
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-brand_blue text-white rounded-md hover:bg-brand_gray_dark transition"
          >
            Continuar con la lección
          </button>
        </div>
      </div>
    );
  };
  
  if (attemptStage === 'completed') {
    return renderCompleted();
  }
  
  return (
    <div className="bg-white rounded-lg shadow-lg">
      {/* Quiz Header */}
      <div className="bg-brand_blue text-white p-6 rounded-t-lg">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold">{quiz.title}</h2>
            <p className="text-gray-300 mt-1">
              Pregunta {currentQuestionIndex + 1} de {questions.length}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            <span>{Math.floor(timeSpent / 60)}:{(timeSpent % 60).toString().padStart(2, '0')}</span>
          </div>
        </div>
      </div>
      
      {/* Description Section - NEW */}
      {quiz.description && (
        <div className="bg-gray-50 border-b border-gray-200 p-6">
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-2">Descripción</h3>
            <div className="text-gray-700 whitespace-pre-wrap">{quiz.description}</div>
          </div>
        </div>
      )}
      
      {/* Instructions Section - NEW */}
      {quiz.instructions && (
        <div className="bg-brand_accent/10 border-b border-brand_accent/30 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-brand_accent flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-brand_primary mb-2">Instrucciones</h3>
              <div className="text-brand_gray_dark whitespace-pre-wrap">{quiz.instructions}</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Feedback Section */}
      <div className="p-6 pb-0">
        {renderFeedback()}
      </div>
      
      {/* Question Content */}
      <div className="p-6 pt-0">
        {renderQuestion(currentQuestion)}
      </div>
      
      {/* Navigation */}
      <div className="border-t px-6 py-4 flex justify-between items-center">
        <button
          onClick={handlePrevious}
          disabled={currentQuestionIndex === 0}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Anterior
        </button>
        
        <div className="flex gap-2">
          {questions.map((q, index) => (
            <button
              key={index}
              onClick={() => setCurrentQuestionIndex(index)}
              className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                index === currentQuestionIndex
                  ? 'bg-brand_blue text-white'
                  : answers[questions[index].id]
                    ? attemptStage === 'tier2-feedback' && incorrectQuestions.has(q.id)
                      ? 'bg-red-100 text-red-800'
                      : 'bg-brand_accent/20 text-brand_accent_hover'
                    : 'bg-gray-100 text-gray-600'
              }`}
            >
              {index + 1}
            </button>
          ))}
        </div>
        
        {isLastQuestion ? (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || attemptStage !== 'answering'}
            className="px-6 py-2 bg-brand_blue text-white rounded-md hover:bg-brand_gray_dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>Enviando...</>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Enviar Quiz
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="px-4 py-2 bg-brand_blue text-white rounded-md hover:bg-brand_gray_dark"
          >
            Siguiente
          </button>
        )}
      </div>
    </div>
  );
}