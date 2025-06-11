import React, { useState } from 'react';
import { AssignmentSubmission } from '../../types/assignments';
import { Upload, FileText, X, Send, Save } from 'lucide-react';

interface SubmissionFormProps {
  submission?: Partial<AssignmentSubmission>;
  assignment: any;
  onSubmit: (data: Partial<AssignmentSubmission>, isDraft: boolean) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const SubmissionForm: React.FC<SubmissionFormProps> = ({
  submission,
  assignment,
  onSubmit,
  onCancel,
  isLoading = false
}) => {
  const [formData, setFormData] = useState<Partial<AssignmentSubmission>>({
    content: '',
    attachment_urls: [],
    ...submission
  });

  const [attachmentInput, setAttachmentInput] = useState('');

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      content: e.target.value
    }));
  };

  const handleAddAttachment = () => {
    if (attachmentInput.trim()) {
      setFormData(prev => ({
        ...prev,
        attachment_urls: [...(prev.attachment_urls || []), attachmentInput.trim()]
      }));
      setAttachmentInput('');
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      attachment_urls: prev.attachment_urls?.filter((_, i) => i !== index) || []
    }));
  };

  const handleSubmit = (e: React.FormEvent, isDraft: boolean = false) => {
    e.preventDefault();
    onSubmit(formData, isDraft);
  };

  const canSubmit = formData.content?.trim() || (formData.attachment_urls && formData.attachment_urls.length > 0);

  return (
    <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
      {/* Assignment Info */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h3 className="font-semibold text-brand_blue mb-2">{assignment.title}</h3>
        {assignment.instructions && (
          <div className="text-sm text-gray-700 whitespace-pre-wrap">
            {assignment.instructions}
          </div>
        )}
        <div className="mt-3 flex items-center space-x-4 text-sm text-gray-600">
          <span className="font-medium">{assignment.points} puntos</span>
          {assignment.due_date && (
            <span>Fecha límite: {new Date(assignment.due_date).toLocaleDateString('es-ES')}</span>
          )}
        </div>
      </div>

      {/* Submission Content */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-brand_blue mb-4">Tu respuesta</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contenido de la entrega
            </label>
            <textarea
              value={formData.content || ''}
              onChange={handleContentChange}
              rows={10}
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              placeholder="Escribe tu respuesta aquí..."
            />
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Archivos adjuntos
            </label>
            
            {formData.attachment_urls && formData.attachment_urls.length > 0 && (
              <div className="mb-3 space-y-2">
                {formData.attachment_urls.map((url, index) => (
                  <div key={index} className="flex items-center p-2 bg-gray-50 rounded-md">
                    <FileText size={16} className="text-gray-600 mr-2" />
                    <span className="flex-1 text-sm text-gray-700 truncate">{url}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(index)}
                      className="ml-2 text-red-600 hover:text-red-800"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center space-x-2">
              <input
                type="url"
                value={attachmentInput}
                onChange={(e) => setAttachmentInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddAttachment();
                  }
                }}
                placeholder="URL del archivo adjunto"
                className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              />
              <button
                type="button"
                onClick={handleAddAttachment}
                disabled={!attachmentInput.trim()}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload size={18} />
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Pega la URL de tu archivo (Google Drive, Dropbox, etc.)
            </p>
          </div>
        </div>
      </div>

      {/* Submission Status */}
      {submission?.status && (
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full mr-3 ${
              submission.status === 'graded' ? 'bg-green-500' :
              submission.status === 'submitted' ? 'bg-yellow-500' :
              submission.status === 'returned' ? 'bg-orange-500' :
              'bg-gray-300'
            }`} />
            <span className="font-medium">
              Estado: {
                submission.status === 'draft' ? 'Borrador' :
                submission.status === 'submitted' ? 'Enviado' :
                submission.status === 'graded' ? 'Calificado' :
                submission.status === 'returned' ? 'Devuelto para revisión' :
                submission.status
              }
            </span>
            {submission.score !== undefined && submission.score !== null && (
              <span className="ml-4 font-medium text-green-700">
                Calificación: {submission.score}/{assignment.points}
              </span>
            )}
          </div>
          
          {submission.feedback && (
            <div className="mt-3 p-3 bg-gray-50 rounded-md">
              <p className="text-sm font-medium text-gray-700 mb-1">Retroalimentación:</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{submission.feedback}</p>
            </div>
          )}
        </div>
      )}

      {/* Form Actions */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition"
        >
          Cancelar
        </button>
        
        <div className="space-x-3">
          {(!submission?.status || submission.status === 'draft' || submission.status === 'returned') && (
            <>
              <button
                type="button"
                onClick={(e) => handleSubmit(e, true)}
                disabled={isLoading || !canSubmit}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={18} className="inline mr-2" />
                Guardar borrador
              </button>
              
              <button
                type="submit"
                disabled={isLoading || !canSubmit}
                className="px-4 py-2 bg-brand_blue text-white rounded-md hover:bg-brand_yellow hover:text-brand_blue transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={18} className="inline mr-2" />
                Enviar tarea
              </button>
            </>
          )}
          
          {submission?.status === 'submitted' && (
            <div className="px-4 py-2 bg-yellow-100 text-yellow-800 rounded-md">
              Tarea enviada - esperando calificación
            </div>
          )}
          
          {submission?.status === 'graded' && (
            <div className="px-4 py-2 bg-green-100 text-green-800 rounded-md">
              Tarea calificada
            </div>
          )}
        </div>
      </div>
    </form>
  );
};