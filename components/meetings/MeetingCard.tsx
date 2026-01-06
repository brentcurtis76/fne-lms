/**
 * Meeting Card Component
 * Expandable meeting display with collapsible sections for agreements, tasks, and commitments
 */

import React, { useState, useEffect } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { 
  ChevronDownIcon,
  ChevronUpIcon,
  CalendarIcon,
  ClockIcon,
  LocationMarkerIcon,
  UserIcon,
  DocumentTextIcon,
  MenuIcon,
  CheckCircleIcon,
  ExclamationIcon,
  EyeIcon,
  PencilIcon,
  PaperClipIcon,
  DownloadIcon,
  UsersIcon
} from '@heroicons/react/outline';
import { 
  CommunityMeeting,
  MeetingWithDetails,
  meetingStatusLabels,
  meetingStatusColors
} from '../../types/meetings';
import { formatMeetingDate, isOverdue } from '../../utils/meetingUtils';
import TaskTracker from './TaskTracker';

interface MeetingCardProps {
  meeting: CommunityMeeting | MeetingWithDetails;
  canEdit: boolean;
  onEdit?: (meetingId: string) => void;
  onView?: (meetingId: string) => void;
  onTaskUpdate?: () => void;
  className?: string;
}

const MeetingCard: React.FC<MeetingCardProps> = ({
  meeting,
  canEdit,
  onEdit,
  onView,
  onTaskUpdate,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState<'summary' | 'agreements' | 'tasks' | 'documents'>('summary');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  
  const supabase = useSupabaseClient();

  const hasDetails = 'agreements' in meeting;
  const meetingWithDetails = hasDetails ? meeting as MeetingWithDetails : null;

  const getTaskStats = () => {
    if (!meetingWithDetails) return null;
    
    const totalTasks = meetingWithDetails.tasks.length + meetingWithDetails.commitments.length;
    const completedTasks = meetingWithDetails.tasks.filter(t => t.status === 'completado').length +
                          meetingWithDetails.commitments.filter(c => c.status === 'completado').length;
    const overdueTasks = meetingWithDetails.tasks.filter(t => t.due_date && isOverdue(t.due_date) && t.status !== 'completado').length +
                        meetingWithDetails.commitments.filter(c => c.due_date && isOverdue(c.due_date) && c.status !== 'completado').length;

    return { totalTasks, completedTasks, overdueTasks };
  };

  const taskStats = getTaskStats();

  // Load attachments when documents section is opened
  useEffect(() => {
    if (activeSection === 'documents' && isExpanded && attachments.length === 0) {
      loadAttachments();
    }
  }, [activeSection, isExpanded]);

  const loadAttachments = async () => {
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

  const toggleSection = (section: typeof activeSection) => {
    if (activeSection === section && isExpanded) {
      setIsExpanded(false);
    } else {
      setActiveSection(section);
      setIsExpanded(true);
    }
  };

  // Helper function to convert URLs in text to clickable links
  const renderTextWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0a0a0a] hover:text-[#fbbf24] underline"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  const renderSummarySection = () => (
    <div className="space-y-3">
      {meeting.summary && (
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-2">Resumen</h4>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {renderTextWithLinks(meeting.summary)}
          </p>
        </div>
      )}
      {meeting.notes && (
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-2">Notas</h4>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {renderTextWithLinks(meeting.notes)}
          </p>
        </div>
      )}
      {!meeting.summary && !meeting.notes && (
        <p className="text-sm text-gray-500 italic">No hay resumen o notas disponibles.</p>
      )}
    </div>
  );

  const renderAgreementsSection = () => {
    const hasAgreements = meetingWithDetails?.agreements.length > 0;
    const hasCommitments = meetingWithDetails?.commitments.length > 0;

    if (!hasAgreements && !hasCommitments) {
      return <p className="text-sm text-gray-500 italic">No se registraron acuerdos o compromisos en esta reunión.</p>;
    }

    return (
      <div className="space-y-6">
        {/* Agreements as unified commitments */}
        {hasAgreements && (
          <div className="space-y-3">
            {meetingWithDetails.agreements.map((agreement, index) => (
              <div key={agreement.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex-shrink-0 w-6 h-6 bg-[#fbbf24] rounded-full flex items-center justify-center text-xs font-bold text-[#0a0a0a]">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{agreement.agreement_text}</p>
                  {agreement.category && (
                    <span className="inline-block mt-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                      {agreement.category}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Commitments */}
        {hasCommitments && (
          <div className="space-y-3">
            {meetingWithDetails.commitments.map(commitment => (
              <TaskTracker
                key={commitment.id}
                item={commitment}
                itemType="commitment"
                canEdit={canEdit}
                onStatusUpdate={onTaskUpdate}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderTasksSection = () => {
    if (!meetingWithDetails?.tasks.length) {
      return <p className="text-sm text-gray-500 italic">No se asignaron tareas en esta reunión.</p>;
    }

    return (
      <div className="space-y-3">
        {meetingWithDetails.tasks.map(task => (
          <TaskTracker
            key={task.id}
            item={task}
            itemType="task"
            canEdit={canEdit}
            onStatusUpdate={onTaskUpdate}
          />
        ))}
      </div>
    );
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
    }
  };

  const renderDocumentsSection = () => {
    if (loadingAttachments) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#fbbf24]"></div>
        </div>
      );
    }

    if (attachments.length === 0) {
      return <p className="text-sm text-gray-500 italic">No se adjuntaron documentos en esta reunión.</p>;
    }

    return (
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
              className="flex-shrink-0 p-2 text-[#0a0a0a] hover:text-[#fbbf24] hover:bg-[#fbbf24]/10 rounded-lg transition-colors"
              title="Descargar documento"
            >
              <DownloadIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    );
  };


  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}>
      {/* Card Header */}
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-3 mb-2">
              <h3 className="text-lg font-semibold text-[#0a0a0a] truncate">
                {meeting.title}
              </h3>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${meetingStatusColors[meeting.status]}`}>
                {meetingStatusLabels[meeting.status]}
              </span>
            </div>
            
            {meeting.description && (
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                {meeting.description}
              </p>
            )}

            {/* Meeting Metadata */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center space-x-1">
                <CalendarIcon className="h-4 w-4" />
                <span>{formatMeetingDate(meeting.meeting_date)}</span>
              </div>
              
              <div className="flex items-center space-x-1">
                <ClockIcon className="h-4 w-4" />
                <span>{meeting.duration_minutes} min</span>
              </div>

              {meeting.location && (
                <div className="flex items-center space-x-1">
                  <LocationMarkerIcon className="h-4 w-4" />
                  <span className="truncate max-w-32">{meeting.location}</span>
                </div>
              )}

              {meeting.facilitator && meeting.facilitator.first_name && (
                <div className="flex items-center space-x-1">
                  <UserIcon className="h-4 w-4" />
                  <span>
                    {meeting.facilitator.first_name} {meeting.facilitator.last_name}
                  </span>
                </div>
              )}
            </div>

            {/* Attendees Preview */}
            {meetingWithDetails && meetingWithDetails.attendees && meetingWithDetails.attendees.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <UsersIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <div className="flex -space-x-2 overflow-hidden">
                  {meetingWithDetails.attendees.slice(0, 5).map((attendee, index) => (
                    <div key={attendee.id} className="relative group">
                      {attendee.user_profile && attendee.user_profile.avatar_url ? (
                        <img
                          src={attendee.user_profile.avatar_url}
                          alt={`${attendee.user_profile.first_name} ${attendee.user_profile.last_name}`}
                          className="h-8 w-8 rounded-full border-2 border-white"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-gray-300 border-2 border-white flex items-center justify-center">
                          <UserIcon className="h-4 w-4 text-gray-600" />
                        </div>
                      )}
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        {attendee.user_profile
                          ? `${attendee.user_profile.first_name || ''} ${attendee.user_profile.last_name || ''}`.trim() || 'Sin nombre'
                          : 'Usuario'}
                      </div>
                    </div>
                  ))}
                  {meetingWithDetails.attendees.length > 5 && (
                    <div className="h-8 w-8 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center">
                      <span className="text-xs font-medium text-gray-600">+{meetingWithDetails.attendees.length - 5}</span>
                    </div>
                  )}
                </div>
                <span className="text-sm text-gray-500">
                  {meetingWithDetails.attendees.length} participante{meetingWithDetails.attendees.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-2 ml-4">
            {onView && (
              <button
                onClick={() => onView(meeting.id)}
                className="p-2 text-gray-400 hover:text-[#0a0a0a] hover:bg-gray-100 rounded-lg transition-colors duration-200"
                title="Ver detalles"
              >
                <EyeIcon className="h-4 w-4" />
              </button>
            )}
            
            {canEdit && onEdit && (
              <button
                onClick={() => onEdit(meeting.id)}
                className="p-2 text-gray-400 hover:text-[#fbbf24] hover:bg-[#fbbf24]/10 rounded-lg transition-colors duration-200"
                title="Editar reunión"
              >
                <PencilIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Task Stats */}
        {taskStats && taskStats.totalTasks > 0 && (
          <div className="mt-4 flex items-center space-x-6 text-sm">
            <div className="flex items-center space-x-1">
              <CheckCircleIcon className="h-4 w-4 text-green-600" />
              <span className="text-gray-600">
                {taskStats.completedTasks}/{taskStats.totalTasks} completadas
              </span>
            </div>
            
            {taskStats.overdueTasks > 0 && (
              <div className="flex items-center space-x-1">
                <ExclamationIcon className="h-4 w-4 text-red-600" />
                <span className="text-red-600">
                  {taskStats.overdueTasks} vencidas
                </span>
              </div>
            )}
          </div>
        )}

        {/* Section Navigation */}
        {meetingWithDetails && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => toggleSection('summary')}
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors duration-200 ${
                activeSection === 'summary' && isExpanded
                  ? 'bg-[#fbbf24] text-[#0a0a0a]'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <DocumentTextIcon className="h-3 w-3 mr-1" />
              Resumen
            </button>

            {meetingWithDetails && (meetingWithDetails.agreements.length > 0 || meetingWithDetails.commitments.length > 0) && (
              <button
                onClick={() => toggleSection('agreements')}
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors duration-200 ${
                  activeSection === 'agreements' && isExpanded
                    ? 'bg-[#fbbf24] text-[#0a0a0a]'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <MenuIcon className="h-3 w-3 mr-1" />
                Acuerdos y Compromisos ({meetingWithDetails.agreements.length + meetingWithDetails.commitments.length})
              </button>
            )}

            {meetingWithDetails.tasks.length > 0 && (
              <button
                onClick={() => toggleSection('tasks')}
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors duration-200 ${
                  activeSection === 'tasks' && isExpanded
                    ? 'bg-[#fbbf24] text-[#0a0a0a]'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <CheckCircleIcon className="h-3 w-3 mr-1" />
                Tareas ({meetingWithDetails.tasks.length})
              </button>
            )}

            <button
              onClick={() => toggleSection('documents')}
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors duration-200 ${
                activeSection === 'documents' && isExpanded
                  ? 'bg-[#fbbf24] text-[#0a0a0a]'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <PaperClipIcon className="h-3 w-3 mr-1" />
              Documentos
            </button>

          </div>
        )}

        {/* Expand/Collapse Indicator */}
        {meetingWithDetails && (
          <div className="flex justify-center mt-4">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors duration-200"
            >
              {isExpanded ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && meetingWithDetails && (
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="max-h-96 overflow-y-auto">
            {activeSection === 'summary' && renderSummarySection()}
            {activeSection === 'agreements' && renderAgreementsSection()}
            {activeSection === 'tasks' && renderTasksSection()}
            {activeSection === 'documents' && renderDocumentsSection()}
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetingCard;
