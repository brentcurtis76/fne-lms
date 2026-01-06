import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import CourseBuilderForm from '../src/components/CourseBuilderForm';
import MainLayout from '../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../components/layout/FunctionalPageHeader';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { BookOpen, MapPin, Award, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { getUserPrimaryRole } from '../utils/roleUtils';

interface LearningPath {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  assigned_at: string;
  assignment_id: string;
  progress?: {
    path_id: string;
    total_courses: number;
    completed_courses: number;
    progress_percentage: number;
    last_accessed: string;
  };
}

interface CourseEnrollment {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  progress_percentage: number;
  lessons_completed: number;
  total_lessons: number;
  last_activity: string;
  assigned_at: string;
}

const MiAprendizajePage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [activeTab, setActiveTab] = useState<'rutas' | 'cursos'>('rutas');
  const [myCourses, setMyCourses] = useState<CourseEnrollment[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  
  // Restored state variables
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [assignedCourses, setAssignedCourses] = useState<any[]>([]);
  const [assignedCoursesProgress, setAssignedCoursesProgress] = useState<Map<string, number>>(new Map());
  const [learningPaths, setLearningPaths] = useState<LearningPath[]>([]);
  const [pathsLoading, setPathsLoading] = useState(true);

  // Handle tab change from URL
  useEffect(() => {
    if (router.query.tab === 'cursos') {
      setActiveTab('cursos');
    } else {
      setActiveTab('rutas');
    }
  }, [router.query.tab]);

  // Fetch my courses
  useEffect(() => {
    const fetchMyCourses = async () => {
      if (activeTab !== 'cursos') return;
      
      try {
        setCoursesLoading(true);
        setCoursesError(null);
        const response = await fetch('/api/my-courses');
        if (response.ok) {
          const data = await response.json();
          setMyCourses(data);
        } else {
          setCoursesError('No se pudieron cargar tus cursos. Por favor, intenta de nuevo más tarde.');
        }
      } catch (error) {
        console.error('Error fetching my courses:', error);
        setCoursesError('Ocurrió un error al cargar tus cursos.');
      } finally {
        setCoursesLoading(false);
      }
    };

    if (user) {
      fetchMyCourses();
    }
  }, [activeTab, user]);
  
  // Authentication logic
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }
        
        setUser(session.user);
        
        // Get user profile
        const { data: profileData } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', session.user.id)
          .single();
        
        if (profileData) {
          const role = await getUserPrimaryRole(session.user.id);
          setUserRole(role);
          setIsAdmin(role === 'admin');
          if (profileData.avatar_url) {
            setAvatarUrl(profileData.avatar_url);
          }
          
          // Fetch assigned courses for all users (including admins)
          const { data: assignments } = await supabase
            .from('course_assignments')
            .select(`
              course_id,
              courses (
                id,
                title,
                description,
                thumbnail_url,
                instructor_id,
                created_at
              )
            `)
            .eq('teacher_id', session.user.id);

          if (assignments) {
            const courses = assignments.map(a => a.courses).filter(Boolean);
            setAssignedCourses(courses);

            // Fetch progress for these courses from my-courses API
            try {
              const progressResponse = await fetch('/api/my-courses');
              if (progressResponse.ok) {
                const progressData = await progressResponse.json();
                const progressMap = new Map<string, number>();
                progressData.forEach((course: any) => {
                  progressMap.set(course.id, course.progress_percentage || 0);
                });
                setAssignedCoursesProgress(progressMap);
              }
            } catch (err) {
              console.error('Error fetching course progress:', err);
            }
          }
          
          // Fetch learning paths
          await fetchLearningPaths();
        }
      } catch (error) {
        console.error('Auth error:', error);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };
    
    checkAuth();
  }, [router]);
  
  const fetchLearningPaths = async () => {
    try {
      setPathsLoading(true);
      const response = await fetch('/api/learning-paths/my-paths');
      
      if (!response.ok) {
        throw new Error('Error al cargar las rutas de aprendizaje');
      }
      
      const data = await response.json();
      setLearningPaths(data);
    } catch (err: any) {
      console.error('Error fetching learning paths:', err);
      // Don't show error to user - learning paths are optional
    } finally {
      setPathsLoading(false);
    }
  };
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };
  
  // Function to refresh the course list after a new course is added
  const handleCourseAdded = () => {
    // Increment the refresh trigger to force the CourseList to refetch
    setRefreshTrigger(prev => prev + 1);
  };
  
  if (loading) {
    return (
      <MainLayout 
        user={user} 
        currentPage="mi-aprendizaje"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#0a0a0a] mx-auto"></div>
            <p className="mt-4 text-[#0a0a0a] font-medium">Cargando...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout 
      user={user} 
      currentPage="mi-aprendizaje"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<BookOpen />}
        title="Mi Aprendizaje"
        subtitle="Rutas de aprendizaje y cursos asignados"
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Buscar en rutas y cursos..."
      />
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-6xl mx-auto">
            
            {/* Tabs */}
            <div className="flex border-b border-gray-200 mb-8">
              <button
                className={`py-4 px-6 font-medium text-sm focus:outline-none ${
                  activeTab === 'rutas'
                    ? 'border-b-2 border-[#0a0a0a] text-[#0a0a0a]'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => {
                  setActiveTab('rutas');
                  router.push('/mi-aprendizaje?tab=rutas', undefined, { shallow: true });
                }}
              >
                Mis Rutas de Aprendizaje
              </button>
              <button
                className={`py-4 px-6 font-medium text-sm focus:outline-none ${
                  activeTab === 'cursos'
                    ? 'border-b-2 border-[#0a0a0a] text-[#0a0a0a]'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => {
                  setActiveTab('cursos');
                  router.push('/mi-aprendizaje?tab=cursos', undefined, { shallow: true });
                }}
              >
                Mis Cursos
              </button>
            </div>

            {/* Course Builder Form Section - Only for Admins */}
            {isAdmin && activeTab === 'rutas' && (
              <div className="mb-12 bg-white rounded-lg shadow-md">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-brand_blue">Agregar Nuevo Curso</h2>
                  <p className="text-gray-500 text-sm mt-1">
                    Completa el formulario para crear un nuevo curso
                  </p>
                </div>
                
                <div className="p-6">
                  <CourseBuilderForm 
                    onSuccess={handleCourseAdded} 
                  />
                </div>
              </div>
            )}
            
            {/* Learning Paths Content */}
            {activeTab === 'rutas' && (
              <>
                <div className="bg-white rounded-lg shadow-md mb-8">
                  <div className="p-6 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-brand_blue">
                      Mis Rutas de Aprendizaje
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">
                      Rutas de aprendizaje estructuradas asignadas a ti
                    </p>
                  </div>
                  
                  <div className="p-6">
                    {pathsLoading ? (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#0a0a0a] mx-auto"></div>
                        <p className="mt-2 text-gray-500">Cargando rutas de aprendizaje...</p>
                      </div>
                    ) : learningPaths.length === 0 ? (
                      <div className="text-center py-8">
                        <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">No tienes rutas de aprendizaje asignadas aún.</p>
                        <p className="text-sm text-gray-400 mt-2">
                          Las rutas de aprendizaje organizan múltiples cursos en secuencias estructuradas.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {learningPaths
                          .filter(path => 
                            !searchQuery || 
                            path.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (path.description && path.description.toLowerCase().includes(searchQuery.toLowerCase()))
                          )
                          .map((path) => (
                            <div
                              key={path.id}
                              className="border rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer"
                              onClick={() => router.push(`/mi-aprendizaje/ruta/${path.id}`)}
                            >
                              <h3 className="text-lg font-semibold text-navy-900 mb-2">{path.name}</h3>
                              <p className="text-gray-600 text-sm line-clamp-2 mb-4">
                                {path.description}
                              </p>
                              
                              {/* Progress Section */}
                              <div className="mb-4">
                                <div className="flex justify-between items-center mb-2">
                                  <span className="text-sm font-medium text-gray-700">Progreso</span>
                                  <span className="text-sm text-gray-500">
                                    {path.progress?.completed_courses || 0} de {path.progress?.total_courses || 0} cursos
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${path.progress?.progress_percentage || 0}%` }}
                                  />
                                </div>
                              </div>

                              {/* Stats */}
                              <div className="flex items-center justify-between text-sm text-gray-600">
                                <div className="flex items-center gap-1">
                                  <BookOpen className="w-4 h-4" />
                                  <span>{path.progress?.total_courses || 0} cursos</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  <span>
                                    {formatDistanceToNow(new Date(path.assigned_at), {
                                      addSuffix: true,
                                      locale: es,
                                    })}
                                  </span>
                                </div>
                              </div>

                              {/* Achievement indicator */}
                              {path.progress?.progress_percentage === 100 && (
                                <div className="flex items-center gap-2 text-green-600 text-sm font-medium mt-3">
                                  <Award className="w-4 h-4" />
                                  <span>¡Completado!</span>
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Individual Courses Section - For Everyone */}
                <div className="bg-white rounded-lg shadow-md mb-8">
                  <div className="p-6 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-brand_blue">
                      Cursos Individuales Asignados
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">
                      Cursos asignados individualmente (fuera de rutas de aprendizaje)
                    </p>
                  </div>
                  
                  <div className="p-6">
                    <div className="space-y-4">
                      {assignedCourses.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-gray-500">No tienes cursos asignados aún.</p>
                          <p className="text-sm text-gray-400 mt-2">
                            Los administradores pueden asignarte cursos para que puedas acceder a ellos.
                          </p>
                        </div>
                      ) : (
                        assignedCourses
                          .filter(course =>
                            !searchQuery ||
                            course.title.toLowerCase().includes(searchQuery.toLowerCase())
                          )
                          .map(course => {
                            const progress = assignedCoursesProgress.get(course.id) || 0;
                            const isCompleted = progress === 100;
                            return (
                              <div key={course.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <h3 className="text-lg font-semibold text-gray-900">{course.title}</h3>
                                      {isCompleted ? (
                                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium flex items-center gap-1">
                                          <Award className="w-3 h-3" />
                                          Completado
                                        </span>
                                      ) : (
                                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                                          Asignado
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-gray-600 mt-1">{course.description}</p>
                                    <p className="text-sm text-gray-500 mt-2">
                                      Creado: {new Date(course.created_at).toLocaleDateString('es-ES')}
                                    </p>
                                  </div>
                                  <div className="ml-4 flex gap-2">
                                    <a
                                      href={`/student/course/${course.id}`}
                                      className={`inline-flex items-center px-4 py-2 rounded-md transition ${
                                        isCompleted
                                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                          : 'bg-green-600 text-white hover:bg-green-700'
                                      }`}
                                    >
                                      {isCompleted ? 'Repasar Curso' : (progress > 0 ? 'Continuar Curso' : 'Comenzar Curso')}
                                    </a>
                                    {isAdmin && (
                                      <a
                                        href={`/admin/course-builder/${course.id}`}
                                        className="inline-flex items-center px-4 py-2 bg-brand_blue text-white rounded-md hover:bg-blue-700 transition"
                                      >
                                        Gestionar
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>
                </div>

              </>
            )}

            {/* Mis Cursos Content */}
            {activeTab === 'cursos' && (
              <div className="bg-white rounded-lg shadow-md mb-8">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-brand_blue">
                    Mis Cursos
                  </h2>
                  <p className="text-gray-500 text-sm mt-1">
                    Cursos en los que estás inscrito y tu progreso
                  </p>
                </div>
                
                <div className="p-6">
                  {coursesLoading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#0a0a0a] mx-auto"></div>
                      <p className="mt-2 text-gray-500">Cargando tus cursos...</p>
                    </div>
                  ) : coursesError ? (
                    <div className="text-center py-8 text-red-600 bg-red-50 rounded-lg">
                      <p>{coursesError}</p>
                      <button 
                        onClick={() => window.location.reload()} 
                        className="mt-2 text-sm underline hover:text-red-800"
                      >
                        Recargar página
                      </button>
                    </div>
                  ) : myCourses.length === 0 ? (
                    <div className="text-center py-8">
                      <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No tienes cursos asignados.</p>
                      <p className="text-sm text-gray-400 mt-2">
                        Cuando te inscribas en cursos, aparecerán aquí.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {myCourses
                        .filter(course => 
                          !searchQuery || 
                          course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (course.description && course.description.toLowerCase().includes(searchQuery.toLowerCase()))
                        )
                        .map((course) => (
                          <div
                            key={course.id}
                            className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow flex flex-col"
                          >
                            {/* Thumbnail */}
                            <div className="h-40 bg-gray-200 relative">
                              {course.thumbnail_url ? (
                                <img 
                                  src={course.thumbnail_url} 
                                  alt={course.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
                                  <BookOpen className="w-12 h-12" />
                                </div>
                              )}
                              {course.progress_percentage === 100 && (
                                <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                                  <Award className="w-3 h-3" />
                                  COMPLETADO
                                </div>
                              )}
                            </div>
                            
                            <div className="p-5 flex-1 flex flex-col">
                              <h3 className="text-lg font-semibold text-navy-900 mb-2 line-clamp-2" title={course.title}>
                                {course.title}
                              </h3>
                              
                              {course.description && (
                                <p className="text-gray-600 text-sm line-clamp-2 mb-4 flex-1">
                                  {course.description}
                                </p>
                              )}
                              
                              <div className="mt-auto">
                                {/* Progress Bar */}
                                <div className="mb-4">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-medium text-gray-700">
                                      {course.progress_percentage}% completado
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {course.lessons_completed} de {course.total_lessons} lecciones
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                      className={`h-2 rounded-full transition-all duration-300 ${
                                        course.progress_percentage === 100 ? 'bg-green-500' : 'bg-blue-600'
                                      }`}
                                      style={{ width: `${course.progress_percentage}%` }}
                                    />
                                  </div>
                                </div>
                                
                                {/* Last Activity */}
                                <div className="flex items-center gap-1 text-xs text-gray-500 mb-4">
                                  <Clock className="w-3 h-3" />
                                  <span>
                                    {course.last_activity ? (
                                      `Última actividad: ${formatDistanceToNow(new Date(course.last_activity), {
                                        addSuffix: true,
                                        locale: es,
                                      })}`
                                    ) : (
                                      'Sin actividad reciente'
                                    )}
                                  </span>
                                </div>
                                
                                <a
                                  href={`/student/course/${course.id}`}
                                  className={`block w-full text-center py-2 rounded-md transition-colors font-medium ${
                                    course.progress_percentage === 100
                                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                      : 'bg-[#0a0a0a] text-white hover:bg-[#004a7a]'
                                  }`}
                                >
                                  {course.progress_percentage === 100 ? 'Repasar Curso' : (course.progress_percentage > 0 ? 'Continuar' : 'Comenzar')}
                                </a>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
      </div>
    </MainLayout>
  );
};

export default MiAprendizajePage;
