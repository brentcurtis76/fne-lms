import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Head from 'next/head';
import Header from '../components/layout/Header';

import { metadataHasRole } from '../utils/roleUtils';

export default function CreadorDeCursos() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        // Check if user is authenticated
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.user) {
          // User is not logged in, redirect to homepage
          router.push('/');
          return;
        }
        
        setUser(session.user);
        
        // Check if user has admin role in metadata
        const { data: userData, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          console.error('Error fetching user data:', userError);
          router.push('/');
          return;
        }
        
        // Check for admin role in user metadata
        const adminRole = metadataHasRole(userData?.user?.user_metadata, 'admin');
        
        if (!adminRole) {
          // If not found in metadata, check profiles table as fallback
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();
            
          if (profileError || profileData?.role !== 'admin') {
            // User is not an admin, redirect to homepage
            console.log('User is not an admin, redirecting to homepage');
            router.push('/');
            return;
          }
        }
        
        // User is an admin, allow access to the page
        setIsAdmin(true);
        setLoading(false);
        
      } catch (error) {
        console.error('Error checking admin access:', error);
        router.push('/');
      }
    };
    
    checkAdminAccess();
  }, [router, supabase.auth]);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-brand_beige flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
          <p className="mt-4 text-brand_blue font-medium">Verificando permisos...</p>
        </div>
      </div>
    );
  }
  
  return (
    <>
      <Head>
        <title>Cursos - Genera</title>
      </Head>
      
      <div className="min-h-screen bg-brand_beige">
        <Header 
          user={user} 
          isAdmin={isAdmin}
        />
        
        <main className="container mx-auto pt-32 pb-10 px-4">
          <div className="max-w-5xl mx-auto bg-white rounded-lg shadow-md p-8">
            <h1 className="text-3xl font-bold mb-6 text-brand_blue">Panel de Creador de Cursos</h1>
            
            <div className="border-t border-gray-200 pt-6 mt-6">
              <p className="text-lg mb-4">
                Bienvenido al panel de creador de cursos. Desde aquí podrás crear, editar y gestionar los cursos de la plataforma.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
                <div className="bg-brand_beige p-6 rounded-lg shadow hover:shadow-md transition">
                  <h3 className="text-xl font-semibold text-brand_blue mb-3">Crear Nuevo Curso</h3>
                  <p className="text-gray-700 mb-4">Crea un nuevo curso desde cero con todos los detalles necesarios.</p>
                  <button 
                    onClick={() => router.push('/admin/course-builder/new')}
                    className="bg-brand_blue text-white px-4 py-2 rounded hover:bg-brand_yellow hover:text-brand_blue transition"
                  >
                    Crear Curso
                  </button>
                </div>
                
                <div className="bg-brand_beige p-6 rounded-lg shadow hover:shadow-md transition">
                  <h3 className="text-xl font-semibold text-brand_blue mb-3">Gestionar Cursos</h3>
                  <p className="text-gray-700 mb-4">Edita, actualiza o elimina cursos existentes en la plataforma.</p>
                  <button 
                    onClick={() => router.push('/admin/course-builder')}
                    className="bg-brand_blue text-white px-4 py-2 rounded hover:bg-brand_yellow hover:text-brand_blue transition"
                  >
                    Ver Cursos
                  </button>
                </div>
                
                <div className="bg-brand_beige p-6 rounded-lg shadow hover:shadow-md transition">
                  <h3 className="text-xl font-semibold text-brand_blue mb-3">Estadísticas</h3>
                  <p className="text-gray-700 mb-4">Visualiza estadísticas sobre los cursos y su uso en la plataforma.</p>
                  <button 
                    className="bg-gray-400 text-white px-4 py-2 rounded cursor-not-allowed"
                    disabled
                  >
                    Próximamente
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
