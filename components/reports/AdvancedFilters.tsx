import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useState, useEffect } from 'react';

interface AdvancedFiltersProps {
  filters: {
    search: string;
    school_id: string;
    generation_id: string;
    community_id: string;
    status: string;
    date_from: string;
    date_to: string;
  };
  onFiltersChange: (filters: any) => void;
  userRole: string;
  isAdmin: boolean;
  userProfile?: any;
}

export default function AdvancedFilters({ 
  filters, 
  onFiltersChange, 
  userRole, 
  isAdmin,
  userProfile 
}: AdvancedFiltersProps) {
  const supabase = useSupabaseClient();
  const [schools, setSchools] = useState<any[]>([]);
  const [generations, setGenerations] = useState<any[]>([]);
  const [communities, setCommunities] = useState<any[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    fetchFilterData();
    
    // Check for mobile screen size
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [userProfile]);

  const fetchFilterData = async () => {
    try {
      const response = await fetch('/api/reports/filter-options', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch filter options');
      }

      const { schools, generations, communities } = await response.json();

      setSchools(schools || []);
      setGenerations(generations || []);
      setCommunities(communities || []);

    } catch (error) {
      console.error('Error fetching filter data:', error);
      // Set empty arrays as fallback
      setSchools([]);
      setGenerations([]);
      setCommunities([]);
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
    onFiltersChange({
      search: '', // Keep search in data structure but don't manage it locally
      school_id: 'all',
      generation_id: 'all',
      community_id: 'all',
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
              className="text-sm text-brand_blue hover:text-brand_yellow font-medium px-3 py-1 rounded border border-brand_blue/20 hover:bg-brand_beige transition-colors"
            >
              Limpiar Filtros
            </button>
          )}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-brand_blue hover:text-brand_yellow font-medium flex items-center justify-center px-3 py-1 rounded border border-brand_blue/20 hover:bg-brand_beige transition-colors"
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

      {/* Primary Filters - Most Important Filters Always Visible */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {/* Organizational Filter - Most important for filtering */}
        {isAdmin && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              🏫 Escuela
            </label>
            <select
              value={filters.school_id}
              onChange={(e) => handleFilterChange('school_id', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand_blue"
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

        {/* Generation Filter for Leadership */}
        {(isAdmin || ['equipo_directivo'].includes(userRole)) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              👥 Generación
            </label>
            <select
              value={filters.generation_id}
              onChange={(e) => handleFilterChange('generation_id', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand_blue"
              disabled={filteredGenerations.length === 0}
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

        {/* Community Filter for Leaders */}
        {(isAdmin || ['equipo_directivo', 'lider_generacion'].includes(userRole)) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              👥 Comunidad
            </label>
            <select
              value={filters.community_id}
              onChange={(e) => handleFilterChange('community_id', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand_blue"
              disabled={filteredCommunities.length === 0}
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            📊 Estado del Usuario
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
      </div>

      {/* Applied Filters Display */}
      {hasActiveFilters && (
        <div className="bg-gray-50 rounded-lg p-3 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Filtros aplicados:</span>
            
            {/* Search Filter */}
            {filters.search && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-brand_blue/10 text-brand_blue">
                🔍 "{filters.search}"
                <button
                  onClick={() => handleFilterChange('search', '')}
                  className="ml-2 text-brand_blue hover:text-brand_yellow"
                >
                  ×
                </button>
              </span>
            )}

            {/* School Filter */}
            {filters.school_id !== 'all' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-brand_blue/10 text-brand_blue">
                🏫 {schools.find(s => s.id === filters.school_id)?.name || 'Escuela seleccionada'}
                <button
                  onClick={() => handleFilterChange('school_id', 'all')}
                  className="ml-2 text-brand_blue hover:text-brand_yellow"
                >
                  ×
                </button>
              </span>
            )}

            {/* Generation Filter */}
            {filters.generation_id !== 'all' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-brand_blue/10 text-brand_blue">
                👥 {generations.find(g => g.id === filters.generation_id)?.name || 'Generación seleccionada'}
                <button
                  onClick={() => handleFilterChange('generation_id', 'all')}
                  className="ml-2 text-brand_blue hover:text-brand_yellow"
                >
                  ×
                </button>
              </span>
            )}

            {/* Community Filter */}
            {filters.community_id !== 'all' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-brand_yellow/20 text-yellow-800">
                👥 {communities.find(c => c.id === filters.community_id)?.name || 'Comunidad seleccionada'}
                <button
                  onClick={() => handleFilterChange('community_id', 'all')}
                  className="ml-2 text-yellow-700 hover:text-yellow-900"
                >
                  ×
                </button>
              </span>
            )}

            {/* Status Filter */}
            {filters.status !== 'all' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-brand_blue/10 text-brand_blue">
                📊 {filters.status === 'active' ? 'Activos' :
                     filters.status === 'completed' ? 'Completados' :
                     filters.status === 'inactive' ? 'Inactivos' : filters.status}
                <button
                  onClick={() => handleFilterChange('status', 'all')}
                  className="ml-2 text-brand_blue hover:text-brand_yellow"
                >
                  ×
                </button>
              </span>
            )}

            {/* Date Range Filters */}
            {(filters.date_from || filters.date_to) && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-brand_yellow/20 text-yellow-800">
                📅 {filters.date_from} {filters.date_from && filters.date_to ? ' - ' : ''} {filters.date_to}
                <button
                  onClick={() => {
                    handleFilterChange('date_from', '');
                    handleFilterChange('date_to', '');
                  }}
                  className="ml-2 text-yellow-700 hover:text-yellow-900"
                >
                  ×
                </button>
              </span>
            )}

            {/* Clear All Button */}
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-brand_yellow/20 text-yellow-800 hover:bg-brand_yellow/30 transition-colors"
            >
              🗑️ Limpiar todos
            </button>
          </div>
        </div>
      )}

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="border-t border-brand_blue/20 pt-6 mt-4">
          <h4 className="text-sm font-semibold text-brand_blue mb-4">Filtros por Fecha</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Date Range Filters - Advanced only */}
            <div>
              <label className="block text-sm font-medium text-brand_blue/80 mb-2">
                📅 Fecha Desde
              </label>
              <input
                type="date"
                value={filters.date_from}
                onChange={(e) => handleFilterChange('date_from', e.target.value)}
                className="w-full border border-brand_blue/30 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-transparent transition-all bg-white hover:border-brand_blue/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-brand_blue/80 mb-2">
                📅 Fecha Hasta
              </label>
              <input
                type="date"
                value={filters.date_to}
                onChange={(e) => handleFilterChange('date_to', e.target.value)}
                className="w-full border border-brand_blue/30 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-transparent transition-all bg-white hover:border-brand_blue/50"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}