import React, { useState } from 'react';
import { X, Upload, FileText, Link as LinkIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface GroupSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: any;
  groupId: string;
  onSubmit: (submissionData: any) => Promise<void>;
}

export const GroupSubmissionModal: React.FC<GroupSubmissionModalProps> = ({
  isOpen,
  onClose,
  assignment,
  groupId,
  onSubmit
}) => {
  const [submissionContent, setSubmissionContent] = useState('');
  const [fileUrls, setFileUrls] = useState<string[]>([]);
  const [newFileUrl, setNewFileUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddFileUrl = () => {
    if (!newFileUrl.trim()) {
      toast.error('Por favor ingresa una URL válida');
      return;
    }

    try {
      new URL(newFileUrl); // Validate URL
      setFileUrls([...fileUrls, newFileUrl]);
      setNewFileUrl('');
      toast.success('Enlace agregado');
    } catch {
      toast.error('URL inválida');
    }
  };

  const handleRemoveFileUrl = (index: number) => {
    setFileUrls(fileUrls.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!submissionContent.trim() && fileUrls.length === 0) {
      toast.error('Debes incluir contenido o al menos un archivo');
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        submission_content: submissionContent,
        file_urls: fileUrls
      });
      
      toast.success('Trabajo grupal enviado exitosamente');
      onClose();
    } catch (error) {
      console.error('Error submitting group work:', error);
      toast.error('Error al enviar el trabajo');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Entregar Trabajo Grupal
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Assignment Info */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-gray-900 mb-1">{assignment.title}</h3>
            <p className="text-sm text-gray-600">
              {assignment.points} puntos • Fecha límite: {
                assignment.due_date 
                  ? new Date(assignment.due_date).toLocaleDateString('es-ES')
                  : 'Sin fecha límite'
              }
            </p>
          </div>

          {/* Submission Form */}
          <form onSubmit={handleSubmit}>
            {/* Content */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contenido de la entrega
              </label>
              <textarea
                value={submissionContent}
                onChange={(e) => setSubmissionContent(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                placeholder="Describe el trabajo realizado por el grupo..."
              />
            </div>

            {/* File Links */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enlaces a archivos (Google Drive, Dropbox, etc.)
              </label>
              
              <div className="flex gap-2 mb-3">
                <input
                  type="url"
                  value={newFileUrl}
                  onChange={(e) => setNewFileUrl(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddFileUrl())}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="https://drive.google.com/file/..."
                />
                <button
                  type="button"
                  onClick={handleAddFileUrl}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition"
                >
                  Agregar
                </button>
              </div>

              {fileUrls.length > 0 && (
                <div className="space-y-2">
                  {fileUrls.map((url, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                    >
                      <div className="flex items-center space-x-2 flex-1 min-w-0">
                        <LinkIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <a 
                          href={url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline truncate"
                        >
                          {url}
                        </a>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFileUrl(index)}
                        className="ml-2 text-red-600 hover:text-red-800"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>Nota:</strong> Asegúrate de que todos los miembros del grupo hayan revisado 
                y aprobado esta entrega antes de enviarla. Una vez enviada, todos los miembros 
                recibirán la misma calificación.
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 transition"
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-[#0a0a0a] text-white rounded-md hover:bg-[#fbbf24] hover:text-[#0a0a0a] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Enviando...' : 'Enviar Trabajo'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};