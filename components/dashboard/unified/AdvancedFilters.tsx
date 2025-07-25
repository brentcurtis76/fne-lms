import React, { useState, useEffect, useCallback } from 'react';
import { Search, Calendar, Users, BookOpen, X, Filter, ChevronDown } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface FilterOptions {
  schools: Array<{ id: string; name: string }>;
  generations: Array<{ id: string; name: string }>;
  communities: Array<{ id: string; name: string }>;
  courses: Array<{ id: string; title: string }>;
}

interface DashboardFilters {
  timeRange: '7d' | '30d' | '90d' | '1y' | 'custom';
  startDate?: string;
  endDate?: string;
  schoolId?: string;
  generationId?: string;
  communityId?: string;
  courseId?: string;
  searchQuery?: string;
}

interface AdvancedFiltersProps {
  filters: DashboardFilters;
  onFiltersChange: (filters: DashboardFilters) => void;
  userRole: string;
  userId: string;
  className?: string;
  isOpen?: boolean;
  onToggle?: () => void;
}

const AdvancedFilters: React.FC<AdvancedFiltersProps> = ({
  filters,
  onFiltersChange,
  userRole,
  userId,
  className = '',
  isOpen = false,
  onToggle
}) => {
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    schools: [],
    generations: [],
    communities: [],
    courses: []
  });
  const [loading, setLoading] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Time range options
  const timeRangeOptions = [
    { value: '7d', label: 'Últimos 7 días' },
    { value: '30d', label: 'Últimos 30 días' },
    { value: '90d', label: 'Últimos 3 meses' },
    { value: '1y', label: 'Último año' },
    { value: 'custom', label: 'Rango personalizado' }
  ];

  // Load filter options based on user role
  const loadFilterOptions = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const promises: Promise<any>[] = [];

      // Load schools based on role
      if (['admin', 'supervisor_de_red'].includes(userRole)) {
        promises.push(
          supabase
            .from('schools')
            .select('id, name')
            .order('name')
            .then(res => ({ type: 'schools', data: res.data || [] }))
        );
      }

      // Load generations
      if (['admin', 'lider_generacion', 'docente'].includes(userRole)) {
        promises.push(
          supabase
            .from('generations')
            .select('id, name')
            .order('name')
            .then(res => ({ type: 'generations', data: res.data || [] }))
        );
      }

      // Load communities
      promises.push(
        supabase
          .from('growth_communities')
          .select('id, name')
          .order('name')
          .then(res => ({ type: 'communities', data: res.data || [] }))
      );

      // Load courses
      promises.push(
        supabase
          .from('courses')
          .select('id, title')
          .order('title')
          .then(res => ({ type: 'courses', data: res.data || [] }))
      );

      const results = await Promise.all(promises);
      const newOptions: FilterOptions = {
        schools: [],
        generations: [],
        communities: [],
        courses: []
      };

      results.forEach(result => {
        if (result.type in newOptions) {
          newOptions[result.type as keyof FilterOptions] = result.data;
        }
      });

      setFilterOptions(newOptions);
    } catch (error) {
      console.error('Error loading filter options:', error);
    } finally {
      setLoading(false);
    }
  }, [userRole]);

  // Generate search suggestions
  const generateSearchSuggestions = useCallback((query: string) => {
    if (!query || query.length < 2) {
      setSearchSuggestions([]);
      return;
    }

    const suggestions: string[] = [];
    const lowerQuery = query.toLowerCase();

    // Add school suggestions
    filterOptions.schools.forEach(school => {
      if (school.name.toLowerCase().includes(lowerQuery)) {
        suggestions.push(`escuela:${school.name}`);
      }
    });

    // Add community suggestions
    filterOptions.communities.forEach(community => {
      if (community.name.toLowerCase().includes(lowerQuery)) {
        suggestions.push(`comunidad:${community.name}`);
      }
    });

    // Add course suggestions
    filterOptions.courses.forEach(course => {
      if (course.title.toLowerCase().includes(lowerQuery)) {
        suggestions.push(`curso:${course.title}`);
      }
    });

    // Add common search patterns
    const commonPatterns = [
      'usuarios activos',
      'cursos completados', 
      'actividad reciente',
      'progreso bajo',
      'colaboración alta'
    ];

    commonPatterns.forEach(pattern => {
      if (pattern.includes(lowerQuery)) {
        suggestions.push(pattern);
      }
    });

    setSearchSuggestions(suggestions.slice(0, 8));
  }, [filterOptions]);

  // Handle filter changes
  const handleFilterChange = (key: keyof DashboardFilters, value: any) => {
    const newFilters = { ...filters, [key]: value };
    
    // Clear dependent filters
    if (key === 'schoolId') {
      delete newFilters.generationId;
      delete newFilters.communityId;
    } else if (key === 'generationId') {
      delete newFilters.communityId;
    }

    onFiltersChange(newFilters);
  };

  // Handle search input
  const handleSearchChange = (value: string) => {
    handleFilterChange('searchQuery', value);
    generateSearchSuggestions(value);
    setShowSuggestions(value.length >= 2);
  };

  // Handle search suggestion selection
  const handleSuggestionSelect = (suggestion: string) => {
    if (suggestion.includes(':')) {
      const [type, name] = suggestion.split(':');
      
      // Convert suggestion to actual filter
      switch (type) {
        case 'escuela':
          const school = filterOptions.schools.find(s => s.name === name);
          if (school) handleFilterChange('schoolId', school.id);
          break;
        case 'comunidad':
          const community = filterOptions.communities.find(c => c.name === name);
          if (community) handleFilterChange('communityId', community.id);
          break;
        case 'curso':
          const course = filterOptions.courses.find(c => c.title === name);
          if (course) handleFilterChange('courseId', course.id);
          break;
      }
      handleFilterChange('searchQuery', '');
    } else {
      handleFilterChange('searchQuery', suggestion);
    }
    setShowSuggestions(false);
  };

  // Clear all filters
  const clearFilters = () => {
    onFiltersChange({
      timeRange: '30d'
    });
  };

  // Count active filters
  const activeFiltersCount = Object.keys(filters).filter(key => 
    key !== 'timeRange' && filters[key as keyof DashboardFilters]
  ).length;

  useEffect(() => {
    loadFilterOptions();
  }, [loadFilterOptions]);

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className={`
          flex items-center space-x-2 px-3 py-2 text-sm font-medium text-gray-700 
          bg-white border border-gray-300 rounded-md hover:bg-gray-50 
          focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}
        `}
      >
        <Filter className="w-4 h-4" />
        <span>Filtros</span>
        {activeFiltersCount > 0 && (
          <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium text-white bg-blue-600 rounded-full">
            {activeFiltersCount}
          </span>
        )}
        <ChevronDown className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className={`bg-white border border-gray-300 rounded-lg shadow-lg p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Filtros Avanzados
        </h3>
        <div className="flex items-center space-x-2">
          {activeFiltersCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-sm text-gray-600 hover:text-gray-800 underline"
            >
              Limpiar filtros
            </button>
          )}
          <button
            onClick={onToggle}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Search */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Búsqueda
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              value={filters.searchQuery || ''}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Buscar usuarios, cursos, comunidades..."
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          {/* Search Suggestions */}
          {showSuggestions && searchSuggestions.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
              {searchSuggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionSelect(suggestion)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-md last:rounded-b-md"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Time Range */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Período de Tiempo
          </label>
          <select
            value={filters.timeRange}
            onChange={(e) => handleFilterChange('timeRange', e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            {timeRangeOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Custom Date Range */}
        {filters.timeRange === 'custom' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha Inicio
              </label>
              <input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha Fin
              </label>
              <input
                type="date"
                value={filters.endDate || ''}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        )}

        {/* Organization Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Schools */}
          {filterOptions.schools.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Users className="inline w-4 h-4 mr-1" />
                Escuela
              </label>
              <select
                value={filters.schoolId || ''}
                onChange={(e) => handleFilterChange('schoolId', e.target.value || undefined)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              >
                <option value="">Todas las escuelas</option>
                {filterOptions.schools.map(school => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Generations */}
          {filterOptions.generations.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="inline w-4 h-4 mr-1" />
                Generación
              </label>
              <select
                value={filters.generationId || ''}
                onChange={(e) => handleFilterChange('generationId', e.target.value || undefined)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              >
                <option value="">Todas las generaciones</option>
                {filterOptions.generations.map(generation => (
                  <option key={generation.id} value={generation.id}>
                    {generation.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Communities */}
          {filterOptions.communities.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Users className="inline w-4 h-4 mr-1" />
                Comunidad
              </label>
              <select
                value={filters.communityId || ''}
                onChange={(e) => handleFilterChange('communityId', e.target.value || undefined)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              >
                <option value="">Todas las comunidades</option>
                {filterOptions.communities.map(community => (
                  <option key={community.id} value={community.id}>
                    {community.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Courses */}
          {filterOptions.courses.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <BookOpen className="inline w-4 h-4 mr-1" />
                Curso
              </label>
              <select
                value={filters.courseId || ''}
                onChange={(e) => handleFilterChange('courseId', e.target.value || undefined)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              >
                <option value="">Todos los cursos</option>
                {filterOptions.courses.map(course => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Active Filters Summary */}
        {activeFiltersCount > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-900 mb-2">
              Filtros Activos ({activeFiltersCount})
            </h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(filters).map(([key, value]) => {
                if (key === 'timeRange' || !value) return null;
                
                let displayValue = value;
                let displayKey = key;

                // Convert IDs to names for better UX
                if (key === 'schoolId') {
                  displayKey = 'Escuela';
                  displayValue = filterOptions.schools.find(s => s.id === value)?.name || value;
                } else if (key === 'communityId') {
                  displayKey = 'Comunidad';
                  displayValue = filterOptions.communities.find(c => c.id === value)?.name || value;
                } else if (key === 'courseId') {
                  displayKey = 'Curso';
                  displayValue = filterOptions.courses.find(c => c.id === value)?.title || value;
                } else if (key === 'searchQuery') {
                  displayKey = 'Búsqueda';
                }

                return (
                  <span
                    key={key}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {displayKey}: {displayValue}
                    <button
                      onClick={() => handleFilterChange(key as keyof DashboardFilters, undefined)}
                      className="ml-1 inline-flex items-center justify-center w-4 h-4 text-blue-400 hover:text-blue-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdvancedFilters;