import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import MainLayout from '../../../../components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { getUserPrimaryRole } from '../../../../utils/roleUtils';
import { ChevronLeft, UserPlus, Users } from 'lucide-react';
import { LearningPath } from '../../../../types/learningPaths';
import { SearchIcon, XIcon } from '@heroicons/react/solid';

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface Group {
  id: string;
  name: string;
  description?: string;
  member_count?: number;
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
  
  // Selection state
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users');
  
  // User/Group lists
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [filteredGroups, setFilteredGroups] = useState<Group[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  
  // Loading state
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (router.isReady && pathId) {
      checkAuthAndLoadData();
    }
  }, [router.isReady, pathId]);

  useEffect(() => {
    // Filter users based on search query
    if (userSearchQuery) {
      const query = userSearchQuery.toLowerCase();
      setFilteredUsers(
        allUsers.filter(user => 
          user.first_name.toLowerCase().includes(query) ||
          user.last_name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query)
        )
      );
    } else {
      setFilteredUsers(allUsers);
    }
  }, [userSearchQuery, allUsers]);

  useEffect(() => {
    // Filter groups based on search query
    if (groupSearchQuery) {
      const query = groupSearchQuery.toLowerCase();
      setFilteredGroups(
        allGroups.filter(group => 
          group.name.toLowerCase().includes(query) ||
          (group.description && group.description.toLowerCase().includes(query))
        )
      );
    } else {
      setFilteredGroups(allGroups);
    }
  }, [groupSearchQuery, allGroups]);

  const checkAuthAndLoadData = async () => {
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
      
      // Load users
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .order('first_name');
      
      if (usersError) throw usersError;
      
      setAllUsers(users || []);
      setFilteredUsers(users || []);
      
      // Load groups
      const { data: groups, error: groupsError } = await supabase
        .from('groups')
        .select('id, name, description')
        .order('name');
      
      if (groupsError) throw groupsError;
      
      // Get member counts for groups
      if (groups && groups.length > 0) {
        const { data: memberCounts } = await supabase
          .from('user_roles')
          .select('community_id')
          .in('community_id', groups.map(g => g.id))
          .eq('is_active', true);
        
        const countMap = memberCounts?.reduce((acc: any, item: any) => {
          acc[item.community_id] = (acc[item.community_id] || 0) + 1;
          return acc;
        }, {}) || {};
        
        const groupsWithCounts = groups.map(group => ({
          ...group,
          member_count: countMap[group.id] || 0
        }));
        
        setAllGroups(groupsWithCounts);
        setFilteredGroups(groupsWithCounts);
      }
      
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Error al cargar los datos');
      router.push('/admin/learning-paths');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (selectedUsers.length === 0 && selectedGroups.length === 0) {
      toast.error('Debes seleccionar al menos un usuario o grupo');
      return;
    }
    
    setAssigning(true);
    const loadingToast = toast.loading('Asignando ruta de aprendizaje...');
    
    try {
      const response = await fetch('/api/learning-paths/batch-assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pathId: pathId as string,
          userIds: selectedUsers,
          groupIds: selectedGroups
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
      
      router.push('/admin/learning-paths');
      
    } catch (error: any) {
      console.error('Error assigning learning path:', error);
      toast.error(error.message || 'Error al asignar la ruta de aprendizaje', { id: loadingToast });
    } finally {
      setAssigning(false);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const clearSelections = () => {
    setSelectedUsers([]);
    setSelectedGroups([]);
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

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        {/* Selection Summary */}
        {(selectedUsers.length > 0 || selectedGroups.length > 0) && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-medium text-blue-900">
                  Selección actual
                </h3>
                <p className="text-sm text-blue-700 mt-1">
                  {selectedUsers.length > 0 && `${selectedUsers.length} usuarios`}
                  {selectedUsers.length > 0 && selectedGroups.length > 0 && ', '}
                  {selectedGroups.length > 0 && `${selectedGroups.length} grupos`}
                </p>
              </div>
              <button
                onClick={clearSelections}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Limpiar selección
              </button>
            </div>
          </div>
        )}

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
              Usuarios ({selectedUsers.length})
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
              Grupos ({selectedGroups.length})
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
                  placeholder="Buscar usuarios..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-brand_blue focus:border-brand_blue sm:text-sm"
                />
              </div>

              {/* User List */}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredUsers.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    No se encontraron usuarios
                  </p>
                ) : (
                  filteredUsers.map((user) => {
                    const isSelected = selectedUsers.includes(user.id);
                    return (
                      <label
                        key={user.id}
                        className={`block p-3 border rounded-lg cursor-pointer transition-colors ${
                          isSelected 
                            ? 'border-brand_blue bg-blue-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleUserSelection(user.id)}
                            className="h-4 w-4 text-brand_blue focus:ring-brand_blue border-gray-300 rounded"
                          />
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900">
                              {user.first_name} {user.last_name}
                            </p>
                            <p className="text-sm text-gray-500">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </label>
                    );
                  })
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
                  placeholder="Buscar grupos..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-brand_blue focus:border-brand_blue sm:text-sm"
                />
              </div>

              {/* Group List */}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredGroups.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    No se encontraron grupos
                  </p>
                ) : (
                  filteredGroups.map((group) => {
                    const isSelected = selectedGroups.includes(group.id);
                    return (
                      <label
                        key={group.id}
                        className={`block p-3 border rounded-lg cursor-pointer transition-colors ${
                          isSelected 
                            ? 'border-brand_blue bg-blue-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleGroupSelection(group.id)}
                            className="h-4 w-4 text-brand_blue focus:ring-brand_blue border-gray-300 rounded"
                          />
                          <div className="ml-3 flex-1">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-gray-900">
                                {group.name}
                              </p>
                              <span className="text-xs text-gray-500">
                                {group.member_count || 0} miembros
                              </span>
                            </div>
                            {group.description && (
                              <p className="text-sm text-gray-500 mt-1">
                                {group.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={() => router.push('/admin/learning-paths')}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue"
          >
            Cancelar
          </button>
          <button
            onClick={handleAssign}
            disabled={assigning || (selectedUsers.length === 0 && selectedGroups.length === 0)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand_blue hover:bg-brand_blue/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {assigning ? 'Asignando...' : 'Confirmar Asignación'}
          </button>
        </div>
      </div>
    </MainLayout>
  );
}