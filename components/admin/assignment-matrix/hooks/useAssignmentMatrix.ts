import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import useDebounce from '../../../../hooks/useDebounce';
import {
  UserAssignmentsResponse,
  UserListItem,
  AssignmentFilters,
  CourseSearchResult,
  LearningPathSearchResult
} from '../../../../types/assignment-matrix';

const PAGE_SIZE = 50;

type GroupType = 'school' | 'community';

interface School {
  id: number;
  name: string;
}

interface Community {
  id: string;
  name: string;
  school_id: number | null;
}

interface GroupAssignmentSummary {
  contentId: string;
  contentTitle: string;
  contentDescription?: string;
  type: 'course' | 'learning_path';
  assignedCount: number;
  completedCount: number;
  averageProgress?: number;
}

interface UseAssignmentMatrixReturn {
  // User list
  users: UserListItem[];
  usersLoading: boolean;
  usersError: string | null;
  loadMoreUsers: () => void;
  hasMoreUsers: boolean;

  // Selected user assignments
  selectedUserId: string | null;
  setSelectedUserId: (id: string | null) => void;
  userAssignments: UserAssignmentsResponse | null;
  assignmentsLoading: boolean;
  assignmentsError: string | null;
  refreshAssignments: () => void;

  // Filters
  filters: AssignmentFilters;
  setFilters: (filters: AssignmentFilters) => void;

  // Schools for filtering
  schools: School[];
  communities: Array<{ id: string; name: string }>;

  // Course/LP search for quick assign
  courseSearchResults: CourseSearchResult[];
  lpSearchResults: LearningPathSearchResult[];
  searchContentQuery: string;
  setSearchContentQuery: (query: string) => void;
  contentSearchLoading: boolean;

  // Mutations
  assignCourse: (courseId: string, userIds: string[]) => Promise<boolean>;
  assignLP: (pathId: string, userIds: string[]) => Promise<boolean>;
  unassignCourse: (courseId: string, userIds: string[]) => Promise<boolean>;
  unassignLP: (pathId: string, userId: string) => Promise<boolean>;
  mutating: boolean;

  // Community-wide assignment
  assignCourseToCommunity: (courseId: string, communityId: string) => Promise<{ assigned: number; skipped: number }>;
  assignLPToCommunity: (pathId: string, communityId: string) => Promise<{ assigned: number; skipped: number }>;

  // Group selection (Phase 2)
  selectedGroup: { type: GroupType; id: string } | null;
  setSelectedGroup: (type: GroupType, id: string) => void;
  clearSelectedGroup: () => void;
  groupAssignments: GroupAssignmentSummary[];
  groupAssignmentsLoading: boolean;
  groupAssignmentsError: string | null;
  groupMemberCount: number;
  groupName: string;
  refreshGroupAssignments: () => void;
}

export function useAssignmentMatrix(): UseAssignmentMatrixReturn {
  const supabase = useSupabaseClient();

  // User list state
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const [hasMoreUsers, setHasMoreUsers] = useState(false);

  // Selected user state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userAssignments, setUserAssignments] = useState<UserAssignmentsResponse | null>(null);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);

  // Filters
  const [filters, setFiltersInternal] = useState<AssignmentFilters>({
    searchQuery: ''
  });
  const debouncedSearch = useDebounce(filters.searchQuery, 300);

  // Filter options
  const [schools, setSchools] = useState<School[]>([]);
  const [allCommunities, setAllCommunities] = useState<Community[]>([]);

  // Content search
  const [searchContentQuery, setSearchContentQuery] = useState('');
  const debouncedContentSearch = useDebounce(searchContentQuery, 300);
  const [courseSearchResults, setCourseSearchResults] = useState<CourseSearchResult[]>([]);
  const [lpSearchResults, setLpSearchResults] = useState<LearningPathSearchResult[]>([]);
  const [contentSearchLoading, setContentSearchLoading] = useState(false);

  // Mutation state
  const [mutating, setMutating] = useState(false);

  // Group selection state (Phase 2)
  const [selectedGroup, setSelectedGroupState] = useState<{ type: GroupType; id: string } | null>(null);
  const [groupAssignments, setGroupAssignments] = useState<GroupAssignmentSummary[]>([]);
  const [groupAssignmentsLoading, setGroupAssignmentsLoading] = useState(false);
  const [groupAssignmentsError, setGroupAssignmentsError] = useState<string | null>(null);
  const [groupMemberCount, setGroupMemberCount] = useState(0);
  const [groupName, setGroupName] = useState('');

  // Load filter options
  useEffect(() => {
    loadFilterOptions();
  }, []);

  // Load users when filters change
  useEffect(() => {
    setUsersPage(1);
    loadUsers(1);
  }, [debouncedSearch, filters.schoolId, filters.communityId]);

  // Load assignments when user selected
  useEffect(() => {
    if (selectedUserId) {
      loadUserAssignments(selectedUserId);
    } else {
      setUserAssignments(null);
    }
  }, [selectedUserId]);

  // Search content when query changes
  useEffect(() => {
    if (debouncedContentSearch) {
      searchContent(debouncedContentSearch);
    } else {
      setCourseSearchResults([]);
      setLpSearchResults([]);
    }
  }, [debouncedContentSearch]);

  // Load group assignments when group selected (Phase 2)
  useEffect(() => {
    if (selectedGroup) {
      loadGroupAssignments(selectedGroup.type, selectedGroup.id);
    } else {
      setGroupAssignments([]);
      setGroupMemberCount(0);
      setGroupName('');
      setGroupAssignmentsError(null);
    }
  }, [selectedGroup]);

  const loadFilterOptions = async () => {
    try {
      // Use the existing filter-options API which handles RLS properly with service role
      const response = await fetch('/api/reports/filter-options');
      if (!response.ok) {
        throw new Error('Failed to load filter options');
      }

      const data = await response.json();

      // Schools come with numeric IDs from the API
      setSchools(data.schools || []);

      // Communities come with school_id for filtering
      setAllCommunities(data.communities || []);
    } catch (error) {
      console.error('Error loading filter options:', error);
    }
  };

  // Filter communities by selected school
  const communities = useMemo(() => {
    if (!filters.schoolId) {
      // No school selected - show all communities
      return allCommunities.map(c => ({ id: c.id, name: c.name }));
    }
    // Filter to communities belonging to the selected school
    const schoolIdNum = parseInt(filters.schoolId, 10);
    return allCommunities
      .filter(c => c.school_id === schoolIdNum)
      .map(c => ({ id: c.id, name: c.name }));
  }, [allCommunities, filters.schoolId]);

  // Wrapper for setFilters that clears community when school changes
  const setFilters = useCallback((newFilters: AssignmentFilters) => {
    setFiltersInternal(prevFilters => {
      // If school changed, clear community filter
      if (newFilters.schoolId !== prevFilters.schoolId) {
        return {
          ...newFilters,
          communityId: undefined
        };
      }
      return newFilters;
    });
  }, []);

  const loadUsers = async (page: number) => {
    setUsersLoading(true);
    setUsersError(null);

    try {
      // Use the admin users API which handles RLS properly with service role
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: PAGE_SIZE.toString()
      });

      if (debouncedSearch) {
        params.append('search', debouncedSearch);
      }
      if (filters.schoolId) {
        params.append('schoolId', filters.schoolId);
      }
      if (filters.communityId) {
        params.append('communityId', filters.communityId);
      }

      const response = await fetch(`/api/admin/users?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al cargar usuarios');
      }

      const data = await response.json();

      // Transform API response to UserListItem format
      const userItems: UserListItem[] = (data.users || []).map((user: any) => {
        // Extract role types from roles array
        const roles = (user.roles || []).map((r: any) => r.role_type);
        const schoolName = user.school?.name;
        // Build full name from first_name and last_name
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;

        return {
          id: user.id,
          fullName,
          email: user.email,
          roles,
          schoolName,
          courseCount: 0, // Will be populated separately or lazily
          lpCount: 0
        };
      });

      if (page === 1) {
        setUsers(userItems);
      } else {
        setUsers(prev => [...prev, ...userItems]);
      }

      setHasMoreUsers((data.total || 0) > page * PAGE_SIZE);
      setUsersPage(page);
    } catch (error: any) {
      console.error('Error loading users:', error);
      setUsersError(error.message || 'Error al cargar usuarios');
    } finally {
      setUsersLoading(false);
    }
  };

  const loadMoreUsers = useCallback(() => {
    if (!usersLoading && hasMoreUsers) {
      loadUsers(usersPage + 1);
    }
  }, [usersLoading, hasMoreUsers, usersPage]);

  const loadUserAssignments = async (userId: string) => {
    setAssignmentsLoading(true);
    setAssignmentsError(null);

    try {
      const response = await fetch(`/api/admin/assignment-matrix/user-assignments?userId=${userId}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al cargar asignaciones');
      }

      const data: UserAssignmentsResponse = await response.json();
      setUserAssignments(data);
    } catch (error: any) {
      console.error('Error loading user assignments:', error);
      setAssignmentsError(error.message);
    } finally {
      setAssignmentsLoading(false);
    }
  };

  const refreshAssignments = useCallback(() => {
    if (selectedUserId) {
      loadUserAssignments(selectedUserId);
    }
  }, [selectedUserId]);

  // Load group assignments (Phase 2)
  const loadGroupAssignments = async (groupType: GroupType, groupId: string) => {
    setGroupAssignmentsLoading(true);
    setGroupAssignmentsError(null);

    try {
      const response = await fetch(
        `/api/admin/assignment-matrix/group-assignments?groupType=${groupType}&groupId=${groupId}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al cargar asignaciones del grupo');
      }

      const data = await response.json();
      setGroupAssignments(data.commonAssignments || []);
      setGroupMemberCount(data.group?.memberCount || 0);
      setGroupName(data.group?.name || '');
    } catch (error: any) {
      console.error('Error loading group assignments:', error);
      setGroupAssignmentsError(error.message || 'Error al cargar asignaciones del grupo');
      setGroupAssignments([]);
      setGroupMemberCount(0);
      setGroupName('');
    } finally {
      setGroupAssignmentsLoading(false);
    }
  };

  // Refresh group assignments
  const refreshGroupAssignments = useCallback(() => {
    if (selectedGroup) {
      loadGroupAssignments(selectedGroup.type, selectedGroup.id);
    }
  }, [selectedGroup]);

  // Group selection handlers (Phase 2)
  const setSelectedGroup = useCallback((type: GroupType, id: string) => {
    setSelectedGroupState({ type, id });
    // Clear user selection when switching to groups
    setSelectedUserId(null);
  }, []);

  const clearSelectedGroup = useCallback(() => {
    setSelectedGroupState(null);
    setGroupAssignments([]);
    setGroupMemberCount(0);
  }, []);

  const searchContent = async (query: string) => {
    setContentSearchLoading(true);

    try {
      // Search courses via existing API
      const coursesResponse = await fetch(`/api/admin/courses?search=${encodeURIComponent(query)}&pageSize=10`);
      if (coursesResponse.ok) {
        const coursesData = await coursesResponse.json();
        setCourseSearchResults((coursesData.courses || []).map((c: any) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          thumbnailUrl: c.thumbnail_url
        })));
      }

      // Search LPs with course count in a single query using subquery
      const { data: lps } = await supabase
        .from('learning_paths')
        .select(`
          id,
          name,
          description,
          learning_path_courses (id)
        `)
        .ilike('name', `%${query}%`)
        .limit(10);

      // Transform to LearningPathSearchResult with course counts
      const lpResults: LearningPathSearchResult[] = (lps || []).map((lp: any) => ({
        id: lp.id,
        title: lp.name || 'Ruta sin título',
        description: lp.description,
        courseCount: lp.learning_path_courses?.length || 0
      }));
      setLpSearchResults(lpResults);
    } catch (error) {
      console.error('Error searching content:', error);
    } finally {
      setContentSearchLoading(false);
    }
  };

  // Mutation functions
  const assignCourse = async (courseId: string, userIds: string[]): Promise<boolean> => {
    setMutating(true);
    try {
      const response = await fetch('/api/courses/batch-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, userIds })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al asignar curso');
      }

      refreshAssignments();
      return true;
    } catch (error: any) {
      console.error('Error assigning course:', error);
      throw error;
    } finally {
      setMutating(false);
    }
  };

  const assignLP = async (pathId: string, userIds: string[]): Promise<boolean> => {
    setMutating(true);
    try {
      const response = await fetch('/api/learning-paths/batch-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathId, userIds })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al asignar ruta');
      }

      refreshAssignments();
      return true;
    } catch (error: any) {
      console.error('Error assigning LP:', error);
      throw error;
    } finally {
      setMutating(false);
    }
  };

  const unassignCourse = async (courseId: string, userIds: string[]): Promise<boolean> => {
    setMutating(true);
    try {
      const response = await fetch('/api/courses/unassign', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, userIds })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al desasignar curso');
      }

      refreshAssignments();
      return true;
    } catch (error: any) {
      console.error('Error unassigning course:', error);
      throw error;
    } finally {
      setMutating(false);
    }
  };

  const unassignLP = async (pathId: string, userId: string): Promise<boolean> => {
    setMutating(true);
    try {
      const response = await fetch('/api/learning-paths/unassign', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathId, userId })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al desasignar ruta');
      }

      refreshAssignments();
      return true;
    } catch (error: any) {
      console.error('Error unassigning LP:', error);
      throw error;
    } finally {
      setMutating(false);
    }
  };

  // Community-wide assignment: Assign course to all users in a community
  const assignCourseToCommunity = async (courseId: string, communityId: string): Promise<{ assigned: number; skipped: number }> => {
    setMutating(true);
    try {
      // First, get all user IDs in the community
      const usersResponse = await fetch(`/api/admin/users?communityId=${communityId}&pageSize=1000`);
      if (!usersResponse.ok) {
        const error = await usersResponse.json();
        throw new Error(error.error || 'Error al obtener usuarios de la comunidad');
      }
      const usersData = await usersResponse.json();
      const userIds = (usersData.users || []).map((u: any) => u.id);

      if (userIds.length === 0) {
        return { assigned: 0, skipped: 0 };
      }

      // Assign to all users using existing batch-assign
      const response = await fetch('/api/courses/batch-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, userIds })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al asignar curso a la comunidad');
      }

      const result = await response.json();
      refreshAssignments();
      return {
        assigned: result.assignments_created || 0,
        skipped: result.assignments_skipped || 0
      };
    } catch (error: any) {
      console.error('Error assigning course to community:', error);
      throw error;
    } finally {
      setMutating(false);
    }
  };

  // Community-wide assignment: Assign LP to all users in a community
  // Note: groupIds in LP batch-assign is for community_workspaces, not growth_communities
  // So we fetch user IDs and use userIds instead
  const assignLPToCommunity = async (pathId: string, communityId: string): Promise<{ assigned: number; skipped: number }> => {
    setMutating(true);
    try {
      // First, get all user IDs in the community (growth_communities)
      const usersResponse = await fetch(`/api/admin/users?communityId=${communityId}&pageSize=1000`);
      if (!usersResponse.ok) {
        const error = await usersResponse.json();
        throw new Error(error.error || 'Error al obtener usuarios de la comunidad');
      }
      const usersData = await usersResponse.json();
      const userIds = (usersData.users || []).map((u: any) => u.id);

      if (userIds.length === 0) {
        return { assigned: 0, skipped: 0 };
      }

      // Assign to all users using userIds (not groupIds)
      const response = await fetch('/api/learning-paths/batch-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathId, userIds })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al asignar ruta a la comunidad');
      }

      const result = await response.json();
      refreshAssignments();
      return {
        assigned: result.assignments_created || 0,
        skipped: result.assignments_skipped || 0
      };
    } catch (error: any) {
      console.error('Error assigning LP to community:', error);
      throw error;
    } finally {
      setMutating(false);
    }
  };

  return {
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
  };
}
