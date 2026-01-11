import React, { useState, useEffect } from 'react';
import { QuizBlockPayload, QuizQuestion } from '@/types/blocks';
import { CheckCircle, XCircle, Clock, AlertCircle, Send } from 'lucide-react';
import { submitQuiz } from '@/lib/services/quizSubmissions';
import { toast } from 'react-hot-toast';
import { useSupabaseClient } from '@supabase/auth-helpers-react';

interface QuizTakerProps {
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

export default function QuizTaker({
  quiz,
  blockId,
  lessonId,
  courseId,
  studentId,
  onComplete
}: QuizTakerProps) {
  const supabase = useSupabaseClient();
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeSpent, setTimeSpent] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [submission, setSubmission] = useState<any>(null);
  
  const questions = quiz.randomizeQuestions 
    ? [...quiz.questions].sort(() => Math.random() - 0.5) 
    : quiz.questions;
  
  const currentQuestion = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  
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
    
    setIsSubmitting(true);
    
    try {
      // Format answers for submission
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
      
      setSubmission(data);
      setShowResults(true);
      
      if (onComplete) {
        onComplete(data);
      }
      
      // Show appropriate message based on whether manual grading is needed
      if (data.manual_gradable_points > 0) {
        toast.success(`Quiz enviado. Puntuación parcial: ${data.auto_graded_score}/${data.auto_gradable_points}. Las preguntas abiertas serán revisadas por tu profesor.`);
      } else {
        toast.success(`Quiz completado. Puntuación: ${data.auto_graded_score}/${data.total_possible_points}`);
      }
    } catch (error) {
      console.error('Error submitting quiz:', error);
      toast.error('Error al enviar el quiz. Por favor intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const renderQuestion = (question: QuizQuestion) => {
    const answer = answers[question.id];
    const options = quiz.randomizeAnswers && question.type !== 'open-ended'
      ? [...question.options].sort(() => Math.random() - 0.5)
      : question.options;
    
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
            <p className="text-sm text-gray-500">
              {question.points} {question.points === 1 ? 'punto' : 'puntos'}
            </p>
          </div>
        </div>
        
        {question.type === 'open-ended' ? (
          <div className="mt-4">
            <textarea
              value={answer?.text || ''}
              onChange={(e) => handleTextAnswer(question.id, e.target.value)}
              placeholder="Escribe tu respuesta aquí..."
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              rows={6}
              maxLength={question.characterLimit}
            />
            {question.characterLimit && (
              <p className="text-sm text-gray-500 mt-1">
                {answer?.text?.length || 0} / {question.characterLimit} caracteres
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {options.map((option, index) => (
              <label
                key={option.id}
                className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                  answer?.selectedOption === option.id
                    ? 'border-brand_primary bg-brand_accent/10'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={option.id}
                  checked={answer?.selectedOption === option.id}
                  onChange={() => handleOptionSelect(question.id, option.id)}
                  className="sr-only"
                />
                <div className="flex items-center gap-3 flex-1">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    answer?.selectedOption === option.id
                      ? 'border-brand_blue bg-brand_blue'
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
  
  const renderResults = () => {
    if (!submission || !showResults) return null;
    
    const hasOpenQuestions = submission.manual_gradable_points > 0;
    const percentage = submission.total_possible_points > 0
      ? (submission.auto_graded_score / submission.auto_gradable_points) * 100
      : 0;
    
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Quiz Completado
          </h2>
          {hasOpenQuestions ? (
            <div className="space-y-2">
              <p className="text-lg text-gray-600">
                Puntuación parcial: <span className="font-semibold">{submission.auto_graded_score}/{submission.auto_gradable_points}</span>
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
                <AlertCircle className="w-5 h-5 text-yellow-600 inline-block mr-2" />
                <p className="text-sm text-yellow-800 inline">
                  Este quiz contiene {submission.manual_gradable_points} puntos en preguntas abiertas que serán revisadas por tu profesor.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-lg text-gray-600">
                Puntuación final: <span className="font-semibold">{submission.auto_graded_score}/{submission.total_possible_points}</span>
              </p>
              <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
                percentage >= 70 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {percentage.toFixed(1)}%
              </div>
            </div>
          )}
        </div>
        
        <div className="flex justify-center mt-6">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-brand_blue text-white rounded-md hover:bg-brand_gray_dark transition"
          >
            Volver a la lección
          </button>
        </div>
      </div>
    );
  };
  
  if (showResults) {
    return renderResults();
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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              <span>{Math.floor(timeSpent / 60)}:{(timeSpent % 60).toString().padStart(2, '0')}</span>
            </div>
            <div className="bg-white/20 px-3 py-1 rounded-full text-sm">
              {quiz.totalPoints} puntos totales
            </div>
          </div>
        </div>
      </div>
      
      {/* Question Content */}
      <div className="p-6">
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
          {questions.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentQuestionIndex(index)}
              className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                index === currentQuestionIndex
                  ? 'bg-brand_primary text-white'
                  : answers[questions[index].id]
                    ? 'bg-brand_accent/20 text-brand_accent_hover'
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
            disabled={isSubmitting}
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