import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import MainLayout from '../../../../components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { getUserPrimaryRole } from '../../../../utils/roleUtils';
import { ChevronLeft, ChevronDown, ChevronUp, UserPlus, X } from 'lucide-react';
import { SearchIcon } from '@heroicons/react/solid';
import useDebounce from '../../../../hooks/useDebounce';

interface SearchResult {
  id: string;
  name: string;
  email: string;
  school_name?: string;
  community_name?: string;
  isAlreadyAssigned: boolean;
}

interface GrowthCommunity {
  id: string;
  name: string;
  school_id: number | string;
}

interface SelectedUser {
  id: string;
  name: string;
  email: string;
}

interface AssignedUser {
  id: string;
  name: string;
  email: string;
  school_name?: string | null;
}

interface Course {
  id: string;
  title: string;
  description: string;
  assignment_count: number;
}

export default function AssignCourse() {
  const router = useRouter();
  const { id: courseId } = router.query;
  const supabase = useSupabaseClient();

  // Auth state
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  // Course state
  const [course, setCourse] = useState<Course | null>(null);

  // Selection state
  const [selectedUsers, setSelectedUsers] = useState<SelectedUser[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<string>('');
  const [selectedCommunity, setSelectedCommunity] = useState<string>('');
  const debouncedQuery = useDebounce(searchQuery, 300);

  // Search results
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Assignment count
  const [totalAssigned, setTotalAssigned] = useState(0);
  const [assignedUsers, setAssignedUsers] = useState<AssignedUser[]>([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);

  // Assigned users section state
  const [assignedSectionExpanded, setAssignedSectionExpanded] = useState(false);
  const [assignedSchoolFilter, setAssignedSchoolFilter] = useState<string>('');
  const [selectedToUnassign, setSelectedToUnassign] = useState<Set<string>>(new Set());

  // Schools and communities for filtering
  const [schools, setSchools] = useState<Array<{id: string, name: string}>>([]);
  const [communities, setCommunities] = useState<GrowthCommunity[]>([]);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [unassigning, setUnassigning] = useState(false);

  // Ref for infinite scroll
  const scrollRef = useRef<HTMLDivElement>(null);

  // Check authentication and load course
  useEffect(() => {
    if (router.isReady && courseId) {
      checkAuthAndLoadCourse();
    }
  }, [router.isReady, courseId]);

  // Search users when debounced query changes
  useEffect(() => {
    if (debouncedQuery !== undefined && course && !loading) {
      setPage(1);
      searchAssignees(debouncedQuery, 1);
    }
  }, [debouncedQuery, course, loading]);

  // Search when school or community filter changes
  useEffect(() => {
    if (course && !loading) {
      setPage(1);
      searchAssignees(debouncedQuery || '', 1);
    }
  }, [selectedSchool, selectedCommunity, course, loading]);

  // Reset community when school changes
  useEffect(() => {
    setSelectedCommunity('');
  }, [selectedSchool]);

  const loadSchoolsAndCommunities = async () => {
    try {
      const [schoolsResult, communitiesResult] = await Promise.all([
        supabase.from('schools').select('id, name').order('name'),
        supabase.from('growth_communities').select('id, name, school_id').order('name')
      ]);

      if (schoolsResult.error) {
        console.warn('Could not load schools for filtering:', schoolsResult.error);
      } else {
        setSchools(schoolsResult.data || []);
      }

      if (communitiesResult.error) {
        console.warn('Could not load communities for filtering:', communitiesResult.error);
      } else {
        setCommunities(communitiesResult.data || []);
      }
    } catch (error) {
      console.warn('Error loading schools/communities:', error);
    }
  };

  const checkAuthAndLoadCourse = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        router.push('/login');
        return;
      }

      setUser(session.user);

      // Check permissions
      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();

      const userRole = await getUserPrimaryRole(session.user.id);
      const hasAccess = ['admin', 'consultor'].includes(userRole);

      if (!hasAccess) {
        toast.error('No tienes permisos para asignar cursos');
        router.push('/dashboard');
        return;
      }

      setIsAdmin(userRole === 'admin');

      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }

      // Load course details
      const courseResponse = await fetch(`/api/courses/${courseId}`);
      if (!courseResponse.ok) {
        throw new Error('Failed to load course');
      }

      const { course: courseData } = await courseResponse.json();
      setCourse(courseData);
      setTotalAssigned(courseData.assignment_count || 0);

      // Load schools and communities for filtering
      await loadSchoolsAndCommunities();
      // Load already assigned users
      await loadAssignedUsers(courseData.id);

    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Error al cargar los datos');
      router.push('/admin/course-builder');
    } finally {
      setLoading(false);
    }
  };

  const searchAssignees = async (
    query: string,
    currentPage: number,
    append: boolean = false
  ) => {
    setSearching(true);

    try {
      const response = await fetch('/api/courses/search-assignees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courseId: courseId as string,
          query,
          schoolId: selectedSchool || undefined,
          communityId: selectedCommunity || undefined,
          page: currentPage,
          pageSize: 20
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Search API Error:', errorData);
        throw new Error(errorData.error || 'Failed to search assignees');
      }

      const data = await response.json();

      if (append) {
        setSearchResults(prev => [...prev, ...data.results]);
      } else {
        setSearchResults(data.results);
      }

      setHasMore(data.hasMore);

    } catch (error: any) {
      console.error('Error searching assignees:', error);
      toast.error('Error al buscar');
    } finally {
      setSearching(false);
    }
  };

  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !hasMore || searching) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

    if (scrollTop + clientHeight >= scrollHeight - 100) {
      const nextPage = page + 1;
      setPage(nextPage);
      searchAssignees(debouncedQuery, nextPage, true);
    }
  }, [hasMore, searching, page, debouncedQuery]);

  const toggleUserSelection = (result: SearchResult) => {
    if (result.isAlreadyAssigned) return;

    const userIndex = selectedUsers.findIndex(u => u.id === result.id);

    if (userIndex >= 0) {
      // Remove from selection
      setSelectedUsers(prev => prev.filter((_, index) => index !== userIndex));
    } else {
      // Add to selection
      const newUser: SelectedUser = {
        id: result.id,
        name: result.name,
        email: result.email
      };
      setSelectedUsers(prev => [...prev, newUser]);
    }
  };

  const removeFromSelection = (userId: string) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== userId));
  };

  const clearSelections = () => {
    setSelectedUsers([]);
  };

  const handleAssign = async () => {
    if (selectedUsers.length === 0) {
      toast.error('Debes seleccionar al menos un usuario');
      return;
    }

    setAssigning(true);
    const loadingToast = toast.loading('Asignando curso...');

    try {
      const userIds = selectedUsers.map(u => u.id);

      const response = await fetch('/api/courses/batch-assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courseId: courseId as string,
          userIds
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to assign course');
      }

      const result = await response.json();

      toast.success(
        `Curso asignado exitosamente: ${result.assignments_created} asignaciones creadas${
          result.assignments_skipped > 0 ? `, ${result.assignments_skipped} omitidas (ya asignadas)` : ''
        }`,
        { id: loadingToast }
      );

      // Update assignment count
      setTotalAssigned(prev => prev + result.assignments_created);
      await loadAssignedUsers(course?.id || (courseId as string));

      // Clear selected users
      setSelectedUsers([]);

      // Refresh search results to show updated assignment status
      if (searchQuery) {
        await searchAssignees(searchQuery, 1, false);
      }

    } catch (error: any) {
      console.error('Error assigning course:', error);
      toast.error(error.message || 'Error al asignar el curso', { id: loadingToast });
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (userId: string) => {
    if (!course) return;
    await handleBatchUnassign([userId]);
  };

  const handleBatchUnassign = async (userIds: string[]) => {
    if (!course || userIds.length === 0) return;

    setUnassigning(true);
    const loadingToast = toast.loading(
      userIds.length === 1 ? 'Desasignando curso...' : `Desasignando ${userIds.length} usuarios...`
    );

    try {
      const response = await fetch('/api/courses/unassign', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courseId: course.id,
          userIds,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to unassign course');
      }

      const result = await response.json();

      toast.success(
        userIds.length === 1
          ? 'Curso desasignado exitosamente'
          : `${userIds.length} usuarios desasignados exitosamente`,
        { id: loadingToast }
      );

      // Update assignment count
      setTotalAssigned(prev => prev - userIds.length);

      // Clear selection
      setSelectedToUnassign(new Set());

      // Refresh search results to show updated assignment status
      await searchAssignees(searchQuery || '', 1, false);
      await loadAssignedUsers(course.id);

    } catch (error: any) {
      console.error('Error unassigning course:', error);
      toast.error(error.message || 'Error al desasignar el curso', { id: loadingToast });
    } finally {
      setUnassigning(false);
    }
  };

  const toggleUnassignSelection = (userId: string) => {
    setSelectedToUnassign(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const selectAllFilteredForUnassign = () => {
    const newSet = new Set(filteredAssignedUsers.map(u => u.id));
    setSelectedToUnassign(newSet);
  };

  const clearUnassignSelection = () => {
    setSelectedToUnassign(new Set());
  };

  const loadAssignedUsers = async (courseIdToLoad: string) => {
    try {
      setLoadingAssigned(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`/api/admin/course-assignments?courseId=${courseIdToLoad}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      if (!response.ok) {
        console.warn('Could not load assigned users');
        return;
      }

      const payload = await response.json();
      const assignments = payload.assignments || [];
      const mapped: AssignedUser[] = assignments.map((a: any) => ({
        id: a.teacher_id,
        name: `${a.profiles?.first_name || ''} ${a.profiles?.last_name || ''}`.trim() || a.profiles?.email || 'Sin nombre',
        email: a.profiles?.email || '',
        school_name: a.profiles?.school || null
      }));
      setAssignedUsers(mapped);
    } catch (err) {
      console.warn('Error loading assigned users', err);
    } finally {
      setLoadingAssigned(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // Get unique schools from assigned users for filtering
  const assignedSchools = useMemo(() => {
    const schoolNames = assignedUsers
      .map(u => u.school_name)
      .filter((name): name is string => !!name);
    return [...new Set(schoolNames)].sort();
  }, [assignedUsers]);

  // Filter assigned users by school
  const filteredAssignedUsers = useMemo(() => {
    if (!assignedSchoolFilter) return assignedUsers;
    return assignedUsers.filter(u => u.school_name === assignedSchoolFilter);
  }, [assignedUsers, assignedSchoolFilter]);

  // Filter communities by selected school
  const filteredCommunities = useMemo(() => {
    if (!selectedSchool) return [];
    return communities.filter(c => String(c.school_id) === String(selectedSchool));
  }, [communities, selectedSchool]);

  // Select all unassigned users in current search results
  const selectAllUnassigned = () => {
    const unassignedUsers = searchResults.filter(u => !u.isAlreadyAssigned);
    const newUsers = unassignedUsers
      .filter(u => !selectedUsers.some(s => s.id === u.id))
      .map(u => ({ id: u.id, name: u.name, email: u.email }));
    setSelectedUsers(prev => [...prev, ...newUsers]);
  };

  if (loading || !course) {
    return (
      <div className="min-h-screen bg-brand_beige flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
          <p className="mt-4 text-brand_blue font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <MainLayout
      user={user}
      currentPage="courses"
      pageTitle={`Asignar: ${course.title}`}
      breadcrumbs={[
        { label: 'Panel', href: '/dashboard' },
        { label: 'Cursos', href: '/admin/course-builder' },
        { label: 'Asignar' }
      ]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <Head>
        <title>Asignar Curso</title>
      </Head>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-6">
          {/* Main Content */}
          <div className="flex-1">
            {/* Header */}
            <div className="mb-8">
              <button
                onClick={() => router.push('/admin/course-builder')}
                className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Volver a Cursos
              </button>

              <h1 className="text-3xl font-bold text-brand_blue">
                Asignar Curso
              </h1>
              <p className="mt-2 text-gray-600">
                Asignando: <span className="font-semibold">{course.title}</span>
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Total asignados: {totalAssigned}
              </p>
            </div>

            {/* Assigned Users - Collapsible */}
            <div className="bg-white rounded-lg shadow-sm mb-6">
              <button
                onClick={() => setAssignedSectionExpanded(!assignedSectionExpanded)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-gray-900">Asignados actualmente</h3>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand_blue/10 text-brand_blue">
                    {assignedUsers.length}
                  </span>
                  {loadingAssigned && (
                    <span className="text-xs text-gray-500">Cargando...</span>
                  )}
                </div>
                {assignedSectionExpanded ? (
                  <ChevronUp className="h-5 w-5 text-gray-500" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-500" />
                )}
              </button>

              {assignedSectionExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  {assignedUsers.length === 0 ? (
                    <p className="text-sm text-gray-500 pt-4">No hay usuarios asignados.</p>
                  ) : (
                    <>
                      {/* School filter for assigned users */}
                      {assignedSchools.length > 0 && (
                        <div className="pt-4 pb-3">
                          <label htmlFor="assignedSchoolFilter" className="block text-sm font-medium text-gray-700 mb-2">
                            Filtrar por Colegio
                          </label>
                          <select
                            id="assignedSchoolFilter"
                            value={assignedSchoolFilter}
                            onChange={(e) => setAssignedSchoolFilter(e.target.value)}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-1 focus:ring-brand_blue focus:border-brand_blue sm:text-sm"
                          >
                            <option value="">Todos los colegios ({assignedUsers.length})</option>
                            {assignedSchools.map((schoolName) => {
                              const count = assignedUsers.filter(u => u.school_name === schoolName).length;
                              return (
                                <option key={schoolName} value={schoolName}>
                                  {schoolName} ({count})
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      )}

                      {/* Batch actions bar */}
                      <div className="flex items-center justify-between py-3 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                          {assignedSchoolFilter && (
                            <span className="text-sm text-gray-500">
                              Mostrando {filteredAssignedUsers.length} de {assignedUsers.length} usuarios
                            </span>
                          )}
                          {selectedToUnassign.size > 0 && (
                            <span className="text-sm font-medium text-red-600">
                              {selectedToUnassign.size} seleccionado(s)
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedToUnassign.size > 0 ? (
                            <>
                              <button
                                onClick={clearUnassignSelection}
                                className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => handleBatchUnassign(Array.from(selectedToUnassign))}
                                disabled={unassigning}
                                className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                              >
                                Desasignar ({selectedToUnassign.size})
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={selectAllFilteredForUnassign}
                              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200"
                            >
                              Seleccionar todos
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 max-h-[300px] overflow-y-auto pt-2">
                        {filteredAssignedUsers.map((user) => (
                          <div
                            key={user.id}
                            className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                              selectedToUnassign.has(user.id) ? 'border-red-300 bg-red-50' : 'hover:bg-gray-50'
                            }`}
                            onClick={() => toggleUnassignSelection(user.id)}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={selectedToUnassign.has(user.id)}
                                onChange={() => toggleUnassignSelection(user.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                              />
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-gray-900">{user.name}</span>
                                <span className="text-xs text-gray-500">{user.email}</span>
                                {user.school_name && (
                                  <span className="text-xs text-gray-400">{user.school_name}</span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUnassign(user.id);
                              }}
                              disabled={unassigning}
                              className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 disabled:opacity-50"
                            >
                              Desasignar
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              {/* Filters Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* School Filter */}
                <div>
                  <label htmlFor="schoolFilter" className="block text-sm font-medium text-gray-700 mb-2">
                    Filtrar por Colegio
                  </label>
                  <select
                    id="schoolFilter"
                    value={selectedSchool}
                    onChange={(e) => setSelectedSchool(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-1 focus:ring-brand_blue focus:border-brand_blue sm:text-sm"
                  >
                    <option value="">Todos los colegios</option>
                    {schools.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Community Filter - only shows when school is selected */}
                {selectedSchool && filteredCommunities.length > 0 && (
                  <div>
                    <label htmlFor="communityFilter" className="block text-sm font-medium text-gray-700 mb-2">
                      Filtrar por Comunidad de Crecimiento
                    </label>
                    <select
                      id="communityFilter"
                      value={selectedCommunity}
                      onChange={(e) => setSelectedCommunity(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-1 focus:ring-brand_blue focus:border-brand_blue sm:text-sm"
                    >
                      <option value="">Todas las comunidades</option>
                      {filteredCommunities.map((community) => (
                        <option key={community.id} value={community.id}>
                          {community.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Search */}
              <div className="relative mb-4">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <SearchIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar usuarios por nombre o email..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-brand_blue focus:border-brand_blue sm:text-sm"
                />
              </div>

              {/* Select All Button - shows when there are unassigned users in results */}
              {searchResults.length > 0 && searchResults.some(u => !u.isAlreadyAssigned) && (
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
                  <span className="text-sm text-gray-600">
                    {searchResults.filter(u => !u.isAlreadyAssigned).length} usuario(s) disponible(s) para asignar
                  </span>
                  <button
                    onClick={selectAllUnassigned}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-brand_blue bg-brand_blue/10 hover:bg-brand_blue/20 transition-colors"
                  >
                    <UserPlus className="h-4 w-4 mr-1.5" />
                    Seleccionar todos
                  </button>
                </div>
              )}

              {/* User List */}
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="space-y-2 max-h-[400px] overflow-y-auto"
              >
                {searching && searchResults.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
                    <p className="mt-2 text-gray-500">Buscando usuarios...</p>
                  </div>
                ) : searchResults.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    {searchQuery ? 'No se encontraron usuarios' : 'Ingresa un termino de busqueda'}
                  </p>
                ) : (
                  <>
                    {searchResults.map((user) => {
                      const isSelected = selectedUsers.some(u => u.id === user.id);
                      return (
                        <label
                          key={user.id}
                          className={`block p-3 border rounded-lg transition-colors ${
                            user.isAlreadyAssigned
                              ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                              : isSelected
                                ? 'border-brand_blue bg-brand_beige cursor-pointer'
                                : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={user.isAlreadyAssigned}
                              onChange={() => toggleUserSelection(user)}
                              className="h-4 w-4 text-brand_blue focus:ring-brand_blue border-gray-300 rounded disabled:opacity-50"
                            />
                            <div className="ml-3 flex-1">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-gray-900">
                                    {user.name}
                                  </p>
                                  <p className="text-sm text-gray-500">
                                    {user.email}
                                  </p>
                                  {(user.school_name || user.community_name) && (
                                    <p className="text-xs text-gray-400 mt-1">
                                      {user.school_name}
                                      {user.school_name && user.community_name && ' · '}
                                      {user.community_name}
                                    </p>
                                  )}
                                </div>
                                {user.isAlreadyAssigned && (
                                  <div className="flex items-center space-x-2">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand_accent/20 text-amber-700">
                                      Asignado
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleUnassign(user.id);
                                      }}
                                      disabled={unassigning}
                                      className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      Desasignar
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                    {searching && (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Assignment Summary Sidebar */}
          <div className="w-80">
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Resumen de Asignacion
              </h3>

              {selectedUsers.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  No has seleccionado ningun usuario
                </p>
              ) : (
                <>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {selectedUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center space-x-2 flex-1 min-w-0">
                          <UserPlus className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {user.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {user.email}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => removeFromSelection(user.id)}
                          className="ml-2 p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="text-sm text-gray-600">
                      <p>{selectedUsers.length} usuario{selectedUsers.length !== 1 ? 's' : ''}</p>
                    </div>

                    <button
                      onClick={clearSelections}
                      className="mt-3 w-full text-sm text-brand_blue hover:text-brand_blue/80"
                    >
                      Limpiar seleccion
                    </button>
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <div className="mt-6 space-y-3">
                <button
                  onClick={handleAssign}
                  disabled={assigning || selectedUsers.length === 0}
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand_blue hover:bg-brand_blue/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {assigning ? 'Asignando...' : 'Confirmar Asignacion'}
                </button>
                <button
                  onClick={() => router.push('/admin/course-builder')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
