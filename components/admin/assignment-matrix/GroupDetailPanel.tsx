import React from 'react';
import { Building, Users, BookOpen, Route, AlertCircle, RefreshCw, GraduationCap, UsersRound } from 'lucide-react';
import { UserHeaderSkeleton, AssignmentListSkeleton, EmptyState } from './SkeletonLoaders';

interface GroupAssignmentSummary {
  contentId: string;
  contentTitle: string;
  contentDescription?: string;
  type: 'course' | 'learning_path';
  assignedCount: number;
  completedCount: number;
  averageProgress?: number;
}

interface GroupDetailPanelProps {
  selectedGroup: { type: 'school' | 'community'; id: string } | null;
  groupName: string;
  groupAssignments: GroupAssignmentSummary[];
  groupMemberCount: number;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

/**
 * Right panel showing assignments for a selected group (school or community)
 */
export function GroupDetailPanel({
  selectedGroup,
  groupName,
  groupAssignments,
  groupMemberCount,
  loading,
  error,
  onRefresh
}: GroupDetailPanelProps) {
  // No group selected state
  if (!selectedGroup && !loading && !error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <Building className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            Selecciona un grupo
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            Selecciona una escuela o comunidad del panel izquierdo para ver sus asignaciones
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
        <UserHeaderSkeleton />
        <div className="flex-1 px-6 py-4">
          <AssignmentListSkeleton count={4} />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            Error al cargar
          </h3>
          <p className="mt-2 text-sm text-red-600">
            {error}
          </p>
          <button
            onClick={onRefresh}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!selectedGroup) return null;

  // Separate courses and LPs
  const courseAssignments = groupAssignments.filter(a => a.type === 'course');
  const lpAssignments = groupAssignments.filter(a => a.type === 'learning_path');

  // Stats line
  const statsLine = `Cursos: ${courseAssignments.length} · Rutas: ${lpAssignments.length} · Miembros: ${groupMemberCount}`;

  const GroupIcon = selectedGroup.type === 'school' ? GraduationCap : UsersRound;
  const groupTypeLabel = selectedGroup.type === 'school' ? 'Escuela' : 'Comunidad';

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
      {/* Group header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <GroupIcon className="h-5 w-5 text-blue-600" />
              <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">
                {groupTypeLabel}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mt-1">{groupName}</h2>
            <p className="text-xs text-gray-400 mt-1">{statsLine}</p>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md"
            title="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Assignments list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {groupAssignments.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-12 w-12" />}
            title="Sin asignaciones"
            description={`Este grupo no tiene cursos ni rutas asignadas a sus ${groupMemberCount} miembros.`}
          />
        ) : (
          <div className="space-y-6">
            {/* Learning Paths section */}
            {lpAssignments.length > 0 && (
              <div>
                <h3 className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                  <Route className="h-4 w-4" />
                  Rutas de Aprendizaje
                </h3>
                <div className="space-y-3">
                  {lpAssignments.map((assignment) => (
                    <GroupAssignmentCard
                      key={assignment.contentId}
                      assignment={assignment}
                      totalMembers={groupMemberCount}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Courses section */}
            {courseAssignments.length > 0 && (
              <div>
                <h3 className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                  <BookOpen className="h-4 w-4" />
                  Cursos
                </h3>
                <div className="space-y-3">
                  {courseAssignments.map((assignment) => (
                    <GroupAssignmentCard
                      key={assignment.contentId}
                      assignment={assignment}
                      totalMembers={groupMemberCount}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary stats section */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Resumen del Grupo</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">{groupMemberCount}</div>
            <div className="text-xs text-gray-500">Miembros</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{courseAssignments.length}</div>
            <div className="text-xs text-gray-500">Cursos</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">{lpAssignments.length}</div>
            <div className="text-xs text-gray-500">Rutas</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Card component for displaying a group assignment summary
 */
function GroupAssignmentCard({
  assignment,
  totalMembers
}: {
  assignment: GroupAssignmentSummary;
  totalMembers: number;
}) {
  const Icon = assignment.type === 'course' ? BookOpen : Route;
  const coverage = totalMembers > 0 ? Math.round((assignment.assignedCount / totalMembers) * 100) : 0;
  const completionRate = assignment.assignedCount > 0
    ? Math.round((assignment.completedCount / assignment.assignedCount) * 100)
    : 0;

  return (
    <div className="p-4 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 p-2 bg-gray-100 rounded-lg">
          <Icon className="h-5 w-5 text-gray-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900 truncate">
            {assignment.contentTitle}
          </h4>
          {assignment.contentDescription && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
              {assignment.contentDescription}
            </p>
          )}

          {/* Dual progress bars with labels */}
          <div className="mt-3 space-y-2">
            {/* Coverage bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs text-gray-600">Cobertura</span>
                </div>
                <span className="text-xs font-medium text-gray-700">
                  {assignment.assignedCount}/{totalMembers} ({coverage}%)
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${coverage}%` }}
                />
              </div>
            </div>

            {/* Progress bar (courses only) */}
            {assignment.type === 'course' && assignment.averageProgress !== undefined && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">Progreso promedio</span>
                  <span className="text-xs font-medium text-gray-700">
                    {assignment.averageProgress}%
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-300"
                    style={{ width: `${assignment.averageProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Completion info */}
          {assignment.completedCount > 0 && (
            <div className="text-xs text-green-600 mt-2">
              ✓ {assignment.completedCount} completaron ({completionRate}%)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GroupDetailPanel;
