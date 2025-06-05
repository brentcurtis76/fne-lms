import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import MainLayout from '../components/layout/MainLayout';
import AdvancedFilters from '../components/reports/AdvancedFilters';
import UserDetailModal from '../components/reports/UserDetailModal';
import AnalyticsDashboard from '../components/reports/AnalyticsDashboard';
import LoadingSkeleton from '../components/common/LoadingSkeleton';
import MobileUserCard from '../components/reports/MobileUserCard';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

interface ProgressUser {
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  school_name?: string;
  generation_name?: string;
  community_name?: string;
  total_courses_enrolled: number;
  completed_courses: number;
  courses_in_progress: number;
  total_lessons_completed: number;
  completion_percentage: number;
  total_time_spent_minutes: number;
  average_quiz_score?: number;
  last_activity_date?: string;
}

interface Summary {
  total_users: number;
  active_users: number;
  completed_users: number;
  average_completion: number;
  total_time_spent: number;
  average_quiz_score?: number;
}

interface Pagination {
  current_page: number;
  total_pages: number;
  total_count: number;
  limit: number;
  has_next: boolean;
  has_prev: boolean;
}

const ROLE_DESCRIPTIONS = {
  admin: 'Vista Global del Sistema',
  'equipo_directivo': 'Reporte de Escuela',
  'lider_generacion': 'Reporte de Generación',
  'lider_comunidad': 'Reporte de Comunidad',
  consultor: 'Estudiantes Asignados'
};

export default function DetailedReports() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ProgressUser[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
  // Filter states
  const [filters, setFilters] = useState({
    search: '',
    school_id: 'all',
    generation_id: 'all',
    community_id: 'all',
    course_id: 'all',
    status: 'all',
    date_from: '',
    date_to: ''
  });

  // Table states
  const [sortBy, setSortBy] = useState('last_activity');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Modal states
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'overview' | 'detailed' | 'analytics'>('overview');

  useEffect(() => {
    initializeAuth();
    
    // Check for mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (user && hasReportingAccess(userRole)) {
      fetchDetailedProgress();
    }
  }, [user, userRole, filters, sortBy, sortOrder, currentPage, pageSize]);

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

        if (!hasReportingAccess(role)) {
          if (role === 'docente') {
            router.push('/profile');
            return;
          } else {
            toast.error('No tienes permisos para acceder a los reportes.');
            router.push('/dashboard');
            return;
          }
        }

        if (profileData.avatar_url) {
          setAvatarUrl(profileData.avatar_url);
        }
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      router.push('/login');
    }
  };

  const hasReportingAccess = (role: string) => {
    return ['admin', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'consultor'].includes(role);
  };

  const fetchDetailedProgress = async () => {
    try {
      setLoading(true);
      
      // Mock data for demonstration
      setTimeout(() => {
        const mockUsers: ProgressUser[] = [
          {
            user_id: '1',
            user_name: 'María González',
            user_email: 'maria@example.com',
            user_role: 'estudiante',
            school_name: 'Escuela Ejemplo',
            generation_name: 'Generación 2024',
            community_name: 'Comunidad Alpha',
            total_courses_enrolled: 3,
            completed_courses: 1,
            courses_in_progress: 2,
            total_lessons_completed: 15,
            completion_percentage: 65,
            total_time_spent_minutes: 720,
            average_quiz_score: 85,
            last_activity_date: '2024-06-01'
          },
          {
            user_id: '2',
            user_name: 'Carlos Rodríguez',
            user_email: 'carlos@example.com',
            user_role: 'estudiante',
            school_name: 'Escuela Ejemplo',
            generation_name: 'Generación 2024',
            community_name: 'Comunidad Beta',
            total_courses_enrolled: 2,
            completed_courses: 2,
            courses_in_progress: 0,
            total_lessons_completed: 24,
            completion_percentage: 100,
            total_time_spent_minutes: 960,
            average_quiz_score: 92,
            last_activity_date: '2024-06-02'
          }
        ];

        const mockSummary: Summary = {
          total_users: 50,
          active_users: 35,
          completed_users: 12,
          average_completion: 72,
          total_time_spent: 15000,
          average_quiz_score: 87
        };

        const mockPagination: Pagination = {
          current_page: 1,
          total_pages: 3,
          total_count: 50,
          limit: 20,
          has_next: true,
          has_prev: false
        };

        setUsers(mockUsers);
        setSummary(mockSummary);
        setPagination(mockPagination);
        setLoading(false);
      }, 1000);
      
    } catch (error) {
      console.error('Error fetching detailed progress:', error);
      toast.error('Error cargando datos de progreso');
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  const handleFiltersChange = (newFilters: any) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handleUserClick = (userId: string) => {
    setSelectedUserId(userId);
    setShowUserModal(true);
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Nunca';
    return new Date(dateString).toLocaleDateString('es-CL');
  };

  if (loading && users.length === 0) {
    return (
      <MainLayout 
        user={user} 
        currentPage="reports"
        pageTitle="Cargando..."
        isAdmin={isAdmin}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <LoadingSkeleton variant="text" width="w-1/3" height="h-8" className="mb-4" />
          <LoadingSkeleton variant="card" className="mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <LoadingSkeleton key={i} variant="card" />
            ))}
          </div>
          <LoadingSkeleton variant="table" count={5} />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout 
      user={user} 
      currentPage="reports"
      pageTitle="Reportes Detallados de Progreso"
      breadcrumbs={[{label: 'Reportes', href: '/reports'}, {label: 'Reportes Detallados'}]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Reportes Detallados de Progreso</h1>
                <p className="text-gray-600 mt-2">
                  {ROLE_DESCRIPTIONS[userRole as keyof typeof ROLE_DESCRIPTIONS] || 'Análisis detallado del progreso'}
                </p>
              </div>
            </div>
          </div>

          {/* Notice Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">
                  Sistema de Reportes Optimizado - En Desarrollo
                </h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>Esta página está optimizada con todas las mejoras de rendimiento y mobile. Los datos mostrados son de ejemplo hasta que se conecte con las APIs reales.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs Navigation */}
          <div className="mb-6">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'overview'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Resumen General
                </button>
                <button
                  onClick={() => setActiveTab('detailed')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'detailed'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Progreso Detallado
                </button>
                <button
                  onClick={() => setActiveTab('analytics')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'analytics'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Análisis Visual
                </button>
              </nav>
            </div>
          </div>

          {/* Filters - Show for Overview and Detailed tabs */}
          {(activeTab === 'overview' || activeTab === 'detailed') && (
            <AdvancedFilters
              filters={filters}
              onFiltersChange={handleFiltersChange}
              userRole={userRole}
              isAdmin={isAdmin}
            />
          )}

          {/* Tab Content */}
          {activeTab === 'overview' && summary && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-white p-4 rounded-lg shadow">
                <div className="text-2xl font-bold text-blue-600">{summary.total_users}</div>
                <div className="text-sm text-gray-600">Total Usuarios</div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <div className="text-2xl font-bold text-green-600">{summary.active_users}</div>
                <div className="text-sm text-gray-600">Activos</div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <div className="text-2xl font-bold text-purple-600">{summary.average_completion}%</div>
                <div className="text-sm text-gray-600">Progreso Promedio</div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <div className="text-2xl font-bold text-orange-600">{formatTime(summary.total_time_spent)}</div>
                <div className="text-sm text-gray-600">Tiempo Total</div>
              </div>
              {summary.average_quiz_score && (
                <div className="bg-white p-4 rounded-lg shadow">
                  <div className="text-2xl font-bold text-red-600">{summary.average_quiz_score}%</div>
                  <div className="text-sm text-gray-600">Quiz Promedio</div>
                </div>
              )}
            </div>
          )}

          {/* Analytics Dashboard Tab */}
          {activeTab === 'analytics' && user && (
            <AnalyticsDashboard
              userId={user.id}
              userRole={userRole}
              isAdmin={isAdmin}
              filters={{
                school_id: filters.school_id,
                generation_id: filters.generation_id,
                community_id: filters.community_id
              }}
            />
          )}

          {/* Progress Display - Show only for detailed tab */}
          {activeTab === 'detailed' && (
            <>
              {/* Mobile View */}
              {isMobile ? (
                <div className="space-y-4">
                  {users.map((userData) => (
                    <MobileUserCard
                      key={userData.user_id}
                      user={userData}
                      onUserClick={handleUserClick}
                      formatTime={formatTime}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              ) : (
                /* Desktop Table View */
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">Progreso Detallado</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Usuario
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Organización
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Progreso
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Cursos
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Tiempo
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Quiz
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Última Actividad
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Acciones
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {users.map((userData) => (
                          <tr key={userData.user_id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div>
                                <div className="text-sm font-medium text-gray-900">{userData.user_name}</div>
                                <div className="text-sm text-gray-500">{userData.user_email}</div>
                                <div className="text-xs text-gray-400">{userData.user_role}</div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {userData.school_name && (
                                  <div>🏫 {userData.school_name}</div>
                                )}
                                {userData.generation_name && (
                                  <div>📚 {userData.generation_name}</div>
                                )}
                                {userData.community_name && (
                                  <div>👥 {userData.community_name}</div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                                  <div 
                                    className="bg-blue-600 h-2 rounded-full" 
                                    style={{ width: `${Math.min(100, userData.completion_percentage)}%` }}
                                  ></div>
                                </div>
                                <span className="text-sm text-gray-900">{userData.completion_percentage}%</span>
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {userData.total_lessons_completed} lecciones
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {userData.total_courses_enrolled} inscritos
                              </div>
                              <div className="text-xs text-gray-500">
                                {userData.completed_courses} completados • {userData.courses_in_progress} en progreso
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatTime(userData.total_time_spent_minutes)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {userData.average_quiz_score ? `${userData.average_quiz_score}%` : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatDate(userData.last_activity_date)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button
                                onClick={() => handleUserClick(userData.user_id)}
                                className="text-blue-600 hover:text-blue-900"
                              >
                                Ver Detalles
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      {/* User Detail Modal */}
      <UserDetailModal
        isOpen={showUserModal}
        onClose={() => {
          setShowUserModal(false);
          setSelectedUserId(null);
        }}
        userId={selectedUserId}
        requestingUserId={user?.id}
      />
    </MainLayout>
  );
}