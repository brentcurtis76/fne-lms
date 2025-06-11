import React, { useState } from 'react';
import { AssignmentSubmission } from '../../types/assignments';
import { assignmentUtils } from '../../lib/services/assignments';
import { User, Calendar, Clock, MessageSquare, Check, X } from 'lucide-react';

interface SubmissionListProps {
  submissions: AssignmentSubmission[];
  assignment: any;
  onGrade: (submissionId: string) => void;
  onReturn: (submissionId: string) => void;
}

export const SubmissionList: React.FC<SubmissionListProps> = ({
  submissions,
  assignment,
  onGrade,
  onReturn
}) => {
  const [selectedSubmission, setSelectedSubmission] = useState<string | null>(null);

  const getStatusBadge = (status: string, score?: number) => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
    
    switch (status) {
      case 'submitted':
        return <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>Enviado</span>;
      case 'graded':
        return (
          <span className={`${baseClasses} bg-green-100 text-green-800`}>
            Calificado {score !== undefined && `(${score}/${assignment.points})`}
          </span>
        );
      case 'returned':
        return <span className={`${baseClasses} bg-orange-100 text-orange-800`}>Devuelto</span>;
      case 'draft':
        return <span className={`${baseClasses} bg-gray-100 text-gray-800`}>Borrador</span>;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (submissions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <p className="text-gray-500">No hay entregas para esta tarea aún.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full table-auto">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-brand_blue font-semibold">Estudiante</th>
              <th className="px-4 py-3 text-left text-brand_blue font-semibold">Estado</th>
              <th className="px-4 py-3 text-left text-brand_blue font-semibold">Fecha de entrega</th>
              <th className="px-4 py-3 text-left text-brand_blue font-semibold">Tardía</th>
              <th className="px-4 py-3 text-left text-brand_blue font-semibold">Archivos</th>
              <th className="px-4 py-3 text-center text-brand_blue font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((submission) => (
              <React.Fragment key={submission.id}>
                <tr 
                  className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedSubmission(
                    selectedSubmission === submission.id ? null : submission.id
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-brand_blue text-white flex items-center justify-center mr-3">
                        {submission.student?.name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {submission.student?.name || 'Usuario'}
                        </p>
                        <p className="text-sm text-gray-600">
                          {submission.student?.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {getStatusBadge(submission.status, submission.score)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {submission.submitted_at ? formatDate(submission.submitted_at) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    {submission.is_late ? (
                      <span className="text-red-600 font-medium">Sí</span>
                    ) : (
                      <span className="text-green-600">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-600">
                      {submission.attachment_urls?.length || 0} archivo(s)
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center space-x-2">
                      {submission.status === 'submitted' && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onGrade(submission.id);
                            }}
                            className="p-1 text-green-600 hover:bg-green-50 rounded"
                            title="Calificar"
                          >
                            <Check size={18} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onReturn(submission.id);
                            }}
                            className="p-1 text-orange-600 hover:bg-orange-50 rounded"
                            title="Devolver para revisión"
                          >
                            <X size={18} />
                          </button>
                        </>
                      )}
                      {submission.status === 'graded' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onGrade(submission.id);
                          }}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="Editar calificación"
                        >
                          <MessageSquare size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                
                {/* Expanded content */}
                {selectedSubmission === submission.id && (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 bg-gray-50">
                      <div className="space-y-4">
                        {submission.content && (
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-2">Respuesta:</h4>
                            <div className="p-3 bg-white rounded-md border border-gray-200">
                              <p className="text-gray-700 whitespace-pre-wrap">{submission.content}</p>
                            </div>
                          </div>
                        )}
                        
                        {submission.attachment_urls && submission.attachment_urls.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-2">Archivos adjuntos:</h4>
                            <div className="space-y-2">
                              {submission.attachment_urls.map((url, index) => (
                                <a
                                  key={index}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block p-2 bg-white rounded-md border border-gray-200 hover:border-brand_blue text-blue-600 hover:text-blue-800"
                                >
                                  Archivo {index + 1}: {url}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {submission.feedback && (
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-2">Retroalimentación:</h4>
                            <div className="p-3 bg-white rounded-md border border-gray-200">
                              <p className="text-gray-700 whitespace-pre-wrap">{submission.feedback}</p>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <div className="flex items-center">
                            <Calendar size={16} className="mr-1" />
                            Creado: {formatDate(submission.created_at)}
                          </div>
                          {submission.graded_at && (
                            <div className="flex items-center">
                              <Clock size={16} className="mr-1" />
                              Calificado: {formatDate(submission.graded_at)}
                            </div>
                          )}
                          {submission.grader && (
                            <div className="flex items-center">
                              <User size={16} className="mr-1" />
                              Por: {submission.grader.name}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};