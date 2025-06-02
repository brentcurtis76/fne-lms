import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import Header from '../components/layout/Header';
import { supabase } from '../lib/supabase';

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  school_id?: string;
  generation_id?: string;
  community_id?: string;
  last_activity?: string;
  total_courses?: number;
  completed_courses?: number;
  completion_rate?: number;
  total_time_spent?: number;
}

interface OverviewData {
  summary: {
    total_users: number;
    active_users: number;
    total_courses: number;
    avg_completion_rate: number;
    total_time_spent: number;
  };
  users: User[];
  communities: Array<{
    id: string;
    name: string;
    user_count: number;
    avg_completion_rate: number;
  }>;
  recent_activity: Array<{
    user_id: string;
    user_name: string;
    activity_type: string;
    created_at: string;
  }>;
}

interface CommunityData {
  community_id: string;
  community_name: string;
  total_users: number;
  active_users: number;
  avg_completion_rate: number;
  engagement_score: number;
  growth_trend: number;
}

interface SchoolData {
  school_id: string;
  school_name: string;
  total_teachers: number;
  active_teachers: number;
  avg_lesson_completion: number;
  avg_assessment_score: number;
  communities: Array<{
    id: string;
    name: string;
    user_count: number;
  }>;
}

interface CourseAnalytics {
  course_id: string;
  course_title: string;
  total_enrollments: number;
  completion_rate: number;
  avg_time_spent: number;
  engagement_score: number;
  category: string;
  popularity_rank: number;
}

const ReportsPage: React.FC = () => {
  const router = useRouter();
  
  // Authentication state
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [userScope, setUserScope] = useState<string>('');
  
  // Data state
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [communityData, setCommunityData] = useState<CommunityData[]>([]);
  const [schoolData, setSchoolData] = useState<SchoolData[]>([]);
  const [courseAnalytics, setCourseAnalytics] = useState<CourseAnalytics[]>([]);
  
  // Filter state
  const [dateRange, setDateRange] = useState('30');
  const [selectedSchool, setSelectedSchool] = useState('');
  const [selectedGeneration, setSelectedGeneration] = useState('');

  useEffect(() => {
    initializeAuth();
  }, [router]);

  useEffect(() => {
    if (user && userRole) {
      fetchReportingData();
    }
  }, [user, userRole, activeTab, dateRange, selectedSchool, selectedGeneration]);

  const initializeAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('role, first_name, last_name, avatar_url, school_id, generation_id, community_id')
        .eq('id', session.user.id)
        .single();
      
      if (profileData) {
        const role = profileData.role;
        setUserRole(role);
        setIsAdmin(role === 'admin');
        
        // Check if user has reporting access
        const reportingRoles = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad'];
        if (!reportingRoles.includes(role)) {
          router.push('/dashboard');
          return;
        }
        
        // Set user scope for display
        if (role === 'admin') {
          setUserScope('Acceso Global');
        } else if (role === 'equipo_directivo') {
          setUserScope('Nivel Escuela');
        } else if (role === 'lider_generacion') {
          setUserScope('Nivel Generación');
        } else if (role === 'lider_comunidad') {
          setUserScope('Nivel Comunidad');
        } else if (role === 'consultor') {
          setUserScope('Estudiantes Asignados');
        }
        
        if (profileData.avatar_url) {
          setAvatarUrl(profileData.avatar_url);
        }
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  const fetchReportingData = async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const headers = {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      };

      if (activeTab === 'overview') {
        const params = new URLSearchParams({
          days: dateRange,
          ...(selectedSchool && { school_id: selectedSchool }),
          ...(selectedGeneration && { generation_id: selectedGeneration })
        });

        const response = await fetch(`/api/reports/overview?${params}`, { headers });
        if (response.ok) {
          const data = await response.json();
          setOverviewData(data);
        }
      } else if (activeTab === 'community') {
        const response = await fetch('/api/reports/community', { headers });
        if (response.ok) {
          const data = await response.json();
          setCommunityData(data.communities || []);
        }
      } else if (activeTab === 'school') {
        const response = await fetch('/api/reports/school', { headers });
        if (response.ok) {
          const data = await response.json();
          setSchoolData(data.schools || []);
        }
      } else if (activeTab === 'courses') {
        const response = await fetch('/api/reports/course-analytics', { headers });
        if (response.ok) {
          const data = await response.json();
          setCourseAnalytics(data.courses || []);
        }
      }
    } catch (error) {
      console.error('Error fetching reporting data:', error);
      toast.error('Error al cargar datos de reportes');
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#e8e5e2] flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00365b]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#e8e5e2]">
      <Header 
        user={user} 
        isAdmin={isAdmin} 
        avatarUrl={avatarUrl}
        onLogout={handleLogout}
      />
      
      <div className="container mx-auto px-4 pt-32 pb-8">
        <div className="bg-white rounded-lg shadow-lg p-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-[#00365b] mb-2">Dashboard de Reportes</h1>
              <p className="text-gray-600">
                Reportes de progreso y analytics • {userScope}
              </p>
            </div>
            <div className="mt-4 md:mt-0 flex flex-col md:flex-row gap-4">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
              >
                <option value="7">Últimos 7 días</option>
                <option value="30">Últimos 30 días</option>
                <option value="90">Últimos 90 días</option>
                <option value="365">Último año</option>
              </select>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              {[
                { id: 'overview', label: 'Resumen General', icon: '📊' },
                { id: 'community', label: 'Comunidades', icon: '👥' },
                { id: 'school', label: 'Escuelas', icon: '🏫' },
                { id: 'courses', label: 'Cursos', icon: '📚' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
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

          {/* Overview Tab */}
          {activeTab === 'overview' && overviewData && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {overviewData.summary.total_users}
                  </div>
                  <div className="text-sm text-blue-800">Total Usuarios</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {overviewData.summary.active_users}
                  </div>
                  <div className="text-sm text-green-800">Usuarios Activos</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {overviewData.summary.total_courses}
                  </div>
                  <div className="text-sm text-purple-800">Total Cursos</div>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">
                    {formatPercentage(overviewData.summary.avg_completion_rate)}
                  </div>
                  <div className="text-sm text-yellow-800">Tasa Promedio</div>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">
                    {formatTime(overviewData.summary.total_time_spent)}
                  </div>
                  <div className="text-sm text-orange-800">Tiempo Total</div>
                </div>
              </div>

              {/* User Progress Table */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Progreso de Usuarios</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left p-4 font-medium text-gray-700">Usuario</th>
                        <th className="text-left p-4 font-medium text-gray-700">Rol</th>
                        <th className="text-left p-4 font-medium text-gray-700">Cursos</th>
                        <th className="text-left p-4 font-medium text-gray-700">Completados</th>
                        <th className="text-left p-4 font-medium text-gray-700">Tasa</th>
                        <th className="text-left p-4 font-medium text-gray-700">Tiempo</th>
                        <th className="text-left p-4 font-medium text-gray-700">Última Actividad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overviewData.users.map((user) => (
                        <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="p-4">
                            <div>
                              <div className="font-medium text-gray-900">
                                {user.first_name} {user.last_name}
                              </div>
                              <div className="text-sm text-gray-500">{user.email}</div>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-medium">
                              {user.role}
                            </span>
                          </td>
                          <td className="p-4">{user.total_courses || 0}</td>
                          <td className="p-4">{user.completed_courses || 0}</td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(user.completion_rate || 0)}`}>
                              {formatPercentage(user.completion_rate || 0)}
                            </span>
                          </td>
                          <td className="p-4">{formatTime(user.total_time_spent || 0)}</td>
                          <td className="p-4 text-sm text-gray-500">
                            {user.last_activity ? new Date(user.last_activity).toLocaleDateString('es-ES') : 'Nunca'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Community Tab */}
          {activeTab === 'community' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">Análisis por Comunidades</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {communityData.map((community) => (
                  <div key={community.community_id} className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="font-semibold text-gray-900 mb-4">{community.community_name}</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Total Usuarios:</span>
                        <span className="font-medium">{community.total_users}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Usuarios Activos:</span>
                        <span className="font-medium">{community.active_users}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Tasa Completación:</span>
                        <span className={`font-medium ${getStatusColor(community.avg_completion_rate).split(' ')[0]}`}>
                          {formatPercentage(community.avg_completion_rate)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Engagement:</span>
                        <span className="font-medium">{Math.round(community.engagement_score || 0)}/100</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* School Tab */}
          {activeTab === 'school' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">Análisis por Escuelas</h3>
              <div className="space-y-4">
                {schoolData.map((school) => (
                  <div key={school.school_id} className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="font-semibold text-gray-900 mb-4">{school.school_name}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{school.total_teachers}</div>
                        <div className="text-sm text-gray-600">Total Docentes</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">{school.active_teachers}</div>
                        <div className="text-sm text-gray-600">Docentes Activos</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">
                          {formatPercentage(school.avg_lesson_completion)}
                        </div>
                        <div className="text-sm text-gray-600">Lecciones Completadas</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-600">
                          {Math.round(school.avg_assessment_score || 0)}%
                        </div>
                        <div className="text-sm text-gray-600">Puntaje Evaluaciones</div>
                      </div>
                    </div>
                    {school.communities.length > 0 && (
                      <div>
                        <h5 className="font-medium text-gray-700 mb-2">Comunidades:</h5>
                        <div className="flex flex-wrap gap-2">
                          {school.communities.map((community) => (
                            <span 
                              key={community.id}
                              className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                            >
                              {community.name} ({community.user_count})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Courses Tab */}
          {activeTab === 'courses' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">Análisis de Cursos</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left p-4 font-medium text-gray-700">Curso</th>
                      <th className="text-left p-4 font-medium text-gray-700">Categoría</th>
                      <th className="text-left p-4 font-medium text-gray-700">Inscritos</th>
                      <th className="text-left p-4 font-medium text-gray-700">Tasa Completación</th>
                      <th className="text-left p-4 font-medium text-gray-700">Tiempo Promedio</th>
                      <th className="text-left p-4 font-medium text-gray-700">Engagement</th>
                      <th className="text-left p-4 font-medium text-gray-700">Ranking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courseAnalytics.map((course) => (
                      <tr key={course.course_id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-4">
                          <div className="font-medium text-gray-900">{course.course_title}</div>
                        </td>
                        <td className="p-4">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                            {course.category}
                          </span>
                        </td>
                        <td className="p-4">{course.total_enrollments}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(course.completion_rate)}`}>
                            {formatPercentage(course.completion_rate)}
                          </span>
                        </td>
                        <td className="p-4">{formatTime(course.avg_time_spent)}</td>
                        <td className="p-4">{Math.round(course.engagement_score || 0)}/100</td>
                        <td className="p-4">#{course.popularity_rank}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;