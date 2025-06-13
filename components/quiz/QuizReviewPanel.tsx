import React, { useState } from 'react';
import { AlertCircle, CheckCircle, MessageSquare, Save } from 'lucide-react';
import { gradeQuizOpenResponses } from '@/lib/services/quizSubmissions';
import { toast } from 'react-hot-toast';

interface QuizReviewPanelProps {
  submission: any;
  onGradingComplete?: () => void;
}

interface GradingData {
  questionId: string;
  score: number;
  feedback: string;
}

export default function QuizReviewPanel({ submission, onGradingComplete }: QuizReviewPanelProps) {
  const [gradingData, setGradingData] = useState<Record<string, GradingData>>({});
  const [isSaving, setIsSaving] = useState(false);
  
  // Initialize grading data for open-ended questions
  React.useEffect(() => {
    if (submission?.open_responses) {
      const initialData: Record<string, GradingData> = {};
      submission.open_responses.forEach((response: any) => {
        initialData[response.question_id] = {
          questionId: response.question_id,
          score: 0,
          feedback: ''
        };
      });
      setGradingData(initialData);
    }
  }, [submission]);
  
  const handleScoreChange = (questionId: string, score: number) => {
    setGradingData(prev => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        score: Math.max(0, score) // Ensure non-negative
      }
    }));
  };
  
  const handleFeedbackChange = (questionId: string, feedback: string) => {
    setGradingData(prev => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        feedback
      }
    }));
  };
  
  const handleSubmitGrading = async () => {
    // Validate that all questions have been graded
    const ungradedQuestions = submission.open_responses.filter((response: any) => {
      const grading = gradingData[response.question_id];
      return !grading || grading?.score === undefined || grading?.score === null;
    });
    
    if (ungradedQuestions.length > 0) {
      toast.error('Por favor asigna puntos a todas las preguntas abiertas');
      return;
    }
    
    // Validate scores don't exceed maximum points
    const invalidScores = submission.open_responses.filter((response: any) => {
      const grading = gradingData[response.question_id];
      return grading?.score > response.points;
    });
    
    if (invalidScores.length > 0) {
      toast.error('Algunos puntajes exceden el máximo permitido');
      return;
    }
    
    setIsSaving(true);
    
    try {
      const gradingArray = Object.values(gradingData);
      const { error } = await gradeQuizOpenResponses(
        submission.id,
        submission.graded_by || submission.student_id, // Use current user ID in real implementation
        gradingArray
      );
      
      if (error) throw error;
      
      toast.success('Quiz calificado exitosamente');
      
      if (onGradingComplete) {
        onGradingComplete();
      }
    } catch (error) {
      console.error('Error grading quiz:', error);
      toast.error('Error al calificar el quiz');
    } finally {
      setIsSaving(false);
    }
  };
  
  const totalManualScore = Object.values(gradingData).reduce((sum, g) => sum + (g.score || 0), 0);
  const finalScore = submission.auto_graded_score + totalManualScore;
  const percentage = (finalScore / submission.total_possible_points) * 100;
  
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
          <div className="text-right">
            <div className="bg-white/20 rounded-lg p-4">
              <p className="text-sm text-blue-100">Puntuación automática</p>
              <p className="text-2xl font-bold">{submission.auto_graded_score}/{submission.auto_gradable_points}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Open-ended questions */}
      <div className="p-6 space-y-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <p className="font-medium mb-1">Preguntas abiertas para revisar</p>
            <p>Este quiz contiene {submission.open_responses?.length || 0} preguntas abiertas que requieren calificación manual.</p>
          </div>
        </div>
        
        {submission.open_responses?.map((response: any, index: number) => {
          const grading = gradingData[response.question_id] || {} as Partial<GradingData>;
          
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
                  <p className="text-sm text-gray-500 ml-11">
                    Valor: {response.points} {response.points === 1 ? 'punto' : 'puntos'}
                  </p>
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
                      <p className="text-sm font-medium text-blue-700 mb-1">Guía de calificación:</p>
                      <p className="text-sm text-blue-900">{response.gradingGuidelines}</p>
                    </div>
                  )}
                </div>
              )}
              
              {/* Grading inputs */}
              <div className="ml-11 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Puntos asignados
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max={response.points}
                      step="0.5"
                      value={grading?.score || 0}
                      onChange={(e) => handleScoreChange(response.question_id, parseFloat(e.target.value) || 0)}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent text-center font-medium"
                    />
                    <span className="text-gray-500">/ {response.points}</span>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Retroalimentación (opcional)
                  </label>
                  <textarea
                    value={grading?.feedback || ''}
                    onChange={(e) => handleFeedbackChange(response.question_id, e.target.value)}
                    placeholder="Comentarios para el estudiante..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                    rows={2}
                  />
                </div>
              </div>
            </div>
          );
        })}
        
        {/* Summary and submit */}
        <div className="border-t pt-6">
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Resumen de calificación</h3>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <p className="text-sm text-gray-600">Puntos automáticos</p>
                <p className="text-2xl font-bold text-gray-900">
                  {submission.auto_graded_score}/{submission.auto_gradable_points}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Puntos manuales</p>
                <p className="text-2xl font-bold text-gray-900">
                  {totalManualScore}/{submission.manual_gradable_points}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Puntuación final</p>
                <p className="text-2xl font-bold text-gray-900">
                  {finalScore}/{submission.total_possible_points}
                  <span className={`ml-2 text-base ${percentage >= 70 ? 'text-green-600' : 'text-red-600'}`}>
                    ({percentage.toFixed(1)}%)
                  </span>
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => window.history.back()}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitGrading}
                disabled={isSaving}
                className="px-6 py-2 bg-brand_blue text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSaving ? (
                  <>Guardando...</>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Guardar calificación
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