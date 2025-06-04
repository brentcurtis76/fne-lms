/**
 * Task Tracker Component
 * Individual task/commitment status management with progress indicators
 */

import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PlayIcon,
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  CalendarDaysIcon,
  UserIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid';
import { 
  MeetingTask, 
  MeetingCommitment, 
  TaskStatus,
  TaskPriority,
  statusLabels,
  statusColors,
  priorityLabels,
  priorityColors
} from '../../types/meetings';
import { updateTaskStatus, getDaysUntilDue, isOverdue } from '../../utils/meetingUtils';

interface TaskTrackerProps {
  item: MeetingTask | MeetingCommitment;
  itemType: 'task' | 'commitment';
  canEdit: boolean;
  onStatusUpdate?: () => void;
  className?: string;
}

const TaskTracker: React.FC<TaskTrackerProps> = ({
  item,
  itemType,
  canEdit,
  onStatusUpdate,
  className = ''
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState(item.notes || '');

  const title = itemType === 'task' 
    ? (item as MeetingTask).task_title 
    : (item as MeetingCommitment).commitment_text;

  const description = itemType === 'task' 
    ? (item as MeetingTask).task_description 
    : undefined;

  const priority = itemType === 'task' 
    ? (item as MeetingTask).priority 
    : undefined;

  const category = itemType === 'task' 
    ? (item as MeetingTask).category 
    : undefined;

  const estimatedHours = itemType === 'task' 
    ? (item as MeetingTask).estimated_hours 
    : undefined;

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (!canEdit) return;

    setIsUpdating(true);
    try {
      const progressPercentage = newStatus === 'completado' ? 100 : 
                                newStatus === 'en_progreso' ? Math.max(item.progress_percentage, 25) :
                                item.progress_percentage;

      const result = await updateTaskStatus(itemType, item.id, newStatus, progressPercentage, notes);
      
      if (result.success) {
        toast.success(`${itemType === 'task' ? 'Tarea' : 'Compromiso'} actualizado correctamente`);
        onStatusUpdate?.();
      } else {
        toast.error(result.error || 'Error al actualizar estado');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Error inesperado al actualizar estado');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleProgressUpdate = async (progressPercentage: number) => {
    if (!canEdit) return;

    setIsUpdating(true);
    try {
      let newStatus = item.status;
      if (progressPercentage === 100) {
        newStatus = 'completado';
      } else if (progressPercentage > 0 && item.status === 'pendiente') {
        newStatus = 'en_progreso';
      }

      const result = await updateTaskStatus(itemType, item.id, newStatus, progressPercentage, notes);
      
      if (result.success) {
        toast.success('Progreso actualizado');
        onStatusUpdate?.();
      } else {
        toast.error(result.error || 'Error al actualizar progreso');
      }
    } catch (error) {
      console.error('Error updating progress:', error);
      toast.error('Error inesperado al actualizar progreso');
    } finally {
      setIsUpdating(false);
    }
  };

  const saveNotes = async () => {
    if (!canEdit) return;

    setIsUpdating(true);
    try {
      const result = await updateTaskStatus(itemType, item.id, item.status, item.progress_percentage, notes);
      
      if (result.success) {
        toast.success('Notas guardadas');
        setShowNotes(false);
        onStatusUpdate?.();
      } else {
        toast.error(result.error || 'Error al guardar notas');
      }
    } catch (error) {
      console.error('Error saving notes:', error);
      toast.error('Error inesperado al guardar notas');
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'completado':
        return <CheckCircleIconSolid className="h-5 w-5 text-green-600" />;
      case 'en_progreso':
        return <PlayIcon className="h-5 w-5 text-blue-600" />;
      case 'vencido':
        return <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-400" />;
    }
  };

  const getProgressBarColor = () => {
    if (item.status === 'completado') return 'bg-green-500';
    if (item.status === 'vencido') return 'bg-red-500';
    if (item.status === 'en_progreso') return 'bg-blue-500';
    return 'bg-gray-300';
  };

  const daysUntilDue = item.due_date ? getDaysUntilDue(item.due_date) : null;
  const isItemOverdue = item.due_date ? isOverdue(item.due_date) : false;

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow duration-200 ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start space-x-3 flex-1 min-w-0">
          <div className="flex-shrink-0 mt-1">
            {getStatusIcon(item.status)}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-gray-900 truncate" title={title}>
              {title}
            </h3>
            {description && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Status Badge */}
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColors[item.status]}`}>
          {statusLabels[item.status]}
        </span>
      </div>

      {/* Metadata Row */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mb-3">
        {/* Assigned User */}
        {item.assigned_to_profile && (
          <div className="flex items-center space-x-1">
            <UserIcon className="h-3 w-3" />
            <span>{item.assigned_to_profile.first_name} {item.assigned_to_profile.last_name}</span>
          </div>
        )}

        {/* Due Date */}
        {item.due_date && (
          <div className={`flex items-center space-x-1 ${isItemOverdue ? 'text-red-600' : ''}`}>
            <CalendarDaysIcon className="h-3 w-3" />
            <span>
              {new Date(item.due_date).toLocaleDateString('es-CL')}
              {daysUntilDue !== null && (
                <span className="ml-1">
                  ({daysUntilDue === 0 ? 'Hoy' : 
                    daysUntilDue > 0 ? `${daysUntilDue}d` : 
                    `${Math.abs(daysUntilDue)}d vencido`})
                </span>
              )}
            </span>
          </div>
        )}

        {/* Priority (for tasks) */}
        {priority && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors[priority]}`}>
            {priorityLabels[priority]}
          </span>
        )}

        {/* Category */}
        {category && (
          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
            {category}
          </span>
        )}

        {/* Estimated Hours */}
        {estimatedHours && (
          <span className="text-gray-500">
            {estimatedHours}h estimadas
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>Progreso</span>
          <span>{item.progress_percentage}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor()}`}
            style={{ width: `${item.progress_percentage}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      {canEdit && (
        <div className="space-y-3">
          {/* Status Actions */}
          <div className="flex flex-wrap gap-2">
            {item.status !== 'completado' && (
              <>
                {item.status === 'pendiente' && (
                  <button
                    onClick={() => handleStatusChange('en_progreso')}
                    disabled={isUpdating}
                    className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 text-xs rounded-full hover:bg-blue-200 transition-colors duration-200 disabled:opacity-50"
                  >
                    <PlayIcon className="h-3 w-3 mr-1" />
                    Iniciar
                  </button>
                )}
                <button
                  onClick={() => handleStatusChange('completado')}
                  disabled={isUpdating}
                  className="inline-flex items-center px-3 py-1 bg-green-100 text-green-800 text-xs rounded-full hover:bg-green-200 transition-colors duration-200 disabled:opacity-50"
                >
                  <CheckCircleIcon className="h-3 w-3 mr-1" />
                  Completar
                </button>
              </>
            )}

            {item.status === 'completado' && (
              <button
                onClick={() => handleStatusChange('en_progreso')}
                disabled={isUpdating}
                className="inline-flex items-center px-3 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full hover:bg-yellow-200 transition-colors duration-200 disabled:opacity-50"
              >
                <ArrowPathIcon className="h-3 w-3 mr-1" />
                Reabrir
              </button>
            )}

            <button
              onClick={() => setShowNotes(!showNotes)}
              className="inline-flex items-center px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-full hover:bg-gray-200 transition-colors duration-200"
            >
              <ChatBubbleLeftRightIcon className="h-3 w-3 mr-1" />
              Notas
            </button>
          </div>

          {/* Progress Slider */}
          {item.status !== 'completado' && item.status !== 'cancelado' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Actualizar progreso: {item.progress_percentage}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={item.progress_percentage}
                onChange={(e) => handleProgressUpdate(parseInt(e.target.value))}
                disabled={isUpdating}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>
          )}

          {/* Notes Section */}
          {showNotes && (
            <div className="border-t border-gray-200 pt-3">
              <label className="block text-xs text-gray-500 mb-2">
                Notas y comentarios
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Agregar notas sobre el progreso..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent text-sm resize-none"
              />
              <div className="flex justify-end space-x-2 mt-2">
                <button
                  onClick={() => setShowNotes(false)}
                  className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveNotes}
                  disabled={isUpdating}
                  className="px-3 py-1 bg-[#fdb933] text-[#00365b] text-xs rounded-lg hover:bg-[#fdb933]/90 transition-colors duration-200 disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Read-only notes display */}
      {!canEdit && item.notes && (
        <div className="border-t border-gray-200 pt-3 mt-3">
          <p className="text-xs text-gray-500 mb-1">Notas:</p>
          <p className="text-sm text-gray-700">{item.notes}</p>
        </div>
      )}

      {/* Loading Overlay */}
      {isUpdating && (
        <div className="absolute inset-0 bg-white/50 rounded-lg flex items-center justify-center">
          <ArrowPathIcon className="h-5 w-5 text-[#fdb933] animate-spin" />
        </div>
      )}
    </div>
  );
};

export default TaskTracker;