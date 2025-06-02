import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import useDebounce from '../../hooks/useDebounce';

interface AdvancedFiltersProps {
  filters: {
    search: string;
    school_id: string;
    generation_id: string;
    community_id: string;
    course_id: string;
    status: string;
    date_from: string;
    date_to: string;
  };
  onFiltersChange: (filters: any) => void;
  userRole: string;
  isAdmin: boolean;
}

export default function AdvancedFilters({ 
  filters, 
  onFiltersChange, 
  userRole, 
  isAdmin 
}: AdvancedFiltersProps) {
  const [schools, setSchools] = useState<any[]>([]);
  const [generations, setGenerations] = useState<any[]>([]);
  const [communities, setCommunities] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [isMobile, setIsMobile] = useState(false);

  // Debounce search input to reduce API calls
  const debouncedSearch = useDebounce(searchInput, 500);

  useEffect(() => {
    fetchFilterData();
    
    // Check for mobile screen size
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Update search filter when debounced value changes
  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      handleFilterChange('search', debouncedSearch);
    }
  }, [debouncedSearch]);

  const fetchFilterData = async () => {
    try {
      const [schoolsRes, generationsRes, communitiesRes, coursesRes] = await Promise.all([
        supabase.from('schools').select('id, name').order('name'),
        supabase.from('generations').select('id, name, school_id').order('name'),
        supabase.from('growth_communities').select('id, name, generation_id, school_id').order('name'),
        supabase.from('courses').select('id, title').order('title')
      ]);

      setSchools(schoolsRes.data || []);
      setGenerations(generationsRes.data || []);
      setCommunities(communitiesRes.data || []);
      setCourses(coursesRes.data || []);
    } catch (error) {
      console.error('Error fetching filter data:', error);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value };
    
    // Reset dependent filters
    if (key === 'school_id') {
      newFilters.generation_id = 'all';
      newFilters.community_id = 'all';
    }
    if (key === 'generation_id') {
      newFilters.community_id = 'all';
    }
    
    onFiltersChange(newFilters);
  };

  const clearAllFilters = () => {
    setSearchInput('');
    onFiltersChange({
      search: '',
      school_id: 'all',
      generation_id: 'all',
      community_id: 'all',
      course_id: 'all',
      status: 'all',
      date_from: '',
      date_to: ''
    });
  };

  const filteredGenerations = generations.filter(gen => 
    filters.school_id === 'all' || gen.school_id === filters.school_id
  );

  const filteredCommunities = communities.filter(comm => 
    filters.generation_id === 'all' || comm.generation_id === filters.generation_id
  );

  const hasActiveFilters = Object.values(filters).some(value => 
    value !== '' && value !== 'all'
  );

  return (
    <div className="bg-white rounded-lg shadow p-4 md:p-6 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 space-y-2 sm:space-y-0">
        <h3 className="text-lg font-semibold text-gray-900">Filtros de Búsqueda</h3>
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="text-sm text-red-600 hover:text-red-800 font-medium px-3 py-1 rounded border border-red-200 hover:bg-red-50"
            >
              Limpiar Filtros
            </button>
          )}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center px-3 py-1 rounded border border-blue-200 hover:bg-blue-50"
          >
            {showAdvanced ? 'Ocultar' : 'Mostrar'} {isMobile ? '' : 'Filtros'} Avanzados
            <svg 
              className={`w-4 h-4 ml-1 transform transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Basic Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Buscar Usuario
          </label>
          <input
            type="text"
            placeholder="Nombre, email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Estado del Usuario
          </label>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activos (estudiando)</option>
            <option value="completed">Completados</option>
            <option value="inactive">Inactivos (30+ días)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Curso
          </label>
          <select
            value={filters.course_id}
            onChange={(e) => handleFilterChange('course_id', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todos los cursos</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="border-t border-gray-200 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            {/* Organizational Filters - Only for admin and leadership */}
            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Escuela
                </label>
                <select
                  value={filters.school_id}
                  onChange={(e) => handleFilterChange('school_id', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Todas las escuelas</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(isAdmin || ['equipo_directivo'].includes(userRole)) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Generación
                </label>
                <select
                  value={filters.generation_id}
                  onChange={(e) => handleFilterChange('generation_id', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!isAdmin && filters.school_id === 'all'}
                >
                  <option value="all">Todas las generaciones</option>
                  {filteredGenerations.map((generation) => (
                    <option key={generation.id} value={generation.id}>
                      {generation.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(isAdmin || ['equipo_directivo', 'lider_generacion'].includes(userRole)) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Comunidad
                </label>
                <select
                  value={filters.community_id}
                  onChange={(e) => handleFilterChange('community_id', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={filters.generation_id === 'all'}
                >
                  <option value="all">Todas las comunidades</option>
                  {filteredCommunities.map((community) => (
                    <option key={community.id} value={community.id}>
                      {community.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Date Range Filters */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Desde
              </label>
              <input
                type="date"
                value={filters.date_from}
                onChange={(e) => handleFilterChange('date_from', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hasta
              </label>
              <input
                type="date"
                value={filters.date_to}
                onChange={(e) => handleFilterChange('date_to', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Filter Summary */}
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="text-sm font-medium text-gray-700">Filtros activos:</span>
              {filters.search && (
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                  Búsqueda: "{filters.search}"
                </span>
              )}
              {filters.status !== 'all' && (
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                  Estado: {filters.status}
                </span>
              )}
              {filters.course_id !== 'all' && (
                <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                  Curso específico
                </span>
              )}
              {(filters.date_from || filters.date_to) && (
                <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs">
                  Rango de fechas
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}