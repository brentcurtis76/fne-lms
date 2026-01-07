import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import DeleteCourseModal from '../../../components/DeleteCourseModal';
import CourseBuilderForm from '../../../src/components/CourseBuilderForm';
import { ResponsiveFunctionalPageHeader } from '../../../components/layout/FunctionalPageHeader';
import { AdminCourseCard } from '../../../components/courses';
import { BookOpen, Plus, ChevronDown, ChevronUp } from 'lucide-react';

import { extractRolesFromMetadata, metadataHasRole } from '../../../utils/roleUtils';

interface CourseFromDB {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string | null;
  instructor_id: string;
  created_at: string;
  instructor_name?: string;
  structure_type?: 'simple' | 'modular';
  instructor?: {
    full_name: string;
    photo_url?: string | null;
  } | null;
}

interface FormattedCourse extends CourseFromDB {
  instructor_name: string;
  thumbnail_url: string | null;
  structure_type?: 'simple' | 'modular';
  instructor?: {
    full_name: string;
    photo_url?: string | null;
  } | null;
}

const CourseBuilder: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<any>(null);
  const [courses, setCourses] = useState<FormattedCourse[]>([]);
  const [totalCourses, setTotalCourses] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [isFormCollapsed, setIsFormCollapsed] = useState(true);
  const [instructorFilter, setInstructorFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [instructorsList, setInstructorsList] = useState<string[]>([]);
  const PAGE_SIZE = 12;
  const totalPages = Math.max(1, Math.ceil(totalCourses / PAGE_SIZE));

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    fetchCourses(page);
  };

  // State for delete confirmation modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedCourseForDeletion, setSelectedCourseForDeletion] = useState<FormattedCourse | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Assignment modal state removed - now navigates to dedicated page

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
        .select('approval_status, avatar_url')
        .eq('id', session.user.id)
        .single();

      const metadataRoles = extractRolesFromMetadata(session.user.user_metadata);

      console.log('Course builder auth check:', {
        userId: session.user.id,
        userEmail: session.user.email,
        profileData,
        metadataRoles,
      });

      // Check admin status from both metadata and user_roles table
      const adminInMetadata = metadataHasRole(session.user.user_metadata, 'admin');
      
      // Correctly check user_roles table for an active admin role
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      const hasAdminRoleInDB = userRoles?.some(role => role.role_type === 'admin') || false;
      
      const isAdmin = adminInMetadata || hasAdminRoleInDB;
      
      // Set avatar URL if available
      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }
      
      if (isAdmin) {
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

  const fetchCourses = useCallback(async (page = 1, overrides?: { search?: string; instructor?: string }) => {
    if (!user) {
      console.log('No user, skipping course fetch');
      return;
    }
    
    console.log('Fetching courses page:', page);
    setLoading(true);
    
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: PAGE_SIZE.toString()
      });

      const search = overrides?.search ?? searchQuery;
      const instructor = overrides?.instructor ?? instructorFilter;

      if (search.trim()) params.append('search', search.trim());
      if (instructor) params.append('instructor', instructor);

      const response = await fetch(`/api/admin/courses?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Error al cargar los cursos');
      }

      const data = await response.json();
      setCourses(
        (data.courses || []).map((course: any) => ({
          ...course,
          thumbnail_url:
            course.thumbnail_url &&
            course.thumbnail_url !== 'default-thumbnail.png' &&
            course.thumbnail_url !== 'https://example.com/default-thumbnail.png'
              ? course.thumbnail_url
              : null
        }))
      );
      setTotalCourses(data.total || 0);
      setCurrentPage(data.page || page);
      if (data.instructors) {
        setInstructorsList(data.instructors);
      }
    } catch (error) {
      console.error('Unexpected error fetching courses:', error);
      toast.error('Error inesperado al cargar cursos');
      setCourses([]);
      setTotalCourses(0);
    } finally {
      setLoading(false);
    }
  }, [user?.id, searchQuery, instructorFilter]);

  useEffect(() => {
    const checkAdminAndFetchData = async () => {
      if (!user) {
        return;
      }
      
      setLoading(true);
      await fetchUserRole();
    };
    
    checkAdminAndFetchData();
  }, [user?.id, fetchUserRole]); // Include fetchUserRole dependency

  // When search or instructor filter changes, refetch first page (admin only)
  useEffect(() => {
    if (user && userRole === 'admin') {
      fetchCourses(1);
    }
  }, [searchQuery, instructorFilter, user, userRole, fetchCourses]);

  // Handle non-admin state
  useEffect(() => {
    if (userRole !== null && userRole !== 'admin') {
      setLoading(false);
    }
  }, [userRole]);

  // Refetch when search or instructor filter changes
  useEffect(() => {
    if (user && userRole === 'admin') {
      fetchCourses(1);
    }
  }, [searchQuery, instructorFilter, user, userRole, fetchCourses]);

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

  // Assignment handler - navigate to dedicated assignment page
  const handleOpenAssignModal = (course: FormattedCourse) => {
    router.push(`/admin/courses/${course.id}/assign`);
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

  // Use instructors list from API (includes all instructors, not just current page)
  const instructorOptions = instructorsList;

  // Courses are already filtered server-side; return as-is for rendering
  const filterCourses = (coursesList: FormattedCourse[]): FormattedCourse[] => coursesList;

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
        subtitle={`${totalCourses} curso${totalCourses !== 1 ? 's' : ''} creado${totalCourses !== 1 ? 's' : ''}`}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Buscar cursos..."
      />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div className="text-sm text-gray-600">
            Filtrar por instructor
          </div>
          <div className="flex items-center gap-3 w-full sm:w-80">
            <select
              value={instructorFilter}
              onChange={(e) => setInstructorFilter(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-1 focus:ring-brand_blue focus:border-brand_blue text-sm"
            >
              <option value="">Todos los instructores</option>
              {instructorOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {instructorFilter && (
              <button
                onClick={() => setInstructorFilter('')}
                className="text-xs text-brand_blue hover:text-brand_blue/80"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
        
        {/* Pagination summary and controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div className="text-sm text-gray-600">
            Mostrando {totalCourses === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
            {' - '}
            {totalCourses === 0 ? 0 : Math.min(totalCourses, (currentPage - 1) * PAGE_SIZE + courses.length)}
            {' de '}
            {totalCourses}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              className="px-3 py-1 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-sm text-gray-700">
              Página {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              className="px-3 py-1 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>

        {/* Course Creation Form Section - Collapsible */}
        <div className="mb-12 bg-white rounded-lg shadow-md">
          <button
            onClick={() => setIsFormCollapsed(!isFormCollapsed)}
            className="w-full p-6 border-b border-gray-200 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="text-left">
              <h2 className="text-xl font-semibold text-[#0a0a0a]">Agregar Nuevo Curso</h2>
              <p className="text-gray-500 text-sm mt-1">
                {isFormCollapsed ? 'Haz clic para expandir el formulario' : 'Completa el formulario para crear un nuevo curso'}
              </p>
            </div>
            {isFormCollapsed ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronUp className="h-5 w-5 text-gray-400" />}
          </button>
          
          {!isFormCollapsed && (
            <div className="p-6">
              <CourseBuilderForm 
                createdBy={user?.id}
                onSuccess={() => {
                  fetchCourses(currentPage);
                  setIsFormCollapsed(true);
                }} 
              />
            </div>
          )}
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
        ) : filterCourses(courses).length === 0 ? (
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
            {filterCourses(courses).map((course) => (
              <AdminCourseCard
                key={course.id}
                course={{
                  id: course.id,
                  title: course.title,
                  description: course.description,
                  thumbnail_url: course.thumbnail_url,
                  instructor_name: course.instructor_name,
                  structure_type: course.structure_type,
                  instructor: course.instructor || null,
                }}
                onEdit={(courseId) => router.push(`/admin/course-builder/${courseId}`)}
                onView={(courseId) => router.push(`/student/course/${courseId}`)}
                onAssign={(courseId) => router.push(`/admin/courses/${courseId}/assign`)}
                onDelete={() => handleOpenDeleteModal(course)}
              />
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
    </MainLayout>
  );
};

export default CourseBuilder;
