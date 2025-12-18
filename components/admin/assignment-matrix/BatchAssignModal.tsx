import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Users, Loader2, Check, BookOpen, Route, Building2, UsersRound, CheckSquare } from 'lucide-react';
import useDebounce from '../../../hooks/useDebounce';
import { toast } from 'react-hot-toast';

interface BatchAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  contentType: 'course' | 'learning_path';
  contentId: string;
  contentTitle: string;
  onAssignComplete: () => void;
}

// Enhanced user target for Phase 5
interface UserTarget {
  id: string;
  name: string;
  email: string;
  school_name?: string;
  community_name?: string;
  isAlreadyAssigned: boolean;
}

interface School {
  id: string;
  name: string;
}

interface Community {
  id: string;
  name: string;
}

/**
 * Batch Assign Modal - Phase 5 Enhanced
 *
 * Features:
 * - Browse-first: Pre-populates users on modal open (no search required)
 * - School/Community filters: Dropdown filters for quick narrowing
 * - "Ya asignado" badge: Shows already-assigned users (disabled from selection)
 * - "Seleccionar todos": Select all non-assigned users at once
 *
 * Uses existing search-assignees APIs which already support filtering.
 */
export function BatchAssignModal({
  isOpen,
  onClose,
  contentType,
  contentId,
  contentTitle,
  onAssignComplete
}: BatchAssignModalProps) {
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [schoolId, setSchoolId] = useState<string>('');
  const [communityId, setCommunityId] = useState<string>('');

  // Data state
  const [users, setUsers] = useState<UserTarget[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // Loading states
  const [loading, setLoading] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingCommunities, setLoadingCommunities] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Pagination
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const debouncedSearch = useDebounce(searchQuery, 300);

  // Fetch schools and communities for dropdowns
  const fetchFilterOptions = useCallback(async () => {
    setLoadingSchools(true);
    setLoadingCommunities(true);
    try {
      // Use the reports filter-options endpoint which returns schools, generations, and communities
      const response = await fetch('/api/reports/filter-options');
      if (response.ok) {
        const data = await response.json();
        setSchools(data.schools || []);
        setCommunities(data.communities || []);
      } else {
        console.error('Error fetching filter options:', response.status);
      }
    } catch (error) {
      console.error('Error fetching filter options:', error);
    } finally {
      setLoadingSchools(false);
      setLoadingCommunities(false);
    }
  }, []);

  // Fetch users with filters
  const fetchUsers = useCallback(async (resetPage = false) => {
    if (!contentId) return;

    const currentPage = resetPage ? 1 : page;
    if (resetPage) setPage(1);

    setLoading(true);
    try {
      // Use the appropriate search-assignees endpoint based on content type
      const endpoint = contentType === 'course'
        ? '/api/courses/search-assignees'
        : '/api/learning-paths/search-assignees';

      const body: any = contentType === 'course'
        ? { courseId: contentId, query: debouncedSearch, page: currentPage, pageSize }
        : { pathId: contentId, query: debouncedSearch, page: currentPage, pageSize };

      // Add optional filters
      if (schoolId) body.schoolId = schoolId;
      if (communityId) body.communityId = communityId;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const data = await response.json();
        const fetchedUsers: UserTarget[] = (data.results || []).map((u: any) => ({
          id: u.id,
          name: u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
          email: u.email,
          school_name: u.school_name,
          community_name: u.community_name,
          isAlreadyAssigned: u.isAlreadyAssigned || false
        }));
        setUsers(fetchedUsers);
        setTotalCount(data.totalCount || 0);
        setHasMore(data.hasMore || false);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Error fetching users:', errorData);
        toast.error(errorData.error || 'Error al cargar usuarios');
        setUsers([]);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Error al cargar usuarios');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [contentId, contentType, debouncedSearch, schoolId, communityId, page, pageSize]);

  // Fetch schools and communities on mount
  useEffect(() => {
    if (isOpen) {
      fetchFilterOptions();
    }
  }, [isOpen, fetchFilterOptions]);

  // Fetch users when filters change
  useEffect(() => {
    if (isOpen && contentId) {
      fetchUsers(true); // Reset to page 1 when filters change
    }
  }, [isOpen, contentId, debouncedSearch, schoolId, communityId]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSchoolId('');
      setCommunityId('');
      setSelectedUserIds(new Set());
      setPage(1);
    }
  }, [isOpen]);

  // Get users that can be selected (not already assigned)
  const selectableUsers = users.filter(u => !u.isAlreadyAssigned);
  const selectedCount = selectedUserIds.size;
  const allSelectableSelected = selectableUsers.length > 0 &&
    selectableUsers.every(u => selectedUserIds.has(u.id));

  // Toggle user selection
  const toggleUser = (user: UserTarget) => {
    if (user.isAlreadyAssigned) return;

    setSelectedUserIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(user.id)) {
        newSet.delete(user.id);
      } else {
        newSet.add(user.id);
      }
      return newSet;
    });
  };

  // Toggle all selectable users
  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      // Deselect all
      setSelectedUserIds(new Set());
    } else {
      // Select all non-assigned users
      setSelectedUserIds(new Set(selectableUsers.map(u => u.id)));
    }
  };

  // Remove selected user
  const removeSelected = (userId: string) => {
    setSelectedUserIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(userId);
      return newSet;
    });
  };

  // Get selected users for display
  const selectedUsers = users.filter(u => selectedUserIds.has(u.id));

  // Perform batch assignment
  const handleAssign = async () => {
    if (selectedUserIds.size === 0) return;

    setAssigning(true);
    try {
      const userIds = Array.from(selectedUserIds);
      const endpoint = contentType === 'course'
        ? '/api/courses/batch-assign'
        : '/api/learning-paths/batch-assign';

      const body = contentType === 'course'
        ? { courseId: contentId, userIds }
        : { pathId: contentId, userIds };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        toast.success(`Asignado a ${userIds.length} usuario(s)`);
        onAssignComplete();
        onClose();
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.error || 'Error al asignar');
      }
    } catch (error: any) {
      console.error('Assignment error:', error);
      toast.error(error.message || 'Error al asignar');
    } finally {
      setAssigning(false);
    }
  };

  if (!isOpen) return null;

  const ContentIcon = contentType === 'course' ? BookOpen : Route;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Modal */}
        <div
          className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <ContentIcon className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Asignar {contentType === 'course' ? 'Curso' : 'Ruta'}
                </h3>
                <p className="text-sm text-gray-500 truncate max-w-md" title={contentTitle}>
                  {contentTitle}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-hidden flex flex-col p-6">
            {/* Filters Row */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {/* School Filter */}
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-400" />
                <select
                  value={schoolId}
                  onChange={(e) => setSchoolId(e.target.value)}
                  disabled={loadingSchools}
                  className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[180px]"
                >
                  <option value="">Todas las escuelas</option>
                  {schools.map(school => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Community Filter */}
              <div className="flex items-center gap-2">
                <UsersRound className="h-4 w-4 text-gray-400" />
                <select
                  value={communityId}
                  onChange={(e) => setCommunityId(e.target.value)}
                  disabled={loadingCommunities}
                  className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[180px]"
                >
                  <option value="">Todas las comunidades</option>
                  {communities.map(community => (
                    <option key={community.id} value={community.id}>
                      {community.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search Input */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre o email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Selected users chips */}
            {selectedUsers.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">
                  {selectedCount} usuario(s) seleccionado(s)
                </p>
                <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto">
                  {selectedUsers.map((user) => (
                    <span
                      key={user.id}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs"
                    >
                      <Users className="h-3 w-3" />
                      {user.name}
                      <button
                        onClick={() => removeSelected(user.id)}
                        className="ml-1 hover:text-blue-900"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Select All + Count Header */}
            <div className="flex items-center justify-between mb-2 px-1">
              <button
                onClick={toggleSelectAll}
                disabled={selectableUsers.length === 0 || loading}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                  allSelectableSelected && selectableUsers.length > 0
                    ? 'bg-blue-600 border-blue-600'
                    : 'border-gray-300'
                }`}>
                  {allSelectableSelected && selectableUsers.length > 0 && (
                    <Check className="h-3 w-3 text-white" />
                  )}
                </div>
                <span>
                  Seleccionar todos ({selectableUsers.length} disponibles)
                </span>
              </button>
              <span className="text-xs text-gray-500">
                {totalCount} usuario(s) total
              </span>
            </div>

            {/* User list */}
            <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
                  <span className="ml-2 text-sm text-gray-500">Cargando usuarios...</span>
                </div>
              ) : users.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">
                  {searchQuery || schoolId || communityId
                    ? 'No se encontraron usuarios con los filtros seleccionados'
                    : 'No hay usuarios disponibles'}
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {users.map((user) => {
                    const isSelected = selectedUserIds.has(user.id);
                    const isDisabled = user.isAlreadyAssigned;

                    return (
                      <li key={user.id}>
                        <button
                          onClick={() => toggleUser(user)}
                          disabled={isDisabled}
                          className={`w-full px-4 py-3 text-left flex items-center justify-between gap-3 transition-colors ${
                            isDisabled
                              ? 'bg-gray-50 cursor-not-allowed'
                              : isSelected
                              ? 'bg-blue-50'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-medium truncate ${
                                isDisabled ? 'text-gray-400' : 'text-gray-900'
                              }`}>
                                {user.name}
                              </p>
                              {user.isAlreadyAssigned && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs whitespace-nowrap">
                                  <Check className="h-3 w-3" />
                                  Ya asignado
                                </span>
                              )}
                            </div>
                            <p className={`text-xs truncate ${
                              isDisabled ? 'text-gray-300' : 'text-gray-500'
                            }`}>
                              {user.email}
                              {(user.school_name || user.community_name) && (
                                <span className="ml-2">
                                  {[user.school_name, user.community_name].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </p>
                          </div>
                          {!isDisabled && (
                            <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600'
                                : 'border-gray-300'
                            }`}>
                              {isSelected && <Check className="h-3 w-3 text-white" />}
                            </div>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Load more */}
            {hasMore && !loading && (
              <button
                onClick={() => {
                  setPage(p => p + 1);
                  fetchUsers(false);
                }}
                className="mt-3 text-sm text-blue-600 hover:text-blue-700 text-center"
              >
                Cargar más usuarios...
              </button>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center gap-3 p-6 border-t border-gray-200">
            <span className="text-sm text-gray-500">
              {selectedCount > 0 && `${selectedCount} seleccionado(s)`}
            </span>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={assigning}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleAssign}
                disabled={selectedCount === 0 || assigning}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {assigning && <Loader2 className="h-4 w-4 animate-spin" />}
                Asignar a {selectedCount} usuario(s)
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default BatchAssignModal;
