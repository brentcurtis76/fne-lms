import { useSupabaseClient } from '@supabase/auth-helpers-react';
/**
 * Meeting Documentation Modal - Simplified 3-Step Form
 * Streamlined meeting documentation with essential information only
 */

import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

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
  CheckCircleIcon,
  PaperClipIcon,
  DocumentIcon,
  UploadIcon
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
  sendTaskAssignmentNotifications,
  getMeetingDetails,
  updateMeeting
} from '../../utils/meetingUtils';
import { uploadFile } from '../../utils/storage';

interface MeetingDocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  userId: string;
  onSuccess: () => void;
  className?: string;
  meetingId?: string;
  mode?: 'create' | 'edit';
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
  className = '',
  meetingId,
  mode = 'create'
}) => {
  const supabase = useSupabaseClient();
  const [currentStep, setCurrentStep] = useState(MeetingFormStep.INFORMATION);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<AssignmentUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingMeeting, setLoadingMeeting] = useState(false);

  // Form data state
  const [formData, setFormData] = useState<MeetingDocumentationInput>({
    meeting_info: {
      title: '',
      meeting_date: '',
      duration_minutes: 60,
      location: '',
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

  // Document upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCommunityMembers();
      if (mode === 'edit' && meetingId) {
        loadMeetingData();
      }
    }
  }, [isOpen, workspaceId, mode, meetingId]);

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

  const loadMeetingData = async () => {
    if (!meetingId) return;
    
    try {
      setLoadingMeeting(true);
      const meetingDetails = await getMeetingDetails(meetingId);
      
      if (meetingDetails) {
        // Extract attendee IDs from the attendees array
        const attendeeIds = meetingDetails.attendees?.map(attendee => attendee.user_id) || [];
        
        // Populate form with existing data
        setFormData({
          meeting_info: {
            title: meetingDetails.title,
            meeting_date: new Date(meetingDetails.meeting_date).toISOString().slice(0, 16), // Format for datetime-local input
            duration_minutes: meetingDetails.duration_minutes,
            location: meetingDetails.location || '',
            attendee_ids: attendeeIds
          },
          summary_info: {
            summary: meetingDetails.summary || '',
            notes: meetingDetails.notes || '',
            status: meetingDetails.status
          },
          agreements: meetingDetails.agreements || [],
          commitments: meetingDetails.commitments || [],
          tasks: meetingDetails.tasks || []
        });
        
        // Load existing attachments
        const { data: attachments, error: attachError } = await supabase
          .from('meeting_attachments')
          .select('*')
          .eq('meeting_id', meetingId);
          
        if (attachments && attachments.length > 0) {
          // Note: We can't restore File objects, but we can show existing attachments info
          console.log('Meeting has', attachments.length, 'existing attachments');
          // TODO: Show existing attachments separately from new uploads
        }
      }
    } catch (error) {
      console.error('Error loading meeting data:', error);
      toast.error('Error al cargar los datos de la reunión');
    } finally {
      setLoadingMeeting(false);
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
    setSelectedFiles([]);
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
    setUploadingFiles(true);
    
    try {
      let result: { success: boolean; meetingId?: string; error?: string };
      
      if (mode === 'edit' && meetingId) {
        // Update existing meeting
        const updateResult = await updateMeeting(meetingId, {
          title: formData.meeting_info.title,
          meeting_date: formData.meeting_info.meeting_date,
          duration_minutes: formData.meeting_info.duration_minutes,
          location: formData.meeting_info.location,
          summary: formData.summary_info.summary,
          notes: formData.summary_info.notes,
          status: formData.summary_info.status
        });
        
        if (updateResult.success) {
          // Update agreements, commitments, and tasks
          // First, delete existing ones
          await supabase.from('meeting_agreements').delete().eq('meeting_id', meetingId);
          await supabase.from('meeting_commitments').delete().eq('meeting_id', meetingId);
          await supabase.from('meeting_tasks').delete().eq('meeting_id', meetingId);
          
          // Then create new ones
          if (formData.agreements.length > 0) {
            await supabase.from('meeting_agreements').insert(
              formData.agreements.map((agreement, index) => ({
                meeting_id: meetingId,
                agreement_text: agreement.agreement_text,
                category: agreement.category,
                order_index: index
              }))
            );
          }
          
          if (formData.commitments.length > 0) {
            await supabase.from('meeting_commitments').insert(
              formData.commitments.map(commitment => ({
                meeting_id: meetingId,
                commitment_text: commitment.commitment_text,
                assigned_to: commitment.assigned_to,
                due_date: commitment.due_date
              }))
            );
          }
          
          if (formData.tasks.length > 0) {
            await supabase.from('meeting_tasks').insert(
              formData.tasks.map(task => ({
                meeting_id: meetingId,
                task_title: task.task_title,
                task_description: task.task_description,
                assigned_to: task.assigned_to,
                due_date: task.due_date,
                priority: task.priority,
                category: task.category,
                estimated_hours: task.estimated_hours
              }))
            );
          }
          
          result = { success: true, meetingId };
        } else {
          result = updateResult;
        }
      } else {
        // Create new meeting
        result = await createMeetingWithDocumentation(workspaceId, userId, formData);
      }
      
      if (result.success && result.meetingId) {
        // Upload documents if any
        if (selectedFiles.length > 0) {
          try {
            // Create meeting-documents bucket if it doesn't exist
            const bucketName = 'meeting-documents';
            
            for (const file of selectedFiles) {
              // Generate unique file path
              const timestamp = Date.now();
              const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
              const filePath = `${workspaceId}/${result.meetingId}/${timestamp}-${sanitizedName}`;
              
              // Upload file
              const { url, error } = await uploadFile(file, filePath, bucketName);
              
              if (error) {
                console.error('Error uploading file:', file.name, error);
                toast.error(`Error al subir ${file.name}`);
                continue;
              }

              // Save file reference to database
              const { error: dbError } = await supabase
                .from('meeting_attachments')
                .insert({
                  meeting_id: result.meetingId,
                  filename: file.name,
                  file_path: filePath,
                  file_size: file.size,
                  file_type: file.type,
                  uploaded_by: userId
                });

              if (dbError) {
                console.error('Error saving file reference:', dbError);
                // Continue with other files even if one fails
              }
            }
          } catch (uploadError) {
            console.error('Error during file upload:', uploadError);
            toast.error('Algunos archivos no se pudieron subir');
          }
        }

        // Send notifications for assigned tasks/commitments
        const assignedUserIds = [
          ...formData.commitments.map(c => c.assigned_to),
          ...formData.tasks.map(t => t.assigned_to)
        ].filter((id, index, arr) => arr.indexOf(id) === index); // Remove duplicates

        if (assignedUserIds.length > 0) {
          await sendTaskAssignmentNotifications(result.meetingId, assignedUserIds);
        }

        toast.success(mode === 'edit' ? 'Reunión actualizada correctamente' : 'Reunión documentada correctamente');
        onSuccess();
        handleClose();
      } else {
        toast.error(result.error || `Error al ${mode === 'edit' ? 'actualizar' : 'crear'} la reunión`);
      }
    } catch (error) {
      console.error('Error submitting meeting:', error);
      toast.error(`Error inesperado al ${mode === 'edit' ? 'actualizar' : 'crear'} la reunión`);
    } finally {
      setIsSubmitting(false);
      setUploadingFiles(false);
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

  // Document upload functions
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(file => {
      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'image/jpeg',
        'image/png',
        'image/gif'
      ];

      if (!allowedTypes.includes(file.type)) {
        toast.error(`Tipo de archivo no permitido: ${file.name}`);
        return false;
      }

      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`Archivo demasiado grande: ${file.name}. Máximo 10MB.`);
        return false;
      }

      return true;
    });

    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string): string => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📽️';
    return '📎';
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
              <h2 className="text-xl font-semibold text-[#0a0a0a]">
                {mode === 'edit' ? 'Editar Reunión' : 'Documentar Reunión'}
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
                      ? 'bg-[#fbbf24] text-[#0a0a0a]' 
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    {currentStep > step.id ? (
                      <CheckIcon className="h-4 w-4" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span className={`ml-2 text-sm font-medium ${
                    currentStep >= step.id ? 'text-[#0a0a0a]' : 'text-gray-500'
                  }`}>
                    {step.title}
                  </span>
                  {index < STEPS.length - 1 && (
                    <div className={`mx-4 h-px w-12 ${
                      currentStep > step.id ? 'bg-[#fbbf24]' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 max-h-96 overflow-y-auto">
            {loadingMeeting ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#fbbf24]"></div>
              </div>
            ) : (
              <>
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  />
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
                          className="h-4 w-4 text-[#fbbf24] focus:ring-[#fbbf24] border-gray-300 rounded"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent resize-none"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent resize-none"
                  />
                </div>
              </div>
            )}

            {/* Step 3: Agreements, Commitments and Tasks */}
            {currentStep === MeetingFormStep.AGREEMENTS && (
              <div className="space-y-8">
                {/* Documents Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      Documentos
                    </h3>
                  </div>

                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                    <div className="text-center">
                      <DocumentIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <div className="text-sm text-gray-600">
                        <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-[#fbbf24] hover:text-[#fbbf24]/80 focus-within:outline-none">
                          <span>Seleccionar archivos</span>
                          <input
                            id="file-upload"
                            name="file-upload"
                            type="file"
                            className="sr-only"
                            multiple
                            onChange={handleFileSelect}
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif"
                          />
                        </label>
                        <span className="pl-1">o arrastrar y soltar</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        PDF, Word, Excel, PowerPoint, o imágenes hasta 10MB
                      </p>
                    </div>
                  </div>

                  {selectedFiles.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Archivos seleccionados ({selectedFiles.length})</h4>
                      <div className="space-y-2">
                        {selectedFiles.map((file, index) => (
                          <div key={index} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                              <span className="text-3xl flex-shrink-0">{getFileIcon(file.type)}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                                <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => removeFile(index)}
                              className="ml-4 p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar archivo"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Unified Agreements/Commitments Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      Acuerdos y Compromisos
                    </h3>
                    <button
                      onClick={addCommitment}
                      className="inline-flex items-center px-3 py-2 bg-[#fbbf24] text-[#0a0a0a] text-sm rounded-lg hover:bg-[#fbbf24]/90 transition-colors duration-200"
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
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-[#fbbf24] text-[#0a0a0a] text-sm font-bold rounded-full">
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
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent resize-none"
                            />
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <select
                                value={commitment.assigned_to}
                                onChange={(e) => updateCommitment(index, 'assigned_to', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
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
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
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
                      className="inline-flex items-center px-3 py-2 bg-[#fbbf24] text-[#0a0a0a] text-sm rounded-lg hover:bg-[#fbbf24]/90 transition-colors duration-200"
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
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                            />
                            
                            <textarea
                              value={task.task_description}
                              onChange={(e) => updateTask(index, 'task_description', e.target.value)}
                              placeholder="Descripción de la tarea..."
                              rows={2}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent resize-none"
                            />
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <select
                                value={task.assigned_to}
                                onChange={(e) => updateTask(index, 'assigned_to', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
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
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                              />
                              
                              <select
                                value={task.priority}
                                onChange={(e) => updateTask(index, 'priority', e.target.value as TaskPriority)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
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
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                              />
                              
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={task.estimated_hours || ''}
                                onChange={(e) => updateTask(index, 'estimated_hours', e.target.value ? parseFloat(e.target.value) : undefined)}
                                placeholder="Horas estimadas"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
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
              </>
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
                  className="inline-flex items-center px-4 py-2 bg-[#fbbf24] text-[#0a0a0a] text-sm rounded-lg hover:bg-[#fbbf24]/90 disabled:opacity-50 transition-colors duration-200"
                >
                  Siguiente
                  <ChevronRightIcon className="h-4 w-4 ml-1" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="inline-flex items-center px-4 py-2 bg-[#0a0a0a] text-white text-sm rounded-lg hover:bg-[#0a0a0a]/90 disabled:opacity-50 transition-colors duration-200"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      {uploadingFiles ? `Subiendo ${selectedFiles.length} archivo${selectedFiles.length !== 1 ? 's' : ''}...` : 'Guardando...'}
                    </>
                  ) : (
                    <>
                      <CheckIcon className="h-4 w-4 mr-1" />
                      {mode === 'edit' ? 'Guardar Cambios' : 'Crear Reunión'}
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