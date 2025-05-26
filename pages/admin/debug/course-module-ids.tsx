import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { User } from '@supabase/supabase-js';
import Head from 'next/head';
import Link from 'next/link';

// Create a simple header component if the imported one isn't available
const SimpleHeader = ({ user, isAdmin, onLogout }: { user: User | null, isAdmin: boolean, onLogout: () => void }) => {
  return (
    <header className="fixed w-full top-0 z-50 bg-[#e8e5e2] py-4 shadow">
      <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
        <div className="flex items-center">
          <Link href="/">
            <img src="/images/logo.png" alt="FNE LMS Logo" className="h-20 w-auto cursor-pointer" />
          </Link>
        </div>
        <nav className="hidden md:flex space-x-6 font-medium">
          <Link href="/" className="hover:text-[#fdb933] transition">Inicio</Link>
          <Link href="/dashboard" className="hover:text-[#fdb933] transition">Mi Panel</Link>
          {isAdmin && (
            <Link href="/admin/course-builder" className="hover:text-[#fdb933] transition font-semibold">
              Cursos
            </Link>
          )}
        </nav>
        <div className="flex items-center space-x-4">
          <button 
            onClick={onLogout}
            className="hidden md:block bg-[#00365b] text-white font-semibold py-2 px-6 rounded-full hover:bg-[#fdb933] hover:text-[#00365b] transition"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>
    </header>
  );
};

// Use SimpleHeader directly instead of trying to import the external component
const Header = SimpleHeader;

type Course = {
  id: string;
  title: string;
};

type Module = {
  id: string;
  title: string;
  course_id: string;
};

export default function DebugCoursesModules() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<{[courseId: string]: Module[]}>({}); 
  const [error, setError] = useState<string | null>(null);

  // Check authentication and admin status
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }

        setUser(session.user);

        // Check if user is admin (support both user_metadata and raw_user_meta_data)
        let isAdminUser = false;
        // Try user_metadata
        const { data: userData } = await supabase.auth.getUser();
        const meta = userData?.user?.user_metadata || {};
        if (meta.role === 'admin') {
          isAdminUser = true;
        } else if (userData?.user?.user_metadata && typeof userData.user.user_metadata === 'object') {
          // Fallback: check user_metadata (for parity with RLS policy)
          if (userData.user.user_metadata.role === 'admin') {
            isAdminUser = true;
          }
        }
        if (!isAdminUser) {
          // Fallback: Check profiles table
          const { data: profileData } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();

          if (profileData?.role !== 'admin') {
            // Not an admin, redirect to dashboard
            router.push('/dashboard');
            return;
          }
        }

        setIsAdmin(true);
        setLoading(false);
        
        // Fetch courses and modules
        fetchCoursesAndModules();
      } catch (error) {
        console.error('Error checking session:', error);
        setLoading(false);
        router.push('/login');
      }
    };

    checkSession();
  }, [supabase, router]);

  const fetchCoursesAndModules = async () => {
    try {
      // Fetch courses
      const { data: coursesData, error: coursesError } = await supabase
        .from('courses')
        .select('id, title')
        .order('created_at', { ascending: false });
      
      if (coursesError) throw coursesError;
      setCourses(coursesData || []);
      
      // Fetch modules for each course
      const modulesByCourse: {[courseId: string]: Module[]} = {};
      
      for (const course of coursesData || []) {
        const { data: modulesData, error: modulesError } = await supabase
          .from('modules')
          .select('id, title, course_id')
          .eq('course_id', course.id)
          .order('created_at', { ascending: true });
        
        if (modulesError) throw modulesError;
        modulesByCourse[course.id] = modulesData || [];
      }
      
      setModules(modulesByCourse);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      setError(error.message || 'Error fetching data');
    }
  };
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
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
        <title>Debug: Course & Module IDs | FNE LMS</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </Head>

      <Header user={user} isAdmin={isAdmin} onLogout={handleLogout} />

      <div className="min-h-screen bg-brand_beige pt-32 pb-20 relative overflow-hidden">
        <div className="container mx-auto px-6">
          <div className="bg-white rounded-xl shadow-md p-6 mb-8">
            <h1 className="text-2xl md:text-3xl font-bold text-brand_blue mb-4">
              Debug: Course & Module IDs
            </h1>
            <p className="text-gray-600">
              Use this page to find course and module IDs for testing the lessons page.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
              <p>{error}</p>
            </div>
          )}

          {courses.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-6 text-center">
              <p className="text-gray-600">No courses found in the database.</p>
              <Link href="/admin/course-builder">
                <button className="mt-4 px-4 py-2 bg-brand_blue text-white rounded-lg hover:bg-blue-700 transition">
                  Create a Course
                </button>
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-xl font-bold text-brand_blue mb-4">Available Courses & Modules</h2>
              
              <div className="space-y-6">
                {courses.map((course) => (
                  <div key={course.id} className="border-b border-gray-200 pb-6 last:border-b-0 last:pb-0">
                    <h3 className="text-lg font-semibold text-brand_blue mb-2">
                      {course.title}
                    </h3>
                    <p className="text-sm text-gray-500 mb-2">
                      <span className="font-medium">Course ID:</span> {course.id}
                    </p>
                    
                    <div className="mt-3">
                      <h4 className="text-md font-medium text-gray-700 mb-2">Modules:</h4>
                      
                      {modules[course.id]?.length > 0 ? (
                        <div className="space-y-3">
                          {modules[course.id].map((module) => (
                            <div key={module.id} className="bg-gray-50 p-3 rounded-lg">
                              <p className="font-medium">{module.title}</p>
                              <p className="text-sm text-gray-500 mb-2">
                                <span className="font-medium">Module ID:</span> {module.id}
                              </p>
                              
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Link href={`/admin/course-builder/${course.id}/${module.id}/lessons`}>
                                  <button className="px-3 py-1 text-xs bg-brand_blue text-white rounded hover:bg-blue-700 transition">
                                    Go to Lessons Page
                                  </button>
                                </Link>
                                
                                <button 
                                  onClick={() => {
                                    navigator.clipboard.writeText(`/admin/course-builder/${course.id}/${module.id}/lessons`);
                                    alert('Path copied to clipboard!');
                                  }}
                                  className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition"
                                >
                                  Copy Path
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <p className="text-gray-500">No modules found for this course.</p>
                          <Link href={`/admin/course-builder/${course.id}/modules`}>
                            <button className="mt-2 px-3 py-1 text-xs bg-brand_blue text-white rounded hover:bg-blue-700 transition">
                              Create Modules
                            </button>
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
