import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import CourseBuilderForm from '../src/components/CourseBuilderForm';
import CourseList from '../src/components/CourseList';
import MainLayout from '../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../components/layout/FunctionalPageHeader';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../lib/supabase';
import { FolderOpen } from 'lucide-react';
import { getUserPrimaryRole } from '../utils/roleUtils';

const CourseManagerPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [assignedCourses, setAssignedCourses] = useState<any[]>([]);
  
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
          }
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
        currentPage="courses"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00365b] mx-auto"></div>
            <p className="mt-4 text-[#00365b] font-medium">Cargando...</p>
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
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<FolderOpen />}
        title="Gestor de Cursos"
        subtitle={isAdmin ? "Administra y organiza todos los cursos del sistema" : "Cursos asignados a ti"}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Buscar cursos por título..."
      />
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-6xl mx-auto">
            
            {/* Course Builder Form Section - Only for Admins */}
            {isAdmin && (
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
            
            {/* Assigned Courses Section - For Everyone */}
            <div className="bg-white rounded-lg shadow-md mb-8">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-brand_blue">
                  Mis Cursos Asignados
                </h2>
                <p className="text-gray-500 text-sm mt-1">
                  Cursos que te han sido asignados para aprender
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
                      .map(course => (
                        <div key={course.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="text-lg font-semibold text-gray-900">{course.title}</h3>
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                                  Asignado
                                </span>
                              </div>
                              <p className="text-gray-600 mt-1">{course.description}</p>
                              <p className="text-sm text-gray-500 mt-2">
                                Creado: {new Date(course.created_at).toLocaleDateString('es-ES')}
                              </p>
                            </div>
                            <div className="ml-4 flex gap-2">
                              <a
                                href={`/student/course/${course.id}`}
                                className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition"
                              >
                                Comenzar Curso
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
                      ))
                  )}
                </div>
              </div>
            </div>

            {/* All Courses Section - Admin Only */}
            {isAdmin && (
              <div className="bg-white rounded-lg shadow-md">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-brand_blue">
                    Todos los Cursos del Sistema
                  </h2>
                  <p className="text-gray-500 text-sm mt-1">
                    Gestiona todos los cursos del sistema
                  </p>
                </div>
                
                <div className="p-6">
                  <CourseList 
                    key={refreshTrigger}
                    showInstructor={true}
                    limit={20}
                  />
                </div>
              </div>
            )}
          </div>
      </div>
    </MainLayout>
  );
};

export default CourseManagerPage;
