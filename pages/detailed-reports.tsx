import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import MainLayout from '../components/layout/MainLayout';
import AdvancedFilters from '../components/reports/AdvancedFilters';
import UserDetailModal from '../components/reports/UserDetailModal';
import AnalyticsDashboard from '../components/reports/AnalyticsDashboard';
import LoadingSkeleton from '../components/common/LoadingSkeleton';
import MobileUserCard from '../components/reports/MobileUserCard';
import { ResponsiveFunctionalPageHeader } from '../components/layout/FunctionalPageHeader';
import { FileText, Users, Activity, TrendingUp, Clock, Target, Building2, BookOpen, Trophy, AlertTriangle, Check } from 'lucide-react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { getReportScopeDescription } from '../utils/reportFilters';
import { getUserRoles, getHighestRole } from '../utils/roleUtils';
import useDebounce from '../hooks/useDebounce';

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
  activity_score?: number;
  engagement_quality?: 'high' | 'medium' | 'low' | 'passive';
  score_breakdown?: {
    lessons: number;
    time: number;
    recency: number;
    courses: number;
  };
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
  is_smart_default?: boolean;
}

// Role descriptions are now handled by getReportScopeDescription function

export default function DetailedReports() {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ProgressUser[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
  // Search state  
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 500);
  
  // Filter states
  const [filters, setFilters] = useState({
    search: '',
    school_id: 'all',
    generation_id: 'all',
    community_id: 'all',
    status: 'all',
    date_from: '',
    date_to: ''
  });

  // Table states
  // Default sort by activity_score to show most engaged users first
  const [sortBy, setSortBy] = useState('activity_score');
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

  // Sync debounced search with filters
  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      setFilters(prevFilters => ({ ...prevFilters, search: debouncedSearch }));
      setCurrentPage(1); // Reset to first page when searching
    }
  }, [debouncedSearch]);

  useEffect(() => {
    if (userProfile && hasReportingAccess(userRole)) {
      fetchDetailedProgress();
    }
  }, [userProfile, userRole, filters, sortBy, sortOrder, currentPage, pageSize]);

  const initializeAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      // Get user roles with dev impersonation support
      const userRoles = await getUserRoles(supabase, session.user.id);
      const highestRole = getHighestRole(userRoles);
      
      // Also get profile data for legacy support and avatar
      const { data: profileData } = await supabase
        .from('profiles')
        .select('first_name, last_name, avatar_url, school_id, generation_id, community_id')
        .eq('id', session.user.id)
        .single();

      if (highestRole) {
        // Use highest role from new system
        const effectiveRole = highestRole || '';
        setUserRole(effectiveRole);
        setIsAdmin(effectiveRole === 'admin');

        // Immediately redirect docentes without showing any UI
        if (effectiveRole === 'docente') {
          router.push('/dashboard');
          return;
        }

        if (!hasReportingAccess(effectiveRole)) {
          toast.error('No tienes permisos para acceder a los reportes.');
          router.push('/dashboard');
          return;
        }

        if (profileData?.avatar_url) {
          setAvatarUrl(profileData.avatar_url);
        }

        // Get organizational context from user roles if available
        const activeRole = userRoles.find(r => r.role_type === effectiveRole) || null;
        
        // Store full profile for role-based filtering
        setUserProfile({
          id: session.user.id,
          role: effectiveRole,
          school_id: activeRole?.school_id || profileData?.school_id,
          generation_id: activeRole?.generation_id || profileData?.generation_id,
          community_id: activeRole?.community_id || profileData?.community_id
        });
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      router.push('/login');
    }
  };

  // Auto-populate filters based on user organizational scope
  useEffect(() => {
    if (!userProfile) return;

    const isAdmin = userProfile.role === 'admin' || userProfile.role === 'consultor';

    setFilters(prev => ({
      ...prev,
      school_id: isAdmin ? 'all' : (userProfile.school_id || 'all'),
      generation_id: isAdmin ? 'all' : (userProfile.generation_id || prev.generation_id),
      community_id: isAdmin ? 'all' : (userProfile.community_id || prev.community_id)
    }));
  }, [userProfile]);

  const hasReportingAccess = (role: string) => {
    return ['admin', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'consultor', 'supervisor_de_red'].includes(role);
  };

  const fetchDetailedProgress = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/reports/detailed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filters,
          sort: { field: sortBy, order: sortOrder },
          pagination: { page: currentPage, limit: pageSize },
          useSmartDefaults: currentPage === 1 && sortBy === 'activity_score' && sortOrder === 'desc', // Use smart defaults for initial load
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch report data');
      }

      const { users, summary, pagination } = await response.json();
      
      setUsers(users);
      setSummary(summary);
      setPagination(pagination);

    } catch (error: any) {
      console.error('Error fetching detailed progress:', error);
      toast.error(`Failed to load report: ${error.message}`);
      setUsers([]);
      setSummary(null);
      setPagination(null);
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
    
    // Sync search field when filters are cleared
    if (newFilters.search !== filters.search) {
      setSearchQuery(newFilters.search);
    }
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

  // Filter users based on search query
  const filterUsersBySearch = (usersList: ProgressUser[]): ProgressUser[] => {
    if (!searchQuery.trim()) return usersList;
    
    const query = searchQuery.toLowerCase();
    return usersList.filter(user => {
      return (
        user.user_name.toLowerCase().includes(query) ||
        user.user_email.toLowerCase().includes(query) ||
        user.user_role.toLowerCase().includes(query) ||
        (user.school_name && user.school_name.toLowerCase().includes(query)) ||
        (user.generation_name && user.generation_name.toLowerCase().includes(query)) ||
        (user.community_name && user.community_name.toLowerCase().includes(query))
      );
    });
  };

  if (loading && users.length === 0) {
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
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      userRole={userRole}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<FileText />}
        title="Reportes Detallados de Progreso"
        subtitle={getReportScopeDescription(userRole)}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Buscar usuarios, escuelas, comunidades..."
      />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Smart Default Indicator */}
          {pagination?.is_smart_default && userRole === 'admin' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-brand_accent" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-amber-800">
                    Vista Inteligente: Top 10 Usuarios Más Activos
                  </h3>
                  <div className="mt-2 text-sm text-amber-700">
                    <p>Mostrando los usuarios con mayor actividad basado en lecciones completadas, tiempo dedicado y participación reciente.</p>
                  </div>
                </div>
                <div className="ml-auto flex-shrink-0">
                  <button
                    onClick={() => {
                      setSortBy('last_activity_date');
                      setSortOrder('desc');
                      setCurrentPage(1);
                      setPageSize(20);
                    }}
                    className="text-xs text-amber-600 hover:text-amber-800 underline"
                  >
                    Ver todos los usuarios
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Role-based Access Notice */}
          {userRole && userRole !== 'admin' && (
            <div className="bg-brand_beige border border-brand_primary/20 rounded-lg p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-brand_primary/60" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-brand_primary">
                    Datos Filtrados por Rol
                  </h3>
                  <div className="mt-2 text-sm text-brand_primary/80">
                    <p>Como <strong>{userRole === 'consultor' ? 'Consultor' :
                                    userRole === 'equipo_directivo' ? 'Equipo Directivo' :
                                    userRole === 'lider_generacion' ? 'Líder de Generación' :
                                    userRole === 'lider_comunidad' ? 'Líder de Comunidad' : userRole}</strong>,
                       solo puedes ver datos de {getReportScopeDescription(userRole).toLowerCase()}.</p>
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* Tabs Navigation */}
          <div className="mb-6">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'overview'
                      ? 'border-brand_primary text-brand_primary'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Resumen General
                </button>
                <button
                  onClick={() => setActiveTab('detailed')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'detailed'
                      ? 'border-brand_primary text-brand_primary'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Progreso Detallado
                </button>
                {/* Análisis Visual tab - Hidden until operational
                <button
                  onClick={() => setActiveTab('analytics')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'analytics'
                      ? 'border-brand_primary text-brand_primary'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Análisis Visual
                </button>
                */}
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
              userProfile={userProfile}
            />
          )}

          {/* Tab Content */}
          {activeTab === 'overview' && summary && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {/* Total Users Card */}
              <div className="bg-gradient-to-br from-brand_primary/5 to-brand_primary/10 p-6 rounded-xl shadow-sm border border-brand_primary/20 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-3xl font-bold text-brand_primary">{summary.total_users}</div>
                    <div className="text-sm font-medium text-brand_primary/80 mt-1">Total Usuarios</div>
                  </div>
                  <div className="w-12 h-12 bg-brand_primary/20 rounded-full flex items-center justify-center">
                    <Users className="h-6 w-6 text-brand_primary" />
                  </div>
                </div>
                <div className="mt-3 text-xs text-brand_primary/60">
                  Usuarios en el sistema
                </div>
              </div>

              {/* Active Users Card */}
              <div className="bg-gradient-to-br from-brand_accent/10 to-brand_accent/20 p-6 rounded-xl shadow-sm border border-brand_accent/30 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-3xl font-bold text-amber-800">{summary.active_users}</div>
                    <div className="text-sm font-medium text-amber-700 mt-1">Usuarios Activos</div>
                  </div>
                  <div className="w-12 h-12 bg-brand_accent/30 rounded-full flex items-center justify-center">
                    <Activity className="h-6 w-6 text-amber-700" />
                  </div>
                </div>
                <div className="mt-3 text-xs text-amber-700">
                  Activos últimos 30 días
                </div>
              </div>

              {/* Average Progress Card */}
              <div className="bg-gradient-to-br from-brand_accent/10 to-brand_accent/20 p-6 rounded-xl shadow-sm border border-brand_accent/30 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-3xl font-bold text-amber-800">{summary.average_completion}%</div>
                    <div className="text-sm font-medium text-amber-700 mt-1">Progreso Promedio</div>
                  </div>
                  <div className="w-12 h-12 bg-brand_accent/30 rounded-full flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-amber-700" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="w-full bg-brand_accent/30 rounded-full h-2">
                    <div
                      className="bg-brand_accent h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, summary.average_completion)}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Total Time Card */}
              <div className="bg-gradient-to-br from-brand_accent/15 to-brand_accent/25 p-6 rounded-xl shadow-sm border border-brand_accent/40 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-3xl font-bold text-amber-800">{formatTime(summary.total_time_spent)}</div>
                    <div className="text-sm font-medium text-amber-700 mt-1">Tiempo Total</div>
                  </div>
                  <div className="w-12 h-12 bg-brand_accent/40 rounded-full flex items-center justify-center">
                    <Clock className="h-6 w-6 text-amber-700" />
                  </div>
                </div>
                <div className="mt-3 text-xs text-amber-700">
                  Tiempo de estudio acumulado
                </div>
              </div>

              {/* Quiz Score Card - Only show if data exists */}
              {summary.average_quiz_score && (
                <div className="bg-gradient-to-br from-brand_primary/5 to-brand_primary/10 p-6 rounded-xl shadow-sm border border-brand_primary/20 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-3xl font-bold text-brand_primary">{summary.average_quiz_score}%</div>
                      <div className="text-sm font-medium text-brand_primary/80 mt-1">Quiz Promedio</div>
                    </div>
                    <div className="w-12 h-12 bg-brand_primary/20 rounded-full flex items-center justify-center">
                      <Target className="h-6 w-6 text-brand_primary" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="w-full bg-brand_primary/20 rounded-full h-2">
                      <div
                        className="bg-brand_primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, summary.average_quiz_score)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Top Users Table in Overview */}
            {users.length > 0 && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {pagination?.is_smart_default ? 'Top 10 Usuarios Más Activos' : 'Usuarios'}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Escuela</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progreso</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Puntaje</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lecciones</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tiempo</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {users.slice(0, 10).map((userData) => (
                        <tr key={userData.user_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{userData.user_name}</div>
                            <div className="text-sm text-gray-500">{userData.user_email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {userData.school_name || 'Sin escuela'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                                <div
                                  className="bg-brand_primary h-2 rounded-full"
                                  style={{ width: `${Math.min(100, userData.completion_percentage)}%` }}
                                ></div>
                              </div>
                              <span className="text-sm text-gray-900">{userData.completion_percentage}%</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                            {userData.activity_score || 0}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {userData.total_lessons_completed}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatTime(userData.total_time_spent_minutes)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {users.length > 10 && (
                  <div className="px-6 py-3 bg-gray-50 text-center">
                    <button
                      onClick={() => setActiveTab('detailed')}
                      className="text-sm text-brand_primary hover:text-brand_accent font-medium transition-colors"
                    >
                      Ver todos los usuarios →
                    </button>
                  </div>
                )}
              </div>
            )}
            </>
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
                  {filterUsersBySearch(users).map((userData) => (
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
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                              onClick={() => handleSort('completion_percentage')}>
                            Progreso
                            {sortBy === 'completion_percentage' && (
                              <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                              onClick={() => handleSort('activity_score')}>
                            Puntaje de Actividad
                            {sortBy === 'activity_score' && (
                              <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                            )}
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
                        {filterUsersBySearch(users).map((userData) => (
                          <tr key={userData.user_id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div>
                                <div className="text-sm font-medium text-gray-900">{userData.user_name}</div>
                                <div className="text-sm text-gray-500">{userData.user_email}</div>
                                <div className="text-xs text-gray-400">{userData.user_role}</div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900 space-y-1">
                                {userData.school_name && (
                                  <div className="flex items-center gap-1.5">
                                    <Building2 className="h-3.5 w-3.5 text-gray-400" />
                                    <span>{userData.school_name}</span>
                                  </div>
                                )}
                                {userData.generation_name && (
                                  <div className="flex items-center gap-1.5">
                                    <BookOpen className="h-3.5 w-3.5 text-gray-400" />
                                    <span>{userData.generation_name}</span>
                                  </div>
                                )}
                                {userData.community_name && (
                                  <div className="flex items-center gap-1.5">
                                    <Users className="h-3.5 w-3.5 text-gray-400" />
                                    <span>{userData.community_name}</span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                                  <div
                                    className="bg-brand_primary h-2 rounded-full"
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
                              <div className="flex items-center space-x-2">
                                <div className="text-sm font-semibold text-gray-900">
                                  {userData.activity_score || 0}
                                </div>
                                {/* Quality indicator */}
                                {userData.engagement_quality === 'passive' && (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800"
                                    title="Alto tiempo registrado sin lecciones completadas"
                                  >
                                    <AlertTriangle className="h-3 w-3" />
                                    Revisar
                                  </span>
                                )}
                                {userData.engagement_quality === 'high' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                                    <Check className="h-3 w-3" />
                                    Activo
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {userData.total_lessons_completed || 0} lecciones • {Math.round((userData.total_time_spent_minutes || 0) / 60)}h
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
                                className="text-brand_primary hover:text-brand_accent transition-colors"
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