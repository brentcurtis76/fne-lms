import React from 'react';
import { CheckCircle, AlertCircle, MessageSquare } from 'lucide-react';

interface QuizResultDisplayProps {
  submission: any;
}

export default function QuizResultDisplay({ submission }: QuizResultDisplayProps) {
  const reviewStatus = submission.review_status || 'pending';
  const hasOpenEndedQuestions = submission.open_responses && submission.open_responses.length > 0;
  
  if (reviewStatus === 'pending' && hasOpenEndedQuestions) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <MessageSquare className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 mb-1">
              Quiz enviado para revisión
            </h3>
            <p className="text-blue-800">
              Tu profesor está revisando las preguntas abiertas. Te notificaremos cuando esté listo.
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  if (reviewStatus === 'pass') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-green-900 mb-1">
              ¡Excelente trabajo!
            </h3>
            <p className="text-green-800 mb-3">
              Has demostrado una buena comprensión del material.
            </p>
            
            {submission.general_feedback && (
              <div className="mt-4 bg-white rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Retroalimentación del instructor:
                </p>
                <p className="text-gray-900 whitespace-pre-wrap">
                  {submission.general_feedback}
                </p>
              </div>
            )}
            
            {submission.open_responses?.map((response: any, index: number) => {
              if (!response.feedback) return null;
              
              return (
                <div key={response.question_id} className="mt-4 bg-white rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    Pregunta {index + 1}: {response.question}
                  </p>
                  <p className="text-sm text-gray-600 mb-2">
                    Tu respuesta: {response.response}
                  </p>
                  <p className="text-sm text-green-700">
                    Retroalimentación: {response.feedback}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
  
  if (reviewStatus === 'needs_review') {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-900 mb-1">
              Necesitas revisar algunos temas
            </h3>
            <p className="text-yellow-800 mb-3">
              Tu profesor ha proporcionado retroalimentación para ayudarte a mejorar.
            </p>
            
            {submission.general_feedback && (
              <div className="mt-4 bg-white rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Retroalimentación del instructor:
                </p>
                <p className="text-gray-900 whitespace-pre-wrap">
                  {submission.general_feedback}
                </p>
              </div>
            )}
            
            {submission.open_responses?.map((response: any, index: number) => {
              if (!response.feedback) return null;
              
              return (
                <div key={response.question_id} className="mt-4 bg-white rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    Pregunta {index + 1}: {response.question}
                  </p>
                  <p className="text-sm text-gray-600 mb-2">
                    Tu respuesta: {response.response}
                  </p>
                  <p className="text-sm text-yellow-700">
                    Retroalimentación: {response.feedback}
                  </p>
                </div>
              );
            })}
            
            <div className="mt-4 p-3 bg-yellow-100 rounded-lg">
              <p className="text-sm text-yellow-900">
                💡 Consejo: Revisa el material de la lección y vuelve a intentar el quiz cuando te sientas listo.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Default for completed MC/TF only quizzes
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-6">
      <div className="flex items-start gap-3">
        <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-green-900 mb-1">
            ¡Quiz completado exitosamente!
          </h3>
          <p className="text-green-800">
            Has demostrado dominio del contenido. ¡Continúa con la siguiente lección!
          </p>
        </div>
      </div>
    </div>
  );
}