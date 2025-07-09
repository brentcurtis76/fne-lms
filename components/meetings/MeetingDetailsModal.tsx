/**
 * Meeting Details Modal
 * Displays comprehensive meeting information including summary, notes, attendees, and attachments
 */

import React, { useState, useEffect } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { toast } from 'react-hot-toast';
import {
  XIcon,
  CalendarIcon,
  ClockIcon,
  LocationMarkerIcon,
  UserIcon,
  DocumentTextIcon,
  PaperClipIcon,
  DownloadIcon,
  CheckCircleIcon,
  ExclamationIcon,
  UsersIcon,
  MenuIcon,
  TrashIcon
} from '@heroicons/react/outline';
import { CommunityMeeting, MeetingWithDetails } from '../../types/meetings';
import { getMeetingDetails } from '../../utils/meetingUtils';
import TaskTracker from './TaskTracker';

interface MeetingDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetingId: string;
  onEdit?: (meetingId: string) => void;
  onDelete?: (meetingId: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

const MeetingDetailsModal: React.FC<MeetingDetailsModalProps> = ({
  isOpen,
  onClose,
  meetingId,
  onEdit,
  onDelete,
  canEdit = false,
  canDelete = false
}) => {
  const supabase = useSupabaseClient();
  const [meeting, setMeeting] = useState<MeetingWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'attendees' | 'agreements' | 'tasks' | 'documents'>('summary');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);

  useEffect(() => {
    if (isOpen && meetingId) {
      loadMeetingDetails();
    }
  }, [isOpen, meetingId]);

  useEffect(() => {
    if (activeTab === 'documents' && meeting) {
      loadAttachments();
    }
  }, [activeTab, meeting]);

  const loadMeetingDetails = async () => {
    try {
      setLoading(true);
      const details = await getMeetingDetails(meetingId);
      if (details) {
        setMeeting(details);
      } else {
        toast.error('No se pudo cargar la información de la reunión');
      }
    } catch (error) {
      console.error('Error loading meeting details:', error);
      toast.error('Error al cargar los detalles de la reunión');
    } finally {
      setLoading(false);
    }
  };

  const loadAttachments = async () => {
    if (!meeting || loadingAttachments) return;
    
    setLoadingAttachments(true);
    try {
      const { data, error } = await supabase
        .from('meeting_attachments')
        .select('*')
        .eq('meeting_id', meeting.id)
        .order('uploaded_at', { ascending: false });

      if (error) {
        console.error('Error loading attachments:', error);
      } else {
        setAttachments(data || []);
      }
    } catch (error) {
      console.error('Error loading attachments:', error);
    } finally {
      setLoadingAttachments(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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

  const handleDownload = async (attachment: any) => {
    try {
      const { data } = supabase.storage
        .from('meeting-documents')
        .getPublicUrl(attachment.file_path);

      window.open(data.publicUrl, '_blank');
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('Error al descargar el archivo');
    }
  };

  const getStatusColor = (status: string) => {
    const colors = {
      programada: 'bg-blue-100 text-blue-800',
      en_progreso: 'bg-yellow-100 text-yellow-800',
      completada: 'bg-green-100 text-green-800',
      cancelada: 'bg-red-100 text-red-800',
      pospuesta: 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      programada: 'Programada',
      en_progreso: 'En Progreso',
      completada: 'Completada',
      cancelada: 'Cancelada',
      pospuesta: 'Pospuesta'
    };
    return labels[status] || status;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75" onClick={onClose}></div>
        </div>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          {loading ? (
            <div className="p-8">
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-1/2 mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          ) : meeting ? (
            <>
              {/* Header */}
              <div className="bg-[#00365b] px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-white">
                      {meeting.title}
                    </h2>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-200">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(meeting.status)}`}>
                        {getStatusLabel(meeting.status)}
                      </span>
                      <div className="flex items-center gap-1">
                        <CalendarIcon className="h-4 w-4" />
                        <span>{formatDate(meeting.meeting_date)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <ClockIcon className="h-4 w-4" />
                        <span>{meeting.duration_minutes} min</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-white hover:text-gray-200 transition-colors"
                  >
                    <XIcon className="h-6 w-6" />
                  </button>
                </div>
              </div>

              {/* Meeting Info */}
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  {meeting.location && (
                    <div className="flex items-center gap-2">
                      <LocationMarkerIcon className="h-5 w-5 text-gray-400" />
                      <span className="text-gray-700">{meeting.location}</span>
                    </div>
                  )}
                  {meeting.facilitator && (
                    <div className="flex items-center gap-2">
                      <UserIcon className="h-5 w-5 text-gray-400" />
                      <span className="text-gray-700">
                        Facilitador: {meeting.facilitator.first_name} {meeting.facilitator.last_name}
                      </span>
                    </div>
                  )}
                  {meeting.created_by_profile && (
                    <div className="flex items-center gap-2">
                      <UserIcon className="h-5 w-5 text-gray-400" />
                      <span className="text-gray-700">
                        Creado por: {meeting.created_by_profile.first_name} {meeting.created_by_profile.last_name}
                      </span>
                    </div>
                  )}
                  {meeting.attendees && meeting.attendees.length > 0 && (
                    <div className="flex items-center gap-2">
                      <UsersIcon className="h-5 w-5 text-gray-400" />
                      <span className="text-gray-700">
                        {meeting.attendees.length} participante{meeting.attendees.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex">
                  <button
                    onClick={() => setActiveTab('summary')}
                    className={`py-2 px-6 border-b-2 font-medium text-sm ${
                      activeTab === 'summary'
                        ? 'border-[#fdb933] text-[#00365b]'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <DocumentTextIcon className="h-5 w-5 inline-block mr-2" />
                    Resumen y Notas
                  </button>
                  <button
                    onClick={() => setActiveTab('attendees')}
                    className={`py-2 px-6 border-b-2 font-medium text-sm ${
                      activeTab === 'attendees'
                        ? 'border-[#fdb933] text-[#00365b]'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <UsersIcon className="h-5 w-5 inline-block mr-2" />
                    Participantes {meeting.attendees && meeting.attendees.length > 0 && `(${meeting.attendees.length})`}
                  </button>
                  {meeting.agreements && meeting.agreements.length > 0 && (
                    <button
                      onClick={() => setActiveTab('agreements')}
                      className={`py-2 px-6 border-b-2 font-medium text-sm ${
                        activeTab === 'agreements'
                          ? 'border-[#fdb933] text-[#00365b]'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <MenuIcon className="h-5 w-5 inline-block mr-2" />
                      Acuerdos ({meeting.agreements.length})
                    </button>
                  )}
                  {(meeting.tasks.length > 0 || meeting.commitments.length > 0) && (
                    <button
                      onClick={() => setActiveTab('tasks')}
                      className={`py-2 px-6 border-b-2 font-medium text-sm ${
                        activeTab === 'tasks'
                          ? 'border-[#fdb933] text-[#00365b]'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <CheckCircleIcon className="h-5 w-5 inline-block mr-2" />
                      Tareas y Compromisos ({meeting.tasks.length + meeting.commitments.length})
                    </button>
                  )}
                  <button
                    onClick={() => setActiveTab('documents')}
                    className={`py-2 px-6 border-b-2 font-medium text-sm ${
                      activeTab === 'documents'
                        ? 'border-[#fdb933] text-[#00365b]'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <PaperClipIcon className="h-5 w-5 inline-block mr-2" />
                    Documentos
                  </button>
                </nav>
              </div>

              {/* Content */}
              <div className="px-6 py-4 max-h-96 overflow-y-auto">
                {/* Summary Tab */}
                {activeTab === 'summary' && (
                  <div className="space-y-6">
                    {meeting.summary && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 mb-2">Resumen</h3>
                        <p className="text-gray-700 whitespace-pre-wrap">{meeting.summary}</p>
                      </div>
                    )}
                    {meeting.notes && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 mb-2">Notas</h3>
                        <p className="text-gray-700 whitespace-pre-wrap">{meeting.notes}</p>
                      </div>
                    )}
                    {!meeting.summary && !meeting.notes && (
                      <p className="text-gray-500 italic text-center py-8">
                        No hay resumen o notas para esta reunión.
                      </p>
                    )}
                  </div>
                )}

                {/* Attendees Tab */}
                {activeTab === 'attendees' && (
                  <div className="space-y-4">
                    {meeting.attendees && meeting.attendees.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {meeting.attendees.map((attendee) => (
                          <div key={attendee.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                            {attendee.user && attendee.user.avatar_url ? (
                              <img
                                src={attendee.user.avatar_url}
                                alt={`${attendee.user.first_name} ${attendee.user.last_name}`}
                                className="h-10 w-10 rounded-full"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-[#fdb933] flex items-center justify-center">
                                <UserIcon className="h-6 w-6 text-[#00365b]" />
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {attendee.user ? `${attendee.user.first_name || ''} ${attendee.user.last_name || ''}`.trim() || 'Usuario sin nombre' : 'Usuario no encontrado'}
                              </p>
                              {attendee.user && attendee.user.email && (
                                <p className="text-xs text-gray-500">{attendee.user.email}</p>
                              )}
                              {attendee.role && attendee.role !== 'participant' && (
                                <span className="inline-block mt-1 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                                  {attendee.role === 'facilitator' ? 'Facilitador' : attendee.role === 'secretary' ? 'Secretario' : attendee.role}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 italic text-center py-8">
                        No se registraron participantes para esta reunión.
                      </p>
                    )}
                  </div>
                )}

                {/* Agreements Tab */}
                {activeTab === 'agreements' && (
                  <div className="space-y-4">
                    {meeting.agreements && meeting.agreements.length > 0 ? (
                      <div className="space-y-3">
                        {meeting.agreements.map((agreement, index) => (
                          <div key={agreement.id} className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg">
                            <div className="flex-shrink-0 w-8 h-8 bg-[#fdb933] rounded-full flex items-center justify-center text-sm font-bold text-[#00365b]">
                              {index + 1}
                            </div>
                            <div className="flex-1">
                              <p className="text-gray-900">{agreement.agreement_text}</p>
                              {agreement.category && (
                                <span className="inline-block mt-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                                  {agreement.category}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 italic text-center py-8">
                        No hay acuerdos registrados para esta reunión.
                      </p>
                    )}
                  </div>
                )}

                {/* Tasks Tab */}
                {activeTab === 'tasks' && (
                  <div className="space-y-6">
                    {meeting.commitments.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 mb-3">Compromisos</h3>
                        <div className="space-y-3">
                          {meeting.commitments.map(commitment => (
                            <TaskTracker
                              key={commitment.id}
                              item={commitment}
                              itemType="commitment"
                              canEdit={canEdit}
                              onStatusUpdate={() => loadMeetingDetails()}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {meeting.tasks.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 mb-3">Tareas</h3>
                        <div className="space-y-3">
                          {meeting.tasks.map(task => (
                            <TaskTracker
                              key={task.id}
                              item={task}
                              itemType="task"
                              canEdit={canEdit}
                              onStatusUpdate={() => loadMeetingDetails()}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {meeting.tasks.length === 0 && meeting.commitments.length === 0 && (
                      <p className="text-gray-500 italic text-center py-8">
                        No hay tareas o compromisos registrados para esta reunión.
                      </p>
                    )}
                  </div>
                )}

                {/* Documents Tab */}
                {activeTab === 'documents' && (
                  <div>
                    {loadingAttachments ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#fdb933]"></div>
                      </div>
                    ) : attachments.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                              <span className="text-2xl flex-shrink-0">{getFileIcon(attachment.file_type)}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{attachment.filename}</p>
                                <p className="text-xs text-gray-500">{formatFileSize(attachment.file_size)}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleDownload(attachment)}
                              className="flex-shrink-0 p-2 text-[#00365b] hover:text-[#fdb933] hover:bg-[#fdb933]/10 rounded-lg transition-colors"
                              title="Descargar documento"
                            >
                              <DownloadIcon className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 italic text-center py-8">
                        No hay documentos adjuntos a esta reunión.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 flex justify-between">
                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cerrar
                  </button>
                  {canDelete && onDelete && (
                    <button
                      onClick={() => {
                        onClose();
                        // Small delay to ensure modal closes before opening delete modal
                        setTimeout(() => {
                          onDelete(meeting.id);
                        }, 150);
                      }}
                      className="inline-flex items-center px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <TrashIcon className="h-4 w-4 mr-2" />
                      Eliminar Reunión
                    </button>
                  )}
                </div>
                {canEdit && onEdit && (
                  <button
                    onClick={() => {
                      onEdit(meeting.id);
                      onClose();
                    }}
                    className="px-4 py-2 bg-[#fdb933] text-[#00365b] font-medium rounded-lg hover:bg-[#fdb933]/90 transition-colors"
                  >
                    Editar Reunión
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="p-8 text-center">
              <p className="text-gray-500">No se pudo cargar la información de la reunión.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MeetingDetailsModal;