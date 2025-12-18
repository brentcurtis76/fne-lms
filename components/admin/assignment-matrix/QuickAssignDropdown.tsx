import React, { useState, useRef, useEffect } from 'react';
import { Search, BookOpen, Route, Plus, AlertTriangle, Loader2 } from 'lucide-react';
import { OverlapInfo } from '../../../types/assignment-matrix';
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

interface QuickAssignDropdownProps {
  courseResults: CourseResult[];
  lpResults: LPResult[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isSearching: boolean;
  onAssignCourse: (courseId: string) => Promise<boolean>;
  onAssignLP: (pathId: string) => Promise<boolean>;
  checkCourseOverlap: (courseId: string) => OverlapInfo;
  checkLPOverlap: (pathId: string) => OverlapInfo;
  disabled?: boolean;
}

/**
 * Dropdown for quick course/LP assignment with search and overlap warnings
 */
export function QuickAssignDropdown({
  courseResults,
  lpResults,
  searchQuery,
  onSearchChange,
  isSearching,
  onAssignCourse,
  onAssignLP,
  checkCourseOverlap,
  checkLPOverlap,
  disabled = false
}: QuickAssignDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedOverlap, setSelectedOverlap] = useState<OverlapInfo | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Open dropdown when typing
  useEffect(() => {
    if (searchQuery) {
      setIsOpen(true);
    }
  }, [searchQuery]);

  const handleInputFocus = () => {
    if (searchQuery || courseResults.length > 0 || lpResults.length > 0) {
      setIsOpen(true);
    }
  };

  const handleAssignCourse = async (course: CourseResult) => {
    // Check for overlap
    const overlap = checkCourseOverlap(course.id);

    if (overlap.hasOverlap) {
      // Show warning but still allow (non-blocking in Phase 1)
      setSelectedOverlap(overlap);
    }

    setAssigningId(course.id);
    try {
      const success = await onAssignCourse(course.id);
      if (success) {
        toast.success(`Curso "${course.title}" asignado`);
        onSearchChange('');
        setIsOpen(false);
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al asignar curso');
    } finally {
      setAssigningId(null);
      setSelectedOverlap(null);
    }
  };

  const handleAssignLP = async (lp: LPResult) => {
    // Check for overlap
    const overlap = checkLPOverlap(lp.id);

    if (overlap.hasOverlap) {
      // Show warning but still allow (non-blocking in Phase 1)
      setSelectedOverlap(overlap);
    }

    setAssigningId(lp.id);
    try {
      const success = await onAssignLP(lp.id);
      if (success) {
        toast.success(`Ruta "${lp.title}" asignada`);
        onSearchChange('');
        setIsOpen(false);
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al asignar ruta');
    } finally {
      setAssigningId(null);
      setSelectedOverlap(null);
    }
  };

  const hasResults = courseResults.length > 0 || lpResults.length > 0;
  const showDropdown = isOpen && (searchQuery || hasResults);

  return (
    <div ref={dropdownRef} className="relative">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Buscar curso o ruta para asignar..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={handleInputFocus}
          disabled={disabled}
          className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 animate-spin" />
        )}
      </div>

      {/* Overlap warning (if any) */}
      {selectedOverlap && selectedOverlap.hasOverlap && (
        <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                {selectedOverlap.overlappingCourses.length > 0
                  ? 'Superposición detectada'
                  : 'Ya asignado'}
              </p>
              <p className="text-sm text-amber-700 mt-1">
                {selectedOverlap.message}
              </p>
              {selectedOverlap.overlappingCourses.length > 0 && (
                <p className="text-xs text-amber-600 mt-2">
                  No se creará duplicado; se usará la inscripción existente.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dropdown results - opens upward since this is at bottom of panel */}
      {showDropdown && (
        <div className="absolute z-10 bottom-full mb-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {/* No results */}
          {!hasResults && searchQuery && !isSearching && (
            <div className="px-4 py-3 text-sm text-gray-500 text-center">
              No se encontraron resultados para "{searchQuery}"
            </div>
          )}

          {/* Course results */}
          {courseResults.length > 0 && (
            <div>
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase">
                  <BookOpen className="h-3.5 w-3.5" />
                  Cursos
                </span>
              </div>
              <ul className="divide-y divide-gray-100">
                {courseResults.map((course) => {
                  const isAssigning = assigningId === course.id;
                  const overlap = checkCourseOverlap(course.id);

                  return (
                    <li key={course.id}>
                      <button
                        data-testid={`assign-item-course-${course.id}`}
                        onClick={() => handleAssignCourse(course)}
                        disabled={disabled || isAssigning}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between gap-3 disabled:opacity-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {course.title}
                          </p>
                          {course.description && (
                            <p className="text-xs text-gray-500 truncate">
                              {course.description}
                            </p>
                          )}
                          {overlap.hasOverlap && (
                            <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Ya asignado
                            </p>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          {isAssigning ? (
                            <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                          ) : (
                            <Plus className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* LP results */}
          {lpResults.length > 0 && (
            <div>
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase">
                  <Route className="h-3.5 w-3.5" />
                  Rutas de Aprendizaje
                </span>
              </div>
              <ul className="divide-y divide-gray-100">
                {lpResults.map((lp) => {
                  const isAssigning = assigningId === lp.id;
                  const lpOverlap = checkLPOverlap(lp.id);

                  return (
                    <li key={lp.id}>
                      <button
                        data-testid={`assign-item-lp-${lp.id}`}
                        onClick={() => handleAssignLP(lp)}
                        disabled={disabled || isAssigning}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between gap-3 disabled:opacity-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {lp.title}
                          </p>
                          {lp.description && (
                            <p className="text-xs text-gray-600 truncate">
                              {lp.description}
                            </p>
                          )}
                          <p className="text-xs text-gray-400">
                            {lp.courseCount} cursos
                          </p>
                          {lpOverlap.hasOverlap && (
                            <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Ya asignada
                            </p>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          {isAssigning ? (
                            <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                          ) : (
                            <Plus className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default QuickAssignDropdown;
