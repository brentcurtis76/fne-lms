import React, { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/router';
import { useSession } from '@supabase/auth-helpers-react';
import MainLayout from '../components/layout/MainLayout';
import { BookOpen, Clock, Award } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { getEffectiveRoleAndStatus } from '../utils/roleUtils';

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

interface MyPathsPageProps {
  profileData: any;
}

export default function MyPathsPage({ profileData }: MyPathsPageProps) {
  const router = useRouter();
  const session = useSession();
  const supabase = useSupabaseClient();
  const [learningPaths, setLearningPaths] = useState<LearningPath[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetchUserPaths();
    fetchUserRole();
  }, []);

  const fetchUserRole = async () => {
    if (profileData?.id) {
      const { effectiveRole, isAdmin: isAdminUser } = await getEffectiveRoleAndStatus(supabase, profileData.id);
      setUserRole(effectiveRole);
      setIsAdmin(isAdminUser);
    }
  };

  const fetchUserPaths = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/learning-paths/my-paths');
      
      if (!response.ok) {
        throw new Error('Error al cargar las rutas de aprendizaje');
      }
      
      const data = await response.json();
      setLearningPaths(data);
    } catch (err: any) {
      console.error('Error fetching learning paths:', err);
      setError(err.message || 'Error al cargar las rutas de aprendizaje');
    } finally {
      setLoading(false);
    }
  };

  const handlePathClick = (pathId: string) => {
    router.push(`/my-paths/${pathId}`);
  };

  if (loading) {
    return (
      <MainLayout 
        user={session?.user} 
        currentPage="my-paths" 
        pageTitle="Mis Rutas de Aprendizaje"
        userRole={userRole} 
        isAdmin={isAdmin}
        avatarUrl={profileData?.avatar_url}
        profileData={profileData}
        onLogout={() => supabase.auth.signOut()}
      >
        <div className="p-6">
          <h1 className="text-3xl font-bold mb-6 text-navy-900">Mis Rutas de Aprendizaje</h1>
          <div className="flex justify-center items-center h-64">
            <div className="animate-pulse text-navy-600">Cargando rutas de aprendizaje...</div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout 
        user={session?.user} 
        currentPage="my-paths" 
        pageTitle="Mis Rutas de Aprendizaje"
        userRole={userRole} 
        isAdmin={isAdmin}
        avatarUrl={profileData?.avatar_url}
        profileData={profileData}
        onLogout={() => supabase.auth.signOut()}
      >
        <div className="p-6">
          <h1 className="text-3xl font-bold mb-6 text-navy-900">Mis Rutas de Aprendizaje</h1>
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout 
      user={session?.user} 
      currentPage="my-paths" 
      pageTitle="Mis Rutas de Aprendizaje"
      userRole={userRole} 
      isAdmin={isAdmin}
      avatarUrl={profileData?.avatar_url}
      onLogout={() => supabase.auth.signOut()}
    >
      <div className="p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-navy-900">Mis Rutas de Aprendizaje</h1>
          <p className="text-gray-600 mt-2">
            Explora las rutas de aprendizaje que te han sido asignadas
          </p>
        </div>

        {learningPaths.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              No tienes rutas de aprendizaje asignadas
            </h3>
            <p className="text-gray-600">
              Cuando te asignen una ruta de aprendizaje, aparecerá aquí.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {learningPaths.map((path) => (
              <div
                key={path.id}
                className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer border border-gray-200"
                onClick={() => handlePathClick(path.id)}
              >
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-navy-900 mb-2">{path.name}</h3>
                  <p className="text-gray-600 text-sm line-clamp-2 mb-4">
                    {path.description}
                  </p>
                </div>
                <div className="px-6 pb-6">
                  <div className="space-y-4">
                    {/* Progress Section */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-700">Progreso</span>
                        <span className="text-sm text-gray-500">
                          {path.progress?.completed_courses || 0} de {path.progress?.total_courses || 0} cursos
                        </span>
                      </div>
                      <div className="relative">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${path.progress?.progress_percentage || 0}%` }}
                          />
                        </div>
                        {/* Placeholder text overlay */}
                        {path.progress?.progress_percentage === 0 && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs text-gray-500 bg-white px-2">
                              Seguimiento de progreso próximamente
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <BookOpen className="w-4 h-4" />
                        <span>{path.progress?.total_courses || 0} cursos</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>
                          Asignado{' '}
                          {formatDistanceToNow(new Date(path.assigned_at), {
                            addSuffix: true,
                            locale: es,
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Achievement indicator (placeholder) */}
                    {path.progress?.progress_percentage === 100 && (
                      <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                        <Award className="w-4 h-4" />
                        <span>¡Completado!</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const supabase = createServerSupabaseClient(ctx);
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return {
      redirect: {
        destination: '/auth/signin',
        permanent: false,
      },
    };
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (!profileData) {
    return {
      redirect: {
        destination: '/auth/signin',
        permanent: false,
      },
    };
  }

  return {
    props: {
      profileData,
    },
  };
};