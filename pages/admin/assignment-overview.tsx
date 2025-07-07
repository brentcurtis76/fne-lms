import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

import MainLayout from '../../components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { groupAssignmentsV2Service } from '../../lib/services/groupAssignmentsV2';
import {
  getAvailableSchools,
  getAvailableCommunitiesForSchool,
  getAvailableGenerationsForSchool,
  updateFilterDependencies,
  getActiveFilterCount,
  clearAllFilters
} from '../../utils/assignmentFilters';
import { ClipboardList, School, Users, Calendar, ChevronDown, X, Loader2 } from 'lucide-react';

interface Assignment {
  id: string;
  lesson_id: string;
  lesson_title: string;
  course_id: string;
  course_title: string;
  title: string;
  description: string;
  instructions: string;
  resources: any[];
  created_at: string;
  groups_count: number;
  students_count: number;
  submitted_count: number;
  submission_rate: number;
  community: {
    id: string;
    name: string;
    school_id: string;
    generation_id: string;
    school: { id: string; name: string };
    generation?: { id: string; name: string };
  } | null;
}

interface FilterState {
  school_id: string | null;
  community_id: string | null;
  generation_id: string | null;
}

export default function AssignmentOverview() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  
  // Assignment data
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [totalAssignments, setTotalAssignments] = useState(0);
  const [currentOffset, setCurrentOffset] = useState(0);
  const limit = 50;
  
  // Filter states
  const [filters, setFilters] = useState<FilterState>({
    school_id: null,
    community_id: null,
    generation_id: null
  });
  
  // Available options for filters
  const [schools, setSchools] = useState<any[]>([]);
  const [communities, setCommunities] = useState<any[]>([]);
  const [generations, setGenerations] = useState<any[]>([]);
  
  // Loading states for dependent dropdowns
  const [loadingCommunities, setLoadingCommunities] = useState(false);
  const [loadingGenerations, setLoadingGenerations] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user && profileData) {
      loadInitialData();
    }
  }, [user, profileData]);

  useEffect(() => {
    if (user && profileData) {
      loadAssignments(true); // Reset when filters change
    }
  }, [filters, user, profileData]);

  useEffect(() => {
    if (filters.school_id) {
      loadCommunitiesForSchool();
      loadGenerationsForSchool();
    } else {
      setCommunities([]);
      setGenerations([]);
    }
  }, [filters.school_id]);

  const checkAuth = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push('/login');
        return;
      }

      setUser(authUser);

      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (profileError) throw profileError;

      // Check if user is admin or consultant
      if (profile.role !== 'admin' && profile.role !== 'consultor') {
        toast.error('No tienes permisos para acceder a esta página');
        router.push('/dashboard');
        return;
      }

      setProfileData(profile);

      // Get avatar URL
      if (profile.avatar_path) {
        const { data } = supabase.storage
          .from('avatars')
          .getPublicUrl(profile.avatar_path);
        setAvatarUrl(data.publicUrl);
      }
    } catch (error) {
      console.error('Error checking auth:', error);
      router.push('/login');
    }
  };

  const loadInitialData = async () => {
    try {
      // Load available schools
      const availableSchools = await getAvailableSchools(user.id, profileData.role);
      setSchools(availableSchools);
      
      // Load assignments
      await loadAssignments(true);
    } catch (error) {
      console.error('Error loading initial data:', error);
      toast.error('Error al cargar los datos');
    }
  };

  const loadAssignments = async (reset = false) => {
    if (!user || !profileData) return;
    
    try {
      if (reset) {
        setLoading(true);
        setCurrentOffset(0);
        setAssignments([]);
      } else {
        setLoadingMore(true);
      }

      const offset = reset ? 0 : currentOffset;
      
      // Create a clean filters object with only non-null values
      const cleanFilters: any = {};
      if (filters.school_id) cleanFilters.school_id = filters.school_id;
      if (filters.community_id) cleanFilters.community_id = filters.community_id;
      if (filters.generation_id) cleanFilters.generation_id = filters.generation_id;
      
      const { assignments: newAssignments, total, error } = await groupAssignmentsV2Service.getAllAssignmentsForAdmin(
        user.id,
        cleanFilters,
        limit,
        offset
      );

      if (error) {
        console.error('Error loading assignments:', error);
        throw error;
      }

      if (reset) {
        setAssignments(newAssignments || []);
      } else {
        setAssignments(prev => [...prev, ...(newAssignments || [])]);
      }
      
      setTotalAssignments(total || 0);
      setCurrentOffset(offset + (newAssignments?.length || 0));
    } catch (error) {
      console.error('Error loading assignments:', error);
      toast.error('Error al cargar las tareas');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadCommunitiesForSchool = async () => {
    if (!filters.school_id || !user || !profileData) return;

    try {
      setLoadingCommunities(true);
      const availableCommunities = await getAvailableCommunitiesForSchool(
        user.id,
        profileData.role,
        filters.school_id
      );
      setCommunities(availableCommunities);
    } catch (error) {
      console.error('Error loading communities:', error);
    } finally {
      setLoadingCommunities(false);
    }
  };

  const loadGenerationsForSchool = async () => {
    if (!filters.school_id || !user || !profileData) return;

    try {
      setLoadingGenerations(true);
      const availableGenerations = await getAvailableGenerationsForSchool(
        user.id,
        profileData.role,
        filters.school_id
      );
      setGenerations(availableGenerations);
    } catch (error) {
      console.error('Error loading generations:', error);
    } finally {
      setLoadingGenerations(false);
    }
  };

  const handleFilterChange = async (field: keyof FilterState, value: string | null) => {
    const updatedFilters = updateFilterDependencies(filters, field, value);
    
    // If community was selected, auto-select its school
    if (field === 'community_id' && value) {
      const selectedCommunity = communities.find(c => c.id === value);
      if (selectedCommunity && selectedCommunity.school_id) {
        updatedFilters.school_id = selectedCommunity.school_id;
      }
    }
    
    setFilters(updatedFilters);
  };

  const handleClearFilters = () => {
    setFilters(clearAllFilters());
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleLoadMore = () => {
    if (!loadingMore && assignments.length < totalAssignments) {
      loadAssignments(false);
    }
  };

  const handleViewDetails = (assignmentId: string) => {
    // Navigate to the assignment discussion page
    router.push(`/community/workspace/assignments/${assignmentId}/discussion`);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (!user || !profileData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#00365b]" />
      </div>
    );
  }

  const activeFilterCount = getActiveFilterCount(filters);
  const hasMore = assignments.length < totalAssignments;

  // Calculate stats
  const totalGroups = assignments.reduce((sum, a) => sum + a.groups_count, 0);
  const totalStudents = assignments.reduce((sum, a) => sum + a.students_count, 0);
  const totalSubmitted = assignments.reduce((sum, a) => sum + a.submitted_count, 0);
  const overallSubmissionRate = totalStudents > 0 ? Math.round((totalSubmitted / totalStudents) * 100) : 0;

  return (
    <MainLayout
      user={user}
      isAdmin={profileData.role === 'admin'}
      userRole={profileData.role}
      avatarUrl={avatarUrl}
      onLogout={handleLogout}
      currentPage="assignment-overview"
      pageTitle="Vista de Tareas Grupales"
    >
      <div className="bg-gray-50 min-h-screen">
        {/* Page Header */}
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600">
                  {profileData.role === 'admin' 
                    ? 'Monitorea todas las tareas grupales de la plataforma'
                    : 'Monitorea las tareas grupales de tus estudiantes asignados'}
                </p>
              </div>
              <ClipboardList className="h-12 w-12 text-[#fdb933]" />
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Tareas</p>
                  <p className="text-2xl font-bold text-[#00365b]">{totalAssignments}</p>
                </div>
                <ClipboardList className="h-8 w-8 text-[#fdb933]" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Grupos Formados</p>
                  <p className="text-2xl font-bold text-[#00365b]">{totalGroups}</p>
                </div>
                <Users className="h-8 w-8 text-[#fdb933]" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Estudiantes</p>
                  <p className="text-2xl font-bold text-[#00365b]">{totalStudents}</p>
                </div>
                <School className="h-8 w-8 text-[#fdb933]" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Tasa de Entrega</p>
                  <p className="text-2xl font-bold text-[#00365b]">{overallSubmissionRate}%</p>
                </div>
                <Calendar className="h-8 w-8 text-[#fdb933]" />
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#00365b]">Filtros</h2>
              {activeFilterCount > 0 && (
                <button
                  onClick={handleClearFilters}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  <X className="h-4 w-4" />
                  Limpiar filtros ({activeFilterCount})
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* School Filter */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Escuela
                </label>
                <select
                  value={filters.school_id || ''}
                  onChange={(e) => handleFilterChange('school_id', e.target.value || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent appearance-none pr-10"
                >
                  <option value="">Todas las escuelas</option>
                  {schools.map(school => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-9 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>

              {/* Community Filter */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Comunidad
                </label>
                <select
                  value={filters.community_id || ''}
                  onChange={(e) => handleFilterChange('community_id', e.target.value || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent appearance-none pr-10"
                  disabled={loadingCommunities}
                >
                  <option value="">Todas las comunidades</option>
                  {communities.map(community => (
                    <option key={community.id} value={community.id}>
                      {community.name}
                    </option>
                  ))}
                </select>
                {loadingCommunities ? (
                  <Loader2 className="absolute right-3 top-9 h-4 w-4 text-gray-400 animate-spin" />
                ) : (
                  <ChevronDown className="absolute right-3 top-9 h-4 w-4 text-gray-400 pointer-events-none" />
                )}
              </div>

              {/* Generation Filter */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Generación
                </label>
                <select
                  value={filters.generation_id || ''}
                  onChange={(e) => handleFilterChange('generation_id', e.target.value || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent appearance-none pr-10"
                  disabled={!filters.school_id || loadingGenerations || generations.length === 0}
                >
                  <option value="">
                    {!filters.school_id 
                      ? 'Selecciona una escuela primero'
                      : generations.length === 0
                      ? 'Sin generaciones'
                      : 'Todas las generaciones'}
                  </option>
                  {generations.map(generation => (
                    <option key={generation.id} value={generation.id}>
                      {generation.name}
                    </option>
                  ))}
                </select>
                {loadingGenerations ? (
                  <Loader2 className="absolute right-3 top-9 h-4 w-4 text-gray-400 animate-spin" />
                ) : (
                  <ChevronDown className="absolute right-3 top-9 h-4 w-4 text-gray-400 pointer-events-none" />
                )}
              </div>
            </div>
          </div>

          {/* Assignments Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#00365b]" />
            </div>
          ) : assignments.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <ClipboardList className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron tareas</h3>
              <p className="text-gray-600">
                {activeFilterCount > 0
                  ? 'No hay tareas que coincidan con los filtros seleccionados.'
                  : 'No hay tareas grupales creadas aún.'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {assignments.map(assignment => (
                  <div
                    key={assignment.id}
                    className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow duration-200 p-6"
                  >
                    {/* Assignment Header */}
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-[#00365b] mb-1">
                        {assignment.title}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {assignment.course_title} - {assignment.lesson_title}
                      </p>
                    </div>

                    {/* Assignment Description */}
                    {assignment.description && (
                      <p className="text-gray-700 mb-4 line-clamp-2">
                        {assignment.description}
                      </p>
                    )}

                    {/* Community Info */}
                    {assignment.community && (
                      <div className="bg-gray-50 rounded-lg p-3 mb-4">
                        <div className="flex items-center gap-2 text-sm">
                          <School className="h-4 w-4 text-gray-500" />
                          <span className="font-medium">{assignment.community.school.name}</span>
                          <span className="text-gray-500">•</span>
                          <span>{assignment.community.name}</span>
                          {assignment.community.generation && (
                            <>
                              <span className="text-gray-500">•</span>
                              <span>{assignment.community.generation.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-[#00365b]">{assignment.groups_count}</p>
                        <p className="text-xs text-gray-600">Grupos</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-[#00365b]">{assignment.students_count}</p>
                        <p className="text-xs text-gray-600">Estudiantes</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-[#00365b]">{assignment.submission_rate}%</p>
                        <p className="text-xs text-gray-600">Entregado</p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Progreso de entregas</span>
                        <span>{assignment.submitted_count} de {assignment.students_count}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-[#fdb933] h-2 rounded-full transition-all duration-300"
                          style={{ width: `${assignment.submission_rate}%` }}
                        />
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span>Creada {formatDate(assignment.created_at)}</span>
                      <button
                        onClick={() => handleViewDetails(assignment.id)}
                        className="text-[#00365b] hover:text-[#00365b]/80 font-medium"
                      >
                        Ver detalles →
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Load More Button */}
              {hasMore && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="px-6 py-3 bg-[#00365b] text-white rounded-lg hover:bg-[#00365b]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Cargando...
                      </>
                    ) : (
                      <>
                        Cargar más
                        <span className="text-sm opacity-75">
                          ({assignments.length} de {totalAssignments})
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
}