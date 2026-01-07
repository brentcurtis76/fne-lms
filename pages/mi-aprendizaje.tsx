import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import CourseBuilderForm from '../src/components/CourseBuilderForm';
import MainLayout from '../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../components/layout/FunctionalPageHeader';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { BookOpen, MapPin, Award, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { getUserPrimaryRole } from '../utils/roleUtils';
import { NetflixCourseRow } from '../components/courses';
import { CourseWithEnrollment } from '../types/courses';
import { LearningPathCard } from '../components/learning-paths';

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
  estimated_duration_hours: number | null;
  difficulty_level: string | null;
  learning_objectives: string[] | null;
  instructor: {
    id: string;
    full_name: string;
    photo_url?: string | null;
  } | null;
  progress_percentage: number;
  lessons_completed: number;
  total_lessons: number;
  last_activity: string;
  assigned_at: string;
}

// Netflix-style courses view component
interface NetflixCoursesViewProps {
  courses: CourseEnrollment[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  onCourseSelect: (courseId: string) => void;
}

const NetflixCoursesView: React.FC<NetflixCoursesViewProps> = ({
  courses,
  loading,
  error,
  searchQuery,
  onCourseSelect,
}) => {
  // Filter courses by search query
  const filteredCourses = useMemo(() => {
    if (!searchQuery) return courses;
    const query = searchQuery.toLowerCase();
    return courses.filter(
      (course) =>
        course.title.toLowerCase().includes(query) ||
        (course.description && course.description.toLowerCase().includes(query))
    );
  }, [courses, searchQuery]);

  // Transform courses to the format expected by NetflixCourseRow
  const transformCourses = (coursesToTransform: CourseEnrollment[]): CourseWithEnrollment[] => {
    return coursesToTransform.map((course) => ({
      id: course.id,
      title: course.title,
      description: course.description,
      thumbnail_url: course.thumbnail_url,
      estimated_duration_hours: course.estimated_duration_hours,
      difficulty_level: course.difficulty_level as 'beginner' | 'intermediate' | 'advanced' | null,
      learning_objectives: course.learning_objectives,
      instructor: course.instructor ? {
        id: course.instructor.id,
        full_name: course.instructor.full_name,
        photo_url: course.instructor.photo_url,
      } : undefined,
      enrollment: {
        progress_percentage: course.progress_percentage,
        lessons_completed: course.lessons_completed,
        total_lessons: course.total_lessons,
        is_completed: course.progress_percentage === 100,
        last_activity: course.last_activity,
      },
    }));
  };

  // Categorize courses
  const inProgressCourses = useMemo(() => {
    return filteredCourses.filter(
      (course) => course.progress_percentage > 0 && course.progress_percentage < 100
    );
  }, [filteredCourses]);

  const completedCourses = useMemo(() => {
    return filteredCourses.filter((course) => course.progress_percentage === 100);
  }, [filteredCourses]);

  const notStartedCourses = useMemo(() => {
    return filteredCourses.filter((course) => course.progress_percentage === 0);
  }, [filteredCourses]);

  if (loading) {
    return (
      <div className="min-h-[400px] py-12">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-brand_accent"></div>
          <p className="mt-4 text-gray-500">Cargando tus cursos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[400px] py-12">
        <div className="mx-auto max-w-md rounded-lg bg-red-50 border border-red-200 p-6 text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
          >
            Recargar página
          </button>
        </div>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="min-h-[400px] py-12">
        <div className="text-center">
          <BookOpen className="mx-auto h-16 w-16 text-gray-400" />
          <p className="mt-4 text-lg text-gray-600">No tienes cursos asignados.</p>
          <p className="mt-2 text-sm text-gray-500">
            Cuando te inscribas en cursos, aparecerán aquí.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[400px] py-4">
      {/* Continue Learning Row */}
      {inProgressCourses.length > 0 && (
        <NetflixCourseRow
          title="Continuar Aprendiendo"
          courses={transformCourses(inProgressCourses)}
          onCourseSelect={onCourseSelect}
          emptyMessage="No hay cursos en progreso"
        />
      )}

      {/* Not Started Row */}
      {notStartedCourses.length > 0 && (
        <NetflixCourseRow
          title="Comenzar"
          courses={transformCourses(notStartedCourses)}
          onCourseSelect={onCourseSelect}
          emptyMessage="No hay cursos pendientes"
        />
      )}

      {/* All Courses Row (if there are courses but none in the above categories) */}
      {inProgressCourses.length === 0 && notStartedCourses.length === 0 && completedCourses.length === 0 && (
        <NetflixCourseRow
          title="Todos Mis Cursos"
          courses={transformCourses(filteredCourses)}
          onCourseSelect={onCourseSelect}
          emptyMessage="No hay cursos que coincidan con tu búsqueda"
        />
      )}

      {/* Completed Courses Row */}
      {completedCourses.length > 0 && (
        <NetflixCourseRow
          title="Completados"
          courses={transformCourses(completedCourses)}
          onCourseSelect={onCourseSelect}
          emptyMessage="No has completado ningún curso aún"
        />
      )}
    </div>
  );
};

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
                created_at,
                difficulty_level,
                estimated_duration_hours,
                instructors (
                  id,
                  full_name,
                  photo_url
                )
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
                            <LearningPathCard
                              key={path.id}
                              id={path.id}
                              name={path.name}
                              description={path.description}
                              assigned_at={path.assigned_at}
                              progress={path.progress}
                              onClick={() => router.push(`/mi-aprendizaje/ruta/${path.id}`)}
                            />
                          ))}
                      </div>
                    )}
                  </div>
                </div>
                
              </>
            )}

            {/* Mis Cursos Content - Netflix Style */}
            {activeTab === 'cursos' && (
              <NetflixCoursesView
                courses={myCourses}
                loading={coursesLoading}
                error={coursesError}
                searchQuery={searchQuery}
                onCourseSelect={(courseId) => router.push(`/student/course/${courseId}`)}
              />
            )}
          </div>
      </div>
    </MainLayout>
  );
};

export default MiAprendizajePage;
