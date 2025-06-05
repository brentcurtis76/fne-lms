import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import CourseBuilderForm from '../src/components/CourseBuilderForm';
import CourseList from '../src/components/CourseList';
import MainLayout from '../components/layout/MainLayout';
import { supabase } from '../lib/supabase';

const CourseManagerPage: React.FC = () => {
  const router = useRouter();
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
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
          .select('role, avatar_url')
          .eq('id', session.user.id)
          .single();
        
        if (profileData) {
          setIsAdmin(profileData.role === 'admin');
          if (profileData.avatar_url) {
            setAvatarUrl(profileData.avatar_url);
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
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
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
        pageTitle="Cargando..."
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
      pageTitle="Gestor de Cursos"
      breadcrumbs={[{label: 'Cursos', href: '/admin/course-builder'}, {label: 'Gestor de Cursos'}]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-3xl font-bold text-brand_blue mb-8">Course Manager</h1>
            
            {/* Course Builder Form Section */}
            <div className="mb-12 bg-white rounded-lg shadow-md">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-brand_blue">Add New Course</h2>
                <p className="text-gray-500 text-sm mt-1">
                  Fill out the form below to create a new course
                </p>
              </div>
              
              <div className="p-6">
                <CourseBuilderForm 
                  onSuccess={handleCourseAdded} 
                />
              </div>
            </div>
            
            {/* Course List Section */}
            <div className="bg-white rounded-lg shadow-md">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-brand_blue">Your Courses</h2>
                <p className="text-gray-500 text-sm mt-1">
                  Manage your existing courses
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
          </div>
      </div>
    </MainLayout>
  );
};

export default CourseManagerPage;
