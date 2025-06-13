import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import Head from 'next/head';
import { toast } from 'react-hot-toast';
import MainLayout from '../components/layout/MainLayout';
import { ClipboardCheckIcon as ClipboardDocumentCheckIcon } from '@heroicons/react/outline';
import { useAvatar } from '../hooks/useAvatar';
import { assignmentService } from '../lib/services/assignments';
import { getStudentAssignmentInstances } from '../lib/services/assignmentInstances';

export default function AssignmentsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [profileName, setProfileName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Data states
  const [assignments, setAssignments] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, any>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [workStats, setWorkStats] = useState<any>(null);
  
  // View states
  const [activeTab] = useState<'list'>('list');
  
  // Use avatar hook for performance
  const { url: avatarUrl } = useAvatar(user);
  
  // Permission helpers
  const isTeacher = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion'].includes(userRole);
  const isStudent = ['lider_comunidad', 'docente'].includes(userRole);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }
        
        setUser(session.user);
        
        // Get user profile and role
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role, avatar_url, name')
          .eq('id', session.user.id)
          .single();

        console.log('Profile query result:', { profile, error });

        if (error) {
          console.error('Profile error:', error);
          toast.error('Error al cargar el perfil: ' + error.message);
        }
        
        if (profile) {
          setUserRole(profile.role);
          setProfileName(profile.name || session.user.email?.split('@')[0] || 'Usuario');
          setIsAdmin(profile.role === 'admin');
        } else {
          // Use defaults if no profile
          setUserRole('docente');
          setProfileName(session.user.email?.split('@')[0] || 'Usuario');
        }
        
        // Load assignments
        await loadAssignments(session.user.id, profile?.role || 'docente');
        
        setLoading(false);
      } catch (error) {
        console.error('Session check error:', error);
        toast.error('Error al verificar la sesión');
        router.push('/login');
      }
    };

    checkSession();
  }, [router]);

  const loadAssignments = async (userId: string, role: string) => {
    try {
      const isTeacherRole = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion'].includes(role);
      
      if (isTeacherRole) {
        // Teachers see assignments they created
        const data = await assignmentService.getAll({ created_by: userId });
        setAssignments(data || []);
        
        // Calculate teacher work stats
        const activeAssignments = data?.filter((a: any) => a.is_published) || [];
        const draftAssignments = data?.filter((a: any) => !a.is_published) || [];
        
        setWorkStats({
          total: data?.length || 0,
          active: activeAssignments.length,
          draft: draftAssignments.length,
          published: activeAssignments.length
        });
        
      } else {
        // Students see assignments from enrolled courses AND group assignment instances
        const [regularAssignments, groupInstances] = await Promise.all([
          assignmentService.getStudentAssignments(userId),
          getStudentAssignmentInstances(userId)
        ]);
        
        // Transform group instances to match assignment format
        const transformedGroupInstances = groupInstances?.data?.map((instance: any) => ({
          id: `instance-${instance.id}`,
          title: instance.title,
          description: instance.description || instance.assignment_templates?.description,
          instructions: instance.instructions || instance.assignment_templates?.instructions,
          due_date: instance.due_date,
          assignment_type: 'group',
          is_published: true,
          is_instance: true,
          instance_id: instance.id,
          courses: {
            id: instance.assignment_templates?.lessons?.modules?.courses?.id,
            title: instance.assignment_templates?.lessons?.modules?.courses?.title
          },
          lessons: {
            id: instance.assignment_templates?.lessons?.id,
            title: instance.assignment_templates?.lessons?.title
          },
          submissions: instance.submission ? [{
            id: instance.submission.id,
            status: instance.submission.status,
            submitted_at: instance.submission.submitted_at,
            score: instance.submission.grade
          }] : []
        })) || [];
        
        // Combine both types of assignments
        const allAssignments = [...(regularAssignments || []), ...transformedGroupInstances];
        setAssignments(allAssignments);
        
        // Build submission map
        const submissionMap: Record<string, any> = {};
        allAssignments.forEach((assignment: any) => {
          if (assignment.submissions && assignment.submissions.length > 0) {
            submissionMap[assignment.id] = assignment.submissions[0];
          }
        });
        setSubmissions(submissionMap);
        
        // Calculate student work stats
        const completedCount = allAssignments.filter((a: any) => 
          a.submissions?.[0]?.status === 'graded'
        ).length;
        
        const inProgressCount = allAssignments.filter((a: any) => 
          a.submissions?.[0]?.status === 'submitted'
        ).length;
        
        const newCount = allAssignments.filter((a: any) => 
          !a.submissions || a.submissions.length === 0
        ).length;
        
        setWorkStats({
          total: allAssignments.length,
          completed: completedCount,
          inProgress: inProgressCount,
          new: newCount,
          active: allAssignments.length - completedCount
        });
      }
    } catch (error: any) {
      console.error('Error loading assignments:', error);
      if (error.message?.includes('enrolled')) {
        toast.error('No estás inscrito en ningún curso');
      } else {
        toast.error('Error al cargar las tareas');
      }
    }
  };



  const handleDeleteAssignment = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta tarea?')) return;
    
    try {
      const { error } = await supabase
        .from('lesson_assignments')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Tarea eliminada exitosamente');
      await loadAssignments(user.id, userRole);
    } catch (error) {
      console.error('Error deleting assignment:', error);
      toast.error('Error al eliminar la tarea');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const filteredAssignments = assignments.filter(assignment => {
    const matchesSearch = !searchQuery || 
      assignment.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      assignment.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = filterType === 'all' || 
      (filterType === 'published' && assignment.is_published) ||
      (filterType === 'draft' && !assignment.is_published) ||
      (filterType === 'pending' && submissions[assignment.id]?.status === 'submitted') ||
      (filterType === 'completed' && submissions[assignment.id]?.status === 'graded');
    
    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue"></div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Mis Tareas - FNE LMS</title>
      </Head>

      <MainLayout 
        user={user}
        currentPage="assignments"
        pageTitle="Mis Tareas"
        isAdmin={isAdmin}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="p-6">
          {/* Search and Action Bar */}
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex-1 max-w-lg">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar tareas..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue"
                />
              </div>
            </div>
          </div>

          {/* Work Status Stats */}
          {workStats && activeTab === 'list' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {isTeacher ? (
                <>
                  <div className="bg-white rounded-lg shadow-md p-4">
                    <p className="text-sm text-gray-600">Total de tareas</p>
                    <p className="text-2xl font-bold text-gray-800">{workStats.total}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-4">
                    <p className="text-sm text-gray-600">Tareas activas</p>
                    <p className="text-2xl font-bold text-blue-600">{workStats.active}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-4">
                    <p className="text-sm text-gray-600">Borradores</p>
                    <p className="text-2xl font-bold text-gray-500">{workStats.draft}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-4">
                    <p className="text-sm text-gray-600">Publicadas</p>
                    <p className="text-2xl font-bold text-green-600">{workStats.published}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-white rounded-lg shadow-md p-4">
                    <p className="text-sm text-gray-600">Asignaciones activas</p>
                    <p className="text-2xl font-bold text-blue-600">{workStats.active}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-4">
                    <p className="text-sm text-gray-600">Completadas</p>
                    <p className="text-2xl font-bold text-green-600">{workStats.completed}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-4">
                    <p className="text-sm text-gray-600">En progreso</p>
                    <p className="text-2xl font-bold text-orange-500">{workStats.inProgress}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-4">
                    <p className="text-sm text-gray-600">Nuevas</p>
                    <p className="text-2xl font-bold text-purple-600">{workStats.new}</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Filter buttons */}
          {activeTab === 'list' && (
            <div className="flex flex-wrap gap-2 mb-6">
              <button
                onClick={() => setFilterType('all')}
                className={`px-4 py-2 rounded-md transition ${
                  filterType === 'all' 
                    ? 'bg-brand_blue text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Todas
              </button>
              {isTeacher ? (
                <>
                  <button
                    onClick={() => setFilterType('published')}
                    className={`px-4 py-2 rounded-md transition ${
                      filterType === 'published' 
                        ? 'bg-brand_blue text-white' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Publicadas
                  </button>
                  <button
                    onClick={() => setFilterType('draft')}
                    className={`px-4 py-2 rounded-md transition ${
                      filterType === 'draft' 
                        ? 'bg-brand_blue text-white' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Borradores
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setFilterType('pending')}
                    className={`px-4 py-2 rounded-md transition ${
                      filterType === 'pending' 
                        ? 'bg-brand_blue text-white' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Pendientes
                  </button>
                  <button
                    onClick={() => setFilterType('completed')}
                    className={`px-4 py-2 rounded-md transition ${
                      filterType === 'completed' 
                        ? 'bg-brand_blue text-white' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Completadas
                  </button>
                </>
              )}
            </div>
          )}

          {/* Main Content */}
          {activeTab === 'list' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAssignments.length === 0 ? (
                <div className="col-span-full bg-white rounded-lg shadow-md p-8 text-center">
                  <ClipboardDocumentCheckIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">
                    {searchQuery 
                      ? 'No se encontraron tareas que coincidan con tu búsqueda'
                      : isTeacher 
                        ? 'No hay tareas creadas en las lecciones aún' 
                        : 'No tienes tareas asignadas en tus cursos activos'
                    }
                  </p>
                  {!isTeacher && !searchQuery && (
                    <p className="text-sm text-gray-400 mt-2">
                      Las tareas aparecerán aquí cuando tus profesores las publiquen en los cursos donde estás inscrito
                    </p>
                  )}
                </div>
              ) : (
                filteredAssignments.map(assignment => {
                  const isOverdue = assignment.due_date && new Date(assignment.due_date) < new Date();
                  const submission = submissions[assignment.id];
                  const isSubmitted = submission?.status === 'submitted' || submission?.status === 'graded';
                  
                  return (
                    <div 
                      key={assignment.id} 
                      className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition cursor-pointer relative overflow-hidden"
                      onClick={() => {
                        if (assignment.is_instance) {
                          router.push(`/assignments/instance/${assignment.instance_id}`);
                        } else {
                          router.push(`/assignments/${assignment.id}`);
                        }
                      }}
                    >
                      {/* Course and Lesson Info */}
                      <div className="mb-3">
                        <p className="text-xs text-gray-500">
                          {assignment.courses?.title || 'Sin curso'} 
                          {assignment.lessons?.title && ` • ${assignment.lessons.title}`}
                        </p>
                      </div>
                      
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{assignment.title}</h3>
                          {assignment.assignment_type === 'group' && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-800">
                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                Tarea Grupal
                              </span>
                              {assignment.student_group && (
                                <span className="text-xs text-gray-600">
                                  {assignment.student_group.group_name}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {isTeacher ? (
                          assignment.is_published ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Publicado
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              Borrador
                            </span>
                          )
                        ) : (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            submission?.status === 'graded' ? 'bg-green-100 text-green-800' :
                            submission?.status === 'submitted' ? 'bg-blue-100 text-blue-800' :
                            isOverdue && !isSubmitted ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {submission?.status === 'graded' ? 'Calificado' :
                             submission?.status === 'submitted' ? 'Enviado' :
                             isOverdue && !isSubmitted ? 'Vencido' :
                             'Pendiente'}
                          </span>
                        )}
                      </div>
                      
                      <p className="text-gray-600 mb-4 line-clamp-2">{assignment.description}</p>
                      
                      {/* Group Members Display for Students */}
                      {assignment.assignment_type === 'group' && assignment.student_group && isStudent && (
                        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs font-medium text-gray-700 mb-2">Tu grupo:</p>
                          <div className="flex flex-wrap gap-2">
                            {assignment.group_members?.map((member: any) => (
                              <span key={member.user_id} className="text-xs px-2 py-1 bg-white rounded border border-gray-200">
                                {member.full_name}
                              </span>
                            ))}
                          </div>
                          {assignment.has_group_submission && (
                            <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              Trabajo grupal entregado
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Show message if student is not in a group */}
                      {assignment.assignment_type === 'group' && !assignment.student_group && isStudent && (
                        <div className="mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                          <p className="text-xs text-yellow-800">
                            ⚠️ No estás asignado a ningún grupo para esta tarea. Contacta a tu profesor.
                          </p>
                        </div>
                      )}
                      
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-500">{assignment.points || 0} puntos</span>
                          {assignment.due_date && (
                            <span className={`${isOverdue && !isSubmitted ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                              {isOverdue ? 'Venció: ' : 'Vence: '}
                              {new Date(assignment.due_date).toLocaleDateString('es-ES', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric'
                              })}
                            </span>
                          )}
                        </div>
                        
                        {isStudent && submission && (
                          <div className="pt-2 border-t">
                            <div className="flex justify-between items-center">
                              <span className={`text-sm ${
                                submission.status === 'graded' ? 'text-green-600' : 
                                submission.status === 'submitted' ? 'text-blue-600' : 
                                'text-gray-500'
                              }`}>
                                {submission.submitted_at && 
                                  `Enviado: ${new Date(submission.submitted_at).toLocaleDateString('es-ES')}`
                                }
                              </span>
                              {submission.score !== null && (
                                <span className="text-sm font-medium">
                                  Nota: {submission.score}/{assignment.points}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Visual indicator for overdue assignments */}
                      {isOverdue && !isSubmitted && isStudent && (
                        <div className="absolute top-0 right-0 w-2 h-full bg-red-500"></div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>
      </MainLayout>
    </>
  );
}