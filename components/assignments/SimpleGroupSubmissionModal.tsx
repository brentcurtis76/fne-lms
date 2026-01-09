import React, { useState } from 'react';
import { X, Upload, FileText, Users, AlertCircle } from 'lucide-react';
import { submitGroupAssignment } from '@/lib/services/simpleGroupAssignments';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { toast } from 'react-hot-toast';

interface SimpleGroupSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: any;
  groupData: any;
  userId: string;
  onSubmissionComplete: () => void;
}

export default function SimpleGroupSubmissionModal({
  isOpen,
  onClose,
  assignment,
  groupData,
  userId,
  onSubmissionComplete
}: SimpleGroupSubmissionModalProps) {
  const supabase = useSupabaseClient();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitComment, setSubmitComment] = useState('');

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        toast.error('Solo se permiten archivos PDF');
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) { // 10MB limit
        toast.error('El archivo no debe superar 10MB');
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      toast.error('Por favor selecciona un archivo PDF');
      return;
    }

    setUploading(true);
    try {
      // Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${assignment.id}/${groupData.group_id}/${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('assignments')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('assignments')
        .getPublicUrl(fileName);

      // Submit the assignment
      const { error: submitError } = await submitGroupAssignment(
        assignment.id,
        groupData.group_id,
        publicUrl,
        userId
      );

      if (submitError) throw submitError;

      toast.success('Trabajo grupal entregado exitosamente');
      onSubmissionComplete();
      onClose();
    } catch (error) {
      console.error('Error submitting group work:', error);
      toast.error('Error al entregar el trabajo grupal');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Entregar Trabajo Grupal</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Assignment Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2">{assignment.title}</h3>
            <p className="text-sm text-gray-600">{assignment.description}</p>
            <div className="mt-3 flex items-center gap-4 text-sm">
              {assignment.due_date && (
                <span className="text-gray-500">
                  Fecha límite: <span className="font-medium text-gray-900">
                    {new Date(assignment.due_date).toLocaleDateString('es-ES')}
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Group Info */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-5 h-5 text-teal-600" />
              <h4 className="font-medium text-gray-900">{groupData.group_name}</h4>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-gray-600">Miembros del grupo:</p>
              <div className="flex flex-wrap gap-2">
                {groupData.members.map((member: any) => (
                  <span 
                    key={member.user_id}
                    className="text-sm px-3 py-1 bg-gray-100 rounded-full"
                  >
                    {member.full_name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Previous Submission Warning */}
          {groupData.submission && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium mb-1">Ya existe una entrega previa</p>
                <p>Al subir un nuevo archivo, reemplazarás la entrega anterior del grupo.</p>
              </div>
            </div>
          )}

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Archivo PDF del trabajo grupal
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              {file ? (
                <div className="space-y-3">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto" />
                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <button
                    onClick={() => setFile(null)}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Eliminar archivo
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                  <div>
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      Seleccionar archivo PDF
                    </label>
                    <input
                      id="file-upload"
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Solo archivos PDF, máximo 10MB
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Comment (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Comentario (opcional)
            </label>
            <textarea
              value={submitComment}
              onChange={(e) => setSubmitComment(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Agrega un comentario sobre la entrega..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!file || uploading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {uploading ? 'Subiendo...' : 'Entregar trabajo grupal'}
          </button>
        </div>
      </div>
    </div>
  );
}