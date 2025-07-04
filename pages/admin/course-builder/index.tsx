import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import DeleteCourseModal from '../../../components/DeleteCourseModal';
import AssignTeachersModal from '../../../components/AssignTeachersModal';
import CourseBuilderForm from '../../../src/components/CourseBuilderForm';
import { ResponsiveFunctionalPageHeader } from '../../../components/layout/FunctionalPageHeader';
import { BookOpen, Plus } from 'lucide-react';

interface CourseFromDB {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string | null;
  instructor_id: string;
  created_at: string;
  instructor_name?: string;
}

interface FormattedCourse extends CourseFromDB {
  instructor_name: string;
  thumbnail_url: string | null;
}

const CourseBuilder: React.FC = () => {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [courses, setCourses] = useState<FormattedCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  // State for delete confirmation modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedCourseForDeletion, setSelectedCourseForDeletion] = useState<FormattedCourse | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // State for assignment modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedCourseForAssignment, setSelectedCourseForAssignment] = useState<FormattedCourse | null>(null);

  const fetchUserRole = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }

      setUser(session.user);

      // Get user profile to check role and avatar
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role, approval_status, avatar_url')
        .eq('id', session.user.id)
        .single();

      console.log('Course builder auth check:', {
        userId: session.user.id,
        userEmail: session.user.email,
        profileData,
        adminInMetadata: session.user.user_metadata?.role,
      });

      const adminInMetadata = session.user.user_metadata?.role === 'admin';
      const adminInProfile = profileData?.role === 'admin';
      
      // Set avatar URL if available
      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }
      
      if (adminInMetadata || adminInProfile) {
        console.log('Setting user role to admin');
        setUserRole('admin');
      } else {
        console.log('Setting user role to docente');
        setUserRole('docente');
      }
    } catch (error) {
      console.error('Error checking admin access:', error);
      setUserRole(null);
    }
  }, [router]);

  // Get initial session
  useEffect(() => {
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
      } else {
        setUser(null);
        setLoading(false);
      }
    };
    
    getInitialSession();
  }, []);

  const fetchCourses = useCallback(async () => {
    if (!user) {
      console.log('No user, skipping course fetch');
      return;
    }
    
    console.log('Fetching courses for user:', user.id);
    setLoading(true);
    
    try {
      // Simple fetch without joins to avoid database errors
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching courses:', error);
        toast.error('Error al cargar los cursos: ' + error.message);
        setCourses([]);
        return;
      }

      console.log('Courses fetched successfully:', data?.length || 0);
      
      // Now fetch instructors for each course
      const coursesWithInstructors = await Promise.all((data || []).map(async (course) => {
        let instructorName = 'Sin instructor';
        
        // First, try to get instructor from instructors table using course.instructor_id
        if (course.instructor_id) {
          const { data: instructor } = await supabase
            .from('instructors')
            .select('full_name')
            .eq('id', course.instructor_id)
            .single();
          
          if (instructor && instructor.full_name) {
            instructorName = instructor.full_name;
          }
        }
        
        // If no instructor found from instructor_id, look for consultants in course_assignments
        if (instructorName === 'Sin instructor') {
          // Get all teachers assigned to this course
          const { data: assignments } = await supabase
            .from('course_assignments')
            .select('teacher_id')
            .eq('course_id', course.id);

          if (assignments && assignments.length > 0) {
            // Get profiles of assigned teachers and find consultants
            const teacherIds = assignments.map(a => a.teacher_id);
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, first_name, last_name, role')
              .in('id', teacherIds)
              .eq('role', 'consultor')
              .limit(1);
            
            if (profiles && profiles.length > 0) {
              const profile = profiles[0];
              instructorName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Sin nombre';
            }
          }
        }
        

        return {
          ...course,
          instructor_name: instructorName,
          thumbnail_url: (course.thumbnail_url && course.thumbnail_url !== 'default-thumbnail.png') ? course.thumbnail_url : null 
        };
      }));
      
      setCourses(coursesWithInstructors);
    } catch (error) {
      console.error('Unexpected error fetching courses:', error);
      toast.error('Error inesperado al cargar cursos');
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    const checkAdminAndFetchData = async () => {
      if (!user) {
        return;
      }
      
      setLoading(true);
      await fetchUserRole();
      
      // Only fetch courses if user role check succeeds
      if (userRole === 'admin') {
        await fetchCourses();
      } else {
        setLoading(false);
      }
    };
    
    checkAdminAndFetchData();
  }, [user?.id]); // Simplified dependencies

  // Separate effect for when userRole changes
  useEffect(() => {
    if (user && userRole === 'admin') {
      fetchCourses();
    } else if (userRole !== null && userRole !== 'admin') {
      setLoading(false);
    }
  }, [userRole]);

  // Handler to open the delete confirmation modal
  const handleOpenDeleteModal = (course: FormattedCourse) => {
    setSelectedCourseForDeletion(course);
    setIsDeleteModalOpen(true);
  };

  // Handler to close the delete confirmation modal
  const handleCloseDeleteModal = () => {
    setSelectedCourseForDeletion(null);
    setIsDeleteModalOpen(false);
  };

  // Assignment modal handlers
  const handleOpenAssignModal = (course: FormattedCourse) => {
    setSelectedCourseForAssignment(course);
    setIsAssignModalOpen(true);
  };

  const handleCloseAssignModal = () => {
    setSelectedCourseForAssignment(null);
    setIsAssignModalOpen(false);
  };

  // Handler for actual deletion - SIMPLIFIED VERSION
  const handleConfirmDelete = async () => {
    if (!selectedCourseForDeletion) {
      toast.error('No se ha seleccionado ningún curso para eliminar.');
      return;
    }

    const courseIdToDelete = selectedCourseForDeletion.id;
    console.log('[DeleteCourse] Starting simplified deletion for course:', selectedCourseForDeletion.title);
    setIsDeleting(true);
    const loadingToastId = toast.loading('Eliminando curso...');

    try {
      // Delete in reverse dependency order to avoid foreign key violations
      
      // 1. First delete any lesson_assignments that reference lessons in this course
      console.log('[DeleteCourse] Deleting lesson assignments...');
      try {
        // Get all lessons for this course (both direct and through modules)
        const { data: allLessons } = await supabase
          .from('lessons')
          .select('id')
          .eq('course_id', courseIdToDelete);
        
        const { data: modules } = await supabase
          .from('modules')
          .select('id')
          .eq('course_id', courseIdToDelete);
        
        let lessonIds: string[] = [];
        if (allLessons) {
          lessonIds = allLessons.map(l => l.id);
        }
        
        if (modules && modules.length > 0) {
          const moduleIds = modules.map(m => m.id);
          const { data: moduleLessons } = await supabase
            .from('lessons')
            .select('id')
            .in('module_id', moduleIds);
          
          if (moduleLessons) {
            lessonIds = [...lessonIds, ...moduleLessons.map(l => l.id)];
          }
        }
        
        // Remove duplicates
        lessonIds = Array.from(new Set(lessonIds));
        
        if (lessonIds.length > 0) {
          const { error: deleteAssignmentsError } = await supabase
            .from('lesson_assignments')
            .delete()
            .in('lesson_id', lessonIds);
          
          if (deleteAssignmentsError) {
            console.log('[DeleteCourse] Assignment deletion failed:', deleteAssignmentsError.message);
          }
        }
      } catch (assignmentError) {
        console.log('[DeleteCourse] Assignment deletion failed:', assignmentError);
      }
      
      // 2. Delete blocks
      console.log('[DeleteCourse] Deleting blocks...');
      try {
        // Try to delete blocks by course_id first
        const { error: deleteBlocksError } = await supabase
          .from('blocks')
          .delete()
          .eq('course_id', courseIdToDelete);
        
        if (deleteBlocksError) {
          console.log('[DeleteCourse] Block deletion by course_id failed, trying lesson approach...');
          // Fallback: get modules and lessons first, then delete blocks by lesson_id
          const { data: modules } = await supabase
            .from('modules')
            .select('id')
            .eq('course_id', courseIdToDelete);
          
          if (modules && modules.length > 0) {
            const moduleIds = modules.map(m => m.id);
            const { data: lessons } = await supabase
              .from('lessons')
              .select('id')
              .in('module_id', moduleIds);
            
            if (lessons && lessons.length > 0) {
              const lessonIds = lessons.map(l => l.id);
              await supabase.from('blocks').delete().in('lesson_id', lessonIds);
            }
          }
        }
      } catch (blockError) {
        console.log('[DeleteCourse] Block deletion failed, continuing anyway:', blockError);
      }

      console.log('[DeleteCourse] Deleting lessons...');
      try {
        // First, delete lessons that have direct course_id reference
        const { error: directLessonError } = await supabase
          .from('lessons')
          .delete()
          .eq('course_id', courseIdToDelete);
        
        if (directLessonError) {
          console.log('[DeleteCourse] Direct lesson deletion failed:', directLessonError.message);
        }
        
        // Then, delete lessons through modules
        const { data: modules } = await supabase
          .from('modules')
          .select('id')
          .eq('course_id', courseIdToDelete);
        
        if (modules && modules.length > 0) {
          const moduleIds = modules.map(m => m.id);
          const { error: deleteLessonsError } = await supabase
            .from('lessons')
            .delete()
            .in('module_id', moduleIds);
          
          if (deleteLessonsError) {
            console.log('[DeleteCourse] Module-based lesson deletion failed:', deleteLessonsError.message);
          }
        }
      } catch (lessonError) {
        console.log('[DeleteCourse] Lesson deletion failed, continuing anyway:', lessonError);
      }

      console.log('[DeleteCourse] Deleting modules...');
      try {
        const { error: deleteModulesError } = await supabase
          .from('modules')
          .delete()
          .eq('course_id', courseIdToDelete);
        
        if (deleteModulesError) {
          console.log('[DeleteCourse] Module deletion failed:', deleteModulesError.message);
        }
      } catch (moduleError) {
        console.log('[DeleteCourse] Module deletion failed, continuing anyway:', moduleError);
      }

      console.log('[DeleteCourse] Deleting course:', courseIdToDelete);
      const { error: deleteCourseError } = await supabase
        .from('courses')
        .delete()
        .eq('id', courseIdToDelete);
      
      if (deleteCourseError) {
        throw new Error(deleteCourseError.message || 'Error al eliminar el curso principal.');
      }

      console.log('[DeleteCourse] Course deleted successfully from DB.');
      toast.success('Curso eliminado exitosamente');
      setCourses(prevCourses => prevCourses.filter(course => course.id !== courseIdToDelete));
      handleCloseDeleteModal();

    } catch (error: any) {
      console.error('[DeleteCourse] Failed to delete course:', error.message);
      toast.error(`Error al eliminar: ${error.message}`);
    } finally {
      toast.dismiss(loadingToastId);
      setIsDeleting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  // Filter courses based on search query
  const filterCoursesBySearch = (coursesList: FormattedCourse[]): FormattedCourse[] => {
    if (!searchQuery.trim()) return coursesList;
    
    const query = searchQuery.toLowerCase();
    return coursesList.filter(course => {
      return (
        course.title.toLowerCase().includes(query) ||
        course.description.toLowerCase().includes(query) ||
        course.instructor_name.toLowerCase().includes(query)
      );
    });
  };

  if (loading || user === undefined) { 
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_blue">Cargando...</p>
      </div>
    );
  }

  // Only show access denied if we've determined the user role and they're not admin
  if (userRole !== null && userRole !== 'admin') {
    return (
      <MainLayout 
        user={user} 
        currentPage="courses"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={false}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="flex flex-col justify-center items-center min-h-[50vh]">
          <div className="text-center p-8">
            <h1 className="text-2xl font-semibold text-brand_blue mb-4">Acceso Denegado</h1>
            <p className="text-gray-700 mb-6">No tienes permiso para acceder a esta página.</p>
            <Link href="/dashboard" legacyBehavior>
              <a className="px-6 py-2 bg-brand_blue text-white rounded-lg shadow hover:bg-opacity-90 transition-colors">
                Ir al Panel
              </a>
            </Link>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout 
      user={user} 
      currentPage="courses"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={userRole === 'admin'}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<BookOpen />}
        title="Gestor de Cursos"
        subtitle={`${courses.length} curso${courses.length !== 1 ? 's' : ''} creado${courses.length !== 1 ? 's' : ''}`}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Buscar cursos..."
      />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Course Creation Form Section */}
        <div className="mb-12 bg-white rounded-lg shadow-md">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-[#00365b]">Agregar Nuevo Curso</h2>
            <p className="text-gray-500 text-sm mt-1">
              Completa el formulario para crear un nuevo curso
            </p>
          </div>
          
          <div className="p-6">
            <CourseBuilderForm 
              onSuccess={fetchCourses} 
            />
          </div>
        </div>

        {courses.length === 0 ? (
          <div className="text-center bg-white p-12 rounded-xl shadow-lg">
            <svg className="mx-auto h-16 w-16 text-brand_blue/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            <h3 className="mt-4 text-xl font-semibold text-brand_blue">No hay cursos todavía</h3>
            <p className="mt-2 text-sm text-gray-600">¡Comienza creando tu primer curso!</p>
            <div className="mt-8">
              <Link href="/admin/course-builder/new" legacyBehavior>
                <a className="inline-flex items-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand_blue hover:bg-brand_yellow hover:text-brand_blue focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue transition-colors duration-150">
                  Crear Nuevo Curso
                </a>
              </Link>
            </div>
          </div>
        ) : filterCoursesBySearch(courses).length === 0 ? (
          <div className="text-center bg-white p-12 rounded-xl shadow-lg">
            <svg className="mx-auto h-16 w-16 text-brand_blue/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h3 className="mt-4 text-xl font-semibold text-brand_blue">No se encontraron cursos</h3>
            <p className="mt-2 text-sm text-gray-600">Intenta con otros términos de búsqueda</p>
            <button
              onClick={() => setSearchQuery('')}
              className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-brand_blue bg-brand_yellow hover:bg-brand_yellow/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue transition-colors"
            >
              Limpiar búsqueda
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {filterCoursesBySearch(courses).map((course) => (
              <div key={course.id} className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col transition-all duration-300 hover:shadow-2xl">
                <Link href={`/admin/course-builder/${course.id}`} legacyBehavior>
                  <a className="block group">
                    <div className="aspect-[16/9] w-full bg-brand_blue/5 flex items-center justify-center">
                      {course.thumbnail_url ? (
                        <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      ) : (
                        <svg className="w-16 h-16 text-brand_blue/30" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                      )}
                    </div>
                    <div className="p-5 md:p-6 flex-grow">
                      <h2 className="text-lg md:text-xl font-bold text-brand_blue group-hover:text-brand_yellow transition-colors duration-150 truncate">
                        {course.title}
                      </h2>
                      <p className="mt-2 text-sm text-gray-600 line-clamp-3 h-[3.75em]">
                        {course.description}
                      </p>
                      <p className="mt-3 text-xs text-gray-500">
                        Instructor: {course.instructor_name}
                      </p>
                    </div>
                  </a>
                </Link>
                <div className="p-4 md:p-6 bg-white mt-auto">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3">
                    <Link href={`/admin/course-builder/${course.id}`} legacyBehavior> 
                      <a className="flex items-center justify-center px-3 py-2.5 text-xs lg:text-sm font-medium rounded-lg shadow-sm text-white bg-brand_blue hover:bg-brand_blue/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue transition-all duration-150">
                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Editar
                      </a>
                    </Link>
                    <Link href={`/student/course/${course.id}`} legacyBehavior> 
                      <a className="flex items-center justify-center px-3 py-2.5 text-xs lg:text-sm font-medium rounded-lg shadow-sm text-brand_blue bg-gray-100 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue transition-all duration-150">
                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Ver
                      </a>
                    </Link>
                    <button
                      onClick={() => handleOpenAssignModal(course)}
                      className="flex items-center justify-center px-3 py-2.5 text-xs lg:text-sm font-medium rounded-lg shadow-sm text-white bg-brand_yellow hover:bg-brand_yellow/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_yellow transition-all duration-150"
                    >
                      <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                      </svg>
                      Asignar
                    </button>
                    <button
                      onClick={() => handleOpenDeleteModal(course)}
                      className="flex items-center justify-center px-3 py-2.5 text-xs lg:text-sm font-medium rounded-lg shadow-sm text-white bg-red-500 hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all duration-150"
                    >
                      <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Delete Course Modal */}
      {isDeleteModalOpen && selectedCourseForDeletion && (
        <DeleteCourseModal
          courseTitle={selectedCourseForDeletion.title}
          isOpen={isDeleteModalOpen}
          onClose={handleCloseDeleteModal}
          onConfirm={handleConfirmDelete}
          isDeleting={isDeleting}
        />
      )}
      
      {/* Assign Teachers Modal */}
      {isAssignModalOpen && selectedCourseForAssignment && (
        <AssignTeachersModal
          isOpen={isAssignModalOpen}
          onClose={handleCloseAssignModal}
          courseId={selectedCourseForAssignment.id}
          courseTitle={selectedCourseForAssignment.title}
        />
      )}
    </MainLayout>
  );
};

export default CourseBuilder;
