import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useState, useEffect } from 'react';
import { X, Upload, Users, FileText, CheckCircle, ExternalLink, File, UserPlus, Search, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { groupAssignmentsV2Service } from '../../lib/services/groupAssignmentsV2';
import { useAuth } from '../../hooks/useAuth';

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
  const { user } = useAuth();
  const [submissionText, setSubmissionText] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [existingSubmission, setExistingSubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Teammate invitation state
  const [eligibleClassmates, setEligibleClassmates] = useState<any[]>([]);
  const [selectedClassmates, setSelectedClassmates] = useState<Set<string>>(new Set());
  const [loadingClassmates, setLoadingClassmates] = useState(false);
  const [classmateSearchQuery, setClassmateSearchQuery] = useState('');
  const [isConsultantManaged, setIsConsultantManaged] = useState(false);

  useEffect(() => {
    // Wait for user to be loaded before fetching group data
    if (!user?.id) {
      console.log('[GroupSubmissionModal] Waiting for user to load...');
      return;
    }
    loadGroupData();
  }, [assignment, group, user?.id]);

  const loadGroupData = async () => {
    if (!group || !assignment) return;

    try {
      setLoading(true);

      // Load group members
      const { members } = await groupAssignmentsV2Service.getGroupMembers(group.id);
      setGroupMembers(members || []);

      // Check for existing submission (use maybeSingle to avoid 406 when none exists)
      const { data: submission } = await supabase
        .from('group_assignment_submissions')
        .select('*')
        .eq('assignment_id', assignment.id)
        .eq('group_id', group.id)
        .maybeSingle();

      if (submission) {
        setExistingSubmission(submission);
        setSubmissionText(submission.content || '');
        setFileUrl(submission.file_url || '');
      }

      // Check if group is consultant-managed
      const { data: groupInfo } = await supabase
        .from('group_assignment_groups')
        .select('is_consultant_managed, community_id')
        .eq('id', group.id)
        .single();

      const isManaged = groupInfo?.is_consultant_managed || false;
      setIsConsultantManaged(isManaged);

      // Load eligible classmates if not submitted and not consultant-managed
      const isSubmitted = submission?.status === 'submitted' || submission?.status === 'graded';
      console.log('[GroupSubmissionModal] loadGroupData - isSubmitted:', isSubmitted, 'isManaged:', isManaged, 'user:', user, 'user?.id:', user?.id, 'group.id:', group.id, 'assignment.id:', assignment.id);
      if (!isSubmitted && !isManaged && user?.id) {
        setLoadingClassmates(true);
        try {
          const url = `/api/assignments/eligible-classmates?assignmentId=${assignment.id}&groupId=${group.id}`;
          console.log('[GroupSubmissionModal] Fetching eligible classmates from:', url);
          const response = await fetch(url);
          const data = await response.json();

          console.log('[GroupSubmissionModal] Response status:', response.status, 'data:', data);
          if (response.ok) {
            console.log('[GroupSubmissionModal] eligible classmates fetched:', data.classmates?.length, 'classmates:', data.classmates);
            setEligibleClassmates(data.classmates || []);
          } else {
            console.error('[GroupSubmissionModal] Error loading classmates:', data.error, 'status:', response.status);
            toast.error(data.error || 'Error al cargar compañeros');
          }
        } catch (error) {
          console.error('[GroupSubmissionModal] Exception loading classmates:', error);
          toast.error('Error al cargar compañeros');
        } finally {
          setLoadingClassmates(false);
        }
      } else {
        console.log('[GroupSubmissionModal] Skipping classmates fetch - conditions not met:', {
          isSubmitted,
          isManaged,
          hasUser: !!user,
          hasUserId: !!user?.id,
          conditionCheck: !isSubmitted && !isManaged && user?.id
        });
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

  // Classmate invitation handlers
  const handleToggleClassmate = (classmateId: string) => {
    setSelectedClassmates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(classmateId)) {
        newSet.delete(classmateId);
      } else {
        newSet.add(classmateId);
      }
      return newSet;
    });
  };

  const handleAddClassmates = async () => {
    if (!user?.id) {
      toast.error('Usuario no autenticado');
      return;
    }

    // Validation: Check max group size
    const maxGroupSize = 8;
    if (groupMembers.length + selectedClassmates.size > maxGroupSize) {
      toast.error(`El grupo no puede tener más de ${maxGroupSize} miembros`);
      return;
    }

    // Validation: Check at least one selected
    if (selectedClassmates.size === 0) {
      toast.error('Selecciona al menos un compañero');
      return;
    }

    try {
      setLoadingClassmates(true);

      const response = await fetch('/api/assignments/add-classmates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assignmentId: assignment.id,
          groupId: group.id,
          classmateIds: Array.from(selectedClassmates)
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Error al agregar compañeros');
        return;
      }

      toast.success(`${data.count || 0} compañero(s) agregado(s) al grupo`);
      setSelectedClassmates(new Set());
      await loadGroupData(); // Refresh data
    } catch (error) {
      console.error('Error adding classmates:', error);
      toast.error('Error al agregar compañeros. Intenta nuevamente.');
    } finally {
      setLoadingClassmates(false);
    }
  };

  const normalizeUrl = (rawUrl?: string | null) => {
    if (!rawUrl) return null;
    const trimmed = rawUrl.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    if (trimmed.startsWith('www.')) {
      return `https://${trimmed}`;
    }
    return trimmed;
  };

  const preventModalPropagation = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation?.();
  };

  const suppressAssignmentCardClick = () => {
    if (typeof window !== 'undefined') {
      (window as any).__suppressAssignmentCardClick = true;
    }
  };

  const handleResourceClick = (
    event: React.MouseEvent,
    resource: { url?: string | null; type?: string; title?: string }
  ) => {
    // CRITICAL: Stop event propagation to prevent triggering parent assignment card click
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();

    preventModalPropagation(event);
    suppressAssignmentCardClick();

    const normalizedUrl = normalizeUrl(resource?.url);
    if (!normalizedUrl) {
      if (resource?.type === 'document') {
        toast.error('Este recurso no tiene un archivo disponible. Solicita al instructor que vuelva a cargarlo.');
      } else {
        toast.error('El recurso no tiene un enlace disponible');
      }
      return;
    }

    window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
  };

  const isSubmitted = existingSubmission?.status === 'submitted' || existingSubmission?.status === 'graded';

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={handleOverlayClick}
    >
      <div
        className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
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
                      {assignment.resources
                        .filter((resource: any) => normalizeUrl(resource.url))
                        .map((resource: any) => (
                        <button
                          key={resource.id}
                          type="button"
                          onMouseDownCapture={preventModalPropagation}
                          onMouseUpCapture={preventModalPropagation}
                          onClick={(e) => handleResourceClick(e, resource)}
                          className="w-full text-left flex items-center gap-2 p-2 hover:bg-gray-100 rounded-md transition-colors"
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
                        </button>
                        ))}
                      {assignment.resources.filter((resource: any) => normalizeUrl(resource.url)).length === 0 && (
                        <p className="text-sm text-gray-500">No hay recursos disponibles actualmente.</p>
                      )}
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
                      {member.user?.avatar_url ? (
                        <img
                          src={member.user.avatar_url}
                          alt={member.user?.full_name || 'User'}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 bg-[#fdb933] rounded-full flex items-center justify-center">
                          <span className="text-[#00365b] text-sm font-medium">
                            {member.user?.full_name?.charAt(0).toUpperCase() || '?'}
                          </span>
                        </div>
                      )}
                      <span className="text-sm text-gray-700">{member.user?.full_name || 'Usuario desconocido'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Invite Classmates Section */}
              {!isSubmitted && !isConsultantManaged && groupMembers.length < 8 && (
                <div className="border-t pt-6">
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    Invitar Compañeros
                  </h3>

                  {/* Search Input */}
                  <div className="mb-3 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar compañeros de clase..."
                      value={classmateSearchQuery}
                      onChange={(e) => setClassmateSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                    />
                  </div>

                  {/* Classmates List */}
                  {loadingClassmates ? (
                    <div className="grid grid-cols-2 gap-2">
                      {[1, 2].map(i => (
                        <div key={i} className="h-12 bg-gray-100 rounded animate-pulse"></div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="max-h-48 overflow-y-auto grid grid-cols-2 gap-2 mb-3">
                        {eligibleClassmates
                          .filter(classmate => {
                            if (!classmateSearchQuery) return true;
                            const query = classmateSearchQuery.toLowerCase();
                            return (
                              classmate.full_name?.toLowerCase().includes(query) ||
                              classmate.email?.toLowerCase().includes(query)
                            );
                          })
                          .map(classmate => (
                            <button
                              key={classmate.id}
                              type="button"
                              onClick={() => handleToggleClassmate(classmate.id)}
                              className={`flex items-center gap-2 p-2 rounded border-2 transition-colors ${
                                selectedClassmates.has(classmate.id)
                                  ? 'border-[#fdb933] bg-yellow-50'
                                  : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedClassmates.has(classmate.id)}
                                onChange={() => {}}
                                className="w-4 h-4 text-[#00365b] rounded focus:ring-[#00365b]"
                              />
                              {classmate.avatar_url ? (
                                <img
                                  src={classmate.avatar_url}
                                  alt={classmate.full_name || 'User'}
                                  className="w-6 h-6 rounded-full"
                                />
                              ) : (
                                <div className="w-6 h-6 bg-[#fdb933] rounded-full flex items-center justify-center">
                                  <span className="text-[#00365b] text-xs font-medium">
                                    {classmate.full_name?.charAt(0).toUpperCase() || '?'}
                                  </span>
                                </div>
                              )}
                              <span className="text-sm text-gray-700 truncate flex-1 text-left">
                                {classmate.full_name || 'Usuario desconocido'}
                              </span>
                            </button>
                          ))}
                      </div>

                      {eligibleClassmates.length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-4">
                          No hay compañeros disponibles para invitar
                        </p>
                      )}

                      {/* Selected Count and Add Button */}
                      {eligibleClassmates.length > 0 && (
                        <div className="flex items-center justify-between pt-3 border-t">
                          <span className="text-sm text-gray-600">
                            {selectedClassmates.size} seleccionado{selectedClassmates.size !== 1 ? 's' : ''}
                            <span className="text-gray-400 ml-1">
                              (máx. {8 - groupMembers.length} más)
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={handleAddClassmates}
                            disabled={selectedClassmates.size === 0 || loadingClassmates}
                            className="px-4 py-2 bg-[#00365b] text-white text-sm rounded-lg hover:bg-[#004a7a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                          >
                            <UserPlus className="h-4 w-4" />
                            {loadingClassmates ? 'Agregando...' : 'Agregar al Grupo'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

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
                      <button
                        type="button"
                        onClick={(e) =>
                          handleResourceClick(e, {
                            url: existingSubmission.file_url,
                            type: 'document',
                            title: 'archivo adjunto'
                          })
                        }
                        onMouseDownCapture={preventModalPropagation}
                        onMouseUpCapture={preventModalPropagation}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <FileText className="h-4 w-4" />
                        Ver archivo adjunto
                      </button>
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
