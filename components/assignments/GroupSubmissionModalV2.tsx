import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useState, useEffect } from 'react';
import { X, Upload, Users, FileText, CheckCircle, ExternalLink, File } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { groupAssignmentsV2Service } from '../../lib/services/groupAssignmentsV2';

interface GroupSubmissionModalV2Props {
  assignment: any;
  group: any;
  onClose: () => void;
  onSubmit: (submissionData: any) => void;
}

export default function GroupSubmissionModalV2({ 
  assignment, 
  group, 
  onClose, 
  onSubmit 
}: GroupSubmissionModalV2Props) {
  const supabase = useSupabaseClient();
  const [submissionText, setSubmissionText] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [existingSubmission, setExistingSubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGroupData();
  }, [assignment, group]);

  const loadGroupData = async () => {
    if (!group || !assignment) return;

    try {
      setLoading(true);

      // Load group members
      const { members } = await groupAssignmentsV2Service.getGroupMembers(group.id);
      setGroupMembers(members || []);

      // Check for existing submission
      const { data: submission } = await supabase
        .from('group_assignment_submissions')
        .select('*')
        .eq('assignment_id', assignment.id)
        .eq('group_id', group.id)
        .single();

      if (submission) {
        setExistingSubmission(submission);
        setSubmissionText(submission.content || '');
        setFileUrl(submission.file_url || '');
      }
    } catch (error) {
      console.error('Error loading group data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('El archivo no debe superar los 10MB');
      return;
    }

    try {
      setUploadingFile(true);

      // Create unique file name
      const fileExt = file.name.split('.').pop();
      const fileName = `group-submissions/${assignment.id}/${group.id}/${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('assignments')
        .upload(fileName, file);

      if (error) throw error;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('assignments')
        .getPublicUrl(fileName);

      setFileUrl(publicUrl);
      toast.success('Archivo subido exitosamente');
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Error al subir el archivo');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSubmit = async () => {
    if (!submissionText.trim() && !fileUrl) {
      toast.error('Debes incluir un texto o archivo en tu entrega');
      return;
    }

    try {
      await onSubmit({
        content: submissionText,
        file_url: fileUrl
      });
    } catch (error) {
      console.error('Error submitting:', error);
    }
  };

  const isSubmitted = existingSubmission?.status === 'submitted' || existingSubmission?.status === 'graded';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold text-[#00365b]">
              {isSubmitted ? 'Ver Entrega Grupal' : 'Entregar Tarea Grupal'}
            </h2>
            <p className="text-sm text-gray-600 mt-1">{assignment.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {loading ? (
            <div className="space-y-4">
              <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Assignment Details */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-2">Detalles de la Tarea</h3>
                <p className="text-sm text-gray-700">{assignment.description}</p>
                {assignment.instructions && (
                  <div className="mt-3">
                    <h4 className="font-medium text-gray-900 text-sm mb-1">Instrucciones:</h4>
                    <p className="text-sm text-gray-700">{assignment.instructions}</p>
                  </div>
                )}
                {assignment.resources && assignment.resources.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-200">
                    <h4 className="font-medium text-gray-900 text-sm mb-2">Recursos:</h4>
                    <div className="space-y-2">
                      {assignment.resources.map((resource: any) => (
                        <a
                          key={resource.id}
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-md transition-colors"
                        >
                          {resource.type === 'link' ? (
                            <ExternalLink className="w-4 h-4 text-blue-600 flex-shrink-0" />
                          ) : (
                            <File className="w-4 h-4 text-gray-600 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {resource.title || 'Sin título'}
                            </p>
                            {resource.description && (
                              <p className="text-xs text-gray-500 truncate">
                                {resource.description}
                              </p>
                            )}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Group Members */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Miembros del Grupo
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {groupMembers.map((member) => (
                    <div key={member.user_id} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                      {member.user.avatar_url ? (
                        <img
                          src={member.user.avatar_url}
                          alt={member.user.full_name}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 bg-[#fdb933] rounded-full flex items-center justify-center">
                          <span className="text-[#00365b] text-sm font-medium">
                            {member.user.full_name?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span className="text-sm text-gray-700">{member.user.full_name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submission Form or View */}
              {isSubmitted ? (
                <div className="space-y-4">
                  <div className="bg-green-50 p-4 rounded-lg flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-900">Tarea Entregada</p>
                      <p className="text-sm text-green-700">
                        Entregado el {new Date(existingSubmission.submitted_at).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                  </div>

                  {existingSubmission.content && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Respuesta:</h4>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="text-gray-700 whitespace-pre-wrap">{existingSubmission.content}</p>
                      </div>
                    </div>
                  )}

                  {existingSubmission.file_url && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Archivo Adjunto:</h4>
                      <a
                        href={existingSubmission.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <FileText className="h-4 w-4" />
                        Ver archivo adjunto
                      </a>
                    </div>
                  )}

                  {existingSubmission.grade && (
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-1">Calificación:</h4>
                      <p className="text-2xl font-bold text-blue-700">{existingSubmission.grade}%</p>
                      {existingSubmission.feedback && (
                        <div className="mt-3">
                          <h5 className="font-medium text-blue-900 text-sm mb-1">Retroalimentación:</h5>
                          <p className="text-sm text-blue-700">{existingSubmission.feedback}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Respuesta del Grupo
                    </label>
                    <textarea
                      value={submissionText}
                      onChange={(e) => setSubmissionText(e.target.value)}
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                      placeholder="Escribe la respuesta de tu grupo aquí..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Archivo Adjunto (opcional)
                    </label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                      {fileUrl ? (
                        <div className="space-y-2">
                          <FileText className="mx-auto h-12 w-12 text-green-600" />
                          <p className="text-sm text-gray-700">Archivo cargado exitosamente</p>
                          <button
                            onClick={() => setFileUrl('')}
                            className="text-sm text-red-600 hover:underline"
                          >
                            Eliminar archivo
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Upload className="mx-auto h-12 w-12 text-gray-400" />
                          <p className="text-sm text-gray-600">
                            Arrastra un archivo aquí o haz clic para seleccionar
                          </p>
                          <input
                            type="file"
                            onChange={handleFileUpload}
                            accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                            disabled={uploadingFile}
                            className="hidden"
                            id="file-upload"
                          />
                          <label
                            htmlFor="file-upload"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 cursor-pointer transition-colors"
                          >
                            {uploadingFile ? 'Subiendo...' : 'Seleccionar archivo'}
                          </label>
                          <p className="text-xs text-gray-500">
                            PDF, DOC, DOCX, TXT, JPG, PNG (máx. 10MB)
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {isSubmitted ? 'Cerrar' : 'Cancelar'}
          </button>
          {!isSubmitted && (
            <button
              onClick={handleSubmit}
              disabled={loading || (!submissionText.trim() && !fileUrl)}
              className="px-4 py-2 bg-[#00365b] text-white rounded-lg hover:bg-[#004a7a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Entregar Tarea
            </button>
          )}
        </div>
      </div>
    </div>
  );
}