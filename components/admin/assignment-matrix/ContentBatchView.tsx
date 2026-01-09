import React, { useState, useEffect, useCallback } from 'react';
import { Search, BookOpen, Route, Users, Building, Loader2, ChevronDown, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import useDebounce from '../../../hooks/useDebounce';
import {
  CourseWithStats,
  LearningPathWithStats,
  ContentStatsResponse,
  ContentBatchFilters
} from '../../../types/assignment-matrix';

interface ContentBatchViewProps {
  onOpenBatchAssign: (contentType: 'course' | 'learning_path', contentId: string, contentTitle: string) => void;
  refreshTrigger?: number; // Increment to trigger a refresh
}

/**
 * Content Batch View - Phase 3
 * Lists courses and learning paths with assignment stats
 * Allows opening batch assign modal for multi-user/group assignment
 */
export function ContentBatchView({ onOpenBatchAssign, refreshTrigger }: ContentBatchViewProps) {
  const [filters, setFilters] = useState<ContentBatchFilters>({
    contentType: 'all',
    searchQuery: ''
  });
  const [courses, setCourses] = useState<CourseWithStats[]>([]);
  const [learningPaths, setLearningPaths] = useState<LearningPathWithStats[]>([]);
  const [totalCourses, setTotalCourses] = useState(0);
  const [totalLearningPaths, setTotalLearningPaths] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const debouncedSearch = useDebounce(filters.searchQuery, 300);

  // Fetch content stats
  const fetchContentStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        contentType: filters.contentType,
        search: debouncedSearch,
        page: page.toString(),
        pageSize: pageSize.toString()
      });

      const response = await fetch(`/api/admin/assignment-matrix/content-stats?${params}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al cargar contenido');
      }

      const data: ContentStatsResponse = await response.json();

      setCourses(data.courses || []);
      setLearningPaths(data.learningPaths || []);
      setTotalCourses(data.totalCourses || 0);
      setTotalLearningPaths(data.totalLearningPaths || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters.contentType, debouncedSearch, page, pageSize]);

  useEffect(() => {
    fetchContentStats();
  }, [fetchContentStats]);

  // Refresh when refreshTrigger changes (after batch assignment)
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      fetchContentStats();
    }
  }, [refreshTrigger, fetchContentStats]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filters.contentType, debouncedSearch]);

  const handleSearchChange = (query: string) => {
    setFilters(prev => ({ ...prev, searchQuery: query }));
  };

  const handleContentTypeChange = (type: ContentBatchFilters['contentType']) => {
    setFilters(prev => ({ ...prev, contentType: type }));
  };

  const showCourses = filters.contentType === 'all' || filters.contentType === 'courses';
  const showLPs = filters.contentType === 'all' || filters.contentType === 'learning_paths';

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* Header with filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Vista por Contenido</h2>
            <p className="text-sm text-gray-500">
              Gestiona asignaciones masivas de cursos y rutas
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {filters.contentType !== 'learning_paths' && (
              <span className="flex items-center gap-1">
                <BookOpen className="h-4 w-4" />
                {totalCourses} cursos
              </span>
            )}
            {filters.contentType !== 'courses' && (
              <span className="flex items-center gap-1">
                <Route className="h-4 w-4" />
                {totalLearningPaths} rutas
              </span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por título..."
              value={filters.searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-brand_accent"
            />
          </div>

          {/* Content type filter */}
          <div className="relative">
            <select
              value={filters.contentType}
              onChange={(e) => handleContentTypeChange(e.target.value as ContentBatchFilters['contentType'])}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-brand_accent bg-white"
            >
              <option value="all">Todo el contenido</option>
              <option value="courses">Solo cursos</option>
              <option value="learning_paths">Solo rutas</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Content list */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-brand_primary animate-spin" />
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-8">
            {/* Courses section */}
            {showCourses && courses.length > 0 && (
              <section>
                <h3 className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-4">
                  <BookOpen className="h-4 w-4" />
                  Cursos
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {courses.map((course) => (
                    <CourseCard
                      key={course.id}
                      course={course}
                      onAssign={() => onOpenBatchAssign('course', course.id, course.title)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Learning Paths section */}
            {showLPs && learningPaths.length > 0 && (
              <section>
                <h3 className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-4">
                  <Route className="h-4 w-4" />
                  Rutas de Aprendizaje
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {learningPaths.map((lp) => (
                    <LearningPathCard
                      key={lp.id}
                      learningPath={lp}
                      onAssign={() => onOpenBatchAssign('learning_path', lp.id, lp.name)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {!loading && courses.length === 0 && learningPaths.length === 0 && (
              <div className="text-center py-12">
                <BookOpen className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">
                  No se encontró contenido
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  {filters.searchQuery
                    ? `No hay resultados para "${filters.searchQuery}"`
                    : 'No hay contenido disponible'}
                </p>
              </div>
            )}

            {/* Pagination */}
            {!loading && (courses.length > 0 || learningPaths.length > 0) && (
              <PaginationControls
                page={page}
                pageSize={pageSize}
                totalCourses={showCourses ? totalCourses : 0}
                totalLearningPaths={showLPs ? totalLearningPaths : 0}
                onPageChange={setPage}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Pagination controls component
interface PaginationControlsProps {
  page: number;
  pageSize: number;
  totalCourses: number;
  totalLearningPaths: number;
  onPageChange: (page: number) => void;
}

function PaginationControls({
  page,
  pageSize,
  totalCourses,
  totalLearningPaths,
  onPageChange
}: PaginationControlsProps) {
  // Calculate total items and pages based on the larger of the two
  const totalItems = Math.max(totalCourses, totalLearningPaths);
  const totalPages = Math.ceil(totalItems / pageSize);

  // Don't show pagination if only one page
  if (totalPages <= 1) return null;

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between pt-6 border-t border-gray-200 mt-8">
      <p className="text-sm text-gray-500">
        Mostrando {startItem}-{endItem} de {totalItems}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </button>
        <span className="text-sm text-gray-500">
          Página {page} de {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Siguiente
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Course card component
interface CourseCardProps {
  course: CourseWithStats;
  onAssign: () => void;
}

function CourseCard({ course, onAssign }: CourseCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-gray-900 truncate" title={course.title}>
            {course.title}
          </h4>
          {course.instructorName && (
            <p className="text-xs text-gray-500 mt-0.5">
              {course.instructorName}
            </p>
          )}
          {course.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2" title={course.description}>
              {course.description}
            </p>
          )}
        </div>
        <button
          onClick={onAssign}
          className="flex-shrink-0 p-1.5 text-brand_primary hover:bg-brand_beige rounded-md transition-colors"
          title="Asignar a usuarios"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Stats - show separate counts to avoid misleading totals */}
      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1" title="Asignaciones directas al curso">
          <Users className="h-3.5 w-3.5" />
          {course.directAssigneeCount} directo{course.directAssigneeCount !== 1 ? 's' : ''}
        </span>
        {course.learningPathCount > 0 && (
          <span className="flex items-center gap-1" title={`Incluido en ${course.learningPathCount} ruta(s) de aprendizaje`}>
            <Route className="h-3.5 w-3.5" />
            {course.learningPathCount} ruta{course.learningPathCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Assignment badge - show direct assignments as primary metric */}
      {course.directAssigneeCount > 0 || course.lpAssigneeCount > 0 ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
          <span>{course.directAssigneeCount} directo{course.directAssigneeCount !== 1 ? 's' : ''}</span>
          {course.lpAssigneeCount > 0 && (
            <span
              className="text-gray-400"
              title="Usuarios con acceso via rutas de aprendizaje (puede incluir algunos usuarios ya contados en asignaciones directas)"
            >
              · +{course.lpAssigneeCount} via rutas
            </span>
          )}
        </div>
      ) : (
        <div className="mt-2">
          <span className="text-xs text-gray-400">Sin asignar</span>
        </div>
      )}
    </div>
  );
}

// Learning Path card component
interface LearningPathCardProps {
  learningPath: LearningPathWithStats;
  onAssign: () => void;
}

function LearningPathCard({ learningPath, onAssign }: LearningPathCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-gray-900 truncate" title={learningPath.name}>
            {learningPath.name}
          </h4>
          <p className="text-xs text-gray-500 mt-0.5">
            {learningPath.courseCount} cursos
          </p>
          {learningPath.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2" title={learningPath.description}>
              {learningPath.description}
            </p>
          )}
        </div>
        <button
          onClick={onAssign}
          className="flex-shrink-0 p-1.5 text-brand_primary hover:bg-brand_beige rounded-md transition-colors"
          title="Asignar a usuarios"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Stats - groupAssigneeCount refers to community_workspaces, not schools/communities */}
      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1" title="Usuarios asignados directamente a esta ruta">
          <Users className="h-3.5 w-3.5" />
          {learningPath.directAssigneeCount} usuario{learningPath.directAssigneeCount !== 1 ? 's' : ''}
        </span>
        {learningPath.groupAssigneeCount > 0 && (
          <span className="flex items-center gap-1" title="Espacios de trabajo colaborativos (no escuelas ni comunidades)">
            <Building className="h-3.5 w-3.5" />
            {learningPath.groupAssigneeCount} espacio{learningPath.groupAssigneeCount !== 1 ? 's' : ''} de trabajo
          </span>
        )}
      </div>

      {/* Assignment badge - show user count as primary metric */}
      {learningPath.directAssigneeCount > 0 || learningPath.groupAssigneeCount > 0 ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
          <span>{learningPath.directAssigneeCount} usuario{learningPath.directAssigneeCount !== 1 ? 's' : ''}</span>
          {learningPath.groupAssigneeCount > 0 && (
            <span
              className="text-gray-400"
              title="Espacios de trabajo colaborativos (community_workspaces), no escuelas ni comunidades"
            >
              · {learningPath.groupAssigneeCount} espacio{learningPath.groupAssigneeCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      ) : (
        <div className="mt-2">
          <span className="text-xs text-gray-400">Sin asignar</span>
        </div>
      )}
    </div>
  );
}

export default ContentBatchView;
