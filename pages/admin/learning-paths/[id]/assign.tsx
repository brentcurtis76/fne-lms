import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import MainLayout from '../../../../components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { getUserPrimaryRole } from '../../../../utils/roleUtils';
import { ChevronLeft, UserPlus, Users, X } from 'lucide-react';
import { LearningPath } from '../../../../types/learningPaths';
import { SearchIcon, XIcon } from '@heroicons/react/solid';
import useDebounce from '../../../../hooks/useDebounce';

interface SearchResult {
  id: string;
  name: string;
  email?: string;
  description?: string;
  member_count?: number;
  isAlreadyAssigned: boolean;
}

interface SelectedAssignee {
  id: string;
  name: string;
  type: 'user' | 'group';
  email?: string;
  description?: string;
}

export default function AssignLearningPath() {
  const router = useRouter();
  const { id: pathId } = router.query;
  const supabase = useSupabaseClient();
  
  // Auth state
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  
  // Learning path state
  const [learningPath, setLearningPath] = useState<LearningPath | null>(null);
  
  // Selection state - now storing full assignee objects
  const [selectedAssignees, setSelectedAssignees] = useState<SelectedAssignee[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users');
  
  // Search state
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const debouncedUserQuery = useDebounce(userSearchQuery, 300);
  const debouncedGroupQuery = useDebounce(groupSearchQuery, 300);
  
  // Search results
  const [userSearchResults, setUserSearchResults] = useState<SearchResult[]>([]);
  const [groupSearchResults, setGroupSearchResults] = useState<SearchResult[]>([]);
  const [userPage, setUserPage] = useState(1);
  const [groupPage, setGroupPage] = useState(1);
  const [hasMoreUsers, setHasMoreUsers] = useState(false);
  const [hasMoreGroups, setHasMoreGroups] = useState(false);
  
  // Assignment counts for tabs
  const [totalAssignedUsers, setTotalAssignedUsers] = useState(0);
  const [totalAssignedGroups, setTotalAssignedGroups] = useState(0);
  
  // Loading states
  const [loading, setLoading] = useState(true);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [searchingGroups, setSearchingGroups] = useState(false);
  const [assigning, setAssigning] = useState(false);
  
  // Refs for infinite scroll
  const userScrollRef = useRef<HTMLDivElement>(null);
  const groupScrollRef = useRef<HTMLDivElement>(null);

  // Check authentication and load learning path
  useEffect(() => {
    if (router.isReady && pathId) {
      checkAuthAndLoadPath();
    }
  }, [router.isReady, pathId]);

  // Search users when debounced query changes
  useEffect(() => {
    if (debouncedUserQuery !== undefined && learningPath && !loading) {
      setUserPage(1);
      searchAssignees('users', debouncedUserQuery, 1);
    }
  }, [debouncedUserQuery, learningPath, loading]);

  // Search groups when debounced query changes
  useEffect(() => {
    if (debouncedGroupQuery !== undefined && learningPath && !loading) {
      setGroupPage(1);
      searchAssignees('groups', debouncedGroupQuery, 1);
    }
  }, [debouncedGroupQuery, learningPath, loading]);

  const checkAuthAndLoadPath = async () => {
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
      const hasAccess = ['admin', 'equipo_directivo', 'consultor'].includes(userRole);
      
      if (!hasAccess) {
        toast.error('No tienes permisos para asignar rutas de aprendizaje');
        router.push('/dashboard');
        return;
      }
      
      setIsAdmin(userRole === 'admin');
      
      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }
      
      // Load learning path
      const pathResponse = await fetch(`/api/learning-paths/${pathId}`);
      if (!pathResponse.ok) {
        throw new Error('Failed to load learning path');
      }
      
      const pathData: LearningPath = await pathResponse.json();
      setLearningPath(pathData);
      
      // Load assignment counts for tabs
      await loadAssignmentCounts(pathId as string);
      
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Error al cargar los datos');
      router.push('/admin/learning-paths');
    } finally {
      setLoading(false);
    }
  };

  const loadAssignmentCounts = async (pathId: string) => {
    try {
      const { data: assignments, error } = await supabase
        .from('learning_path_assignments')
        .select('user_id, group_id')
        .eq('path_id', pathId);

      if (error) {
        console.warn('Could not load assignment counts:', error);
        return;
      }

      const userCount = assignments.filter(a => a.user_id).length;
      const groupCount = assignments.filter(a => a.group_id).length;
      
      setTotalAssignedUsers(userCount);
      setTotalAssignedGroups(groupCount);
    } catch (error) {
      console.warn('Error loading assignment counts:', error);
    }
  };

  const searchAssignees = async (
    searchType: 'users' | 'groups',
    query: string,
    page: number,
    append: boolean = false
  ) => {
    const setSearching = searchType === 'users' ? setSearchingUsers : setSearchingGroups;
    const setResults = searchType === 'users' ? setUserSearchResults : setGroupSearchResults;
    const setHasMore = searchType === 'users' ? setHasMoreUsers : setHasMoreGroups;
    
    setSearching(true);
    
    try {
      const response = await fetch('/api/learning-paths/search-assignees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pathId: pathId as string,
          searchType,
          query,
          page,
          pageSize: 20
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Search API Error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          requestBody: { pathId, searchType, query, page, pageSize: 20 }
        });
        throw new Error(errorData.error || 'Failed to search assignees');
      }

      const data = await response.json();
      
      if (append) {
        setResults(prev => [...prev, ...data.results]);
      } else {
        setResults(data.results);
      }
      
      setHasMore(data.hasMore);
      
    } catch (error: any) {
      console.error('Error searching assignees:', error);
      toast.error('Error al buscar');
    } finally {
      setSearching(false);
    }
  };

  const handleScroll = useCallback((searchType: 'users' | 'groups') => {
    const scrollRef = searchType === 'users' ? userScrollRef : groupScrollRef;
    const hasMore = searchType === 'users' ? hasMoreUsers : hasMoreGroups;
    const isSearching = searchType === 'users' ? searchingUsers : searchingGroups;
    const currentPage = searchType === 'users' ? userPage : groupPage;
    const setPage = searchType === 'users' ? setUserPage : setGroupPage;
    const query = searchType === 'users' ? debouncedUserQuery : debouncedGroupQuery;
    
    if (!scrollRef.current || !hasMore || isSearching) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    
    if (scrollTop + clientHeight >= scrollHeight - 100) {
      const nextPage = currentPage + 1;
      setPage(nextPage);
      searchAssignees(searchType, query, nextPage, true);
    }
  }, [hasMoreUsers, hasMoreGroups, searchingUsers, searchingGroups, userPage, groupPage, debouncedUserQuery, debouncedGroupQuery]);

  const toggleAssigneeSelection = (result: SearchResult, type: 'user' | 'group') => {
    if (result.isAlreadyAssigned) return;
    
    const assigneeIndex = selectedAssignees.findIndex(a => a.id === result.id && a.type === type);
    
    if (assigneeIndex >= 0) {
      // Remove from selection
      setSelectedAssignees(prev => prev.filter((_, index) => index !== assigneeIndex));
    } else {
      // Add to selection
      const newAssignee: SelectedAssignee = {
        id: result.id,
        name: result.name,
        type,
        email: result.email,
        description: result.description
      };
      setSelectedAssignees(prev => [...prev, newAssignee]);
    }
  };

  const removeFromSelection = (assigneeId: string, type: 'user' | 'group') => {
    setSelectedAssignees(prev => prev.filter(a => !(a.id === assigneeId && a.type === type)));
  };

  const clearSelections = () => {
    setSelectedAssignees([]);
  };

  const handleAssign = async () => {
    if (selectedAssignees.length === 0) {
      toast.error('Debes seleccionar al menos un usuario o grupo');
      return;
    }
    
    setAssigning(true);
    const loadingToast = toast.loading('Asignando ruta de aprendizaje...');
    
    try {
      const userIds = selectedAssignees.filter(a => a.type === 'user').map(a => a.id);
      const groupIds = selectedAssignees.filter(a => a.type === 'group').map(a => a.id);
      
      const response = await fetch('/api/learning-paths/batch-assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pathId: pathId as string,
          userIds,
          groupIds
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to assign learning path');
      }

      const result = await response.json();
      
      toast.success(
        `Ruta asignada exitosamente: ${result.assignments_created} asignaciones creadas${
          result.assignments_skipped > 0 ? `, ${result.assignments_skipped} omitidas (ya asignadas)` : ''
        }`, 
        { id: loadingToast }
      );
      
      // Refresh assignment counts
      await loadAssignmentCounts(pathId as string);
      
      // Clear selected assignees
      setSelectedAssignees([]);
      
      // Refresh search results to show updated assignment status
      if (userSearchQuery) {
        await searchAssignees('users', userSearchQuery, 1, false);
      }
      if (groupSearchQuery) {
        await searchAssignees('groups', groupSearchQuery, 1, false);
      }
      
    } catch (error: any) {
      console.error('Error assigning learning path:', error);
      toast.error(error.message || 'Error al asignar la ruta de aprendizaje', { id: loadingToast });
    } finally {
      setAssigning(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading || !learningPath) {
    return (
      <div className="min-h-screen bg-brand_beige flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
          <p className="mt-4 text-brand_blue font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  const selectedUserCount = selectedAssignees.filter(a => a.type === 'user').length;
  const selectedGroupCount = selectedAssignees.filter(a => a.type === 'group').length;

  return (
    <MainLayout
      user={user}
      currentPage="learning-paths"
      pageTitle={`Asignar: ${learningPath.name}`}
      breadcrumbs={[
        { label: 'Panel', href: '/dashboard' },
        { label: 'Rutas de Aprendizaje', href: '/admin/learning-paths' },
        { label: 'Asignar' }
      ]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <Head>
        <title>Asignar Ruta de Aprendizaje</title>
      </Head>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-6">
          {/* Main Content */}
          <div className="flex-1">
            {/* Header */}
            <div className="mb-8">
              <button
                onClick={() => router.push('/admin/learning-paths')}
                className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Volver a Rutas de Aprendizaje
              </button>
              
              <h1 className="text-3xl font-bold text-brand_blue">
                Asignar Ruta de Aprendizaje
              </h1>
              <p className="mt-2 text-gray-600">
                Asignando: <span className="font-semibold">{learningPath.name}</span>
              </p>
            </div>

            {/* Tab Navigation */}
            <div className="border-b border-gray-200 mb-6">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('users')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'users'
                      ? 'border-brand_blue text-brand_blue'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <UserPlus className="h-4 w-4 inline mr-2" />
                  Usuarios ({totalAssignedUsers})
                </button>
                <button
                  onClick={() => setActiveTab('groups')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'groups'
                      ? 'border-brand_blue text-brand_blue'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Users className="h-4 w-4 inline mr-2" />
                  Grupos ({totalAssignedGroups})
                </button>
              </nav>
            </div>

            {/* Content */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              {activeTab === 'users' ? (
                <div>
                  {/* User Search */}
                  <div className="relative mb-4">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <SearchIcon className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      placeholder="Buscar usuarios por nombre o email..."
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-brand_blue focus:border-brand_blue sm:text-sm"
                    />
                  </div>

                  {/* User List */}
                  <div 
                    ref={userScrollRef}
                    onScroll={() => handleScroll('users')}
                    className="space-y-2 max-h-[400px] overflow-y-auto"
                  >
                    {searchingUsers && userSearchResults.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
                        <p className="mt-2 text-gray-500">Buscando usuarios...</p>
                      </div>
                    ) : userSearchResults.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">
                        {userSearchQuery ? 'No se encontraron usuarios' : 'Ingresa un término de búsqueda'}
                      </p>
                    ) : (
                      <>
                        {userSearchResults.map((user) => {
                          const isSelected = selectedAssignees.some(a => a.id === user.id && a.type === 'user');
                          return (
                            <label
                              key={user.id}
                              className={`block p-3 border rounded-lg transition-colors ${
                                user.isAlreadyAssigned 
                                  ? 'border-gray-200 bg-gray-50 cursor-not-allowed' 
                                  : isSelected 
                                    ? 'border-brand_blue bg-blue-50 cursor-pointer' 
                                    : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={user.isAlreadyAssigned}
                                  onChange={() => toggleAssigneeSelection(user, 'user')}
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
                                    </div>
                                    {user.isAlreadyAssigned && (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                        Asignado
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                        {searchingUsers && (
                          <div className="text-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  {/* Group Search */}
                  <div className="relative mb-4">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <SearchIcon className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={groupSearchQuery}
                      onChange={(e) => setGroupSearchQuery(e.target.value)}
                      placeholder="Buscar grupos por nombre..."
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-brand_blue focus:border-brand_blue sm:text-sm"
                    />
                  </div>

                  {/* Group List */}
                  <div 
                    ref={groupScrollRef}
                    onScroll={() => handleScroll('groups')}
                    className="space-y-2 max-h-[400px] overflow-y-auto"
                  >
                    {searchingGroups && groupSearchResults.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
                        <p className="mt-2 text-gray-500">Buscando grupos...</p>
                      </div>
                    ) : groupSearchResults.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">
                        {groupSearchQuery ? 'No se encontraron grupos' : 'Ingresa un término de búsqueda'}
                      </p>
                    ) : (
                      <>
                        {groupSearchResults.map((group) => {
                          const isSelected = selectedAssignees.some(a => a.id === group.id && a.type === 'group');
                          return (
                            <label
                              key={group.id}
                              className={`block p-3 border rounded-lg transition-colors ${
                                group.isAlreadyAssigned 
                                  ? 'border-gray-200 bg-gray-50 cursor-not-allowed' 
                                  : isSelected 
                                    ? 'border-brand_blue bg-blue-50 cursor-pointer' 
                                    : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={group.isAlreadyAssigned}
                                  onChange={() => toggleAssigneeSelection(group, 'group')}
                                  className="h-4 w-4 text-brand_blue focus:ring-brand_blue border-gray-300 rounded disabled:opacity-50"
                                />
                                <div className="ml-3 flex-1">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-sm font-medium text-gray-900">
                                        {group.name}
                                      </p>
                                      {group.description && (
                                        <p className="text-sm text-gray-500 mt-1">
                                          {group.description}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <span className="text-xs text-gray-500">
                                        {group.member_count || 0} miembros
                                      </span>
                                      {group.isAlreadyAssigned && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                          Asignado
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                        {searchingGroups && (
                          <div className="text-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Assignment Summary Sidebar */}
          <div className="w-80">
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Resumen de Asignación
              </h3>
              
              {selectedAssignees.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  No has seleccionado ningún usuario o grupo
                </p>
              ) : (
                <>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {selectedAssignees.map((assignee) => (
                      <div
                        key={`${assignee.type}-${assignee.id}`}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center space-x-2 flex-1 min-w-0">
                          {assignee.type === 'user' ? (
                            <UserPlus className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          ) : (
                            <Users className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {assignee.name}
                            </p>
                            {assignee.email && (
                              <p className="text-xs text-gray-500 truncate">
                                {assignee.email}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => removeFromSelection(assignee.id, assignee.type)}
                          className="ml-2 p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="text-sm text-gray-600 space-y-1">
                      {selectedUserCount > 0 && (
                        <p>{selectedUserCount} usuario{selectedUserCount !== 1 ? 's' : ''}</p>
                      )}
                      {selectedGroupCount > 0 && (
                        <p>{selectedGroupCount} grupo{selectedGroupCount !== 1 ? 's' : ''}</p>
                      )}
                    </div>
                    
                    <button
                      onClick={clearSelections}
                      className="mt-3 w-full text-sm text-brand_blue hover:text-brand_blue/80"
                    >
                      Limpiar selección
                    </button>
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <div className="mt-6 space-y-3">
                <button
                  onClick={handleAssign}
                  disabled={assigning || selectedAssignees.length === 0}
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand_blue hover:bg-brand_blue/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {assigning ? 'Asignando...' : 'Confirmar Asignación'}
                </button>
                <button
                  onClick={() => router.push('/admin/learning-paths')}
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