import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import Header from '../../../components/layout/Header';
import DeleteCourseModal from '../../../components/DeleteCourseModal';
import AssignTeachersModal from '../../../components/AssignTeachersModal';

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
  const [searchTerm, setSearchTerm] = useState('');
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
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('courses')
        .select(`
          *,
          instructors(full_name)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Error al cargar los cursos: ' + error.message);
        throw error;
      }

      const formattedCourses = data.map(course => ({
        ...course,
        // @ts-ignore
        instructor_name: course.instructors?.full_name || 'Sin instructor',
        // Ensure thumbnail_url is a string or null, and specifically handle 'default-thumbnail.png'
        thumbnail_url: (course.thumbnail_url && course.thumbnail_url !== 'default-thumbnail.png') ? course.thumbnail_url : null 
      }));
      setCourses(formattedCourses);
    } catch (error) {
      console.error('Error fetching courses:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    const checkAdminAndFetchData = async () => {
      if (!user) {
        // Don't redirect if user is just undefined (still loading)
        // Only redirect if we have explicitly determined there's no user
        return;
      }
      setLoading(true);
      await fetchUserRole();
    };
    checkAdminAndFetchData();
  }, [user, router, fetchUserRole]);

  useEffect(() => {
    if (userRole === 'admin') {
      fetchCourses();
    } else if (userRole === null && user) {
      setLoading(false);
    }
  }, [userRole, user, fetchCourses, router]);

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
      // Simplified deletion approach - delete in dependency order without complex backup logic
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
        // Continue with course deletion even if blocks fail
      }

      console.log('[DeleteCourse] Deleting lessons...');
      try {
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
            console.log('[DeleteCourse] Lesson deletion failed:', deleteLessonsError.message);
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
      <div className="min-h-screen bg-brand_beige flex flex-col justify-center items-center">
        {user && <Header user={user} isAdmin={false} avatarUrl={avatarUrl} />}
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
    );
  }

  return (
    <div className="min-h-screen bg-brand_beige text-brand_blue">
      <Header user={user} isAdmin={userRole === 'admin'} avatarUrl={avatarUrl} /> {/* Render Header */}
      {/* Add padding-top to account for the fixed header's height */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 pt-40 md:pt-44"> 
        <header className="mb-8 md:mb-12 flex flex-col sm:flex-row justify-between items-center gap-4">
          <h1 className="text-3xl sm:text-4xl font-bold text-brand_blue">
            Mis Cursos
          </h1>
          <Link href="/admin/course-builder/new" legacyBehavior>
            <a className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-md text-white bg-brand_blue hover:bg-brand_yellow hover:text-brand_blue focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue transition-colors duration-150">
              Crear Nuevo Curso
            </a>
          </Link>
        </header>

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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {courses.map((course) => (
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
                <div className="p-4 md:p-5 bg-gray-50 border-t border-gray-200 mt-auto">
                  <div className="flex flex-col sm:flex-row justify-end items-center gap-3">
                    <Link href={`/admin/course-builder/${course.id}`} legacyBehavior> 
                      <a className="w-full sm:w-auto text-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-brand_blue bg-brand_yellow/80 hover:bg-brand_yellow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_yellow transition-colors duration-150 font-mont">
                        Editar
                      </a>
                    </Link>
                    <Link href={`/student/course/${course.id}`} legacyBehavior> 
                      <a className="w-full sm:w-auto text-center px-4 py-2.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue transition-colors duration-150 font-mont">
                        Ver Curso
                      </a>
                    </Link>
                    <button
                      onClick={() => handleOpenAssignModal(course)}
                      className="w-full sm:w-auto text-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-150 font-mont"
                    >
                      Asignar Docentes
                    </button>
                    <button
                      onClick={() => handleOpenDeleteModal(course)}
                      className="w-full sm:w-auto text-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-150 font-mont"
                    >
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
    </div>
  );
};

export default CourseBuilder;
