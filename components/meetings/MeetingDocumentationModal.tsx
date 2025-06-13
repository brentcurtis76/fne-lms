/**
 * Meeting Documentation Modal - 4-Step Professional Form
 * Step-by-step meeting documentation with information, summary, agreements, and commitments/tasks
 */

import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import {
  XIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
  CalendarIcon,
  ClockIcon,
  LocationMarkerIcon,
  UserIcon,
  DocumentTextIcon,
  MenuIcon,
  CheckCircleIcon
} from '@heroicons/react/outline';
import {
  MeetingDocumentationInput,
  MeetingFormStep,
  TaskPriority,
  MeetingStatus,
  AssignmentUser,
  priorityLabels,
  meetingStatusLabels
} from '../../types/meetings';
import { 
  createMeetingWithDocumentation,
  getCommunityMembersForAssignment,
  sendTaskAssignmentNotifications
} from '../../utils/meetingUtils';

interface MeetingDocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  userId: string;
  onSuccess: () => void;
  className?: string;
}

const STEPS = [
  {
    id: MeetingFormStep.INFORMATION,
    title: 'Información',
    description: 'Datos básicos de la reunión',
    icon: CalendarIcon
  },
  {
    id: MeetingFormStep.SUMMARY,
    title: 'Resumen',
    description: 'Resumen y notas de la reunión',
    icon: DocumentTextIcon
  },
  {
    id: MeetingFormStep.AGREEMENTS,
    title: 'Acuerdos y Compromisos',
    description: 'Acuerdos, compromisos y tareas',
    icon: CheckCircleIcon
  }
];

const MeetingDocumentationModal: React.FC<MeetingDocumentationModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
  userId,
  onSuccess,
  className = ''
}) => {
  const [currentStep, setCurrentStep] = useState(MeetingFormStep.INFORMATION);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<AssignmentUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Form data state
  const [formData, setFormData] = useState<MeetingDocumentationInput>({
    meeting_info: {
      title: '',
      meeting_date: '',
      duration_minutes: 60,
      location: '',
      facilitator_id: '',
      secretary_id: '',
      attendee_ids: []
    },
    summary_info: {
      summary: '',
      notes: '',
      status: 'completada'
    },
    agreements: [],
    commitments: [],
    tasks: []
  });

  useEffect(() => {
    if (isOpen) {
      loadCommunityMembers();
    }
  }, [isOpen, workspaceId]);

  const loadCommunityMembers = async () => {
    try {
      setLoadingUsers(true);
      
      // Get workspace details first
      const { data: workspace, error: wsError } = await supabase
        .from('community_workspaces')
        .select('community_id')
        .eq('id', workspaceId)
        .single();

      if (wsError || !workspace) {
        // If workspace table doesn't exist, just get all users from profiles
        const { data: allUsers, error: usersError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, avatar_url')
          .order('first_name', { ascending: true });

        if (!usersError && allUsers) {
          const formattedUsers: AssignmentUser[] = allUsers.map(user => ({
            id: user.id,
            first_name: user.first_name || 'Usuario',
            last_name: user.last_name || '',
            email: user.email || '',
            avatar_url: user.avatar_url,
            role_type: 'docente'
          }));
          setAvailableUsers(formattedUsers);
        }
        return;
      }

      // Get community members
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('community_id', workspace.community_id)
        .eq('is_active', true);

      if (rolesError || !userRoles || userRoles.length === 0) {
        // Fallback to all users if no community members found
        const { data: allUsers, error: usersError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, avatar_url')
          .order('first_name', { ascending: true });

        if (!usersError && allUsers) {
          const formattedUsers: AssignmentUser[] = allUsers.map(user => ({
            id: user.id,
            first_name: user.first_name || 'Usuario',
            last_name: user.last_name || '',
            email: user.email || '',
            avatar_url: user.avatar_url,
            role_type: 'docente'
          }));
          setAvailableUsers(formattedUsers);
        }
        return;
      }

      // Get user details for community members
      const userIds = userRoles.map(role => role.user_id);
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, avatar_url')
        .in('id', userIds)
        .order('first_name', { ascending: true });

      if (!usersError && users) {
        const formattedUsers: AssignmentUser[] = users.map(user => ({
          id: user.id,
          first_name: user.first_name || 'Usuario',
          last_name: user.last_name || '',
          email: user.email || '',
          avatar_url: user.avatar_url,
          role_type: 'docente'
        }));
        setAvailableUsers(formattedUsers);
      }
      
    } catch (error) {
      console.error('Error loading community members:', error);
      // Fallback to loading all users if there's an error
      try {
        const { data: allUsers, error: usersError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, avatar_url')
          .order('first_name', { ascending: true });

        if (!usersError && allUsers) {
          const formattedUsers: AssignmentUser[] = allUsers.map(user => ({
            id: user.id,
            first_name: user.first_name || 'Usuario',
            last_name: user.last_name || '',
            email: user.email || '',
            avatar_url: user.avatar_url,
            role_type: 'docente'
          }));
          setAvailableUsers(formattedUsers);
        }
      } catch (fallbackError) {
        console.error('Error loading fallback users:', fallbackError);
        toast.error('Error al cargar miembros de la comunidad');
      }
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    
    // Reset form
    setCurrentStep(MeetingFormStep.INFORMATION);
    setFormData({
      meeting_info: {
        title: '',
        meeting_date: '',
        duration_minutes: 60,
        location: '',
        facilitator_id: '',
        secretary_id: '',
        attendee_ids: []
      },
      summary_info: {
        summary: '',
        notes: '',
        status: 'completada'
      },
      agreements: [],
      commitments: [],
      tasks: []
    });
    onClose();
  };

  const validateStep = (step: MeetingFormStep): boolean => {
    switch (step) {
      case MeetingFormStep.INFORMATION:
        return !!(formData.meeting_info.title && formData.meeting_info.meeting_date);
      case MeetingFormStep.SUMMARY:
        return !!formData.summary_info.summary;
      case MeetingFormStep.AGREEMENTS:
        return true; // Agreements, commitments and tasks are optional
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (!validateStep(currentStep)) {
      toast.error('Por favor completa los campos requeridos');
      return;
    }

    if (currentStep < MeetingFormStep.AGREEMENTS) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > MeetingFormStep.INFORMATION) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) {
      toast.error('Por favor completa los campos requeridos');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createMeetingWithDocumentation(workspaceId, userId, formData);
      
      if (result.success && result.meetingId) {
        // Send notifications for assigned tasks/commitments
        const assignedUserIds = [
          ...formData.commitments.map(c => c.assigned_to),
          ...formData.tasks.map(t => t.assigned_to)
        ].filter((id, index, arr) => arr.indexOf(id) === index); // Remove duplicates

        if (assignedUserIds.length > 0) {
          await sendTaskAssignmentNotifications(result.meetingId, assignedUserIds);
        }

        toast.success('Reunión documentada correctamente');
        onSuccess();
        handleClose();
      } else {
        toast.error(result.error || 'Error al crear la reunión');
      }
    } catch (error) {
      console.error('Error submitting meeting:', error);
      toast.error('Error inesperado al crear la reunión');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper functions for form updates
  const updateMeetingInfo = (field: keyof typeof formData.meeting_info, value: any) => {
    setFormData(prev => ({
      ...prev,
      meeting_info: {
        ...prev.meeting_info,
        [field]: value
      }
    }));
  };

  const updateSummaryInfo = (field: keyof typeof formData.summary_info, value: any) => {
    setFormData(prev => ({
      ...prev,
      summary_info: {
        ...prev.summary_info,
        [field]: value
      }
    }));
  };

  const addAgreement = () => {
    setFormData(prev => ({
      ...prev,
      agreements: [
        ...prev.agreements,
        { agreement_text: '', category: '' }
      ]
    }));
  };

  const updateAgreement = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      agreements: prev.agreements.map((agreement, i) => 
        i === index ? { ...agreement, [field]: value } : agreement
      )
    }));
  };

  const removeAgreement = (index: number) => {
    setFormData(prev => ({
      ...prev,
      agreements: prev.agreements.filter((_, i) => i !== index)
    }));
  };

  const addCommitment = () => {
    setFormData(prev => ({
      ...prev,
      commitments: [
        ...prev.commitments,
        { commitment_text: '', assigned_to: '', due_date: '' }
      ]
    }));
  };

  const updateCommitment = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      commitments: prev.commitments.map((commitment, i) => 
        i === index ? { ...commitment, [field]: value } : commitment
      )
    }));
  };

  const removeCommitment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      commitments: prev.commitments.filter((_, i) => i !== index)
    }));
  };

  const addTask = () => {
    setFormData(prev => ({
      ...prev,
      tasks: [
        ...prev.tasks,
        {
          task_title: '',
          task_description: '',
          assigned_to: '',
          due_date: '',
          priority: 'media',
          category: '',
          estimated_hours: undefined
        }
      ]
    }));
  };

  const updateTask = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      tasks: prev.tasks.map((task, i) => 
        i === index ? { ...task, [field]: value } : task
      )
    }));
  };

  const removeTask = (index: number) => {
    setFormData(prev => ({
      ...prev,
      tasks: prev.tasks.filter((_, i) => i !== index)
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={handleClose} />
        
        <div className={`relative w-full max-w-4xl bg-white rounded-lg shadow-xl ${className}`}>
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-semibold text-[#00365b]">
                Documentar Reunión
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {STEPS[currentStep].title}: {STEPS[currentStep].description}
              </p>
            </div>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Progress Steps */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              {STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                    currentStep >= step.id 
                      ? 'bg-[#fdb933] text-[#00365b]' 
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    {currentStep > step.id ? (
                      <CheckIcon className="h-4 w-4" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span className={`ml-2 text-sm font-medium ${
                    currentStep >= step.id ? 'text-[#00365b]' : 'text-gray-500'
                  }`}>
                    {step.title}
                  </span>
                  {index < STEPS.length - 1 && (
                    <div className={`mx-4 h-px w-12 ${
                      currentStep > step.id ? 'bg-[#fdb933]' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 max-h-96 overflow-y-auto">
            {/* Step 1: Information */}
            {currentStep === MeetingFormStep.INFORMATION && (
              <div className="space-y-6">
                {/* Basic Info */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Título de la Reunión *
                  </label>
                  <input
                    type="text"
                    value={formData.meeting_info.title}
                    onChange={(e) => updateMeetingInfo('title', e.target.value)}
                    placeholder="Ej: Reunión de planificación semanal"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha y Hora *
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.meeting_info.meeting_date}
                      onChange={(e) => updateMeetingInfo('meeting_date', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Duración (minutos)
                    </label>
                    <input
                      type="number"
                      min="15"
                      max="480"
                      value={formData.meeting_info.duration_minutes}
                      onChange={(e) => updateMeetingInfo('duration_minutes', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ubicación
                  </label>
                  <input
                    type="text"
                    value={formData.meeting_info.location}
                    onChange={(e) => updateMeetingInfo('location', e.target.value)}
                    placeholder="Ej: Sala de reuniones, Zoom, etc."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                  />
                </div>

                {/* Roles */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Facilitador
                    </label>
                    <select
                      value={formData.meeting_info.facilitator_id}
                      onChange={(e) => updateMeetingInfo('facilitator_id', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                    >
                      <option value="">Seleccionar facilitador</option>
                      {availableUsers.map(user => (
                        <option key={user.id} value={user.id}>
                          {user.first_name} {user.last_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Secretario
                    </label>
                    <select
                      value={formData.meeting_info.secretary_id}
                      onChange={(e) => updateMeetingInfo('secretary_id', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                    >
                      <option value="">Seleccionar secretario</option>
                      {availableUsers.map(user => (
                        <option key={user.id} value={user.id}>
                          {user.first_name} {user.last_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Attendees */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Asistentes
                  </label>
                  <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-300 rounded-lg p-3">
                    {availableUsers.map(user => (
                      <label key={user.id} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.meeting_info.attendee_ids.includes(user.id)}
                          onChange={(e) => {
                            const attendeeIds = e.target.checked
                              ? [...formData.meeting_info.attendee_ids, user.id]
                              : formData.meeting_info.attendee_ids.filter(id => id !== user.id);
                            updateMeetingInfo('attendee_ids', attendeeIds);
                          }}
                          className="h-4 w-4 text-[#fdb933] focus:ring-[#fdb933] border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          {user.first_name} {user.last_name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Summary */}
            {currentStep === MeetingFormStep.SUMMARY && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Estado de la Reunión
                  </label>
                  <select
                    value={formData.summary_info.status}
                    onChange={(e) => updateSummaryInfo('status', e.target.value as MeetingStatus)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                  >
                    {Object.entries(meetingStatusLabels).map(([status, label]) => (
                      <option key={status} value={status}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Resumen de la Reunión *
                  </label>
                  <textarea
                    value={formData.summary_info.summary}
                    onChange={(e) => updateSummaryInfo('summary', e.target.value)}
                    placeholder="Describe los puntos principales tratados en la reunión..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent resize-none"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Puedes incluir enlaces en el resumen. Los enlaces se mostrarán como texto clickeable.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notas Adicionales
                  </label>
                  <textarea
                    value={formData.summary_info.notes}
                    onChange={(e) => updateSummaryInfo('notes', e.target.value)}
                    placeholder="Notas adicionales, observaciones, etc."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent resize-none"
                  />
                </div>
              </div>
            )}

            {/* Step 3: Agreements, Commitments and Tasks */}
            {currentStep === MeetingFormStep.AGREEMENTS && (
              <div className="space-y-8">
                {/* Unified Agreements/Commitments Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      Acuerdos y Compromisos
                    </h3>
                    <button
                      onClick={addCommitment}
                      className="inline-flex items-center px-3 py-2 bg-[#fdb933] text-[#00365b] text-sm rounded-lg hover:bg-[#fdb933]/90 transition-colors duration-200"
                    >
                      <PlusIcon className="h-4 w-4 mr-1" />
                      Agregar Compromiso
                    </button>
                  </div>

                  {formData.commitments.length === 0 ? (
                    <div className="text-center py-6 text-gray-500">
                      <MenuIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <p>No se han agregado compromisos.</p>
                      <p className="text-sm">Los compromisos son opcionales.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {formData.commitments.map((commitment, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-[#fdb933] text-[#00365b] text-sm font-bold rounded-full">
                              {index + 1}
                            </span>
                            <button
                              onClick={() => removeCommitment(index)}
                              className="p-1 text-red-400 hover:text-red-600"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                          
                          <div className="space-y-3">
                            <textarea
                              value={commitment.commitment_text}
                              onChange={(e) => updateCommitment(index, 'commitment_text', e.target.value)}
                              placeholder="Describe el acuerdo o compromiso..."
                              rows={2}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent resize-none"
                            />
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <select
                                value={commitment.assigned_to}
                                onChange={(e) => updateCommitment(index, 'assigned_to', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                              >
                                <option value="">Asignar a...</option>
                                {availableUsers.map(user => (
                                  <option key={user.id} value={user.id}>
                                    {user.first_name} {user.last_name}
                                  </option>
                                ))}
                              </select>
                              
                              <input
                                type="date"
                                value={commitment.due_date}
                                onChange={(e) => updateCommitment(index, 'due_date', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tasks Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      Tareas
                    </h3>
                    <button
                      onClick={addTask}
                      className="inline-flex items-center px-3 py-2 bg-[#fdb933] text-[#00365b] text-sm rounded-lg hover:bg-[#fdb933]/90 transition-colors duration-200"
                    >
                      <PlusIcon className="h-4 w-4 mr-1" />
                      Agregar Tarea
                    </button>
                  </div>

                  {formData.tasks.length === 0 ? (
                    <div className="text-center py-6 text-gray-500">
                      <p className="text-sm">No se han agregado tareas.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {formData.tasks.map((task, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-green-500 text-white text-sm font-bold rounded-full">
                              T{index + 1}
                            </span>
                            <button
                              onClick={() => removeTask(index)}
                              className="p-1 text-red-400 hover:text-red-600"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                          
                          <div className="space-y-3">
                            <input
                              type="text"
                              value={task.task_title}
                              onChange={(e) => updateTask(index, 'task_title', e.target.value)}
                              placeholder="Título de la tarea..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                            />
                            
                            <textarea
                              value={task.task_description}
                              onChange={(e) => updateTask(index, 'task_description', e.target.value)}
                              placeholder="Descripción de la tarea..."
                              rows={2}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent resize-none"
                            />
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <select
                                value={task.assigned_to}
                                onChange={(e) => updateTask(index, 'assigned_to', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                              >
                                <option value="">Asignar a...</option>
                                {availableUsers.map(user => (
                                  <option key={user.id} value={user.id}>
                                    {user.first_name} {user.last_name}
                                  </option>
                                ))}
                              </select>
                              
                              <input
                                type="date"
                                value={task.due_date}
                                onChange={(e) => updateTask(index, 'due_date', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                              />
                              
                              <select
                                value={task.priority}
                                onChange={(e) => updateTask(index, 'priority', e.target.value as TaskPriority)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                              >
                                {Object.entries(priorityLabels).map(([priority, label]) => (
                                  <option key={priority} value={priority}>{label}</option>
                                ))}
                              </select>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <input
                                type="text"
                                value={task.category}
                                onChange={(e) => updateTask(index, 'category', e.target.value)}
                                placeholder="Categoría (opcional)"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                              />
                              
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={task.estimated_hours || ''}
                                onChange={(e) => updateTask(index, 'estimated_hours', e.target.value ? parseFloat(e.target.value) : undefined)}
                                placeholder="Horas estimadas"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-gray-200">
            <button
              onClick={handlePrevious}
              disabled={currentStep === MeetingFormStep.INFORMATION || isSubmitting}
              className="inline-flex items-center px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              <ChevronLeftIcon className="h-4 w-4 mr-1" />
              Anterior
            </button>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Cancelar
              </button>

              {currentStep < MeetingFormStep.AGREEMENTS ? (
                <button
                  onClick={handleNext}
                  disabled={isSubmitting}
                  className="inline-flex items-center px-4 py-2 bg-[#fdb933] text-[#00365b] text-sm rounded-lg hover:bg-[#fdb933]/90 disabled:opacity-50 transition-colors duration-200"
                >
                  Siguiente
                  <ChevronRightIcon className="h-4 w-4 ml-1" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="inline-flex items-center px-4 py-2 bg-[#00365b] text-white text-sm rounded-lg hover:bg-[#00365b]/90 disabled:opacity-50 transition-colors duration-200"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <CheckIcon className="h-4 w-4 mr-1" />
                      Crear Reunión
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeetingDocumentationModal;