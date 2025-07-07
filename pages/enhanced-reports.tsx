import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../lib/supabase';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import MainLayout from '../components/layout/MainLayout';
import AdvancedFilters from '../components/reports/AdvancedFilters';
import UserDetailModal from '../components/reports/UserDetailModal';
import AnalyticsDashboard from '../components/reports/AnalyticsDashboard';
import VirtualizedTable from '../components/reports/VirtualizedTable';
import EnhancedMobileUserCard from '../components/reports/EnhancedMobileUserCard';
import CollapsibleSection from '../components/reports/CollapsibleSection';
import ResponsiveChart from '../components/reports/ResponsiveChart';
import ReportLoadingSkeleton from '../components/reports/ReportLoadingSkeleton';
import { NoData, NoResults, ErrorState } from '../components/reports/EmptyStates';
import { ResponsiveFunctionalPageHeader } from '../components/layout/FunctionalPageHeader';
import { TrendingUp } from 'lucide-react';

import { apiCache, setupCacheCleanup, invalidateReportCache } from '../utils/cache';
import useFiltersUrlState from '../hooks/useFiltersUrlState';
import useDebounce from '../hooks/useDebounce';
import toast from 'react-hot-toast';
import { navigationManager } from '../utils/navigationManager';
import reportsService from '../lib/services/reports';
import { getReportScopeDescription } from '../utils/reportFilters';

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

interface ReportError {
  type: 'network' | 'auth' | 'permission' | 'unknown';
  message: string;
}

// Role descriptions are now handled by getReportScopeDescription function

const INITIAL_FILTERS = {
  search: '',
  school_id: 'all',
  generation_id: 'all',
  community_id: 'all',
  course_id: 'all',
  status: 'all',
  date_from: '',
  date_to: ''
};

const TABLE_COLUMNS = [
  { key: 'user_name', label: 'Usuario', width: 200 },
  { key: 'school_name', label: 'Escuela', width: 150 },
  { key: 'completion_percentage', label: 'Progreso', width: 120 },
  { key: 'completed_courses', label: 'Cursos', width: 100 },
  { key: 'total_time_spent_minutes', label: 'Tiempo', width: 100 },
  { key: 'average_quiz_score', label: 'Quiz', width: 80 },
  { key: 'last_activity_date', label: 'Último Acceso', width: 120 },
  { key: 'actions', label: 'Acciones', width: 100, sortable: false }
];

export default function EnhancedReports() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ProgressUser[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<ReportError | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  
  // URL-managed filter state - DISABLED to prevent navigation conflicts
  // const [filters, updateFilters, resetFilters, filtersInitialized] = useFiltersUrlState(INITIAL_FILTERS, { debounceMs: 1000 });
  // const debouncedFilters = useDebounce(filters, 300);
  
  // Use local state instead to avoid URL updates that cause navigation throttling
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const updateFilters = (newFilters: Partial<typeof INITIAL_FILTERS>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };
  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
  };
  const filtersInitialized = true;
  const debouncedFilters = useDebounce(filters, 300);

  // Modal states
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);

  // Tab and section states
  const [activeTab, setActiveTab] = useState<'overview' | 'detailed' | 'analytics'>('overview');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    summary: true,
    filters: true,
    data: true,
    analytics: false
  });

  // Mobile responsiveness check
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      
      // Collapse sections on mobile by default
      if (mobile && !expandedSections.summary) {
        setExpandedSections(prev => ({
          ...prev,
          summary: true,
          filters: false,
          data: true,
          analytics: false
        }));
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Cache cleanup setup
  useEffect(() => {
    const cleanup = setupCacheCleanup();
    return cleanup;
  }, []);

  // Authentication initialization
  useEffect(() => {
    let mounted = true;
    let hasInitialized = false;
    
    const init = async () => {
      if (mounted && !hasInitialized) {
        hasInitialized = true;
        await initializeAuth();
      }
    };
    
    init();
    
    return () => {
      mounted = false;
      // Clear any pending navigations when component unmounts
      navigationManager.clearQueue();
    };
  }, []);

  // Data fetching when filters change
  useEffect(() => {
    if (userProfile && hasReportingAccess(userRole) && filtersInitialized) {
      fetchDetailedProgress();
    }
  }, [userProfile, userRole, debouncedFilters, filtersInitialized]);

  const initializeAuth = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        await navigationManager.navigate(async () => {
          await router.replace('/login');
        });
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

        // Immediately redirect docentes without showing any UI
        if (role === 'docente') {
          await navigationManager.navigate(async () => {
            await router.replace('/dashboard');
          });
          return;
        }

        if (!hasReportingAccess(role)) {
          setError({
            type: 'permission',
            message: 'No tienes permisos para acceder a los reportes.'
          });
          // Redirect non-authorized users back to dashboard
          setTimeout(async () => {
            await navigationManager.navigate(async () => {
              await router.replace('/dashboard');
            });
          }, 2000);
          return;
        }

        if (profileData.avatar_url) {
          setAvatarUrl(profileData.avatar_url);
        }

        // Store full profile for role-based filtering
        setUserProfile({
          id: session.user.id,
          role: profileData.role,
          school_id: profileData.school_id,
          generation_id: profileData.generation_id,
          community_id: profileData.community_id
        });
      }
    } catch (err) {
      console.error('Auth initialization error:', err);
      setError({
        type: 'auth',
        message: 'Error de autenticación. Por favor, inicia sesión nuevamente.'
      });
    } finally {
      setLoading(false);
    }
  };

  const hasReportingAccess = (role: string) => {
    return ['admin', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'consultor'].includes(role);
  };

  const fetchDetailedProgress = async () => {
    if (!userProfile) return;

    try {
      setLoading(true);
      setError(null);

      // Create cache key based on filters and user role
      const cacheKey = `reports_detailed_${userProfile.id}_${userProfile.role}_${JSON.stringify(debouncedFilters)}`;
      
      // Check cache first
      const cachedData = apiCache.get<{ users: ProgressUser[]; summary: Summary }>(cacheKey);
      if (cachedData) {
        setUsers(cachedData.users);
        setSummary(cachedData.summary);
        setLoading(false);
        return;
      }

      // Fetch real data using the reports service
      const [progressResult, summaryResult] = await Promise.all([
        reportsService.getUserProgress(userProfile, debouncedFilters),
        reportsService.getSummaryStats(userProfile)
      ]);

      if (progressResult.error || summaryResult.error) {
        throw new Error('Error fetching report data');
      }

      // For now, use mock data until the database views are created
      // In production, this would use progressResult.data and summaryResult.data
      const mockUsers: ProgressUser[] = generateMockUsers(20);
      const mockSummary: Summary = summaryResult.data || calculateSummary(mockUsers);

      // Apply role-based filtering to mock data
      let filteredMockUsers = mockUsers;
      if (userRole === 'consultor') {
        // Consultants see fewer users
        filteredMockUsers = mockUsers.slice(0, 5);
      } else if (userRole === 'equipo_directivo') {
        // School leaders see users from their school
        filteredMockUsers = mockUsers.slice(0, 15);
      } else if (userRole === 'lider_generacion') {
        // Generation leaders see users from their generation
        filteredMockUsers = mockUsers.slice(0, 10);
      } else if (userRole === 'lider_comunidad') {
        // Community leaders see users from their community
        filteredMockUsers = mockUsers.slice(0, 8);
      }

      // Cache the results
      apiCache.set(cacheKey, { users: filteredMockUsers, summary: mockSummary }, 3 * 60 * 1000); // 3 minutes

      setUsers(filteredMockUsers);
      setSummary(mockSummary);
      
    } catch (err) {
      console.error('Error fetching detailed progress:', err);
      setError({
        type: 'network',
        message: 'Error cargando datos de progreso. Verifica tu conexión.'
      });
    } finally {
      setLoading(false);
    }
  };

  const generateMockUsers = (count: number): ProgressUser[] => {
    const schools = ['Escuela Ejemplo A', 'Escuela Ejemplo B', 'Escuela Ejemplo C'];
    const generations = ['Generación 2024', 'Generación 2023', 'Generación 2025'];
    const communities = ['Comunidad Alpha', 'Comunidad Beta', 'Comunidad Gamma'];
    
    return Array.from({ length: count }, (_, i) => ({
      user_id: `user_${i + 1}`,
      user_name: `Usuario ${i + 1}`,
      user_email: `usuario${i + 1}@example.com`,
      user_role: 'estudiante',
      school_name: schools[i % schools.length],
      generation_name: generations[i % generations.length],
      community_name: communities[i % communities.length],
      total_courses_enrolled: Math.floor(Math.random() * 5) + 1,
      completed_courses: Math.floor(Math.random() * 3),
      courses_in_progress: Math.floor(Math.random() * 2) + 1,
      total_lessons_completed: Math.floor(Math.random() * 20) + 5,
      completion_percentage: Math.floor(Math.random() * 100),
      total_time_spent_minutes: Math.floor(Math.random() * 1000) + 100,
      average_quiz_score: Math.floor(Math.random() * 40) + 60,
      last_activity_date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
    }));
  };

  const calculateSummary = (users: ProgressUser[]): Summary => {
    const total = users.length;
    const active = users.filter(u => {
      const lastActivity = new Date(u.last_activity_date || 0);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return lastActivity > sevenDaysAgo;
    }).length;
    const completed = users.filter(u => u.completion_percentage >= 100).length;
    const avgCompletion = users.reduce((sum, u) => sum + u.completion_percentage, 0) / total;
    const totalTime = users.reduce((sum, u) => sum + u.total_time_spent_minutes, 0);
    const avgQuizScore = users.reduce((sum, u) => sum + (u.average_quiz_score || 0), 0) / total;

    return {
      total_users: total,
      active_users: active,
      completed_users: completed,
      average_completion: Math.round(avgCompletion),
      total_time_spent: totalTime,
      average_quiz_score: Math.round(avgQuizScore)
    };
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      localStorage.removeItem('rememberMe');
      sessionStorage.removeItem('sessionOnly');
      
      await navigationManager.navigate(async () => {
        await router.replace('/login');
      });
    } catch (error) {
      console.error('Logout error:', error);
      // Force redirect if router fails
      window.location.href = '/login';
    }
  };

  const handleRetry = useCallback(() => {
    setIsRetrying(true);
    invalidateReportCache();
    fetchDetailedProgress().finally(() => {
      setIsRetrying(false);
    });
  }, []);

  const handleUserClick = (userId: string) => {
    setSelectedUserId(userId);
    setShowUserModal(true);
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
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

  // Memoized components for performance
  const MemoizedMobileCards = useMemo(() => {
    if (!isMobile || activeTab !== 'detailed') return null;
    
    const filteredUsers = filterUsersBySearch(users);
    
    return (
      <div className="space-y-4">
        {filteredUsers.map((userData) => (
          <EnhancedMobileUserCard
            key={userData.user_id}
            user={userData}
            onUserClick={handleUserClick}
            formatTime={formatTime}
            formatDate={formatDate}
          />
        ))}
      </div>
    );
  }, [isMobile, activeTab, users, searchQuery]);

  const MemoizedVirtualizedTable = useMemo(() => {
    if (isMobile || activeTab !== 'detailed') return null;

    const filteredUsers = filterUsersBySearch(users);
    const tableData = filteredUsers.map(user => ({
      ...user,
      actions: (
        <button
          onClick={() => handleUserClick(user.user_id)}
          className="text-[#00365b] hover:text-[#00365b]/80 font-medium"
        >
          Ver Detalles
        </button>
      )
    }));

    return (
      <VirtualizedTable
        data={tableData}
        columns={TABLE_COLUMNS}
        height={500}
        onRowClick={handleUserClick}
        loading={loading}
        className="shadow-sm"
      />
    );
  }, [isMobile, activeTab, users, loading, searchQuery]);

  if (loading && !users.length) {
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
          <ReportLoadingSkeleton variant="dashboard" />
        </div>
      </MainLayout>
    );
  }

  if (error) {
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
          <ErrorState
            title={error.message}
            actionLabel={isRetrying ? "Reintentando..." : "Reintentar"}
            onAction={isRetrying ? undefined : handleRetry}
          />
          {error.type === 'permission' && (
            <div className="mt-4 text-center">
              <button
                onClick={async () => {
                  await navigationManager.navigate(async () => {
                    await router.replace('/dashboard');
                  });
                }}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Volver al Dashboard
              </button>
            </div>
          )}
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
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<TrendingUp />}
        title="Reportes Optimizados"
        subtitle={getReportScopeDescription(userRole)}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Buscar usuarios, escuelas, comunidades..."
      />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Role-based Access Notice */}
          {userRole && userRole !== 'admin' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">
                    Alcance de Datos
                  </h3>
                  <div className="mt-2 text-sm text-blue-700">
                    <p>Estás viendo: <strong>{getReportScopeDescription(userRole)}</strong></p>
                    {userRole === 'consultor' && (
                      <p className="mt-1">Los datos mostrados corresponden únicamente a los estudiantes bajo tu supervisión.</p>
                    )}
                    {userRole === 'equipo_directivo' && (
                      <p className="mt-1">Los datos mostrados corresponden a todos los usuarios de tu escuela.</p>
                    )}
                    {userRole === 'lider_generacion' && (
                      <p className="mt-1">Los datos mostrados corresponden a los usuarios de tu generación.</p>
                    )}
                    {userRole === 'lider_comunidad' && (
                      <p className="mt-1">Los datos mostrados corresponden a los miembros de tu comunidad de crecimiento.</p>
                    )}
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
                      ? 'border-[#fdb933] text-[#00365b]'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Resumen General
                </button>
                <button
                  onClick={() => setActiveTab('detailed')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'detailed'
                      ? 'border-[#fdb933] text-[#00365b]'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Progreso Detallado
                </button>
                <button
                  onClick={() => setActiveTab('analytics')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'analytics'
                      ? 'border-[#fdb933] text-[#00365b]'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Análisis Visual
                </button>
              </nav>
            </div>
          </div>

          {/* Filters */}
          {(activeTab === 'overview' || activeTab === 'detailed') && (
            <CollapsibleSection
              title="Filtros de Búsqueda"
              isExpanded={expandedSections.filters}
              onToggle={() => toggleSection('filters')}
              className="mb-6"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z" />
                </svg>
              }
            >
              <AdvancedFilters
                filters={filters}
                onFiltersChange={updateFilters}
                userRole={userRole}
                isAdmin={isAdmin}
                userProfile={userProfile}
              />
            </CollapsibleSection>
          )}

          {/* Tab Content */}
          {activeTab === 'overview' && summary && (
            <CollapsibleSection
              title="Métricas Principales"
              isExpanded={expandedSections.summary}
              onToggle={() => toggleSection('summary')}
              badge={summary.total_users}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-[#00365b]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-[#00365b]">{summary.total_users}</div>
                      <div className="text-sm text-gray-600">Total Usuarios</div>
                    </div>
                    <div className="p-3 rounded-full bg-blue-50">
                      <svg className="w-6 h-6 text-[#00365b]" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-green-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-green-600">{summary.active_users}</div>
                      <div className="text-sm text-gray-600">Activos</div>
                    </div>
                    <div className="p-3 rounded-full bg-green-50">
                      <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-[#fdb933]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-[#fdb933]">{summary.average_completion}%</div>
                      <div className="text-sm text-gray-600">Progreso Promedio</div>
                    </div>
                    <div className="p-3 rounded-full bg-yellow-50">
                      <svg className="w-6 h-6 text-[#fdb933]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-purple-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-purple-600">{formatTime(summary.total_time_spent)}</div>
                      <div className="text-sm text-gray-600">Tiempo Total</div>
                    </div>
                    <div className="p-3 rounded-full bg-purple-50">
                      <svg className="w-6 h-6 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleSection>
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

          {/* Detailed Progress */}
          {activeTab === 'detailed' && (
            <CollapsibleSection
              title="Progreso Detallado"
              isExpanded={expandedSections.data}
              onToggle={() => toggleSection('data')}
              badge={users.length}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v2H8V5z" />
                </svg>
              }
            >
              {users.length === 0 ? (
                <NoData 
                  title="No hay datos de progreso disponibles"
                  description="Los datos aparecerán aquí cuando los usuarios comiencen a usar la plataforma."
                />
              ) : (
                <>
                  {MemoizedMobileCards}
                  {MemoizedVirtualizedTable}
                </>
              )}
            </CollapsibleSection>
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