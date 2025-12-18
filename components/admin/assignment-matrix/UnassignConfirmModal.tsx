import React, { useState } from 'react';
import { X, AlertTriangle, Loader2, BookOpen, Route, Info } from 'lucide-react';

interface UnassignConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (cleanSlate: boolean) => Promise<void>;
  contentType: 'course' | 'learning_path';
  contentTitle: string;
  userName: string;
  source: 'asignacion_directa' | 'ruta' | 'directa_y_ruta' | 'inscripcion_otro';
  sourceLPNames?: string[];
  hasProgress?: boolean;
  progressPercent?: number;
}

/**
 * UnassignConfirmModal - Confirmation modal for unassigning content
 *
 * Shows different messaging based on source type:
 * - Direct assignment: Simple confirmation
 * - Mixed (direct + LP): Warns that LP source remains
 * - LP-only: Not shown (courses via LP are read-only in matrix view)
 *
 * Clean slate option:
 * - Only available for learning paths
 * - Requires explicit checkbox confirmation
 * - Warns about permanent progress loss
 *
 * NOTE: Clean slate is UI-only for now. The onConfirm callback receives the
 * cleanSlate boolean, but the backend (pages/api/learning-paths/unassign.ts)
 * does NOT yet support deleting course enrollments/progress. This will require:
 * 1. Adding cleanSlate param to the API
 * 2. Implementing batch delete of course_enrollments for LP courses
 * 3. Potentially adding a new RPC for atomic cleanup
 */
export function UnassignConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  contentType,
  contentTitle,
  userName,
  source,
  sourceLPNames = [],
  hasProgress = false,
  progressPercent = 0
}: UnassignConfirmModalProps) {
  const [cleanSlate, setCleanSlate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(cleanSlate);
      onClose();
    } catch (error) {
      console.error('Unassign error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const ContentIcon = contentType === 'course' ? BookOpen : Route;
  const contentTypeLabel = contentType === 'course' ? 'curso' : 'ruta';

  // Determine the appropriate messaging based on source
  const isMixedSource = source === 'directa_y_ruta';
  const isLPSource = source === 'ruta';

  // LP-sourced courses should not show this modal (they're read-only)
  if (contentType === 'course' && isLPSource) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-red-100 rounded-lg">
              <ContentIcon className="h-5 w-5 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              Desasignar {contentTypeLabel}
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-500 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Content info */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm font-medium text-gray-900 truncate" title={contentTitle}>
              {contentTitle}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Usuario: {userName}
            </p>
          </div>

          {/* Main message */}
          <p className="text-sm text-gray-600">
            {isMixedSource ? (
              <>
                Se quitara la <strong>asignacion directa</strong> de este {contentTypeLabel}.
                El usuario seguira teniendo acceso a traves de:
                <span className="block mt-1 text-gray-700 font-medium">
                  {sourceLPNames.join(', ')}
                </span>
              </>
            ) : (
              <>
                Se desasignara este {contentTypeLabel} de <strong>{userName}</strong>.
              </>
            )}
          </p>

          {/* Progress preservation notice */}
          {hasProgress && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">El progreso se conservara</p>
                <p className="text-blue-700 mt-0.5">
                  {progressPercent > 0
                    ? `Progreso actual: ${progressPercent}%`
                    : 'El usuario podra continuar donde lo dejo si se reasigna.'}
                </p>
              </div>
            </div>
          )}

          {/* Clean slate option - HIDDEN until backend supports it
              TODO: Enable when pages/api/learning-paths/unassign.ts implements cleanSlate param
              Set ENABLE_CLEAN_SLATE to true once backend is ready */}
          {false && contentType === 'learning_path' && (
            <div className="border border-gray-200 rounded-lg p-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cleanSlate}
                  onChange={(e) => setCleanSlate(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    Limpieza completa
                  </span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Eliminar tambien las inscripciones de los cursos de esta ruta
                  </p>
                </div>
              </label>

              {cleanSlate && (
                <div className="mt-3 flex items-start gap-2 p-2 bg-red-50 rounded border border-red-200">
                  <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-red-700">
                    <strong>Atencion:</strong> Esta accion eliminara permanentemente todo el progreso del usuario en los cursos de esta ruta.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors disabled:opacity-50 ${
              cleanSlate
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                : 'bg-gray-800 hover:bg-gray-900 focus:ring-gray-500'
            }`}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {cleanSlate ? 'Eliminar Todo' : 'Desasignar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default UnassignConfirmModal;
