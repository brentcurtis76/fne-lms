import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '../components/layout/MainLayout';
import UserDetailModal from '../components/reports/UserDetailModal';
import ExportDropdown from '../components/reports/ExportDropdown';
import EnhancedTable from '../components/reports/EnhancedTable';
import StatusBadge from '../components/reports/StatusBadge';
import ConsultantIndicator from '../components/reports/ConsultantIndicator';
import AnalyticsVisualization from '../components/reports/AnalyticsVisualization';
import AdvancedFilters from '../components/reports/AdvancedFilters';
import { ResponsiveFunctionalPageHeader } from '../components/layout/FunctionalPageHeader';
import { BarChart3, Calendar } from 'lucide-react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
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
  consultant_info?: {
    has_consultant: boolean;
    consultant_name?: string;
    assignment_type?: string;
    is_active?: boolean;
  };
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
  const supabase = useSupabaseClient();
  
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
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter state
  const [dateRange, setDateRange] = useState('30');
  const [groupBy, setGroupBy] = useState('week');
  const [selectedSchool, setSelectedSchool] = useState('');
  const [selectedGeneration, setSelectedGeneration] = useState('');
  const [selectedCommunity, setSelectedCommunity] = useState('');
  
  // Modal state
  const [userDetailModalOpen, setUserDetailModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    initializeAuth();
  }, [router]);

  useEffect(() => {
    if (user && userRole) {
      fetchReportingData();
    }
  }, [user, userRole, activeTab, dateRange, groupBy, selectedSchool, selectedGeneration, selectedCommunity]);

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
        .select('first_name, last_name, avatar_url, school_id, generation_id, community_id')
        .eq('id', session.user.id)
        .single();
      
      if (profileData) {
        const role = await getUserPrimaryRole(session.user.id);
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

  const handleUserClick = (userId: string) => {
    setSelectedUserId(userId);
    setUserDetailModalOpen(true);
  };

  const handleFiltersChange = (filters: any) => {
    setSelectedSchool(filters.school_id === 'all' ? '' : filters.school_id);
    setSelectedGeneration(filters.generation_id === 'all' ? '' : filters.generation_id);
    setSelectedCommunity(filters.community_id === 'all' ? '' : filters.community_id);
  };

  const handleCloseUserModal = () => {
    setUserDetailModalOpen(false);
    setSelectedUserId(null);
  };

  // Filter data based on search query
  const filterDataBySearch = <T extends any>(data: T[], searchFields: (keyof T)[]): T[] => {
    if (!searchQuery.trim()) return data;
    
    const query = searchQuery.toLowerCase();
    return data.filter(item => {
      return searchFields.some(field => {
        const value = item[field];
        if (typeof value === 'string') {
          return value.toLowerCase().includes(query);
        }
        if (typeof value === 'number') {
          return value.toString().includes(query);
        }
        return false;
      });
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#e8e5e2] flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00365b]"></div>
      </div>
    );
  }

  return (
    <MainLayout 
      user={user} 
      currentPage="reports"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<BarChart3 />}
        title="Dashboard de Reportes"
        subtitle={`Reportes de progreso y analytics • ${userScope}`}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Buscar usuarios, cursos, comunidades..."
      >
        {/* Date range selector as additional action */}
        <div className="flex items-center space-x-2">
          <Calendar size={16} className="text-gray-500" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent text-sm"
          >
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="365">Último año</option>
          </select>
        </div>
      </ResponsiveFunctionalPageHeader>
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-lg p-6">

          {/* Tab Navigation */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              {[
                { id: 'overview', label: 'Resumen General', icon: '📊' },
                { id: 'analytics', label: 'Analytics', icon: '📈' },
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
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Progreso de Usuarios</h3>
                  <ExportDropdown
                    tabName="Progreso-Usuarios"
                    data={overviewData.users}
                    headers={['first_name', 'last_name', 'email', 'role', 'total_courses', 'completed_courses', 'completion_rate', 'total_time_spent', 'last_activity']}
                    metadata={{
                      dateRange: `Últimos ${dateRange} días`,
                      filters: { selectedSchool, selectedGeneration }
                    }}
                  />
                </div>
                <EnhancedTable
                  data={filterDataBySearch(overviewData.users, ['first_name', 'last_name', 'email', 'role'])}
                  columns={[
                    {
                      key: 'full_name',
                      label: 'Usuario',
                      render: (_, user) => (
                        <div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUserClick(user.id);
                            }}
                            className="font-medium text-[#00365b] hover:text-[#fdb933] cursor-pointer transition-colors text-left"
                          >
                            {user.first_name} {user.last_name}
                          </button>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      )
                    },
                    {
                      key: 'role',
                      label: 'Rol',
                      render: (role) => (
                        <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-medium">
                          {role}
                        </span>
                      )
                    },
                    {
                      key: 'total_courses',
                      label: 'Cursos',
                      render: (value) => value || 0
                    },
                    {
                      key: 'completed_courses',
                      label: 'Completados',
                      render: (value) => value || 0
                    },
                    {
                      key: 'completion_rate',
                      label: 'Tasa',
                      render: (rate) => (
                        <StatusBadge 
                          value={rate || 0} 
                          type="completion" 
                          showProgress={true}
                        />
                      )
                    },
                    {
                      key: 'total_time_spent',
                      label: 'Tiempo',
                      render: (time) => formatTime(time || 0)
                    },
                    {
                      key: 'last_activity',
                      label: 'Última Actividad',
                      render: (activity) => (
                        <span className="text-sm text-gray-500">
                          {activity ? new Date(activity).toLocaleDateString('es-ES') : 'Nunca'}
                        </span>
                      )
                    },
                    {
                      key: 'consultant_info',
                      label: 'Consultor',
                      sortable: false,
                      render: (consultantInfo) => (
                        <ConsultantIndicator
                          hasConsultant={consultantInfo?.has_consultant || false}
                          consultantName={consultantInfo?.consultant_name}
                          assignmentType={consultantInfo?.assignment_type}
                          isActive={consultantInfo?.is_active}
                          size="sm"
                        />
                      )
                    }
                  ]}
                  searchable={true}
                  searchPlaceholder="Buscar por nombre, email o rol..."
                  pageSize={10}
                  onRowClick={(user) => handleUserClick(user.id)}
                />
              </div>
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              {/* Analytics-specific Time Range Filter */}
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                  <h3 className="text-lg font-semibold text-gray-900">Configuración de Analytics</h3>
                  <div className="flex space-x-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Período de Tiempo
                      </label>
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
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Agrupar por
                      </label>
                      <select
                        value={groupBy}
                        onChange={(e) => setGroupBy(e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                      >
                        <option value="day">Día</option>
                        <option value="week">Semana</option>
                        <option value="month">Mes</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Organizational Filters */}
              <AdvancedFilters
                filters={{
                  search: '',
                  school_id: selectedSchool || 'all',
                  generation_id: selectedGeneration || 'all',
                  community_id: selectedCommunity || 'all',
                  course_id: 'all',
                  status: 'all',
                  date_from: '',
                  date_to: ''
                }}
                onFiltersChange={handleFiltersChange}
                userRole={userRole}
                isAdmin={isAdmin}
              />

              {/* Analytics Visualization */}
              <AnalyticsVisualization
                userId={user?.id || ''}
                userRole={userRole}
                filters={{
                  timeRange: dateRange,
                  groupBy: groupBy,
                  school_id: selectedSchool || undefined,
                  generation_id: selectedGeneration || undefined,
                  community_id: selectedCommunity || undefined
                }}
              />
            </div>
          )}

          {/* Community Tab */}
          {activeTab === 'community' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Análisis por Comunidades</h3>
                <ExportDropdown
                  tabName="Analisis-Comunidades"
                  data={communityData}
                  headers={['community_name', 'total_users', 'active_users', 'avg_completion_rate', 'engagement_score', 'growth_trend']}
                  metadata={{
                    dateRange: `Últimos ${dateRange} días`
                  }}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filterDataBySearch(communityData, ['community_name']).map((community) => (
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
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Tasa Completación:</span>
                        <StatusBadge 
                          value={community.avg_completion_rate} 
                          type="completion" 
                          size="sm"
                        />
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
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Análisis por Escuelas</h3>
                <ExportDropdown
                  tabName="Analisis-Escuelas"
                  data={schoolData}
                  headers={['school_name', 'total_teachers', 'active_teachers', 'avg_lesson_completion', 'avg_assessment_score']}
                  metadata={{
                    dateRange: `Últimos ${dateRange} días`
                  }}
                />
              </div>
              <div className="space-y-4">
                {filterDataBySearch(schoolData, ['school_name']).map((school) => (
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
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Análisis de Cursos</h3>
                <ExportDropdown
                  tabName="Analisis-Cursos"
                  data={courseAnalytics}
                  headers={['course_title', 'category', 'total_enrollments', 'completion_rate', 'avg_time_spent', 'engagement_score', 'popularity_rank']}
                  metadata={{
                    dateRange: `Últimos ${dateRange} días`
                  }}
                />
              </div>
              <EnhancedTable
                data={filterDataBySearch(courseAnalytics, ['course_title', 'category'])}
                columns={[
                  {
                    key: 'course_title',
                    label: 'Curso',
                    render: (title) => (
                      <div className="font-medium text-gray-900">{title}</div>
                    )
                  },
                  {
                    key: 'category',
                    label: 'Categoría',
                    render: (category) => (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                        {category}
                      </span>
                    )
                  },
                  {
                    key: 'total_enrollments',
                    label: 'Inscritos'
                  },
                  {
                    key: 'completion_rate',
                    label: 'Tasa Completación',
                    render: (rate) => (
                      <StatusBadge 
                        value={rate} 
                        type="completion" 
                        showProgress={true}
                      />
                    )
                  },
                  {
                    key: 'avg_time_spent',
                    label: 'Tiempo Promedio',
                    render: (time) => formatTime(time)
                  },
                  {
                    key: 'engagement_score',
                    label: 'Engagement',
                    render: (score) => `${Math.round(score || 0)}/100`
                  },
                  {
                    key: 'popularity_rank',
                    label: 'Ranking',
                    render: (rank) => `#${rank}`
                  }
                ]}
                searchable={true}
                searchPlaceholder="Buscar por curso o categoría..."
                pageSize={15}
              />
            </div>
          )}
        </div>
      </div>

      {/* User Detail Modal */}
      <UserDetailModal
        isOpen={userDetailModalOpen}
        onClose={handleCloseUserModal}
        userId={selectedUserId}
        requestingUserId={user?.id}
      />
    </MainLayout>
  );
};

export default ReportsPage;