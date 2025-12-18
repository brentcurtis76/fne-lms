import React, { useState, useEffect } from 'react';
import { X, Search, BookOpen, Route, Plus, Loader2, CheckCircle, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface CourseResult {
  id: string;
  title: string;
  description?: string;
}

interface LPResult {
  id: string;
  title: string;
  description?: string;
  courseCount: number;
}

interface CommunityAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  communityId: string;
  communityName: string;
  userCount: number;
  courseResults: CourseResult[];
  lpResults: LPResult[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isSearching: boolean;
  onAssignCourse: (courseId: string) => Promise<{ assigned: number; skipped: number }>;
  onAssignLP: (pathId: string) => Promise<{ assigned: number; skipped: number }>;
  disabled?: boolean;
}

/**
 * Modal for assigning courses/LPs to all users in a community
 * Better UX than inline dropdown - full view of content
 */
export function CommunityAssignModal({
  isOpen,
  onClose,
  communityId,
  communityName,
  userCount,
  courseResults,
  lpResults,
  searchQuery,
  onSearchChange,
  isSearching,
  onAssignCourse,
  onAssignLP,
  disabled = false
}: CommunityAssignModalProps) {
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ type: 'course' | 'lp'; title: string; assigned: number; skipped: number } | null>(null);

  // Clear search when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      onSearchChange('');
      setLastResult(null);
    }
  }, [isOpen, onSearchChange]);

  // Clear result after 5 seconds
  useEffect(() => {
    if (lastResult) {
      const timer = setTimeout(() => setLastResult(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [lastResult]);

  const handleAssignCourse = async (course: CourseResult) => {
    setAssigningId(course.id);
    try {
      const result = await onAssignCourse(course.id);
      setLastResult({
        type: 'course',
        title: course.title,
        assigned: result.assigned,
        skipped: result.skipped
      });
      if (result.assigned > 0) {
        toast.success(`Curso asignado a ${result.assigned} usuario(s)`);
      } else {
        toast.success(`Todos los usuarios ya tenían el curso asignado`);
      }
      onSearchChange('');
    } catch (error: any) {
      toast.error(error.message || 'Error al asignar curso');
    } finally {
      setAssigningId(null);
    }
  };

  const handleAssignLP = async (lp: LPResult) => {
    setAssigningId(lp.id);
    try {
      const result = await onAssignLP(lp.id);
      setLastResult({
        type: 'lp',
        title: lp.title,
        assigned: result.assigned,
        skipped: result.skipped
      });
      if (result.assigned > 0) {
        toast.success(`Ruta asignada a ${result.assigned} usuario(s)`);
      } else {
        toast.success(`Todos los usuarios ya tenían la ruta asignada`);
      }
      onSearchChange('');
    } catch (error: any) {
      toast.error(error.message || 'Error al asignar ruta');
    } finally {
      setAssigningId(null);
    }
  };

  if (!isOpen) return null;

  const hasResults = courseResults.length > 0 || lpResults.length > 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Asignar a Comunidad
              </h2>
              <p className="text-sm text-gray-500 mt-1 flex items-center gap-2">
                <Users className="h-4 w-4" />
                {communityName} · {userCount} usuario{userCount !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Last result indicator */}
          {lastResult && (
            <div className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
              <div className="text-sm text-green-800">
                <span className="font-medium">{lastResult.type === 'course' ? 'Curso' : 'Ruta'} "{lastResult.title}":</span>
                {lastResult.assigned > 0
                  ? ` ${lastResult.assigned} asignado(s)${lastResult.skipped > 0 ? `, ${lastResult.skipped} ya tenían asignación` : ''}`
                  : ' ya asignado a todos los usuarios'
                }
              </div>
            </div>
          )}

          {/* Search */}
          <div className="px-6 py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar curso o ruta de aprendizaje..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                disabled={disabled}
                autoFocus
                className="w-full pl-10 pr-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-500 animate-spin" />
              )}
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {!searchQuery && (
              <div className="text-center py-8 text-gray-500">
                <Search className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>Escribe para buscar cursos o rutas de aprendizaje</p>
              </div>
            )}

            {searchQuery && !hasResults && !isSearching && (
              <div className="text-center py-8 text-gray-500">
                <p>No se encontraron resultados para "{searchQuery}"</p>
              </div>
            )}

            {/* Course results */}
            {courseResults.length > 0 && (
              <div className="mb-6">
                <h3 className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                  <BookOpen className="h-4 w-4" />
                  Cursos ({courseResults.length})
                </h3>
                <div className="space-y-2">
                  {courseResults.map((course) => {
                    const isAssigning = assigningId === course.id;

                    return (
                      <div
                        key={course.id}
                        className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-gray-900">
                            {course.title}
                          </h4>
                          {course.description && (
                            <p className="text-sm text-gray-600 mt-1">
                              {course.description}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleAssignCourse(course)}
                          disabled={disabled || isAssigning}
                          className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {isAssigning ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          Asignar
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* LP results */}
            {lpResults.length > 0 && (
              <div>
                <h3 className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                  <Route className="h-4 w-4" />
                  Rutas de Aprendizaje ({lpResults.length})
                </h3>
                <div className="space-y-2">
                  {lpResults.map((lp) => {
                    const isAssigning = assigningId === lp.id;

                    return (
                      <div
                        key={lp.id}
                        className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-gray-900">
                            {lp.title}
                          </h4>
                          {lp.description && (
                            <p className="text-sm text-gray-600 mt-1">
                              {lp.description}
                            </p>
                          )}
                          <p className="text-xs text-blue-600 mt-2">
                            {lp.courseCount} cursos incluidos
                          </p>
                        </div>
                        <button
                          onClick={() => handleAssignLP(lp)}
                          disabled={disabled || isAssigning}
                          className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {isAssigning ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          Asignar
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CommunityAssignModal;
