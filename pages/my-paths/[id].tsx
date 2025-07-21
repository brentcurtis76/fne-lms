import React, { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/router';
import Link from 'next/link';
import MainLayout from '../../components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { 
  BookOpen, 
  Clock, 
  CheckCircle, 
  Circle, 
  PlayCircle, 
  ChevronLeft,
  Award,
  BarChart
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface Course {
  sequence: number;
  course_id: string;
  title: string;
  description: string;
  category: string;
  duration_hours: number;
  difficulty_level: string;
  status: 'not_started' | 'enrolled' | 'in_progress' | 'completed';
  completion_rate: number;
  last_accessed: string | null;
  enrolled_at: string | null;
  enrollment_status: string | null;
  buttonText: string;
  buttonVariant: string;
}

interface LearningPathDetails {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  courses: Course[];
  progress: {
    total_courses: number;
    completed_courses: number;
    progress_percentage: number;
  };
}

interface PathDetailsPageProps {
  profileData: any;
}

export default function PathDetailsPage({ profileData }: PathDetailsPageProps) {
  const router = useRouter();
  const { id: pathId } = router.query;
  const [pathDetails, setPathDetails] = useState<LearningPathDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pathId) {
      fetchPathDetails();
    }
  }, [pathId]);

  const fetchPathDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/learning-paths/${pathId}?user=true`);
      
      if (!response.ok) {
        throw new Error('Error al cargar los detalles de la ruta');
      }
      
      const data = await response.json();
      setPathDetails(data);
    } catch (err: any) {
      console.error('Error fetching path details:', err);
      setError(err.message || 'Error al cargar los detalles de la ruta');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string, completionRate: number) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            Completado
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
            <PlayCircle className="w-3 h-3 mr-1" />
            En progreso ({completionRate}%)
          </span>
        );
      case 'enrolled':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
            <Circle className="w-3 h-3 mr-1" />
            Inscrito
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
            <Circle className="w-3 h-3 mr-1" />
            No iniciado
          </span>
        );
    }
  };

  const getDifficultyBadge = (level: string) => {
    const levels: { [key: string]: { color: string; text: string } } = {
      beginner: { color: 'bg-green-100 text-green-800', text: 'Principiante' },
      intermediate: { color: 'bg-yellow-100 text-yellow-800', text: 'Intermedio' },
      advanced: { color: 'bg-red-100 text-red-800', text: 'Avanzado' }
    };
    
    const levelInfo = levels[level] || levels.intermediate;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${levelInfo.color} border-transparent`}>
        <BarChart className="w-3 h-3 mr-1" />
        {levelInfo.text}
      </span>
    );
  };

  if (loading) {
    return (
      <MainLayout profileData={profileData}>
        <div className="p-6">
          <div className="flex justify-center items-center h-64">
            <div className="animate-pulse text-navy-600">Cargando detalles de la ruta...</div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !pathDetails) {
    return (
      <MainLayout profileData={profileData}>
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error || 'Ruta de aprendizaje no encontrada'}
          </div>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => router.push('/my-paths')}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Volver a Mis Rutas
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout profileData={profileData}>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Back button */}
        <Button 
          variant="ghost" 
          className="mb-6 -ml-2"
          onClick={() => router.push('/my-paths')}
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Volver a Mis Rutas
        </Button>

        {/* Header with path info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h1 className="text-3xl font-bold text-navy-900 mb-3">{pathDetails.name}</h1>
          <p className="text-gray-600 mb-6">{pathDetails.description}</p>
          
          {/* Overall progress */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Progreso general</span>
              <span className="text-sm text-gray-500">
                {pathDetails.progress.completed_courses} de {pathDetails.progress.total_courses} cursos completados
              </span>
            </div>
            <div className="relative w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-blue-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${pathDetails.progress.progress_percentage}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                {pathDetails.progress.progress_percentage}% completado
              </span>
              {pathDetails.progress.progress_percentage === 100 && (
                <div className="flex items-center gap-2 text-green-600 font-medium">
                  <Award className="w-4 h-4" />
                  <span>¡Ruta completada!</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Course list */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-navy-900 mb-4">
            Cursos en esta ruta ({pathDetails.courses.length})
          </h2>
          
          {pathDetails.courses.map((course, index) => (
            <div 
              key={course.course_id}
              className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-200"
            >
              <div className="p-6">
                <div className="flex items-start gap-4">
                  {/* Sequence number */}
                  <div className="flex-shrink-0">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${
                      course.status === 'completed' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {course.sequence}
                    </div>
                  </div>

                  {/* Course details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <h3 className="text-lg font-semibold text-navy-900 mb-1">
                          {course.title}
                        </h3>
                        <p className="text-gray-600 text-sm line-clamp-2">
                          {course.description}
                        </p>
                      </div>
                      {getStatusBadge(course.status, course.completion_rate)}
                    </div>

                    {/* Course metadata */}
                    <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>{course.duration_hours} horas</span>
                      </div>
                      {getDifficultyBadge(course.difficulty_level)}
                      {course.last_accessed && (
                        <span className="text-xs">
                          Último acceso{' '}
                          {formatDistanceToNow(new Date(course.last_accessed), {
                            addSuffix: true,
                            locale: es,
                          })}
                        </span>
                      )}
                    </div>

                    {/* Action button */}
                    <div className="mt-4">
                      <Link href={`/courses/${course.course_id}`}>
                        <Button 
                          variant={course.buttonVariant as any}
                          size="sm"
                        >
                          <BookOpen className="w-4 h-4 mr-2" />
                          {course.buttonText}
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
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