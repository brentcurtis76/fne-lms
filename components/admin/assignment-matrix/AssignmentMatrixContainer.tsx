import React, { useState, useCallback } from 'react';
import { Users, BookOpen } from 'lucide-react';
import { useAssignmentMatrix } from './hooks/useAssignmentMatrix';
import UserGroupPanel from './UserGroupPanel';
import AssignmentDetailPanel from './AssignmentDetailPanel';
import GroupDetailPanel from './GroupDetailPanel';
import ContentBatchView from './ContentBatchView';
import BatchAssignModal from './BatchAssignModal';

type ViewMode = 'users' | 'content';

/**
 * Main container for the Assignment Matrix feature
 * Implements the dual-panel layout from the plan
 * Phase 3 adds Content Batch View for content-centric operations
 */
export function AssignmentMatrixContainer() {
  // View mode: users (default) or content (Phase 3)
  const [viewMode, setViewMode] = useState<ViewMode>('users');

  // Batch assign modal state
  const [batchAssignModal, setBatchAssignModal] = useState<{
    isOpen: boolean;
    contentType: 'course' | 'learning_path';
    contentId: string;
    contentTitle: string;
  }>({
    isOpen: false,
    contentType: 'course',
    contentId: '',
    contentTitle: ''
  });

  // Refresh trigger for ContentBatchView (increment after batch assignment)
  const [contentRefreshTrigger, setContentRefreshTrigger] = useState(0);

  // Track which panel is using the search (to avoid conflicts)
  const [communitySearchActive, setCommunitySearchActive] = useState(false);

  const {
    // User list
    users,
    usersLoading,
    usersError,
    loadMoreUsers,
    hasMoreUsers,

    // Selected user
    selectedUserId,
    setSelectedUserId,
    userAssignments,
    assignmentsLoading,
    assignmentsError,
    refreshAssignments,

    // Filters
    filters,
    setFilters,

    // Filter options
    schools,
    communities,

    // Content search
    courseSearchResults,
    lpSearchResults,
    searchContentQuery,
    setSearchContentQuery,
    contentSearchLoading,

    // Mutations
    assignCourse,
    assignLP,
    unassignCourse,
    unassignLP,
    mutating,

    // Community-wide assignment
    assignCourseToCommunity,
    assignLPToCommunity,

    // Group selection (Phase 2)
    selectedGroup,
    setSelectedGroup,
    clearSelectedGroup,
    groupAssignments,
    groupAssignmentsLoading,
    groupAssignmentsError,
    groupMemberCount,
    groupName,
    refreshGroupAssignments
  } = useAssignmentMatrix();

  // Get selected community details for display
  const selectedCommunity = filters.communityId
    ? communities.find(c => c.id === filters.communityId)
    : null;

  // Community search handler - uses the same search but tracks which panel is active
  const handleCommunitySearchChange = useCallback((query: string) => {
    setCommunitySearchActive(true);
    setSearchContentQuery(query);
  }, [setSearchContentQuery]);

  // User search handler - clears community search active
  const handleUserSearchChange = useCallback((query: string) => {
    setCommunitySearchActive(false);
    setSearchContentQuery(query);
  }, [setSearchContentQuery]);

  // Handlers for community-wide assignment
  const handleAssignCourseToCommunity = async (courseId: string) => {
    if (!filters.communityId) throw new Error('No hay comunidad seleccionada');
    return assignCourseToCommunity(courseId, filters.communityId);
  };

  const handleAssignLPToCommunity = async (pathId: string) => {
    if (!filters.communityId) throw new Error('No hay comunidad seleccionada');
    return assignLPToCommunity(pathId, filters.communityId);
  };

  // User selection handler - clears group selection for exclusive state
  const handleSelectUser = useCallback((userId: string | null) => {
    setSelectedUserId(userId);
    if (userId) {
      clearSelectedGroup();
    }
  }, [setSelectedUserId, clearSelectedGroup]);

  // Open batch assign modal
  const handleOpenBatchAssign = useCallback((
    contentType: 'course' | 'learning_path',
    contentId: string,
    contentTitle: string
  ) => {
    setBatchAssignModal({
      isOpen: true,
      contentType,
      contentId,
      contentTitle
    });
  }, []);

  // Close batch assign modal
  const handleCloseBatchAssign = useCallback(() => {
    setBatchAssignModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Content batch view renders differently
  if (viewMode === 'content') {
    return (
      <div className="flex flex-col h-[calc(100vh-16rem)]">
        {/* View mode tabs */}
        <div className="bg-white rounded-t-lg border border-b-0 border-gray-200 px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setViewMode('users')}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg text-gray-600 hover:bg-gray-100 border border-transparent hover:border-gray-200 transition-colors"
            >
              <Users className="h-4 w-4" />
              Por Usuario
            </button>
            <button
              onClick={() => setViewMode('content')}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-brand_beige text-brand_primary border border-brand_accent"
            >
              <BookOpen className="h-4 w-4" />
              Por Contenido
            </button>
          </div>
        </div>

        {/* Content batch view */}
        <div className="flex-1 min-h-0 bg-white rounded-b-lg shadow-sm border border-t-0 border-gray-200">
          <ContentBatchView
            onOpenBatchAssign={handleOpenBatchAssign}
            refreshTrigger={contentRefreshTrigger}
          />
        </div>

        {/* Batch assign modal */}
        <BatchAssignModal
          isOpen={batchAssignModal.isOpen}
          onClose={handleCloseBatchAssign}
          contentType={batchAssignModal.contentType}
          contentId={batchAssignModal.contentId}
          contentTitle={batchAssignModal.contentTitle}
          onAssignComplete={() => {
            // Trigger refresh of ContentBatchView to show updated assignment counts
            setContentRefreshTrigger(prev => prev + 1);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-16rem)]">
      {/* View mode tabs */}
      <div className="bg-white rounded-t-lg border border-b-0 border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setViewMode('users')}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-brand_beige text-brand_primary border border-brand_accent"
          >
            <Users className="h-4 w-4" />
            Por Usuario
          </button>
          <button
            onClick={() => setViewMode('content')}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg text-gray-600 hover:bg-gray-100 border border-transparent hover:border-gray-200 transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            Por Contenido
          </button>
        </div>
      </div>

      {/* Dual panel view */}
      <div className="flex flex-1 bg-white rounded-b-lg shadow-sm border border-t-0 border-gray-200 overflow-hidden">
        {/* Left panel - User/Group selection */}
        <div className="w-80 flex-shrink-0">
          <UserGroupPanel
          users={users}
          usersLoading={usersLoading}
          usersError={usersError}
          hasMoreUsers={hasMoreUsers}
          loadMoreUsers={loadMoreUsers}
          selectedUserId={selectedUserId}
          onSelectUser={handleSelectUser}
          filters={filters}
          onFiltersChange={setFilters}
          schools={schools}
          communities={communities}
          // Community assignment props
          selectedCommunity={selectedCommunity}
          communityUserCount={users.length}
          communitySearchQuery={communitySearchActive ? searchContentQuery : ''}
          onCommunitySearchChange={handleCommunitySearchChange}
          courseSearchResults={communitySearchActive ? courseSearchResults : []}
          lpSearchResults={communitySearchActive ? lpSearchResults : []}
          contentSearchLoading={communitySearchActive && contentSearchLoading}
          onAssignCourseToCommunity={handleAssignCourseToCommunity}
          onAssignLPToCommunity={handleAssignLPToCommunity}
          mutating={mutating}
          // Groups tab (Phase 2)
          onGroupSelect={setSelectedGroup}
          selectedGroup={selectedGroup}
          groupAssignments={groupAssignments}
          groupAssignmentsLoading={groupAssignmentsLoading}
          groupMemberCount={groupMemberCount}
        />
      </div>

      {/* Right panel - Assignment details (user or group) */}
      {selectedGroup ? (
        <GroupDetailPanel
          selectedGroup={selectedGroup}
          groupName={groupName}
          groupAssignments={groupAssignments}
          groupMemberCount={groupMemberCount}
          loading={groupAssignmentsLoading}
          error={groupAssignmentsError}
          onRefresh={refreshGroupAssignments}
        />
      ) : (
        <AssignmentDetailPanel
          userAssignments={userAssignments}
          loading={assignmentsLoading}
          error={assignmentsError}
          onRefresh={refreshAssignments}
          onUnassignCourse={unassignCourse}
          onUnassignLP={unassignLP}
          onAssignCourse={assignCourse}
          onAssignLP={assignLP}
          courseSearchResults={!communitySearchActive ? courseSearchResults : []}
          lpSearchResults={!communitySearchActive ? lpSearchResults : []}
          searchContentQuery={!communitySearchActive ? searchContentQuery : ''}
          onSearchContentChange={handleUserSearchChange}
          contentSearchLoading={!communitySearchActive && contentSearchLoading}
          mutating={mutating}
        />
      )}
      </div>
    </div>
  );
}

export default AssignmentMatrixContainer;
