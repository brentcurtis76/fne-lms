import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, Users, Building, ChevronDown, Loader2, GraduationCap, UsersRound, BookOpen, Route, UserX, FolderOpen } from 'lucide-react';
import { UserListItem, AssignmentFilters, CourseSearchResult, LearningPathSearchResult } from '../../../types/assignment-matrix';
import CommunityAssignSection from './CommunityAssignSection';
import { UserListSkeleton, GroupListSkeleton, EmptyState } from './SkeletonLoaders';

type ActiveTab = 'users' | 'groups';
type GroupFilterType = 'school' | 'community';

interface GroupAssignmentSummary {
  contentId: string;
  contentTitle: string;
  contentDescription?: string;
  type: 'course' | 'learning_path';
  assignedCount: number;
  completedCount: number;
  averageProgress?: number;
}

interface UserGroupPanelProps {
  // Users tab
  users: UserListItem[];
  usersLoading: boolean;
  usersError: string | null;
  hasMoreUsers: boolean;
  loadMoreUsers: () => void;

  // Selection
  selectedUserId: string | null;
  onSelectUser: (userId: string) => void;

  // Filters
  filters: AssignmentFilters;
  onFiltersChange: (filters: AssignmentFilters) => void;
  schools: Array<{ id: number; name: string }>;
  communities: Array<{ id: string; name: string }>;

  // Community assignment (optional - Phase 1 enhancement)
  selectedCommunity?: { id: string; name: string } | null;
  communityUserCount?: number;
  communitySearchQuery?: string;
  onCommunitySearchChange?: (query: string) => void;
  courseSearchResults?: CourseSearchResult[];
  lpSearchResults?: LearningPathSearchResult[];
  contentSearchLoading?: boolean;
  onAssignCourseToCommunity?: (courseId: string) => Promise<{ assigned: number; skipped: number }>;
  onAssignLPToCommunity?: (pathId: string) => Promise<{ assigned: number; skipped: number }>;
  mutating?: boolean;

  // Groups tab (Phase 2)
  onGroupSelect?: (groupType: GroupFilterType, groupId: string) => void;
  selectedGroup?: { type: GroupFilterType; id: string } | null;
  groupAssignments?: GroupAssignmentSummary[];
  groupAssignmentsLoading?: boolean;
  groupMemberCount?: number;
}

/**
 * Left panel for selecting users (and groups in Phase 2)
 * Implements virtualization via intersection observer for performance
 */
export function UserGroupPanel({
  users,
  usersLoading,
  usersError,
  hasMoreUsers,
  loadMoreUsers,
  selectedUserId,
  onSelectUser,
  filters,
  onFiltersChange,
  schools,
  communities,
  // Community assignment props
  selectedCommunity,
  communityUserCount = 0,
  communitySearchQuery = '',
  onCommunitySearchChange,
  courseSearchResults = [],
  lpSearchResults = [],
  contentSearchLoading = false,
  onAssignCourseToCommunity,
  onAssignLPToCommunity,
  mutating = false,
  // Groups tab (Phase 2)
  onGroupSelect,
  selectedGroup,
  groupAssignments = [],
  groupAssignmentsLoading = false,
  groupMemberCount = 0
}: UserGroupPanelProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const userListRef = useRef<HTMLDivElement>(null);
  const groupListRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('users');
  const [groupFilterType, setGroupFilterType] = useState<GroupFilterType>('school');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');

  // Virtualizer for user list
  const userVirtualizer = useVirtualizer({
    count: users.length,
    getScrollElement: () => userListRef.current,
    estimateSize: useCallback(() => 76, []), // Estimated row height
    overscan: 5,
  });

  // Intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreUsers && !usersLoading) {
          loadMoreUsers();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasMoreUsers, usersLoading, loadMoreUsers]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ ...filters, searchQuery: e.target.value });
  };

  const handleSchoolChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFiltersChange({
      ...filters,
      schoolId: e.target.value || undefined
    });
  };

  const handleCommunityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFiltersChange({ ...filters, communityId: e.target.value || undefined });
  };

  const getRoleBadge = (role: string): { label: string; color: string } => {
    const roleMap: Record<string, { label: string; color: string }> = {
      admin: { label: 'Admin', color: 'bg-red-100 text-red-700' },
      consultor: { label: 'Consultor', color: 'bg-purple-100 text-purple-700' },
      equipo_directivo: { label: 'Directivo', color: 'bg-blue-100 text-blue-700' },
      docente: { label: 'Docente', color: 'bg-green-100 text-green-700' },
      estudiante: { label: 'Estudiante', color: 'bg-yellow-100 text-yellow-700' },
      lider_comunidad: { label: 'Líder Com.', color: 'bg-orange-100 text-orange-700' },
      lider_generacion: { label: 'Líder Gen.', color: 'bg-teal-100 text-teal-700' },
      supervisor_de_red: { label: 'Supervisor', color: 'bg-indigo-100 text-indigo-700' }
    };
    return roleMap[role] || { label: role, color: 'bg-gray-100 text-gray-700' };
  };

  // Filter groups by search query
  const filteredSchools = schools.filter(s =>
    s.name.toLowerCase().includes(groupSearchQuery.toLowerCase())
  );
  const filteredCommunities = communities.filter(c =>
    c.name.toLowerCase().includes(groupSearchQuery.toLowerCase())
  );

  // Get the current list based on group filter type
  const currentGroupList = groupFilterType === 'school' ? filteredSchools : filteredCommunities;

  // Handle group selection
  const handleGroupClick = (id: string | number) => {
    if (onGroupSelect) {
      onGroupSelect(groupFilterType, String(id));
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Tab header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'users'
              ? 'text-blue-600 bg-blue-50'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Users className="h-4 w-4" />
          Usuarios
        </button>
        <button
          onClick={() => setActiveTab('groups')}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'groups'
              ? 'text-blue-600 bg-blue-50'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Building className="h-4 w-4" />
          Grupos
        </button>
      </div>

      {/* USERS TAB CONTENT */}
      {activeTab === 'users' && (
        <>
          {/* Search and filters */}
          <div className="px-4 py-3 space-y-3 border-b border-gray-200">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar usuarios..."
                value={filters.searchQuery}
                onChange={handleSearchChange}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Filter dropdowns */}
            <div className="grid grid-cols-1 gap-2">
              {/* School filter */}
              <div className="relative">
                <select
                  value={filters.schoolId || ''}
                  onChange={handleSchoolChange}
                  className="w-full pl-3 pr-8 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white"
                >
                  <option value="">Todas las escuelas</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>

              {/* Community filter */}
              <div className="relative">
                <select
                  value={filters.communityId || ''}
                  onChange={handleCommunityChange}
                  className="w-full pl-3 pr-8 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white"
                >
                  <option value="">Todas las comunidades</option>
                  {communities.map((comm) => (
                    <option key={comm.id} value={comm.id}>
                      {comm.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* User list - virtualized */}
          <div ref={userListRef} className="flex-1 overflow-y-auto">
            {usersError && (
              <div className="p-4 text-sm text-red-600 bg-red-50 border border-red-200 m-2 rounded-lg">
                {usersError}
              </div>
            )}

            {/* Initial loading skeleton */}
            {usersLoading && users.length === 0 && (
              <UserListSkeleton count={8} />
            )}

            {/* Empty state */}
            {users.length === 0 && !usersLoading && !usersError && (
              <EmptyState
                icon={<UserX className="h-12 w-12" />}
                title="No se encontraron usuarios"
                description={filters.searchQuery
                  ? `No hay usuarios que coincidan con "${filters.searchQuery}"`
                  : "Ajusta los filtros para ver usuarios"
                }
              />
            )}

            {/* Virtualized user list */}
            {users.length > 0 && (
              <div
                style={{
                  height: `${userVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {userVirtualizer.getVirtualItems().map((virtualRow) => {
                  const user = users[virtualRow.index];
                  const isSelected = selectedUserId === user.id;
                  const primaryRole = user.roles[0];
                  const roleBadge = primaryRole ? getRoleBadge(primaryRole) : null;

                  return (
                    <div
                      key={user.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className="border-b border-gray-100"
                    >
                      <button
                        onClick={() => onSelectUser(user.id)}
                        className={`w-full h-full px-4 py-3 text-left transition-colors ${
                          isSelected
                            ? 'bg-blue-50 border-l-4 border-blue-500'
                            : 'hover:bg-gray-50 border-l-4 border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-medium truncate ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                              {user.fullName}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {user.email}
                            </p>
                            {user.schoolName && (
                              <p className="text-xs text-gray-400 truncate mt-0.5">
                                {user.schoolName}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 ml-2">
                            {roleBadge && (
                              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${roleBadge.color}`}>
                                {roleBadge.label}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Load more trigger */}
            <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
              {usersLoading && (
                <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
              )}
            </div>
          </div>

          {/* Community assignment section - appears when community is selected */}
          {selectedCommunity && onCommunitySearchChange && onAssignCourseToCommunity && onAssignLPToCommunity && (
            <CommunityAssignSection
              communityId={selectedCommunity.id}
              communityName={selectedCommunity.name}
              userCount={communityUserCount}
              courseResults={courseSearchResults.map(c => ({
                id: c.id,
                title: c.title,
                description: c.description
              }))}
              lpResults={lpSearchResults.map(lp => ({
                id: lp.id,
                title: lp.title,
                description: lp.description,
                courseCount: lp.courseCount
              }))}
              searchQuery={communitySearchQuery}
              onSearchChange={onCommunitySearchChange}
              isSearching={contentSearchLoading}
              onAssignCourse={onAssignCourseToCommunity}
              onAssignLP={onAssignLPToCommunity}
              disabled={mutating}
            />
          )}
        </>
      )}

      {/* GROUPS TAB CONTENT */}
      {activeTab === 'groups' && (
        <>
          {/* Group type selector and search */}
          <div className="px-4 py-3 space-y-3 border-b border-gray-200">
            {/* Group type toggle */}
            <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-lg">
              <button
                onClick={() => setGroupFilterType('school')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  groupFilterType === 'school'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <GraduationCap className="h-4 w-4" />
                Escuelas
              </button>
              <button
                onClick={() => setGroupFilterType('community')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  groupFilterType === 'community'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <UsersRound className="h-4 w-4" />
                Comunidades
              </button>
            </div>

            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder={groupFilterType === 'school' ? 'Buscar escuelas...' : 'Buscar comunidades...'}
                value={groupSearchQuery}
                onChange={(e) => setGroupSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Group list */}
          <div className="flex-1 overflow-y-auto">
            {/* Empty state for groups */}
            {currentGroupList.length === 0 && (
              <EmptyState
                icon={<FolderOpen className="h-12 w-12" />}
                title={groupSearchQuery
                  ? `No se encontraron ${groupFilterType === 'school' ? 'escuelas' : 'comunidades'}`
                  : `No hay ${groupFilterType === 'school' ? 'escuelas' : 'comunidades'} disponibles`
                }
                description={groupSearchQuery
                  ? `Prueba con otros términos de búsqueda`
                  : undefined
                }
              />
            )}

            <ul className="divide-y divide-gray-100">
              {currentGroupList.map((group) => {
                const groupId = String(group.id);
                const isSelected = selectedGroup?.type === groupFilterType && selectedGroup?.id === groupId;

                return (
                  <li key={groupId}>
                    <button
                      onClick={() => handleGroupClick(group.id)}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        isSelected
                          ? 'bg-blue-50 border-l-4 border-blue-500'
                          : 'hover:bg-gray-50 border-l-4 border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {groupFilterType === 'school' ? (
                              <GraduationCap className={`h-4 w-4 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                            ) : (
                              <UsersRound className={`h-4 w-4 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                            )}
                            <p className={`text-sm font-medium truncate ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                              {group.name}
                            </p>
                          </div>
                        </div>
                        {isSelected && groupMemberCount > 0 && (
                          <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                            {groupMemberCount} miembro{groupMemberCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Group assignments summary (when a group is selected) */}
          {selectedGroup && (
            <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 max-h-48 overflow-y-auto">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Asignaciones del Grupo
              </h4>
              {groupAssignmentsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                </div>
              ) : groupAssignments.length === 0 ? (
                <p className="text-sm text-gray-500">Sin asignaciones comunes</p>
              ) : (
                <ul className="space-y-1">
                  {groupAssignments.slice(0, 5).map((assignment) => (
                    <li key={assignment.contentId} className="flex items-center gap-2 text-sm">
                      {assignment.type === 'course' ? (
                        <BookOpen className="h-3.5 w-3.5 text-gray-400" />
                      ) : (
                        <Route className="h-3.5 w-3.5 text-gray-400" />
                      )}
                      <span className="truncate text-gray-700">{assignment.contentTitle}</span>
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        ({assignment.assignedCount}/{groupMemberCount})
                      </span>
                    </li>
                  ))}
                  {groupAssignments.length > 5 && (
                    <li className="text-xs text-gray-500 pt-1">
                      +{groupAssignments.length - 5} más...
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default UserGroupPanel;
