import React from 'react';
import { Trash2, BookOpen, Route, Info } from 'lucide-react';
import { UserAssignment } from '../../../types/assignment-matrix';
import { SourceBadge, OverlapBadge } from './SourceBadge';

interface AssignmentCardProps {
  assignment: UserAssignment;
  // Called when unassign button is clicked - parent handles confirmation modal
  onUnassign: (assignment: UserAssignment) => void;
  disabled?: boolean;
}

/**
 * Card displaying a single assignment with source badge and conditional unassign.
 *
 * Confirmation modal is handled at the parent level (AssignmentDetailPanel)
 * using UnassignConfirmModal for richer messaging and clean slate option.
 */
export function AssignmentCard({ assignment, onUnassign, disabled = false }: AssignmentCardProps) {
  const isCourse = assignment.type === 'course';
  const isLP = assignment.type === 'learning_path';

  // Determine if unassign is allowed based on source
  const canUnassign = (): boolean => {
    if (isLP) {
      // LPs can always be unassigned (removes the LP assignment)
      return true;
    }

    // For courses, check the source
    switch (assignment.source) {
      case 'asignacion_directa':
        return true; // Direct assignments can be removed
      case 'directa_y_ruta':
        return true; // Can remove the direct part
      case 'ruta':
        return false; // LP-sourced courses are read-only
      case 'inscripcion_otro':
        return false; // Unknown source - read-only
      default:
        return false;
    }
  };


  // Get the read-only message for LP-sourced courses
  const getReadOnlyMessage = (): string | null => {
    if (!isCourse) return null;

    switch (assignment.source) {
      case 'ruta':
        const lpName = assignment.sourceLPNames[0] || 'una ruta';
        return `Gestionado por: ${lpName}`;
      case 'inscripcion_otro':
        return 'Ver detalles';
      default:
        return null;
    }
  };


  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-CL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const readOnlyMessage = getReadOnlyMessage();
  const showUnassign = canUnassign();

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          {/* Icon and title */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`flex-shrink-0 p-2 rounded-lg ${isCourse ? 'bg-blue-50' : 'bg-amber-50'}`}>
              {isCourse ? (
                <BookOpen className={`h-5 w-5 ${isCourse ? 'text-blue-600' : 'text-amber-600'}`} />
              ) : (
                <Route className="h-5 w-5 text-amber-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-gray-900 truncate">
                {assignment.contentTitle}
              </h4>
              {assignment.contentDescription && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                  {assignment.contentDescription}
                </p>
              )}
            </div>
          </div>

          {/* Unassign button or read-only indicator */}
          <div className="flex-shrink-0">
            {showUnassign ? (
              <button
                onClick={() => onUnassign(assignment)}
                disabled={disabled}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Desasignar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : readOnlyMessage && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                {assignment.source === 'inscripcion_otro' ? (
                  <span
                    className="inline-flex items-center gap-1 text-gray-500 cursor-help"
                    title="Fuente inferida - inscripción existe pero sin registro de asignación directa ni de ruta. Puede ser auto-inscripción o datos migrados."
                  >
                    <Info className="h-3 w-3" />
                    Fuente desconocida
                  </span>
                ) : (
                  <span className="text-gray-500 italic">{readOnlyMessage}</span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <SourceBadge
            source={assignment.source}
            sourceLPNames={assignment.sourceLPNames}
          />
          {assignment.source === 'directa_y_ruta' && (
            <OverlapBadge sourceCount={2} />
          )}
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
          {/* Assignment date */}
          {assignment.assignedAt && (
            <span>{formatDate(assignment.assignedAt)}</span>
          )}

          {/* Assigned by */}
          {assignment.assignedByName && (
            <span>Por: {assignment.assignedByName}</span>
          )}

          {/* Progress for courses */}
          {isCourse && assignment.progress !== undefined && (
            <span className="font-medium text-gray-700">
              {assignment.progress}% completado
            </span>
          )}

          {/* Course count for LPs */}
          {isLP && assignment.courseCount !== undefined && (
            <span>
              {assignment.coursesCompleted || 0}/{assignment.courseCount} cursos
            </span>
          )}
        </div>

        {/* Progress bar for courses */}
        {isCourse && assignment.progress !== undefined && assignment.progress > 0 && (
          <div className="mt-3">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${assignment.progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default AssignmentCard;
