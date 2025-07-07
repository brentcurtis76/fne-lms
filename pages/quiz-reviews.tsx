import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../lib/supabase';
import Head from 'next/head';
import { toast } from 'react-hot-toast';
import MainLayout from '../components/layout/MainLayout';
import { ClipboardCheckIcon, ClockIcon, UserGroupIcon } from '@heroicons/react/outline';
import { useAvatar } from '../hooks/useAvatar';
import { getPendingQuizReviews } from '../lib/services/quizSubmissions';
import Link from 'next/link';

export default function QuizReviewsPage() {
  const router = useRouter();
  const session = useSession();
  const supabase = useSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'my_courses'>('my_courses');
  
  const { url: avatarUrl } = useAvatar(session?.user);
  
  useEffect(() => {
    const loadUserData = async () => {
      if (session) {
        try {
          // Get user profile and role
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();
          
          if (profile) {
            setUserRole(profile.role);
            setIsAdmin(profile.role === 'admin');
            
            // Check if user is a consultant/teacher
            if (!['admin', 'consultor', 'equipo_directivo'].includes(profile.role)) {
              toast.error('No tienes permisos para acceder a esta página');
              router.push('/dashboard');
              return;
            }
          }
          
          await loadPendingReviews();
          setLoading(false);
        } catch (error) {
          console.error('Error loading user data:', error);
          toast.error('Error al cargar los datos del usuario');
          setLoading(false);
        }
      } else if (session === null) {
        // Session has loaded and user is not logged in
        router.push('/login');
      }
      // The `session` object can be `undefined` while loading, so we check for `null`.
    };

    loadUserData();
  }, [session, router, supabase]);
  
  const loadPendingReviews = async () => {
    try {
      const { data, error } = await getPendingQuizReviews(supabase);
      
      if (error) throw error;
      
      setPendingReviews(data || []);
    } catch (error) {
      console.error('Error loading pending reviews:', error);
      toast.error('Error al cargar las revisiones pendientes');
    }
  };
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };
  
  const getTimeAgo = (date: string) => {
    const now = new Date();
    const submitted = new Date(date);
    const diffMs = now.getTime() - submitted.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `hace ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`;
    if (diffHours > 0) return `hace ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
    if (diffMins > 0) return `hace ${diffMins} ${diffMins === 1 ? 'minuto' : 'minutos'}`;
    return 'hace un momento';
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue"></div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Revisión de Quizzes - FNE LMS</title>
      </Head>

      <MainLayout 
        user={session?.user}
        currentPage="quiz-reviews"
        pageTitle="Revisión de Quizzes"
        isAdmin={isAdmin}
        userRole={userRole}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="p-6">
          {/* Header Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-md p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Pendientes de revisión</p>
                  <p className="text-2xl font-bold text-orange-600">{pendingReviews.length}</p>
                </div>
                <ClockIcon className="w-8 h-8 text-orange-600 opacity-50" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-md p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Tiempo promedio</p>
                  <p className="text-2xl font-bold text-blue-600">~15 min</p>
                </div>
                <ClipboardCheckIcon className="w-8 h-8 text-blue-600 opacity-50" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-md p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Revisados hoy</p>
                  <p className="text-2xl font-bold text-green-600">0</p>
                </div>
                <UserGroupIcon className="w-8 h-8 text-green-600 opacity-50" />
              </div>
            </div>
          </div>
          
          {/* Filter buttons */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setFilter('my_courses')}
              className={`px-4 py-2 rounded-md transition ${
                filter === 'my_courses' 
                  ? 'bg-brand_blue text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Mis cursos
            </button>
            {isAdmin && (
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-md transition ${
                  filter === 'all' 
                    ? 'bg-brand_blue text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Todos los cursos
              </button>
            )}
          </div>
          
          {/* Pending Reviews List */}
          <div className="bg-white rounded-lg shadow-md">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Quizzes pendientes de revisión</h2>
              <p className="text-sm text-gray-500 mt-1">
                Estos quizzes contienen preguntas abiertas que requieren calificación manual
              </p>
            </div>
            
            <div className="divide-y divide-gray-200">
              {pendingReviews.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <ClipboardCheckIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">No hay quizzes pendientes de revisión</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Los quizzes con preguntas abiertas aparecerán aquí cuando los estudiantes los completen
                  </p>
                </div>
              ) : (
                pendingReviews.map((review) => (
                  <div key={review.id} className="px-6 py-4 hover:bg-gray-50 transition">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-medium text-gray-900">{review.student_name}</h3>
                          <span className="text-sm text-gray-500">•</span>
                          <span className="text-sm text-gray-500">{review.student_email}</span>
                        </div>
                        
                        <div className="space-y-1 text-sm text-gray-600">
                          <p>Curso: <span className="font-medium text-gray-900">{review.course_title}</span></p>
                          <p>Lección: <span className="font-medium text-gray-900">{review.lesson_title}</span></p>
                          <p>Preguntas abiertas: <span className="font-medium text-gray-900">{review.open_responses?.length || 0}</span></p>
                        </div>
                        
                        <div className="flex items-center gap-4 mt-3">
                          <span className="text-xs text-gray-500">
                            <ClockIcon className="w-4 h-4 inline-block mr-1" />
                            Enviado {getTimeAgo(review.submitted_at)}
                          </span>
                          {review.reviewer_workload > 5 && (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                              Alta carga de trabajo
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <Link
                        href={`/quiz-reviews/${review.id}`}
                        className="ml-4 px-4 py-2 bg-brand_blue text-white rounded-md hover:bg-blue-700 transition text-sm"
                      >
                        Revisar
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </MainLayout>
    </>
  );
}