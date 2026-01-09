/**
 * Collaborative Submission Modal
 * Multi-step modal for submitting assignments with optional sharing to community members
 */

import React, { useState, useEffect } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { Assignment, CommunityMember } from '@/lib/services/userAssignments';
import {
  XIcon,
  UploadIcon,
  UsersIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  SearchIcon
} from '@heroicons/react/outline';
import { toast } from 'react-hot-toast';

interface CollaborativeSubmissionModalProps {
  assignment: Assignment;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'content' | 'share-prompt' | 'community-select' | 'member-select' | 'confirm';

const CollaborativeSubmissionModal: React.FC<CollaborativeSubmissionModalProps> = ({
  assignment,
  userId,
  onClose,
  onSuccess
}) => {
  const supabase = useSupabaseClient();

  // Step management
  const [currentStep, setCurrentStep] = useState<Step>('content');

  // Content step
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Share flow
  const [wantsToShare, setWantsToShare] = useState(false);
  const [userCommunities, setUserCommunities] = useState<any[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null);
  const [availableMembers, setAvailableMembers] = useState<CommunityMember[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  // Load user's communities on mount
  useEffect(() => {
    loadUserCommunities();
  }, []);

  const loadUserCommunities = async () => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          community_id,
          growth_communities:community_id(id, name, schools:school_id(name))
        `)
        .eq('user_id', userId)
        .eq('is_active', true)
        .not('community_id', 'is', null);

      if (error) throw error;

      const communities = data
        ?.map((r: any) => ({
          id: r.growth_communities?.id,
          name: r.growth_communities?.name,
          school: r.growth_communities?.schools?.name
        }))
        .filter((c: any) => c.id);

      setUserCommunities(communities || []);

      // Auto-select if only one community or if assignment has a community
      if (communities && communities.length === 1) {
        setSelectedCommunity(communities[0].id);
      } else if (assignment.community_id) {
        setSelectedCommunity(assignment.community_id);
      }
    } catch (error) {
      console.error('Error loading communities:', error);
    }
  };

  // Load members when community is selected
  useEffect(() => {
    if (selectedCommunity && currentStep === 'member-select') {
      loadShareableMembers();
    }
  }, [selectedCommunity, currentStep]);

  const loadShareableMembers = async () => {
    if (!selectedCommunity) return;

    try {
      setLoadingMembers(true);
      const response = await fetch(
        `/api/assignments/shareable-members?assignmentId=${assignment.assignment_id}&communityId=${selectedCommunity}`
      );

      if (!response.ok) {
        throw new Error('Error al cargar los miembros');
      }

      const data = await response.json();
      setAvailableMembers(data.members || []);
    } catch (error) {
      console.error('Error loading members:', error);
      toast.error('Error al cargar los miembros de la comunidad');
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      // Create preview for images
      if (selectedFile.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setFilePreview(reader.result as string);
        };
        reader.readAsDataURL(selectedFile);
      } else {
        setFilePreview(null);
      }
    }
  };

  const handleSubmit = async () => {
    if (!content && !file) {
      toast.error('Debes proporcionar contenido o un archivo');
      return;
    }

    try {
      setUploading(true);

      // Upload file if present
      let fileUrl = null;
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `group-submissions/${assignment.assignment_id}/${userId}/${Date.now()}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('assignments')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl }
        } = supabase.storage.from('assignments').getPublicUrl(fileName);

        fileUrl = publicUrl;
      }

      // Submit via API
      const response = await fetch('/api/assignments/collaborative-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId: assignment.assignment_id,
          communityId: selectedCommunity || assignment.community_id,
          content,
          fileUrl,
          sharedWithUserIds: wantsToShare ? selectedMembers : []
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al enviar el trabajo');
      }

      const result = await response.json();
      toast.success(result.message || '¡Trabajo enviado exitosamente!');
      onSuccess();
    } catch (error) {
      console.error('Error submitting assignment:', error);
      toast.error(
        error instanceof Error ? error.message : 'Error al enviar el trabajo'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleNext = () => {
    if (currentStep === 'content') {
      if (!content && !file) {
        toast.error('Debes proporcionar contenido o un archivo');
        return;
      }
      setCurrentStep('share-prompt');
    } else if (currentStep === 'share-prompt') {
      if (wantsToShare) {
        if (userCommunities.length > 1) {
          setCurrentStep('community-select');
        } else {
          setCurrentStep('member-select');
        }
      } else {
        setCurrentStep('confirm');
      }
    } else if (currentStep === 'community-select') {
      if (!selectedCommunity) {
        toast.error('Selecciona una comunidad');
        return;
      }
      setCurrentStep('member-select');
    } else if (currentStep === 'member-select') {
      if (selectedMembers.length === 0) {
        toast.error('Selecciona al menos un miembro');
        return;
      }
      setCurrentStep('confirm');
    }
  };

  const handleBack = () => {
    if (currentStep === 'share-prompt') {
      setCurrentStep('content');
    } else if (currentStep === 'community-select') {
      setCurrentStep('share-prompt');
    } else if (currentStep === 'member-select') {
      if (userCommunities.length > 1) {
        setCurrentStep('community-select');
      } else {
        setCurrentStep('share-prompt');
      }
    } else if (currentStep === 'confirm') {
      if (wantsToShare) {
        setCurrentStep('member-select');
      } else {
        setCurrentStep('share-prompt');
      }
    }
  };

  const toggleMember = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const selectAll = () => {
    setSelectedMembers(availableMembers.map((m) => m.id));
  };

  const deselectAll = () => {
    setSelectedMembers([]);
  };

  const filteredMembers = availableMembers.filter((m) =>
    m.full_name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.email.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const getStepTitle = () => {
    switch (currentStep) {
      case 'content':
        return 'Enviar Trabajo';
      case 'share-prompt':
        return '¿Compartir con compañeros?';
      case 'community-select':
        return 'Selecciona Comunidad';
      case 'member-select':
        return 'Selecciona Miembros';
      case 'confirm':
        return 'Confirmar Envío';
      default:
        return '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{getStepTitle()}</h2>
            <p className="text-sm text-gray-600 mt-1">{assignment.title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={uploading}
          >
            <XIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {/* Step 1: Content */}
          {currentStep === 'content' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contenido del Trabajo
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                  placeholder="Escribe tu respuesta aquí..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Archivo (opcional)
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="file"
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 cursor-pointer"
                  >
                    <UploadIcon className="h-5 w-5 mr-2" />
                    Subir Archivo
                  </label>
                  {file && (
                    <span className="text-sm text-gray-600">{file.name}</span>
                  )}
                </div>
                {filePreview && (
                  <img
                    src={filePreview}
                    alt="Preview"
                    className="mt-3 max-w-xs rounded-lg"
                  />
                )}
              </div>
            </div>
          )}

          {/* Step 2: Share Prompt */}
          {currentStep === 'share-prompt' && (
            <div className="space-y-4">
              <p className="text-gray-700">
                ¿Deseas compartir este trabajo con otros miembros de tu comunidad? Ellos
                también aparecerán como que han entregado el trabajo.
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    setWantsToShare(true);
                    handleNext();
                  }}
                  className="w-full flex items-center justify-between p-4 border-2 border-brand_blue rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-center">
                    <UsersIcon className="h-6 w-6 text-brand_blue mr-3" />
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Sí, compartir</p>
                      <p className="text-sm text-gray-600">
                        Seleccionar miembros para compartir
                      </p>
                    </div>
                  </div>
                  <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                </button>

                <button
                  onClick={() => {
                    setWantsToShare(false);
                    setCurrentStep('confirm');
                  }}
                  className="w-full flex items-center justify-between p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="text-left">
                    <p className="font-medium text-gray-900">No, solo yo</p>
                    <p className="text-sm text-gray-600">Enviar solo para mí</p>
                  </div>
                  <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Community Select (if multiple communities) */}
          {currentStep === 'community-select' && (
            <div className="space-y-3">
              <p className="text-gray-700 mb-4">
                Selecciona la comunidad con la que deseas compartir:
              </p>
              {userCommunities.map((community) => (
                <button
                  key={community.id}
                  onClick={() => {
                    setSelectedCommunity(community.id);
                    setCurrentStep('member-select');
                  }}
                  className={`w-full p-4 border-2 rounded-lg text-left hover:bg-gray-50 transition-colors ${
                    selectedCommunity === community.id
                      ? 'border-brand_blue bg-blue-50'
                      : 'border-gray-300'
                  }`}
                >
                  <p className="font-medium text-gray-900">{community.name}</p>
                  {community.school && (
                    <p className="text-sm text-gray-600">{community.school}</p>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Step 4: Member Select */}
          {currentStep === 'member-select' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-gray-700">
                  Selecciona los miembros con quienes compartir:
                </p>
                <div className="flex space-x-2">
                  <button
                    onClick={selectAll}
                    className="text-sm text-brand_blue hover:underline"
                  >
                    Todos
                  </button>
                  <span className="text-gray-400">|</span>
                  <button
                    onClick={deselectAll}
                    className="text-sm text-gray-600 hover:underline"
                  >
                    Ninguno
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar miembros..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              {/* Members List */}
              {loadingMembers ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand_blue mx-auto"></div>
                </div>
              ) : filteredMembers.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  No hay miembros disponibles
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredMembers.map((member) => (
                    <label
                      key={member.id}
                      className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedMembers.includes(member.id)}
                        onChange={() => toggleMember(member.id)}
                        className="h-4 w-4 text-brand_blue focus:ring-brand_blue border-gray-300 rounded"
                      />
                      <div className="ml-3 flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {member.full_name || 'Sin nombre'}
                        </p>
                        <p className="text-xs text-gray-500">{member.email}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              <p className="text-sm text-gray-600">
                Seleccionados: {selectedMembers.length} de {availableMembers.length}
              </p>
            </div>
          )}

          {/* Step 5: Confirm */}
          {currentStep === 'confirm' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2 flex items-center">
                  <CheckCircleIcon className="h-5 w-5 mr-2" />
                  Resumen del Envío
                </h3>

                <div className="space-y-2 text-sm text-blue-800">
                  <p>
                    <strong>Trabajo:</strong> {assignment.title}
                  </p>
                  {content && (
                    <p>
                      <strong>Contenido:</strong> {content.substring(0, 100)}
                      {content.length > 100 ? '...' : ''}
                    </p>
                  )}
                  {file && (
                    <p>
                      <strong>Archivo:</strong> {file.name}
                    </p>
                  )}
                  {wantsToShare && selectedMembers.length > 0 && (
                    <p>
                      <strong>Compartido con:</strong> {selectedMembers.length} miembro
                      {selectedMembers.length > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>

              {wantsToShare && selectedMembers.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Nota:</strong> Todos los miembros seleccionados verán este
                    trabajo como "Entregado" en su lista de tareas.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between">
          <button
            onClick={currentStep === 'content' ? onClose : handleBack}
            disabled={uploading}
            className="flex items-center text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            <ChevronLeftIcon className="h-5 w-5 mr-1" />
            {currentStep === 'content' ? 'Cancelar' : 'Atrás'}
          </button>

          {currentStep === 'confirm' ? (
            <button
              onClick={handleSubmit}
              disabled={uploading}
              className="flex items-center px-6 py-2 bg-brand_blue text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Enviando...
                </>
              ) : (
                <>
                  <CheckCircleIcon className="h-5 w-5 mr-2" />
                  Confirmar y Enviar
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center px-6 py-2 bg-brand_blue text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Siguiente
              <ChevronRightIcon className="h-5 w-5 ml-2" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CollaborativeSubmissionModal;
