import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import Head from 'next/head';
import { toast } from 'react-hot-toast';
import MainLayout from '../components/layout/MainLayout';
import { ClipboardDocumentCheckIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useAvatar } from '../hooks/useAvatar';
import { assignmentService } from '../lib/services/assignments';

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
  const [courses, setCourses] = useState<any[]>([]);
  
  // View states
  const [activeTab, setActiveTab] = useState<'list' | 'new' | 'edit'>('list');
  const [editingAssignment, setEditingAssignment] = useState<any | null>(null);
  
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
        
        // Load courses for assignment creation
        const { data: coursesData } = await supabase
          .from('courses')
          .select('id, title')
          .order('title');
        setCourses(coursesData || []);
      } else {
        // Students see assignments from enrolled courses
        const data = await assignmentService.getStudentAssignments(userId);
        setAssignments(data || []);
        
        // Submissions are already included in the response
        if (data && data.length > 0) {
          const submissionMap: Record<string, any> = {};
          data.forEach((assignment: any) => {
            if (assignment.submissions && assignment.submissions.length > 0) {
              submissionMap[assignment.id] = assignment.submissions[0];
            }
          });
          setSubmissions(submissionMap);
          
          // Calculate student work stats
          const completedCount = data.filter((a: any) => 
            a.submissions?.[0]?.status === 'graded'
          ).length;
          
          const inProgressCount = data.filter((a: any) => 
            a.submissions?.[0]?.status === 'submitted'
          ).length;
          
          const newCount = data.filter((a: any) => 
            !a.submissions || a.submissions.length === 0
          ).length;
          
          setWorkStats({
            total: data.length,
            completed: completedCount,
            inProgress: inProgressCount,
            new: newCount,
            active: data.length - completedCount
          });
        }
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

  const handleCreateAssignment = async (data: any) => {
    try {
      await assignmentService.create({
        ...data,
        created_by: user.id
      });
      
      toast.success('Tarea creada exitosamente');
      await loadAssignments(user.id, userRole);
      setActiveTab('list');
    } catch (error) {
      console.error('Error creating assignment:', error);
      toast.error('Error al crear la tarea');
    }
  };

  const handleUpdateAssignment = async (data: any) => {
    if (!editingAssignment) return;
    
    try {
      const { error } = await supabase
        .from('lesson_assignments')
        .update(data)
        .eq('id', editingAssignment.id);
      
      if (error) throw error;
      toast.success('Tarea actualizada exitosamente');
      await loadAssignments(user.id, userRole);
      setActiveTab('list');
      setEditingAssignment(null);
    } catch (error) {
      console.error('Error updating assignment:', error);
      toast.error('Error al actualizar la tarea');
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
              {isTeacher && (
                <button
                  onClick={() => setActiveTab('new')}
                  className="flex items-center px-4 py-2 bg-brand_blue text-white rounded-md hover:bg-blue-700 transition"
                >
                  <PlusIcon className="w-5 h-5 mr-2" />
                  Nueva Tarea
                </button>
              )}
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
                        ? 'No has creado ninguna tarea aún' 
                        : 'No tienes tareas asignadas en tus cursos activos'
                    }
                  </p>
                  {!isTeacher && !searchQuery && (
                    <p className="text-sm text-gray-400 mt-2">
                      Las tareas aparecerán aquí cuando tus profesores las publiquen en los cursos donde estás inscrito
                    </p>
                  )}
                  {isTeacher && !searchQuery && (
                    <button
                      onClick={() => setActiveTab('new')}
                      className="mt-4 px-4 py-2 bg-brand_blue text-white rounded-md hover:bg-brand_yellow hover:text-brand_blue transition"
                    >
                      Crear primera tarea
                    </button>
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
                      onClick={() => router.push(`/assignments/${assignment.id}`)}
                    >
                      {/* Course and Lesson Info */}
                      <div className="mb-3">
                        <p className="text-xs text-gray-500">
                          {assignment.courses?.title || 'Sin curso'} 
                          {assignment.lessons?.title && ` • ${assignment.lessons.title}`}
                        </p>
                      </div>
                      
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">{assignment.title}</h3>
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

          {activeTab === 'new' && isTeacher && (
            <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Crear Nueva Tarea</h2>
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                handleCreateAssignment({
                  title: formData.get('title') as string,
                  description: formData.get('description') as string,
                  course_id: formData.get('course_id') as string,
                  points: parseInt(formData.get('points') as string) || 0,
                  due_date: formData.get('due_date') as string,
                  assignment_type: formData.get('assignment_type') as string,
                  is_published: formData.get('is_published') === 'on'
                });
              }}>
                <div className="mb-4">
                  <label className="block text-gray-700 mb-2">Curso *</label>
                  <select
                    name="course_id"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue"
                  >
                    <option value="">Seleccionar curso</option>
                    {courses.map(course => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="mb-4">
                  <label className="block text-gray-700 mb-2">Título *</label>
                  <input
                    name="title"
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue"
                  />
                </div>
                
                <div className="mb-4">
                  <label className="block text-gray-700 mb-2">Descripción</label>
                  <textarea
                    name="description"
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-gray-700 mb-2">Tipo de tarea</label>
                    <select
                      name="assignment_type"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue"
                    >
                      <option value="task">Tarea</option>
                      <option value="quiz">Cuestionario</option>
                      <option value="project">Proyecto</option>
                      <option value="essay">Ensayo</option>
                      <option value="presentation">Presentación</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-700 mb-2">Puntos</label>
                    <input
                      name="points"
                      type="number"
                      defaultValue={100}
                      min={0}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue"
                    />
                  </div>
                </div>
                
                <div className="mb-4">
                  <label className="block text-gray-700 mb-2">Fecha límite</label>
                  <input
                    name="due_date"
                    type="datetime-local"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue"
                  />
                </div>
                
                <div className="mb-6">
                  <label className="flex items-center">
                    <input
                      name="is_published"
                      type="checkbox"
                      className="mr-2 rounded"
                    />
                    <span className="text-gray-700">Publicar inmediatamente</span>
                  </label>
                </div>
                
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('list')}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-brand_blue text-white rounded-md hover:bg-blue-700 transition"
                  >
                    Crear Tarea
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </MainLayout>
    </>
  );
}