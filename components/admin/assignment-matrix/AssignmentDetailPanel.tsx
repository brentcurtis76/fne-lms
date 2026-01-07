import React, { useState } from 'react';
import { User, BookOpen, Route, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { UserAssignmentsResponse, UserAssignment } from '../../../types/assignment-matrix';
import AssignmentCard from './AssignmentCard';
import QuickAssignDropdown from './QuickAssignDropdown';
import { useOverlapDetection } from './hooks/useOverlapDetection';
import { UserHeaderSkeleton, AssignmentListSkeleton, EmptyState } from './SkeletonLoaders';
import { AuditLogSection } from './AuditLogSection';
import { UnassignConfirmModal } from './UnassignConfirmModal';

interface AssignmentDetailPanelProps {
  userAssignments: UserAssignmentsResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onUnassignCourse: (courseId: string, userIds: string[]) => Promise<boolean>;
  onUnassignLP: (pathId: string, userId: string) => Promise<boolean>;
  onAssignCourse: (courseId: string, userIds: string[]) => Promise<boolean>;
  onAssignLP: (pathId: string, userIds: string[]) => Promise<boolean>;
  // Content search props
  courseSearchResults: Array<{ id: string; title: string; description?: string }>;
  lpSearchResults: Array<{ id: string; title: string; courseCount: number }>;
  searchContentQuery: string;
  onSearchContentChange: (query: string) => void;
  contentSearchLoading: boolean;
  mutating: boolean;
}

/**
 * Right panel showing assignments for selected user with quick assign dropdown
 */
export function AssignmentDetailPanel({
  userAssignments,
  loading,
  error,
  onRefresh,
  onUnassignCourse,
  onUnassignLP,
  onAssignCourse,
  onAssignLP,
  courseSearchResults,
  lpSearchResults,
  searchContentQuery,
  onSearchContentChange,
  contentSearchLoading,
  mutating
}: AssignmentDetailPanelProps) {
  const { checkCourseOverlap, checkLPOverlap } = useOverlapDetection(userAssignments);

  // State for unassign confirmation modal
  const [unassignModalData, setUnassignModalData] = useState<{
    isOpen: boolean;
    assignment: UserAssignment | null;
  }>({ isOpen: false, assignment: null });

  // Trigger to refresh audit log after mutations
  const [auditRefreshTrigger, setAuditRefreshTrigger] = useState(0);

  // Open unassign confirmation modal
  const handleUnassignClick = (assignment: UserAssignment) => {
    setUnassignModalData({ isOpen: true, assignment });
  };

  // Handle confirmed unassign (from modal)
  const handleUnassignConfirm = async (cleanSlate: boolean) => {
    if (!userAssignments || !unassignModalData.assignment) return;

    const assignment = unassignModalData.assignment;
    const userId = userAssignments.user.id;

    try {
      if (assignment.type === 'learning_path') {
        // cleanSlate param passed but backend doesn't support it yet
        await onUnassignLP(assignment.contentId, userId);
        toast.success(`Ruta "${assignment.contentTitle}" desasignada`);
      } else {
        // For courses, only unassign if direct assignment exists
        if (assignment.source === 'asignacion_directa' || assignment.source === 'directa_y_ruta') {
          await onUnassignCourse(assignment.contentId, [userId]);
          toast.success(`Curso "${assignment.contentTitle}" desasignado`);
        }
      }

      // Trigger audit log refresh after successful unassignment
      setAuditRefreshTrigger(prev => prev + 1);
    } catch (error: any) {
      toast.error(error.message || 'Error al desasignar');
      throw error; // Re-throw so modal knows it failed
    }
  };

  // Close unassign modal
  const handleUnassignModalClose = () => {
    setUnassignModalData({ isOpen: false, assignment: null });
  };

  // No user selected state
  if (!userAssignments && !loading && !error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <User className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            Selecciona un usuario
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            Selecciona un usuario del panel izquierdo para ver sus asignaciones
          </p>
        </div>
      </div>
    );
  }

  // Loading state - show skeleton
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
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand_primary rounded-md hover:bg-gray-800"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!userAssignments) return null;

  const { user, assignments, stats } = userAssignments;

  // Separate courses and LPs for display
  const courseAssignments = assignments.filter(a => a.type === 'course');
  const lpAssignments = assignments.filter(a => a.type === 'learning_path');

  // Stats line with overlap info
  const statsLine = `Cursos: ${stats.totalCourses}${stats.overlappingCourses > 0 ? ` (${stats.overlappingCourses} con superposición)` : ''} · Rutas: ${stats.totalLPs}`;

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
      {/* User header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{user.name}</h2>
            <p className="text-sm text-gray-500">{user.email}</p>
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
        {assignments.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-12 w-12" />}
            title="Sin asignaciones"
            description="Este usuario no tiene cursos ni rutas asignadas. Usa el panel de abajo para asignar contenido."
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
                    <AssignmentCard
                      key={assignment.id}
                      assignment={assignment}
                      onUnassign={handleUnassignClick}
                      disabled={mutating}
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
                    <AssignmentCard
                      key={assignment.id}
                      assignment={assignment}
                      onUnassign={handleUnassignClick}
                      disabled={mutating}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Audit Log Section - shows assignment history for this user */}
        <AuditLogSection
          entityType="user"
          entityId={user.id}
          refreshTrigger={auditRefreshTrigger}
        />
      </div>

      {/* Quick assign section */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Asignar</h3>
        <QuickAssignDropdown
          courseResults={courseSearchResults}
          lpResults={lpSearchResults}
          searchQuery={searchContentQuery}
          onSearchChange={onSearchContentChange}
          isSearching={contentSearchLoading}
          onAssignCourse={async (courseId) => {
            const result = await onAssignCourse(courseId, [user.id]);
            if (result) setAuditRefreshTrigger(prev => prev + 1);
            return result;
          }}
          onAssignLP={async (pathId) => {
            const result = await onAssignLP(pathId, [user.id]);
            if (result) setAuditRefreshTrigger(prev => prev + 1);
            return result;
          }}
          checkCourseOverlap={checkCourseOverlap}
          checkLPOverlap={checkLPOverlap}
          disabled={mutating}
        />
      </div>

      {/* Unassign Confirmation Modal */}
      {unassignModalData.assignment && (
        <UnassignConfirmModal
          isOpen={unassignModalData.isOpen}
          onClose={handleUnassignModalClose}
          onConfirm={handleUnassignConfirm}
          contentType={unassignModalData.assignment.type === 'learning_path' ? 'learning_path' : 'course'}
          contentTitle={unassignModalData.assignment.contentTitle}
          userName={user.name}
          source={unassignModalData.assignment.source}
          sourceLPNames={unassignModalData.assignment.sourceLPNames}
          hasProgress={(unassignModalData.assignment.progress ?? 0) > 0}
          progressPercent={unassignModalData.assignment.progress}
        />
      )}
    </div>
  );
}

export default AssignmentDetailPanel;
