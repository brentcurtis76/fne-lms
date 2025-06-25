import React, { useState } from 'react';
import { MessageSquare, Save, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

interface QuizReviewPanelProps {
  submission: any;
  onGradingComplete?: () => void;
}

interface QuestionFeedback {
  questionId: string;
  feedback: string;
}

export default function QuizReviewPanel({ submission, onGradingComplete }: QuizReviewPanelProps) {
  const [reviewStatus, setReviewStatus] = useState<'pass' | 'needs_review'>('pass');
  const [generalFeedback, setGeneralFeedback] = useState('');
  const [questionFeedback, setQuestionFeedback] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  
  // Initialize feedback data for open-ended questions
  React.useEffect(() => {
    if (submission?.open_responses) {
      const initialFeedback: Record<string, string> = {};
      submission.open_responses.forEach((response: any) => {
        initialFeedback[response.question_id] = '';
      });
      setQuestionFeedback(initialFeedback);
    }
  }, [submission]);
  
  const handleFeedbackChange = (questionId: string, feedback: string) => {
    setQuestionFeedback(prev => ({
      ...prev,
      [questionId]: feedback
    }));
  };
  
  const handleSubmitReview = async () => {
    if (!generalFeedback.trim() && reviewStatus === 'needs_review') {
      toast.error('Por favor proporciona retroalimentación general cuando el estudiante necesita revisar');
      return;
    }
    
    setIsSaving(true);
    
    try {
      // Prepare question feedback object
      const feedbackObject = Object.keys(questionFeedback).reduce((acc, key) => {
        if (questionFeedback[key].trim()) {
          acc[key] = questionFeedback[key];
        }
        return acc;
      }, {} as Record<string, string>);

      const { error } = await supabase.rpc('grade_quiz_feedback', {
        p_submission_id: submission.id,
        p_graded_by: submission.graded_by,
        p_review_status: reviewStatus,
        p_general_feedback: generalFeedback,
        p_question_feedback: Object.keys(feedbackObject).length > 0 ? feedbackObject : null
      });
      
      if (error) throw error;
      
      // Send notification to student
      const notificationMessage = reviewStatus === 'pass' 
        ? 'Tu quiz ha sido revisado y aprobado. ¡Buen trabajo!'
        : 'Tu quiz ha sido revisado. Por favor revisa la retroalimentación del instructor.';
        
      await supabase.from('notifications').insert({
        user_id: submission.student_id,
        type: 'quiz_reviewed',
        title: 'Quiz revisado',
        message: notificationMessage,
        data: {
          submission_id: submission.id,
          course_id: submission.course_id,
          lesson_id: submission.lesson_id,
          review_status: reviewStatus
        }
      });
      
      toast.success('Revisión guardada exitosamente');
      
      if (onGradingComplete) {
        onGradingComplete();
      }
    } catch (error) {
      console.error('Error saving review:', error);
      toast.error('Error al guardar la revisión');
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="bg-brand_blue text-white p-6 rounded-t-lg">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold mb-2">Revisión de Quiz</h2>
            <div className="space-y-1 text-sm text-blue-100">
              <p>Estudiante: <span className="font-medium text-white">{submission.student?.name}</span></p>
              <p>Curso: <span className="font-medium text-white">{submission.course?.title}</span></p>
              <p>Lección: <span className="font-medium text-white">{submission.lesson?.title}</span></p>
              <p>Enviado: <span className="font-medium text-white">
                {new Date(submission.submitted_at).toLocaleString('es-ES')}
              </span></p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Open-ended questions */}
      <div className="p-6 space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <MessageSquare className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Enfoque en el aprendizaje</p>
            <p>Revisa las respuestas del estudiante y proporciona retroalimentación constructiva. 
               El objetivo es ayudar al estudiante a mejorar su comprensión del tema.</p>
          </div>
        </div>
        
        {submission.open_responses?.map((response: any, index: number) => {
          const feedback = questionFeedback[response.question_id] || '';
          
          return (
            <div key={response.question_id} className="border rounded-lg p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-brand_blue text-white rounded-full flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </div>
                    <h3 className="text-lg font-medium text-gray-900">{response.question}</h3>
                  </div>
                </div>
              </div>
              
              {/* Student's response */}
              <div className="ml-11 bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Respuesta del estudiante:</p>
                <p className="text-gray-900 whitespace-pre-wrap">{response.response || '(Sin respuesta)'}</p>
              </div>
              
              {/* Expected answer and grading guidelines */}
              {(response.expectedAnswer || response.gradingGuidelines) && (
                <div className="ml-11 bg-blue-50 rounded-lg p-4 space-y-3">
                  {response.expectedAnswer && (
                    <div>
                      <p className="text-sm font-medium text-blue-700 mb-1">Respuesta esperada:</p>
                      <p className="text-sm text-blue-900">{response.expectedAnswer}</p>
                    </div>
                  )}
                  {response.gradingGuidelines && (
                    <div>
                      <p className="text-sm font-medium text-blue-700 mb-1">Guía de evaluación:</p>
                      <p className="text-sm text-blue-900">{response.gradingGuidelines}</p>
                    </div>
                  )}
                </div>
              )}
              
              {/* Feedback input */}
              <div className="ml-11">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Retroalimentación para esta pregunta (opcional)
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => handleFeedbackChange(response.question_id, e.target.value)}
                  placeholder="Proporciona retroalimentación específica sobre esta respuesta..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                  rows={3}
                />
              </div>
            </div>
          );
        })}
        
        {/* General feedback and status */}
        <div className="border-t pt-6">
          <div className="bg-gray-50 rounded-lg p-6 space-y-6">
            <h3 className="text-lg font-semibold text-gray-900">Evaluación general</h3>
            
            {/* Pass/Needs Review selection */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Estado de la revisión</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="reviewStatus"
                    value="pass"
                    checked={reviewStatus === 'pass'}
                    onChange={() => setReviewStatus('pass')}
                    className="w-4 h-4 text-green-600 focus:ring-green-500"
                  />
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="font-medium text-gray-900">Aprobado</span>
                  </div>
                  <span className="text-sm text-gray-500">El estudiante demuestra comprensión adecuada</span>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="reviewStatus"
                    value="needs_review"
                    checked={reviewStatus === 'needs_review'}
                    onChange={() => setReviewStatus('needs_review')}
                    className="w-4 h-4 text-yellow-600 focus:ring-yellow-500"
                  />
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                    <span className="font-medium text-gray-900">Necesita revisar</span>
                  </div>
                  <span className="text-sm text-gray-500">El estudiante debe revisar el material</span>
                </label>
              </div>
            </div>
            
            {/* General feedback */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Retroalimentación general {reviewStatus === 'needs_review' && <span className="text-red-500">*</span>}
              </label>
              <textarea
                value={generalFeedback}
                onChange={(e) => setGeneralFeedback(e.target.value)}
                placeholder={
                  reviewStatus === 'pass' 
                    ? "Comentarios adicionales para el estudiante (opcional)..."
                    : "Explica qué áreas necesita revisar el estudiante y proporciona orientación..."
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                rows={4}
              />
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => window.history.back()}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitReview}
                disabled={isSaving}
                className="px-6 py-2 bg-brand_blue text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSaving ? (
                  <>Guardando...</>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Guardar revisión
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}