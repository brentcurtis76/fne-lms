import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useState, useEffect } from 'react';

import LoadingSkeleton from '../common/LoadingSkeleton';
import { toast } from 'react-hot-toast';

interface UserDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  requestingUserId?: string;
}

interface UserDetails {
  basic_info: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    role: string;
    phone?: string;
    avatar_url?: string;
    created_at: string;
    last_login?: string;
    schools?: { name: string };
    generations?: { name: string };
    growth_communities?: { name: string };
  };
  course_progress: Array<{
    id: string;
    enrolled_at: string;
    completion_rate: number;
    last_accessed: string;
    courses: {
      id: string;
      title: string;
      description: string;
      category: string;
    };
  }>;
  lesson_completions: Array<{
    id: string;
    completed_at: string;
    time_spent_minutes: number;
    lessons: {
      id: string;
      title: string;
      order_index: number;
      modules: {
        id: string;
        title: string;
        courses: {
          id: string;
          title: string;
        };
      };
    };
  }>;
  quiz_results: Array<{
    id: string;
    score: number;
    max_score: number;
    percentage_score: number;
    attempted_at: string;
    lessons: {
      id: string;
      title: string;
      modules: {
        title: string;
        courses: {
          title: string;
        };
      };
    };
  }>;
  time_spent: Array<{
    time_spent_minutes: number;
    lessons: {
      modules: {
        courses: {
          title: string;
        };
      };
    };
  }>;
  consultant_assignments: Array<{
    id: string;
    assignment_type: string;
    start_date: string;
    end_date: string;
    is_active: boolean;
    permissions: any;
    notes: string;
    consultant: {
      first_name: string;
      last_name: string;
      email: string;
    };
  }>;
  recent_activity: Array<{
    created_at: string;
    activity_type: string;
    description: string;
  }>;
  summary: {
    total_courses: number;
    completed_courses: number;
    avg_completion_rate: number;
    total_lessons_completed: number;
    avg_quiz_score: number;
    total_time_minutes: number;
    last_activity: string | null;
  };
}

export default function UserDetailModal({ 
  isOpen, 
  onClose, 
  userId, 
  requestingUserId 
}: UserDetailModalProps) {
  const supabase = useSupabaseClient();
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (isOpen && userId) {
      fetchUserDetails();
    } else {
      setUserDetails(null);
      setActiveTab('overview');
    }
  }, [isOpen, userId]);

  const fetchUserDetails = async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/reports/user-details?userId=${userId}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUserDetails(data);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Error al cargar detalles del usuario');
      }
    } catch (error) {
      console.error('Error fetching user details:', error);
      toast.error('Error al cargar detalles del usuario');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (minutes: number) => {
    if (!minutes) return '0h 0m';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatPercentage = (value: number) => {
    return `${Math.round(value || 0)}%`;
  };

  const getStatusColor = (rate: number) => {
    if (rate >= 80) return 'text-green-600 bg-green-100';
    if (rate >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getRoleDisplayName = (role: string) => {
    const roleMap: { [key: string]: string } = {
      'admin': 'Administrador',
      'equipo_directivo': 'Equipo Directivo',
      'lider_generacion': 'Líder de Generación',
      'lider_comunidad': 'Líder de Comunidad',
      'consultor': 'Consultor',
      'docente': 'Docente'
    };
    return roleMap[role] || role;
  };

  const getAssignmentTypeDisplayName = (type: string) => {
    const typeMap: { [key: string]: string } = {
      'monitoring': 'Monitoreo',
      'mentoring': 'Mentoría',
      'evaluation': 'Evaluación',
      'support': 'Apoyo'
    };
    return typeMap[type] || type;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#00365b] text-white p-6 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                {userDetails?.basic_info ? 
                  `${userDetails.basic_info.first_name} ${userDetails.basic_info.last_name}` : 
                  'Detalles del Usuario'
                }
              </h2>
              {userDetails?.basic_info && (
                <p className="text-blue-100 mt-1">
                  {getRoleDisplayName(userDetails.basic_info.role)} • {userDetails.basic_info.email}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-blue-100 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <LoadingSkeleton key={i} variant="card" />
                ))}
              </div>
              <LoadingSkeleton variant="card" />
              <LoadingSkeleton variant="card" />
            </div>
          ) : userDetails ? (
            <div>
              {/* Summary Cards */}
              <div className="p-6 bg-gray-50 border-b">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="text-2xl font-bold text-[#00365b]">
                      {userDetails.summary.total_courses}
                    </div>
                    <div className="text-sm text-gray-600">Cursos Inscritos</div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="text-2xl font-bold text-green-600">
                      {userDetails.summary.completed_courses}
                    </div>
                    <div className="text-sm text-gray-600">Cursos Completados</div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="text-2xl font-bold text-[#fdb933]">
                      {formatPercentage(userDetails.summary.avg_completion_rate)}
                    </div>
                    <div className="text-sm text-gray-600">Tasa Promedio</div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="text-2xl font-bold text-purple-600">
                      {formatTime(userDetails.summary.total_time_minutes)}
                    </div>
                    <div className="text-sm text-gray-600">Tiempo Total</div>
                  </div>
                </div>
              </div>

              {/* Tab Navigation */}
              <div className="border-b border-gray-200">
                <nav className="flex px-6">
                  {[
                    { id: 'overview', label: 'Resumen', icon: '📊' },
                    { id: 'courses', label: 'Cursos', icon: '📚' },
                    { id: 'activity', label: 'Actividad', icon: '⚡' },
                    { id: 'consultants', label: 'Consultorías', icon: '👨‍💼' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center py-4 px-6 border-b-2 font-medium text-sm ${
                        activeTab === tab.id
                          ? 'border-[#fdb933] text-[#00365b]'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <span className="mr-2">{tab.icon}</span>
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {/* Basic Info */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Información Personal</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <span className="text-sm text-gray-600">Nombre Completo:</span>
                          <p className="font-medium">{userDetails.basic_info.first_name} {userDetails.basic_info.last_name}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">Email:</span>
                          <p className="font-medium">{userDetails.basic_info.email}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">Rol:</span>
                          <p className="font-medium">{getRoleDisplayName(userDetails.basic_info.role)}</p>
                        </div>
                        {userDetails.basic_info.phone && (
                          <div>
                            <span className="text-sm text-gray-600">Teléfono:</span>
                            <p className="font-medium">{userDetails.basic_info.phone}</p>
                          </div>
                        )}
                        {userDetails.basic_info.schools && (
                          <div>
                            <span className="text-sm text-gray-600">Escuela:</span>
                            <p className="font-medium">{userDetails.basic_info.schools.name}</p>
                          </div>
                        )}
                        {userDetails.basic_info.generations && (
                          <div>
                            <span className="text-sm text-gray-600">Generación:</span>
                            <p className="font-medium">{userDetails.basic_info.generations.name}</p>
                          </div>
                        )}
                        {userDetails.basic_info.growth_communities && (
                          <div>
                            <span className="text-sm text-gray-600">Comunidad:</span>
                            <p className="font-medium">{userDetails.basic_info.growth_communities.name}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Recent Activity Preview */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Actividad Reciente</h3>
                      <div className="space-y-3">
                        {userDetails.recent_activity.slice(0, 5).map((activity, index) => (
                          <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{activity.description}</p>
                              <p className="text-xs text-gray-500">
                                {new Date(activity.created_at).toLocaleString('es-ES')}
                              </p>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              activity.activity_type === 'lesson_completion' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-blue-100 text-blue-800'
                            }`}>
                              {activity.activity_type === 'lesson_completion' ? 'Lección' : 'Quiz'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Courses Tab */}
                {activeTab === 'courses' && (
                  <div className="space-y-6">
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900">Progreso de Cursos</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left p-4 font-medium text-gray-700">Curso</th>
                              <th className="text-left p-4 font-medium text-gray-700">Categoría</th>
                              <th className="text-left p-4 font-medium text-gray-700">Progreso</th>
                              <th className="text-left p-4 font-medium text-gray-700">Última Visita</th>
                              <th className="text-left p-4 font-medium text-gray-700">Inscrito</th>
                            </tr>
                          </thead>
                          <tbody>
                            {userDetails.course_progress.map((course) => (
                              <tr key={course.id} className="border-b border-gray-100">
                                <td className="p-4">
                                  <div className="font-medium text-gray-900">{course.courses.title}</div>
                                  <div className="text-sm text-gray-500">{course.courses.description}</div>
                                </td>
                                <td className="p-4">
                                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                                    {course.courses.category}
                                  </span>
                                </td>
                                <td className="p-4">
                                  <div className="flex items-center">
                                    <div className="w-full bg-gray-200 rounded-full h-2 mr-2">
                                      <div 
                                        className="bg-[#fdb933] h-2 rounded-full" 
                                        style={{ width: `${course.completion_rate}%` }}
                                      ></div>
                                    </div>
                                    <span className="text-sm font-medium text-gray-700">
                                      {formatPercentage(course.completion_rate)}
                                    </span>
                                  </div>
                                </td>
                                <td className="p-4 text-sm text-gray-500">
                                  {course.last_accessed ? new Date(course.last_accessed).toLocaleDateString('es-ES') : 'Nunca'}
                                </td>
                                <td className="p-4 text-sm text-gray-500">
                                  {new Date(course.enrolled_at).toLocaleDateString('es-ES')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Quiz Results */}
                    {userDetails.quiz_results.length > 0 && (
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200">
                          <h3 className="text-lg font-semibold text-gray-900">Resultados de Evaluaciones</h3>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="text-left p-4 font-medium text-gray-700">Lección</th>
                                <th className="text-left p-4 font-medium text-gray-700">Curso</th>
                                <th className="text-left p-4 font-medium text-gray-700">Puntaje</th>
                                <th className="text-left p-4 font-medium text-gray-700">Porcentaje</th>
                                <th className="text-left p-4 font-medium text-gray-700">Fecha</th>
                              </tr>
                            </thead>
                            <tbody>
                              {userDetails.quiz_results.slice(0, 10).map((quiz) => (
                                <tr key={quiz.id} className="border-b border-gray-100">
                                  <td className="p-4">
                                    <div className="font-medium text-gray-900">{quiz.lessons.title}</div>
                                    <div className="text-sm text-gray-500">{quiz.lessons.modules.title}</div>
                                  </td>
                                  <td className="p-4 text-sm text-gray-600">
                                    {quiz.lessons.modules.courses.title}
                                  </td>
                                  <td className="p-4 font-medium">
                                    {quiz.score}/{quiz.max_score}
                                  </td>
                                  <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(quiz.percentage_score)}`}>
                                      {formatPercentage(quiz.percentage_score)}
                                    </span>
                                  </td>
                                  <td className="p-4 text-sm text-gray-500">
                                    {new Date(quiz.attempted_at).toLocaleDateString('es-ES')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Activity Tab */}
                {activeTab === 'activity' && (
                  <div className="space-y-6">
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900">Historial de Actividad</h3>
                      </div>
                      <div className="p-6">
                        <div className="space-y-4">
                          {userDetails.recent_activity.map((activity, index) => (
                            <div key={index} className="flex items-start space-x-4 py-3 border-b border-gray-100 last:border-0">
                              <div className={`p-2 rounded-full ${
                                activity.activity_type === 'lesson_completion' 
                                  ? 'bg-green-100 text-green-600' 
                                  : 'bg-blue-100 text-blue-600'
                              }`}>
                                {activity.activity_type === 'lesson_completion' ? '✓' : '?'}
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">{activity.description}</p>
                                <p className="text-sm text-gray-500">
                                  {new Date(activity.created_at).toLocaleString('es-ES')}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Lesson Completions */}
                    {userDetails.lesson_completions.length > 0 && (
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200">
                          <h3 className="text-lg font-semibold text-gray-900">Lecciones Completadas</h3>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="text-left p-4 font-medium text-gray-700">Lección</th>
                                <th className="text-left p-4 font-medium text-gray-700">Curso</th>
                                <th className="text-left p-4 font-medium text-gray-700">Tiempo</th>
                                <th className="text-left p-4 font-medium text-gray-700">Completado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {userDetails.lesson_completions.slice(0, 10).map((lesson) => (
                                <tr key={lesson.id} className="border-b border-gray-100">
                                  <td className="p-4">
                                    <div className="font-medium text-gray-900">{lesson.lessons.title}</div>
                                    <div className="text-sm text-gray-500">Orden: {lesson.lessons.order_index}</div>
                                  </td>
                                  <td className="p-4 text-sm text-gray-600">
                                    {lesson.lessons.modules.courses.title}
                                  </td>
                                  <td className="p-4 font-medium">
                                    {formatTime(lesson.time_spent_minutes)}
                                  </td>
                                  <td className="p-4 text-sm text-gray-500">
                                    {new Date(lesson.completed_at).toLocaleDateString('es-ES')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Consultants Tab */}
                {activeTab === 'consultants' && (
                  <div className="space-y-6">
                    {userDetails.consultant_assignments.length > 0 ? (
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200">
                          <h3 className="text-lg font-semibold text-gray-900">Asignaciones de Consultoría</h3>
                        </div>
                        <div className="p-6">
                          <div className="space-y-4">
                            {userDetails.consultant_assignments.map((assignment) => (
                              <div key={assignment.id} className="border border-gray-200 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <div>
                                    <h4 className="font-medium text-gray-900">
                                      {assignment.consultant.first_name} {assignment.consultant.last_name}
                                    </h4>
                                    <p className="text-sm text-gray-600">{assignment.consultant.email}</p>
                                  </div>
                                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                    assignment.is_active 
                                      ? 'bg-green-100 text-green-800' 
                                      : 'bg-gray-100 text-gray-800'
                                  }`}>
                                    {assignment.is_active ? 'Activo' : 'Inactivo'}
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                  <div>
                                    <span className="text-gray-600">Tipo:</span>
                                    <p className="font-medium">{getAssignmentTypeDisplayName(assignment.assignment_type)}</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Inicio:</span>
                                    <p className="font-medium">{new Date(assignment.start_date).toLocaleDateString('es-ES')}</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Fin:</span>
                                    <p className="font-medium">{new Date(assignment.end_date).toLocaleDateString('es-ES')}</p>
                                  </div>
                                </div>
                                {assignment.notes && (
                                  <div className="mt-3 p-3 bg-gray-50 rounded">
                                    <p className="text-sm text-gray-700">{assignment.notes}</p>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
                        <div className="text-gray-400 mb-4">
                          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">Sin Asignaciones de Consultoría</h3>
                        <p className="text-gray-600">Este usuario no tiene consultores asignados actualmente.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="text-gray-400 mb-4">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 12.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Error al Cargar Datos</h3>
              <p className="text-gray-600">No se pudieron cargar los detalles del usuario.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-[#00365b] text-white rounded-md hover:bg-[#004170] transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}