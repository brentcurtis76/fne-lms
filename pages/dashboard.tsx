import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import Head from 'next/head';
import Link from 'next/link';
import Header from '../components/layout/Header';

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profileName, setProfileName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profileData, setProfileData] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [allCourses, setAllCourses] = useState<any[]>([]);
  const [myCourses, setMyCourses] = useState<any[]>([]);
  
  useEffect(() => {
    const checkSession = async () => {
      try {
        // Check if user is authenticated
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }
        
        setUser(session.user);
        
        // Get user metadata and check for admin role
        const { data: userData, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          console.error('Error fetching user data:', userError);
        } else {
          // Check if user has admin role
          const adminRole = userData?.user?.user_metadata?.role === 'admin';
          setIsAdmin(adminRole);
          
          // Always fetch profile data for all users (admin and non-admin)
          if (userData?.user) {
            const { data: profileData, error: profileError } = await supabase
              .from('profiles')
              .select('role, first_name, last_name, avatar_url, school, description')
              .eq('id', userData.user.id)
              .single();
              
            if (profileData) {
              setProfileData(profileData);
              
              // Check if user is admin from either metadata or profile
              const isAdminUser = profileData.role === 'admin' || adminRole;
              setIsAdmin(isAdminUser);
              
              if (profileData.first_name && profileData.last_name) {
                setProfileName(`${profileData.first_name} ${profileData.last_name}`);
              }
              
              if (profileData.avatar_url) {
                setAvatarUrl(profileData.avatar_url);
              }

              // Fetch courses based on user role
              if (isAdminUser) {
                // Admins see all courses and can create courses
                const { data: allCoursesData, error: allCoursesError } = await supabase
                  .from('courses')
                  .select(`
                    *,
                    instructors(full_name)
                  `)
                  .order('created_at', { ascending: false });
                
                if (allCoursesData) {
                  // Format courses with instructor names
                  const formattedCourses = allCoursesData.map(course => ({
                    ...course,
                    // @ts-ignore
                    instructor_name: course.instructors?.full_name || 'Sin instructor',
                    // Ensure thumbnail_url is a string or null, and specifically handle 'default-thumbnail.png'
                    thumbnail_url: (course.thumbnail_url && course.thumbnail_url !== 'default-thumbnail.png') ? course.thumbnail_url : null 
                  }));
                  
                  setAllCourses(formattedCourses);
                  
                  // Filter courses created by current user
                  if (userData?.user?.id) {
                    const userCreatedCourses = formattedCourses.filter(course => course.created_by === userData.user.id);
                    setMyCourses(userCreatedCourses);
                  }
                }
              } else {
                // Teachers only see courses assigned to them
                const { data: assignedCoursesData, error: assignedCoursesError } = await supabase
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
                      created_by,
                      instructors(full_name)
                    )
                  `)
                  .eq('teacher_id', userData.user.id);

                if (assignedCoursesData && !assignedCoursesError) {
                  // Extract course data from the join and format with instructor names
                  const teacherCourses = assignedCoursesData
                    .map(assignment => assignment.courses)
                    .filter(course => course !== null) // Filter out null courses
                    .map(course => ({
                      ...course,
                      // @ts-ignore
                      instructor_name: course?.instructors?.full_name || 'Sin instructor',
                      // @ts-ignore - Ensure thumbnail_url is a string or null, and specifically handle 'default-thumbnail.png'
                      thumbnail_url: (course?.thumbnail_url && course?.thumbnail_url !== 'default-thumbnail.png') ? course?.thumbnail_url : null 
                    }));
                  
                  setAllCourses(teacherCourses);
                  setMyCourses([]); // Teachers don't have "my courses" - only assigned courses
                } else {
                  console.error('Error fetching assigned courses:', assignedCoursesError);
                  setAllCourses([]);
                  setMyCourses([]);
                }
              }
            }
          }
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error in checkSession:', error);
        setLoading(false);
        router.push('/login');
      }
    };
    
    checkSession();
  }, [router]);
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
    // Clear remember me preferences on logout
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-brand_beige flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
          <p className="mt-4 text-brand_blue font-medium">Cargando...</p>
        </div>
      </div>
    );
  }
  
  return (
    <>
      <Head>
        <title>Panel - FNE LMS</title>
      </Head>
      
      <div className="min-h-screen bg-brand_beige">
        <Header 
          user={user}
          isAdmin={isAdmin}
          onLogout={handleLogout}
          avatarUrl={avatarUrl}
        />
        
        <main className="container mx-auto pt-44 pb-10 px-4">
          <div className="max-w-6xl mx-auto bg-white rounded-lg shadow-md p-8">
            <h1 className="text-2xl font-bold mb-6 text-brand_blue">Bienvenido a tu Panel</h1>
            
            {/* User Info Section */}
            <div className="mb-8 p-6 bg-white rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4 text-brand_blue">Información de Usuario</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Profile Picture and Basic Info */}
                <div className="flex items-start space-x-4">
                  {avatarUrl ? (
                    <img 
                      src={avatarUrl} 
                      alt="Foto de perfil" 
                      className="w-20 h-20 rounded-full object-cover border-2 border-brand_blue"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-brand_blue flex items-center justify-center">
                      <span className="text-white font-bold text-xl">
                        {profileName ? profileName.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="space-y-2">
                    <p><span className="font-semibold">Nombre:</span> {profileName || 'No disponible'}</p>
                    <p><span className="font-semibold">Email:</span> {user?.email || 'No disponible'}</p>
                    <p><span className="font-semibold">Rol:</span> {isAdmin ? 'Administrador' : 'Docente'}</p>
                  </div>
                </div>
                
                {/* Additional Profile Info */}
                <div className="space-y-2">
                  <p><span className="font-semibold">Institución:</span> {profileData?.school || 'No especificado'}</p>
                  <p><span className="font-semibold">Descripción:</span> {profileData?.description || 'No especificado'}</p>
                  <Link
                    href="/profile"
                    className="inline-block mt-2 text-brand_blue hover:text-brand_yellow font-medium"
                  >
                    Editar perfil →
                  </Link>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-brand_blue">Acciones Rápidas</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Admin-only actions */}
                {isAdmin && (
                  <>
                    <Link
                      href="/admin/course-builder/new"
                      className="block p-6 bg-brand_blue text-white rounded-lg hover:bg-brand_yellow hover:text-brand_blue transition-colors"
                    >
                      <h3 className="text-lg font-semibold mb-2">Crear Curso</h3>
                      <p className="text-sm opacity-90">Crea nuevos cursos</p>
                    </Link>
                    
                    {myCourses.length > 0 ? (
                      <Link
                        href={`/admin/course-builder/${myCourses[0].id}`}
                        className="block p-6 bg-brand_yellow text-brand_blue rounded-lg hover:bg-brand_blue hover:text-white transition-colors"
                      >
                        <h3 className="text-lg font-semibold mb-2">Editor de Lecciones</h3>
                        <p className="text-sm opacity-90">Edita lecciones interactivas</p>
                      </Link>
                    ) : (
                      <div className="p-6 bg-gray-300 text-gray-500 rounded-lg">
                        <h3 className="text-lg font-semibold mb-2">Editor de Lecciones</h3>
                        <p className="text-sm">Crea un curso primero</p>
                      </div>
                    )}
                  </>
                )}

                {/* Admin-specific actions */}
                {isAdmin && (
                  <Link
                    href="#mis-cursos"
                    className="block p-6 bg-blue-100 text-blue-900 rounded-lg hover:bg-blue-200 transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById('mis-cursos')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    <h3 className="text-lg font-semibold mb-2">Mis Cursos</h3>
                    <p className="text-sm opacity-90">Cursos que he creado ({myCourses.length})</p>
                  </Link>
                )}

                {/* Teacher-specific actions */}
                {!isAdmin && (
                  <>
                    <Link
                      href="#todos-mis-cursos"
                      className="block p-6 bg-brand_blue text-white rounded-lg hover:bg-brand_yellow hover:text-brand_blue transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById('todos-mis-cursos')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      <h3 className="text-lg font-semibold mb-2">Todos mis cursos</h3>
                      <p className="text-sm opacity-90">Ver todos los cursos ({allCourses.length})</p>
                    </Link>

                    <Link
                      href="#cursos-abiertos"
                      className="block p-6 bg-brand_yellow text-brand_blue rounded-lg hover:bg-brand_blue hover:text-white transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById('cursos-abiertos')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      <h3 className="text-lg font-semibold mb-2">Cursos Abiertos</h3>
                      <p className="text-sm opacity-90">Cursos en progreso ({allCourses.length})</p>
                    </Link>

                    <Link
                      href="#cursos-finalizados"
                      className="block p-6 bg-brand_beige text-brand_blue rounded-lg hover:bg-brand_blue hover:text-white transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById('cursos-finalizados')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      <h3 className="text-lg font-semibold mb-2">Cursos Finalizados</h3>
                      <p className="text-sm opacity-90">Cursos completados (0)</p>
                    </Link>
                  </>
                )}

                {/* Common action - show for admins as well */}
                {isAdmin && (
                  <Link
                    href="#todos-cursos"
                    className="block p-6 bg-yellow-100 text-yellow-900 rounded-lg hover:bg-yellow-200 transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById('todos-cursos')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    <h3 className="text-lg font-semibold mb-2">Todos los Cursos</h3>
                    <p className="text-sm opacity-90">Ver todos los cursos (${allCourses.length})</p>
                  </Link>
                )}
              </div>
            </div>

            {/* My Courses Section - Admin Only */}
            {isAdmin && (
              <div id="mis-cursos" className="mb-8">
                <h2 className="text-xl font-semibold mb-4 text-brand_blue">Mis Cursos ({myCourses.length})</h2>
                <p className="text-gray-600 mb-4">Cursos que has creado como administrador</p>
              
              {myCourses.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                  {myCourses.map((course) => (
                    <div key={course.id} className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col transition-all duration-300 hover:shadow-2xl">
                      <Link href={`/admin/course-builder/${course.id}`} legacyBehavior>
                        <a className="block group">
                          {/* Thumbnail Section */}
                          <div className="aspect-[16/9] w-full bg-brand_blue/5 flex items-center justify-center">
                            {course.thumbnail_url ? (
                              <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                            ) : (
                              <svg className="w-16 h-16 text-brand_blue/30" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                              </svg>
                            )}
                          </div>
                          {/* Content Section */}
                          <div className="p-5 md:p-6 flex-grow">
                            <div className="flex items-center justify-between mb-2">
                              <h2 className="text-lg md:text-xl font-bold text-brand_blue group-hover:text-brand_yellow transition-colors duration-150 truncate">
                                {course.title}
                              </h2>
                              <span className="px-2 py-1 bg-blue-200 text-blue-700 text-xs rounded-full font-medium">
                                Mío
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-gray-600 line-clamp-3 h-[3.75em]">
                              {course.description || 'Sin descripción'}
                            </p>
                            <p className="mt-3 text-xs text-gray-500">
                              Instructor: {course.instructor_name || 'Sin instructor'}
                            </p>
                          </div>
                        </a>
                      </Link>
                      {/* Action Buttons */}
                      <div className="p-4 md:p-5 bg-gray-50 border-t border-gray-200 mt-auto">
                        <div className="flex space-x-2">
                          <Link
                            href={`/admin/course-builder/${course.id}`}
                            className="flex-1 text-center px-3 py-2 bg-brand_blue text-white rounded hover:bg-brand_yellow hover:text-brand_blue transition-colors text-sm font-medium"
                          >
                            Editar
                          </Link>
                          <Link
                            href={`/student/course/${course.id}`}
                            className="flex-1 text-center px-3 py-2 border border-blue-300 text-blue-700 rounded hover:bg-blue-200 hover:text-blue-800 transition-colors text-sm font-medium"
                          >
                            Vista Estudiante
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-blue-700 mb-2">No has creado ningún curso aún.</p>
                  <Link 
                    href="/admin/course-builder"
                    className="inline-block px-4 py-2 bg-blue-200 text-blue-800 rounded hover:bg-blue-300 transition-colors"
                  >
                    Crear mi primer curso
                  </Link>
                </div>
              )}
              </div>
            )}

            {/* Teacher Courses Sections */}
            {!isAdmin && (
              <>
                {/* Todos mis cursos - Teacher */}
                <div id="todos-mis-cursos" className="mb-8">
                  <h2 className="text-xl font-semibold mb-4 text-brand_blue">Todos mis cursos ({allCourses.length})</h2>
                  <p className="text-gray-600 mb-4">Todos los cursos asignados a tu cuenta</p>
                  
                  {allCourses.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                      {allCourses.map((course) => (
                        <div key={course.id} className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col transition-all duration-300 hover:shadow-2xl">
                          <Link href={`/student/course/${course.id}`} legacyBehavior>
                            <a className="block group">
                              {/* Thumbnail Section */}
                              <div className="aspect-[16/9] w-full bg-brand_blue/5 flex items-center justify-center">
                                {course.thumbnail_url ? (
                                  <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                ) : (
                                  <svg className="w-16 h-16 text-brand_blue/30" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                  </svg>
                                )}
                              </div>
                              {/* Content Section */}
                              <div className="p-5 md:p-6 flex-grow">
                                <div className="flex items-center justify-between mb-2">
                                  <h2 className="text-lg md:text-xl font-bold text-brand_blue group-hover:text-brand_yellow transition-colors duration-150 truncate">
                                    {course.title}
                                  </h2>
                                  <span className="px-2 py-1 bg-brand_blue text-white text-xs rounded-full font-medium">
                                    Asignado
                                  </span>
                                </div>
                                <p className="mt-2 text-sm text-gray-600 line-clamp-3 h-[3.75em]">
                                  {course.description || 'Sin descripción'}
                                </p>
                                <p className="mt-3 text-xs text-gray-500">
                                  Instructor: {course.instructor_name || 'Sin instructor'}
                                </p>
                              </div>
                            </a>
                          </Link>
                          {/* Action Buttons */}
                          <div className="p-4 md:p-5 bg-gray-50 border-t border-gray-200 mt-auto">
                            <div className="flex space-x-2">
                              <Link
                                href={`/student/course/${course.id}`}
                                className="w-full text-center px-3 py-2 bg-brand_blue text-white rounded hover:bg-brand_yellow hover:text-brand_blue transition-colors text-sm font-medium"
                              >
                                Ver Curso
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-brand_beige rounded-lg">
                      <p className="text-brand_blue mb-2">No tienes cursos asignados aún.</p>
                      <p className="text-gray-600 text-sm">Los cursos serán asignados por el administrador según tu institución.</p>
                    </div>
                  )}
                </div>

                {/* Cursos Abiertos - Teacher */}
                <div id="cursos-abiertos" className="mb-8">
                  <h2 className="text-xl font-semibold mb-4 text-brand_blue">Cursos Abiertos ({allCourses.length})</h2>
                  <p className="text-gray-600 mb-4">Cursos que estás cursando actualmente</p>
                  
                  {allCourses.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                      {allCourses.map((course) => (
                        <div key={course.id} className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col transition-all duration-300 hover:shadow-2xl border-l-4 border-brand_yellow">
                          <Link href={`/student/course/${course.id}`} legacyBehavior>
                            <a className="block group">
                              {/* Thumbnail Section */}
                              <div className="aspect-[16/9] w-full bg-brand_blue/5 flex items-center justify-center">
                                {course.thumbnail_url ? (
                                  <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                ) : (
                                  <svg className="w-16 h-16 text-brand_blue/30" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                  </svg>
                                )}
                              </div>
                              {/* Content Section */}
                              <div className="p-5 md:p-6 flex-grow">
                                <div className="flex items-center justify-between mb-2">
                                  <h2 className="text-lg md:text-xl font-bold text-brand_blue group-hover:text-brand_yellow transition-colors duration-150 truncate">
                                    {course.title}
                                  </h2>
                                  <span className="px-2 py-1 bg-brand_yellow text-brand_blue text-xs rounded-full font-medium">
                                    En Progreso
                                  </span>
                                </div>
                                <p className="mt-2 text-sm text-gray-600 line-clamp-3 h-[3.75em]">
                                  {course.description || 'Sin descripción'}
                                </p>
                                <p className="mt-3 text-xs text-gray-500">
                                  Instructor: {course.instructor_name || 'Sin instructor'}
                                </p>
                              </div>
                            </a>
                          </Link>
                          {/* Action Buttons */}
                          <div className="p-4 md:p-5 bg-gray-50 border-t border-gray-200 mt-auto">
                            <div className="flex space-x-2">
                              <Link
                                href={`/student/course/${course.id}`}
                                className="w-full text-center px-3 py-2 bg-brand_yellow text-brand_blue rounded hover:bg-brand_blue hover:text-white transition-colors text-sm font-medium"
                              >
                                Continuar Curso
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-brand_beige border border-brand_blue/20 rounded-lg">
                      <p className="text-brand_blue mb-2">No tienes cursos en progreso.</p>
                      <p className="text-gray-600 text-sm">Los cursos aparecerán aquí cuando comiences a estudiar.</p>
                    </div>
                  )}
                </div>

                {/* Cursos Finalizados - Teacher */}
                <div id="cursos-finalizados" className="mb-8">
                  <h2 className="text-xl font-semibold mb-4 text-brand_blue">Cursos Finalizados (0)</h2>
                  <p className="text-gray-600 mb-4">Cursos que has completado exitosamente</p>
                  
                  <div className="text-center py-8 bg-brand_beige border border-brand_blue/20 rounded-lg">
                    <p className="text-brand_blue mb-2">No has completado ningún curso aún.</p>
                    <p className="text-gray-600 text-sm">Los cursos completados aparecerán aquí con tu certificado de finalización.</p>
                  </div>
                </div>
              </>
            )}

            {/* All Courses Section - Admin Only */}
            {isAdmin && (
            <div id="todos-cursos" className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-brand_blue">
                {isAdmin ? `Todos los Cursos (${allCourses.length})` : `Mis Cursos (${allCourses.length})`}
              </h2>
              <p className="text-gray-600 mb-4">
                {isAdmin ? 'Todos los cursos disponibles en la plataforma' : 'Cursos asignados a tu cuenta'}
              </p>
              
              {allCourses.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                  {allCourses.map((course) => (
                    <div key={course.id} className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col transition-all duration-300 hover:shadow-2xl">
                      <Link href={isAdmin && course.created_by === user?.id ? `/admin/course-builder/${course.id}` : `/student/course/${course.id}`} legacyBehavior>
                        <a className="block group">
                          {/* Thumbnail Section */}
                          <div className="aspect-[16/9] w-full bg-brand_blue/5 flex items-center justify-center">
                            {course.thumbnail_url ? (
                              <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                            ) : (
                              <svg className="w-16 h-16 text-brand_blue/30" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                              </svg>
                            )}
                          </div>
                          {/* Content Section */}
                          <div className="p-5 md:p-6 flex-grow">
                            <div className="flex items-center justify-between mb-2">
                              <h2 className="text-lg md:text-xl font-bold text-brand_blue group-hover:text-brand_yellow transition-colors duration-150 truncate">
                                {course.title}
                              </h2>
                              {course.created_by === user?.id && (
                                <span className="px-2 py-1 bg-blue-200 text-blue-700 text-xs rounded-full font-medium">
                                  Mío
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-sm text-gray-600 line-clamp-3 h-[3.75em]">
                              {course.description || 'Sin descripción'}
                            </p>
                            <p className="mt-3 text-xs text-gray-500">
                              Instructor: {course.instructor_name || 'Sin instructor'}
                            </p>
                          </div>
                        </a>
                      </Link>
                      {/* Action Buttons */}
                      <div className="p-4 md:p-5 bg-gray-50 border-t border-gray-200 mt-auto">
                        <div className="flex space-x-2">
                          {isAdmin && course.created_by === user?.id ? (
                            <>
                              <Link
                                href={`/admin/course-builder/${course.id}`}
                                className="flex-1 text-center px-3 py-2 bg-brand_blue text-white rounded hover:bg-brand_yellow hover:text-brand_blue transition-colors text-sm font-medium"
                              >
                                Editar
                              </Link>
                              <Link
                                href={`/student/course/${course.id}`}
                                className="flex-1 text-center px-3 py-2 border border-blue-300 text-blue-700 rounded hover:bg-blue-200 hover:text-blue-800 transition-colors text-sm font-medium"
                              >
                                Vista Estudiante
                              </Link>
                            </>
                          ) : (
                            <Link
                              href={`/student/course/${course.id}`}
                              className="w-full text-center px-3 py-2 bg-yellow-200 text-yellow-800 rounded hover:bg-yellow-300 transition-colors text-sm font-medium"
                            >
                              Ver Curso
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-brand_beige rounded-lg">
                  <p className="text-brand_blue mb-2">
                    {isAdmin ? 'No hay cursos disponibles.' : 'No tienes cursos asignados aún.'}
                  </p>
                  {!isAdmin && (
                    <p className="text-gray-600 text-sm">
                      Los cursos serán asignados por el administrador según tu institución.
                    </p>
                  )}
                </div>
              )}
            </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}