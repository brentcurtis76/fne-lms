/**
 * Meeting Card Component
 * Expandable meeting display with collapsible sections for agreements, tasks, and commitments
 */

import React, { useState } from 'react';
import { 
  ChevronDownIcon,
  ChevronUpIcon,
  CalendarDaysIcon,
  ClockIcon,
  MapPinIcon,
  UserIcon,
  DocumentTextIcon,
  ListBulletIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  PencilIcon
} from '@heroicons/react/24/outline';
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
  const [activeSection, setActiveSection] = useState<'summary' | 'agreements' | 'tasks' | 'commitments'>('summary');

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

  const toggleSection = (section: typeof activeSection) => {
    if (activeSection === section && isExpanded) {
      setIsExpanded(false);
    } else {
      setActiveSection(section);
      setIsExpanded(true);
    }
  };

  const renderSummarySection = () => (
    <div className="space-y-3">
      {meeting.summary && (
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-2">Resumen</h4>
          <p className="text-sm text-gray-700">{meeting.summary}</p>
        </div>
      )}
      {meeting.notes && (
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-2">Notas</h4>
          <p className="text-sm text-gray-700">{meeting.notes}</p>
        </div>
      )}
      {!meeting.summary && !meeting.notes && (
        <p className="text-sm text-gray-500 italic">No hay resumen o notas disponibles.</p>
      )}
    </div>
  );

  const renderAgreementsSection = () => {
    if (!meetingWithDetails?.agreements.length) {
      return <p className="text-sm text-gray-500 italic">No se registraron acuerdos en esta reunión.</p>;
    }

    return (
      <div className="space-y-3">
        {meetingWithDetails.agreements.map((agreement, index) => (
          <div key={agreement.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
            <div className="flex-shrink-0 w-6 h-6 bg-[#fdb933] rounded-full flex items-center justify-center text-xs font-bold text-[#00365b]">
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

  const renderCommitmentsSection = () => {
    if (!meetingWithDetails?.commitments.length) {
      return <p className="text-sm text-gray-500 italic">No se asignaron compromisos en esta reunión.</p>;
    }

    return (
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
    );
  };

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}>
      {/* Card Header */}
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-3 mb-2">
              <h3 className="text-lg font-semibold text-[#00365b] truncate">
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
                <CalendarDaysIcon className="h-4 w-4" />
                <span>{formatMeetingDate(meeting.meeting_date)}</span>
              </div>
              
              <div className="flex items-center space-x-1">
                <ClockIcon className="h-4 w-4" />
                <span>{meeting.duration_minutes} min</span>
              </div>

              {meeting.location && (
                <div className="flex items-center space-x-1">
                  <MapPinIcon className="h-4 w-4" />
                  <span className="truncate max-w-32">{meeting.location}</span>
                </div>
              )}

              {meeting.facilitator && (
                <div className="flex items-center space-x-1">
                  <UserIcon className="h-4 w-4" />
                  <span>
                    {meeting.facilitator.first_name} {meeting.facilitator.last_name}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-2 ml-4">
            {onView && (
              <button
                onClick={() => onView(meeting.id)}
                className="p-2 text-gray-400 hover:text-[#00365b] hover:bg-gray-100 rounded-lg transition-colors duration-200"
                title="Ver detalles"
              >
                <EyeIcon className="h-4 w-4" />
              </button>
            )}
            
            {canEdit && onEdit && (
              <button
                onClick={() => onEdit(meeting.id)}
                className="p-2 text-gray-400 hover:text-[#fdb933] hover:bg-[#fdb933]/10 rounded-lg transition-colors duration-200"
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
                <ExclamationTriangleIcon className="h-4 w-4 text-red-600" />
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
                  ? 'bg-[#fdb933] text-[#00365b]'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <DocumentTextIcon className="h-3 w-3 mr-1" />
              Resumen
            </button>

            {meetingWithDetails.agreements.length > 0 && (
              <button
                onClick={() => toggleSection('agreements')}
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors duration-200 ${
                  activeSection === 'agreements' && isExpanded
                    ? 'bg-[#fdb933] text-[#00365b]'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <ListBulletIcon className="h-3 w-3 mr-1" />
                Acuerdos ({meetingWithDetails.agreements.length})
              </button>
            )}

            {meetingWithDetails.tasks.length > 0 && (
              <button
                onClick={() => toggleSection('tasks')}
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors duration-200 ${
                  activeSection === 'tasks' && isExpanded
                    ? 'bg-[#fdb933] text-[#00365b]'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <CheckCircleIcon className="h-3 w-3 mr-1" />
                Tareas ({meetingWithDetails.tasks.length})
              </button>
            )}

            {meetingWithDetails.commitments.length > 0 && (
              <button
                onClick={() => toggleSection('commitments')}
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors duration-200 ${
                  activeSection === 'commitments' && isExpanded
                    ? 'bg-[#fdb933] text-[#00365b]'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <UserIcon className="h-3 w-3 mr-1" />
                Compromisos ({meetingWithDetails.commitments.length})
              </button>
            )}
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
            {activeSection === 'commitments' && renderCommitmentsSection()}
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetingCard;