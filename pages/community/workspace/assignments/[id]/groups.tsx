import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import Head from 'next/head';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../../../components/layout/MainLayout';
import { useAuth } from '../../../../../hooks/useAuth';
import { groupAssignmentService } from '../../../../../lib/services/groupAssignments';
import { ClipboardCheckIcon, UsersIcon, ArrowLeftIcon } from '@heroicons/react/outline';

export default function AssignmentGroupsPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const { id: assignmentId } = router.query;
  const { user, loading: authLoading, isAdmin, avatarUrl, logout } = useAuth();
  
  const [assignment, setAssignment] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [workspace, setWorkspace] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userGroup, setUserGroup] = useState<any>(null);

  useEffect(() => {
    if (!authLoading && user && assignmentId) {
      loadData();
    } else if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, assignmentId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load assignment details
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('lesson_assignments')
        .select(`
          *,
          courses (
            id,
            title
          ),
          lessons (
            id,
            title
          ),
          community:growth_communities!assigned_to_community_id (
            id,
            name
          )
        `)
        .eq('id', assignmentId)
        .single();

      if (assignmentError) throw assignmentError;
      setAssignment(assignmentData);

      // Load workspace
      if (assignmentData.assigned_to_community_id) {
        const { data: workspaceData } = await supabase
          .from('community_workspaces')
          .select('*')
          .eq('community_id', assignmentData.assigned_to_community_id)
          .single();
          
        setWorkspace(workspaceData);
      }

      // Load all groups for this assignment
      const allGroups = await groupAssignmentService.getAssignmentGroups(assignmentId as string);
      setGroups(allGroups);

      // Check if user is in a group
      const userInGroup = allGroups.find(group => 
        group.members.some((member: any) => member.user_id === user?.id)
      );
      setUserGroup(userInGroup);

    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGroup = async (groupId: string) => {
    if (!user || !assignment || !workspace) return;

    try {
      await groupAssignmentService.joinGroup(
        assignment.id,
        assignment.assigned_to_community_id,
        groupId,
        user.id
      );
      
      toast.success('Te has unido al grupo exitosamente');
      await loadData();
    } catch (error) {
      console.error('Error joining group:', error);
      toast.error('Error al unirse al grupo');
    }
  };

  const handleLeaveGroup = async () => {
    if (!user || !assignment) return;

    try {
      await groupAssignmentService.leaveGroup(assignment.id, user.id);
      toast.success('Has salido del grupo');
      await loadData();
    } catch (error) {
      console.error('Error leaving group:', error);
      toast.error('Error al salir del grupo');
    }
  };

  if (authLoading || loading) {
    return (
      <MainLayout 
        user={user} 
        currentPage="workspace"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={isAdmin}
        onLogout={logout}
        avatarUrl={avatarUrl}
      >
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00365b]"></div>
        </div>
      </MainLayout>
    );
  }

  if (!assignment) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Grupos - {assignment.title} - FNE LMS</title>
      </Head>

      <MainLayout 
        user={user} 
        currentPage="workspace"
        pageTitle="Grupos de Trabajo"
        breadcrumbs={[
          { label: 'Mis Tareas', href: '/mi-aprendizaje/tareas' },
          { label: assignment.title }
        ]}
        isAdmin={isAdmin}
        onLogout={logout}
        avatarUrl={avatarUrl}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Back button */}
          <button
            onClick={() => router.push('/mi-aprendizaje/tareas')}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-1" />
            Volver a Tareas Grupales
          </button>

          {/* Assignment Header */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-[#00365b] mb-2">{assignment.title}</h1>
                <p className="text-gray-600">
                  {assignment.courses?.title} - {assignment.lessons?.title}
                </p>
                <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                  <span>Comunidad: {assignment.community?.name}</span>
                  <span>•</span>
                  <span>Grupos: {assignment.min_group_size} - {assignment.max_group_size} miembros</span>
                </div>
              </div>
              <ClipboardCheckIcon className="w-8 h-8 text-gray-400" />
            </div>
          </div>

          {/* User's Current Group Status */}
          {userGroup && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <UsersIcon className="w-5 h-5 text-blue-600" />
                  <span className="text-blue-900 font-medium">
                    Ya eres parte de un grupo ({userGroup.members.length} miembros)
                  </span>
                </div>
                <button
                  onClick={handleLeaveGroup}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  Salir del grupo
                </button>
              </div>
            </div>
          )}

          {/* Groups List */}
          <div className="space-y-4">
            {groups.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <UsersIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No hay grupos formados aún
                </h3>
                <p className="text-gray-500">
                  Sé el primero en crear un grupo para esta tarea.
                </p>
              </div>
            ) : (
              groups.map((group, index) => {
                const isFull = group.members.length >= assignment.max_group_size;
                const isMyGroup = group.members.some((m: any) => m.user_id === user?.id);
                const canJoin = !userGroup && !isFull && assignment.allow_self_grouping;

                return (
                  <div key={group.id} className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          Grupo {index + 1}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {group.members.length} de {assignment.max_group_size} miembros
                        </p>
                      </div>
                      {isMyGroup && (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Tu grupo
                        </span>
                      )}
                      {isFull && !isMyGroup && (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Completo
                        </span>
                      )}
                    </div>

                    {/* Group Members */}
                    <div className="space-y-2 mb-4">
                      {group.members.map((member: any) => (
                        <div key={member.id} className="flex items-center space-x-3">
                          {member.user?.avatar_url ? (
                            <img
                              src={member.user.avatar_url}
                              alt={member.user.name}
                              className="w-8 h-8 rounded-full"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                              <UsersIcon className="w-4 h-4 text-gray-600" />
                            </div>
                          )}
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">
                              {member.user?.name || 'Usuario'}
                              {member.role === 'leader' && (
                                <span className="ml-2 text-xs text-[#fdb933]">Líder</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500">{member.user?.email}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Join Button */}
                    {canJoin && (
                      <button
                        onClick={() => handleJoinGroup(group.id)}
                        className="w-full px-4 py-2 bg-[#00365b] text-white rounded-md hover:bg-[#fdb933] hover:text-[#00365b] transition"
                      >
                        Unirse a este grupo
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </MainLayout>
    </>
  );
}