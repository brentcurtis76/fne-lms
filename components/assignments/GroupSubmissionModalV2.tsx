import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useState, useEffect } from 'react';
import { X, Upload, Users, FileText, CheckCircle, ExternalLink, File, UserPlus, Search, Clock, UserMinus } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { groupAssignmentsV2Service } from '../../lib/services/groupAssignmentsV2';
import { useAuth } from '../../hooks/useAuth';

const formatSubmissionDateTime = (timestamp?: string | null) => {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
};

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
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [existingSubmission, setExistingSubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  // Internal group state - allows updating when group is created within this component
  // This solves the issue where parent's selectedGroup is null after group creation
  const [activeGroup, setActiveGroup] = useState<any>(group);

  // Teammate invitation state
  const [eligibleClassmates, setEligibleClassmates] = useState<any[]>([]);
  const [selectedClassmates, setSelectedClassmates] = useState<Set<string>>(new Set());
  const [loadingClassmates, setLoadingClassmates] = useState(false);
  const [classmateSearchQuery, setClassmateSearchQuery] = useState('');
  const [isConsultantManaged, setIsConsultantManaged] = useState(false);

  // Update activeGroup when prop changes
  useEffect(() => {
    if (group) {
      setActiveGroup(group);
    }
  }, [group]);

  useEffect(() => {
    // Wait for user to be loaded before fetching group data
    if (!user?.id) {
      console.log('[GroupSubmissionModal] Waiting for user to load...');
      return;
    }
    loadGroupData();
  }, [assignment, activeGroup, user?.id]);

  const loadGroupData = async () => {
    if (!assignment) return;

    try {
      setLoading(true);

      // Only load group members if user is already in a group
      if (activeGroup?.id) {
        try {
          const membersResponse = await fetch(
            `/api/assignments/group-members?groupId=${activeGroup.id}&assignmentId=${assignment.id}`
          );
          const membersData = await membersResponse.json();

          if (membersResponse.ok) {
            // Transform API response to match expected structure
            const transformedMembers = (membersData.members || []).map((member: any) => ({
              user_id: member.id,
              role: member.role,
              user: {
                id: member.id,
                full_name: member.full_name,
                avatar_url: member.avatar_url,
                first_name: member.full_name.split(' ')[0] || '',
                last_name: member.full_name.split(' ').slice(1).join(' ') || ''
              }
            }));
            setGroupMembers(transformedMembers);
          } else {
            console.error('[GroupSubmissionModal] Error loading members:', membersData.error);
            toast.error(membersData.error || 'Error al cargar miembros del grupo');
            setGroupMembers([]);
          }
        } catch (membersError) {
          console.error('[GroupSubmissionModal] Exception loading members:', membersError);
          toast.error('Error al cargar miembros del grupo');
          setGroupMembers([]);
        }

        // Check for existing submission (use maybeSingle to avoid 406 when none exists)
        const { data: submission, error: submissionError } = await supabase
          .from('group_assignment_submissions')
          .select('*')
          .eq('assignment_id', assignment.id)
          .eq('group_id', activeGroup.id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (submissionError) {
          console.error('[GroupSubmissionModal] Error fetching submission:', submissionError);
        }

        if (submission) {
          setExistingSubmission(submission);
          setSubmissionText(submission.content || '');
          setFileUrl(submission.file_url || '');
          // Only show filename if file_url exists
          if (submission.file_url) {
            const urlParts = submission.file_url.split('/');
            const fileNameWithTimestamp = urlParts[urlParts.length - 1];
            setUploadedFileName(decodeURIComponent(fileNameWithTimestamp));
          } else {
            setUploadedFileName('');
          }
        } else {
          // Reset state when no existing submission
          setUploadedFileName('');
        }
      } else {
        // No group yet - user needs to create one by inviting classmates
        setGroupMembers([]);
        setExistingSubmission(null);
      }

      // Check if group is consultant-managed (only if group exists)
      let isManaged = false;
      if (activeGroup?.id) {
        const { data: groupInfo } = await supabase
          .from('group_assignment_groups')
          .select('is_consultant_managed, community_id')
          .eq('id', activeGroup.id)
          .single();

        isManaged = groupInfo?.is_consultant_managed || false;
        setIsConsultantManaged(isManaged);
      } else {
        setIsConsultantManaged(false);
      }

      // Load eligible classmates if not submitted and not consultant-managed
      const isSubmitted = existingSubmission?.status === 'submitted' || existingSubmission?.status === 'graded';
      console.log('[GroupSubmissionModal] loadGroupData - isSubmitted:', isSubmitted, 'isManaged:', isManaged, 'user:', user, 'user?.id:', user?.id, 'activeGroup?.id:', activeGroup?.id, 'assignment.id:', assignment.id);
      if (!isManaged && user?.id) {
        setLoadingClassmates(true);
        try {
          // Build URL with or without groupId
          const url = activeGroup?.id
            ? `/api/assignments/eligible-classmates?assignmentId=${assignment.id}&groupId=${activeGroup.id}`
            : `/api/assignments/eligible-classmates?assignmentId=${assignment.id}`;

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
          conditionCheck: !isManaged && user?.id
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

      // Store original file name
      setUploadedFileName(file.name);

      // Create unique file name (use activeGroup.id if available, otherwise use user.id for individual submissions)
      const fileExt = file.name.split('.').pop();
      const groupOrUserId = activeGroup?.id || user?.id || 'unknown';
      const fileName = `group-submissions/${assignment.id}/${groupOrUserId}/${Date.now()}.${fileExt}`;

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
      setUploadedFileName(''); // Clear filename on error
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSubmit = async () => {
    // Require a group to submit
    if (!activeGroup?.id) {
      toast.error('Debes crear un grupo antes de entregar');
      return;
    }

    // File is required only for NEW submissions (not when editing existing ones)
    const isNewSubmission = !existingSubmission;

    if (isNewSubmission && !fileUrl) {
      toast.error('Debes incluir un archivo en tu primera entrega');
      return;
    }

    // For ALL submissions (new and updates), require at least text OR file
    // This prevents saving completely empty submissions
    const hasText = submissionText && submissionText.trim().length > 0;
    const hasFile = fileUrl && fileUrl.trim().length > 0;

    if (!hasText && !hasFile) {
      toast.error('Debes incluir al menos texto o un archivo en tu entrega');
      return;
    }

    try {
      // Pass activeGroup in submission data so parent can use it even if selectedGroup is null
      await onSubmit({
        content: submissionText,
        file_url: fileUrl,
        group: activeGroup  // Include the group so parent knows which group to submit to
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

    // Validation: Check at least one selected
    if (selectedClassmates.size === 0) {
      toast.error('Selecciona al menos un compañero');
      return;
    }

    try {
      setLoadingClassmates(true);

      const isCreatingGroup = !activeGroup?.id;
      const endpoint = isCreatingGroup
        ? '/api/assignments/create-group'
        : '/api/assignments/add-classmates';

      const body = {
        assignmentId: assignment.id,
        classmateIds: Array.from(selectedClassmates),
        ...(activeGroup?.id ? { groupId: activeGroup.id } : {})
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        // Show detailed error with debugging info
        let errorMsg = data.error || 'Error al agregar compañeros';

        // If details are available, log them for debugging
        if (data.details) {
          console.error('[GroupSubmissionModal] API Error Details:', data.details);

          // Append helpful context to error message
          if (data.details.missingIds) {
            errorMsg += ` (${data.details.missingIds.length} sin rol activo)`;
          }
          if (data.details.notEnrolled) {
            errorMsg += ` (${data.details.notEnrolled.length} sin inscripción)`;
          }
        }

        toast.error(errorMsg);
        return;
      }

      if (isCreatingGroup) {
        toast.success('Grupo creado exitosamente');

        // Update internal activeGroup state with the new group
        // This allows the component to function properly even though the parent's selectedGroup is null
        if (data.group) {
          console.log('[GroupSubmissionModal] Group created, updating activeGroup:', data.group);
          setActiveGroup(data.group);
          // loadGroupData will be triggered by the useEffect when activeGroup changes
        }
      } else {
        toast.success(`${data.count || 0} compañero(s) agregado(s) al grupo`);
        await loadGroupData();
      }

      setSelectedClassmates(new Set());

    } catch (error) {
      console.error('Error adding classmates:', error);
      toast.error('Error al agregar compañeros. Intenta nuevamente.');
    } finally {
      setLoadingClassmates(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!user?.id) {
      toast.error('Usuario no autenticado');
      return;
    }

    if (!activeGroup?.id || !assignment?.id) return;

    try {
      setRemovingMemberId(memberId);

      const response = await fetch('/api/assignments/group-members', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          groupId: activeGroup.id,
          assignmentId: assignment.id,
          memberId
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Error al remover al miembro');
        return;
      }

      toast.success('Miembro removido del grupo');
      await loadGroupData();
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('Error al remover al miembro. Intenta nuevamente.');
    } finally {
      setRemovingMemberId(null);
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
  const formattedSubmissionTimestamp = formatSubmissionDateTime(existingSubmission?.submitted_at);

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
            <h2 className="text-xl font-semibold text-[#0a0a0a]">
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
                    <div className="text-sm text-gray-700 space-y-1">
                      {(() => {
                        const lines = assignment.instructions.split('\n');
                        const steps: { number?: string; content: string }[] = [];

                        lines.forEach((line: string) => {
                          const trimmed = line.trim();
                          if (!trimmed) return;

                          // Check if line contains multiple numbered steps (e.g., "1. ... 2. ... 3. ...")
                          const numberedPattern = /\d+\./g;
                          const matches = trimmed.match(numberedPattern);

                          if (matches && matches.length > 1) {
                            // Split by numbered pattern while keeping the number
                            const parts = trimmed.split(/(?=\d+\.)/);
                            parts.forEach(part => {
                              const trimmedPart = part.trim();
                              const numberMatch = trimmedPart.match(/^(\d+)\.\s*/);
                              if (numberMatch) {
                                const number = numberMatch[1];
                                const content = trimmedPart.substring(numberMatch[0].length);
                                if (content) steps.push({ number, content });
                              }
                            });
                          } else if (/^\d+\.\s/.test(trimmed)) {
                            // Single numbered item at start of line - preserve the number
                            const numberMatch = trimmed.match(/^(\d+)\.\s*/);
                            if (numberMatch) {
                              const number = numberMatch[1];
                              const content = trimmed.substring(numberMatch[0].length);
                              steps.push({ number, content });
                            }
                          } else {
                            // Regular line without numbering - render as plain text (no bullet)
                            steps.push({ content: trimmed });
                          }
                        });

                        return steps.map((step, index) => (
                          <div key={index} className={index > 0 ? 'mt-1' : ''}>
                            {step.number ? (
                              <span className="text-gray-700">
                                <span className="font-medium">{step.number}.</span> {step.content}
                              </span>
                            ) : (
                              <span className="text-gray-700">{step.content}</span>
                            )}
                          </div>
                        ));
                      })()}
                    </div>
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
                {groupMembers.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-200">
                    <h4 className="font-medium text-gray-900 text-sm mb-2 flex items-center gap-2">
                      <Users className="h-4 w-4 text-[#0a0a0a]" />
                      Miembros del grupo
                    </h4>
                    <div className="space-y-2">
                      {groupMembers.map((member) => {
                        const isCurrentUser = member.user_id === user?.id;
                        return (
                          <div
                            key={member.user_id}
                            className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 bg-white"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#0a0a0a] text-white flex items-center justify-center text-sm font-semibold uppercase">
                                {member.user?.first_name?.[0] || member.user?.last_name?.[0] || 'U'}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {isCurrentUser ? 'Tú' : member.user?.full_name || 'Usuario'}
                                </p>
                                <p className="text-xs text-gray-500 capitalize">
                                  {isCurrentUser ? 'Miembro actual' : member.role === 'leader' ? 'Líder del grupo' : 'Miembro'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isCurrentUser && (
                                <span className="text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                                  Tú
                                </span>
                              )}
                              {!isConsultantManaged && !isCurrentUser && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMember(member.user_id)}
                                  disabled={removingMemberId === member.user_id}
                                  className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                                >
                                  <UserMinus className="h-4 w-4" />
                                  {removingMemberId === member.user_id ? 'Removiendo...' : 'Remover'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Invite Classmates Section */}
              {!isConsultantManaged && (
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
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
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
                              className={`flex items-center gap-2 p-2 rounded border-2 transition-colors ${selectedClassmates.has(classmate.id)
                                ? 'border-[#fbbf24] bg-yellow-50'
                                : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                                }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedClassmates.has(classmate.id)}
                                onChange={() => { }}
                                className="w-4 h-4 text-[#0a0a0a] rounded focus:ring-[#0a0a0a]"
                              />
                              {classmate.avatar_url ? (
                                <img
                                  src={classmate.avatar_url}
                                  alt={classmate.full_name || 'User'}
                                  className="w-6 h-6 rounded-full"
                                />
                              ) : (
                                <div className="w-6 h-6 bg-[#fbbf24] rounded-full flex items-center justify-center">
                                  <span className="text-[#0a0a0a] text-xs font-medium">
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
                          </span>
                          <button
                            type="button"
                            onClick={handleAddClassmates}
                            disabled={selectedClassmates.size === 0 || loadingClassmates}
                            className="px-4 py-2 bg-[#0a0a0a] text-white text-sm rounded-lg hover:bg-[#004a7a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                          >
                            <UserPlus className="h-4 w-4" />
                            {loadingClassmates ? 'Procesando...' : (activeGroup?.id ? 'Agregar al Grupo' : 'Crear Grupo')}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Submission state */}
              {isSubmitted && existingSubmission && (
                <div className="space-y-4">
                  <div className="bg-green-50 p-4 rounded-lg flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-900">Tarea entregada</p>
                      {formattedSubmissionTimestamp && (
                        <p className="text-sm text-green-700">
                          Última entrega: {formattedSubmissionTimestamp}
                        </p>
                      )}
                      <p className="text-xs text-green-700 mt-1">
                        Puedes actualizar la entrega y volver a enviarla cuando lo necesites.
                      </p>
                    </div>
                  </div>

                  {existingSubmission.content && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-1">Respuesta actual:</h4>
                      <p className="text-sm text-gray-600">
                        Edita el campo de comentarios para actualizarla.
                      </p>
                    </div>
                  )}

                  {existingSubmission.file_url && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Archivo actual:</h4>
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
              )}

              {/* Submission Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Comentarios o Notas <span className="text-xs text-gray-500 font-normal">(opcional)</span>
                  </label>
                  <textarea
                    value={submissionText}
                    onChange={(e) => setSubmissionText(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
                    placeholder="Agrega comentarios adicionales sobre tu entrega (opcional)..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Archivo Adjunto {existingSubmission ? (
                      <span className="text-xs text-gray-500 font-normal">(opcional para reediciones)</span>
                    ) : (
                      <span className="text-red-600">*</span>
                    )}
                    <span className="ml-2 text-xs text-gray-500 font-normal">Solo se permite un archivo</span>
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    {uploadingFile ? (
                      <div className="space-y-3">
                        <div className="mx-auto h-12 w-12 border-4 border-[#0a0a0a] border-t-transparent rounded-full animate-spin"></div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">Subiendo archivo...</p>
                          {uploadedFileName && (
                            <p className="text-sm text-gray-600 mt-1 break-all px-4">
                              {uploadedFileName}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : fileUrl ? (
                      <div className="space-y-3">
                        <FileText className="mx-auto h-12 w-12 text-green-600" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">Archivo cargado exitosamente</p>
                          {uploadedFileName && (
                            <p className="text-sm text-gray-600 mt-1 break-all px-4">
                              {uploadedFileName}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setFileUrl('');
                            setUploadedFileName('');
                          }}
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
                        <button
                          type="button"
                          onClick={() => document.getElementById('file-upload')?.click()}
                          disabled={uploadingFile}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Seleccionar archivo
                        </button>
                        <p className="text-xs text-gray-500">
                          PDF, DOC, DOCX, TXT, JPG, PNG (máx. 10MB)
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || uploadingFile}
            className="px-4 py-2 bg-[#0a0a0a] text-white rounded-lg hover:bg-[#004a7a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploadingFile
              ? 'Subiendo archivo...'
              : isSubmitted
                ? 'Actualizar Entrega'
                : 'Entregar Tarea'}
          </button>
        </div>
      </div>
    </div>
  );
}
