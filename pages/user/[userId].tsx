import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../../lib/supabase';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import Head from 'next/head';
import Link from 'next/link';
import MainLayout from '../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../components/layout/FunctionalPageHeader';
import { getUserRoles } from '../../utils/roleUtils';
import { UserRole, UserProfile } from '../../types/roles';
import { ArrowLeft, Book, Calendar, User } from 'lucide-react';

export default function UserProfileView() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const { userId } = router.query;
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profileData, setProfileData] = useState<any>(null);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [enrolledCourses, setEnrolledCourses] = useState<any[]>([]);

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Check if current user is authenticated
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }
        
        setCurrentUser(session.user);
        
        // Get current user's admin status and avatar
        const { data: currentUserProfile } = await supabase
          .from('profiles')
          .select('role, avatar_url')
          .eq('id', session.user.id)
          .single();
        
        if (currentUserProfile) {
          setIsAdmin(currentUserProfile.role === 'admin');
          
          if (currentUserProfile.avatar_url) {
            setAvatarUrl(currentUserProfile.avatar_url);
          }
        }
        
        if (userId && typeof userId === 'string') {
          await loadUserProfile(userId);
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error in checkSession:', error);
        setLoading(false);
        router.push('/login');
      }
    };
    
    if (userId) {
      checkSession();
    }
  }, [router, userId]);

  const loadUserProfile = async (targetUserId: string) => {
    try {
      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetUserId)
        .single();

      if (profileError) {
        console.error('Error fetching user profile:', profileError);
        return;
      }

      setProfileData(profile);

      // Get user roles
      const roles = await getUserRoles(supabase, targetUserId);
      setUserRoles(roles);

      // Get enrolled courses
      const { data: courseAssignments, error: coursesError } = await supabase
        .from('course_assignments')
        .select(`
          course_id,
          assigned_at,
          courses (
            id,
            title,
            description,
            thumbnail_url,
            created_at,
            instructors(full_name)
          )
        `)
        .eq('teacher_id', targetUserId)
        .eq('is_active', true);

      if (courseAssignments && !coursesError) {
        const courses = courseAssignments
          .map(assignment => assignment.courses)
          .filter(course => course !== null)
          .map(course => ({
            ...course,
            // @ts-ignore
            instructor_name: course?.instructors?.full_name || 'Sin instructor',
            // @ts-ignore
            thumbnail_url: (course?.thumbnail_url && course?.thumbnail_url !== 'default-thumbnail.png') ? course?.thumbnail_url : null
          }));
        
        setEnrolledCourses(courses);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  if (loading) {
    return (
      <MainLayout 
        user={currentUser} 
        currentPage="profile"
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

  if (!profileData) {
    return (
      <MainLayout 
        user={currentUser} 
        currentPage="profile"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="max-w-4xl mx-auto py-8">
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <h1 className="text-2xl font-bold mb-4 text-brand_blue">Usuario no encontrado</h1>
            <p className="text-gray-600 mb-6">El perfil que buscas no existe o no tienes permisos para verlo.</p>
            <Link
              href="/dashboard"
              className="inline-flex items-center text-brand_blue hover:text-brand_yellow transition-colors"
            >
              <ArrowLeft className="mr-2" size={20} />
              Volver al Panel
            </Link>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout 
      user={currentUser} 
      currentPage="profile"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <Head>
        <title>{profileData.first_name} {profileData.last_name} - FNE LMS</title>
      </Head>
      
      <ResponsiveFunctionalPageHeader
        icon={<User />}
        title={`${profileData.first_name} ${profileData.last_name}`}
        subtitle="Perfil de usuario"
      />
      
      <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-brand_blue hover:text-brand_yellow transition-colors"
          >
            <ArrowLeft className="mr-2" size={20} />
            Volver al Panel
          </Link>
        </div>

            {/* User Profile Card */}
            <div className="bg-white rounded-lg shadow-md p-8 mb-8">
              <div className="flex flex-col md:flex-row md:items-start md:space-x-8">
                {/* Avatar and Basic Info */}
                <div className="flex flex-col items-center md:items-start mb-6 md:mb-0">
                  {profileData.avatar_url ? (
                    <img 
                      src={profileData.avatar_url} 
                      alt={`${profileData.first_name} ${profileData.last_name}`}
                      className="w-32 h-32 rounded-full object-cover border-4 border-brand_yellow mb-4"
                    />
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-brand_yellow flex items-center justify-center mb-4">
                      <span className="text-brand_blue font-bold text-3xl">
                        {profileData.first_name?.charAt(0)}{profileData.last_name?.charAt(0)}
                      </span>
                    </div>
                  )}
                  
                  <h1 className="text-2xl font-bold text-brand_blue text-center md:text-left">
                    {profileData.first_name} {profileData.last_name}
                  </h1>
                  <p className="text-gray-600 text-center md:text-left">{profileData.email}</p>
                </div>

                {/* Profile Details */}
                <div className="flex-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Contact Information */}
                    <div>
                      <h3 className="text-lg font-semibold text-brand_blue mb-3">Información de Contacto</h3>
                      <div className="space-y-2">
                        <p><span className="font-medium">Email:</span> {profileData.email}</p>
                        {profileData.school && (
                          <p><span className="font-medium">Institución:</span> {String(profileData.school)}</p>
                        )}
                        {profileData.description && (
                          <p><span className="font-medium">Descripción:</span> {profileData.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Roles */}
                    <div>
                      <h3 className="text-lg font-semibold text-brand_blue mb-3">Roles</h3>
                      {userRoles.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {userRoles.map(role => (
                            <span key={role.id} className="inline-block bg-brand_yellow text-brand_blue px-3 py-1 rounded-full text-sm font-medium">
                              {role.role_type === 'admin' && 'Administrador Global'}
                              {role.role_type === 'consultor' && 'Consultor FNE'}
                              {role.role_type === 'equipo_directivo' && 'Equipo Directivo'}
                              {role.role_type === 'lider_generacion' && 'Líder de Generación'}
                              {role.role_type === 'lider_comunidad' && 'Líder de Comunidad'}
                              {role.role_type === 'docente' && 'Docente'}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-600">Sin roles asignados</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Enrolled Courses */}
            <div className="bg-white rounded-lg shadow-md p-8">
              <h2 className="text-xl font-semibold text-brand_blue mb-6 flex items-center">
                <Book className="mr-2" size={24} />
                Cursos Asignados ({enrolledCourses.length})
              </h2>
              
              {enrolledCourses.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {enrolledCourses.map((course) => (
                    <div key={course.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      {course.thumbnail_url ? (
                        <img 
                          src={course.thumbnail_url} 
                          alt={course.title}
                          className="w-full h-32 object-cover rounded-lg mb-3"
                        />
                      ) : (
                        <div className="w-full h-32 bg-gray-100 rounded-lg mb-3 flex items-center justify-center">
                          <Book className="text-gray-400" size={40} />
                        </div>
                      )}
                      
                      <h3 className="font-semibold text-brand_blue mb-2">{course.title}</h3>
                      <p className="text-sm text-gray-600 mb-2 line-clamp-2">{course.description}</p>
                      <p className="text-xs text-gray-500">
                        <span className="font-medium">Instructor:</span> {course.instructor_name}
                      </p>
                      <p className="text-xs text-gray-500 flex items-center mt-1">
                        <Calendar className="mr-1" size={12} />
                        {new Date(course.created_at).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Book className="mx-auto mb-4 text-gray-300" size={48} />
                  <p>Este usuario no tiene cursos asignados actualmente.</p>
                </div>
              )}
            </div>
      </div>
    </MainLayout>
  );
}