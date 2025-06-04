/**
 * ActivityFilters Component
 * Advanced filtering by activity types, users, date ranges, entity types
 * Phase 5 of Collaborative Workspace System for FNE LMS
 */

import React, { useState, useCallback, useEffect } from 'react';
import { 
  Filter, 
  Search, 
  Calendar, 
  Users, 
  Tag, 
  Zap, 
  Eye, 
  EyeOff, 
  RotateCcw,
  ChevronDown,
  ChevronUp,
  X,
  Clock,
  TrendingUp,
  Activity as ActivityIcon
} from 'lucide-react';
import {
  ActivityFilters as ActivityFiltersType,
  ActivityFiltersProps,
  ActivityType,
  EntityType,
  ACTIVITY_TYPE_CONFIG,
  IMPORTANCE_LEVELS,
  DEFAULT_ACTIVITY_FILTERS
} from '../../types/activity';

const ActivityFilters: React.FC<ActivityFiltersProps> = ({
  filters,
  onFiltersChange,
  availableUsers,
  stats,
  showAdvanced = false,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(showAdvanced);
  const [searchQuery, setSearchQuery] = useState(filters.search_query || '');
  const [dateRange, setDateRange] = useState({
    start: filters.date_range.start || '',
    end: filters.date_range.end || ''
  });

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      onFiltersChange({
        ...filters,
        search_query: searchQuery
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Handle filter changes
  const handleActivityTypeToggle = useCallback((activityType: ActivityType) => {
    const newTypes = filters.activity_types.includes(activityType)
      ? filters.activity_types.filter(t => t !== activityType)
      : [...filters.activity_types, activityType];
    
    onFiltersChange({
      ...filters,
      activity_types: newTypes
    });
  }, [filters, onFiltersChange]);

  const handleEntityTypeToggle = useCallback((entityType: EntityType) => {
    const newTypes = filters.entity_types.includes(entityType)
      ? filters.entity_types.filter(t => t !== entityType)
      : [...filters.entity_types, entityType];
    
    onFiltersChange({
      ...filters,
      entity_types: newTypes
    });
  }, [filters, onFiltersChange]);

  const handleUserToggle = useCallback((userId: string) => {
    const newUsers = filters.users.includes(userId)
      ? filters.users.filter(u => u !== userId)
      : [...filters.users, userId];
    
    onFiltersChange({
      ...filters,
      users: newUsers
    });
  }, [filters, onFiltersChange]);

  const handleImportanceToggle = useCallback((level: number) => {
    const newLevels = filters.importance_levels.includes(level)
      ? filters.importance_levels.filter(l => l !== level)
      : [...filters.importance_levels, level];
    
    onFiltersChange({
      ...filters,
      importance_levels: newLevels
    });
  }, [filters, onFiltersChange]);

  const handleDateRangeChange = useCallback(() => {
    onFiltersChange({
      ...filters,
      date_range: {
        start: dateRange.start || null,
        end: dateRange.end || null
      }
    });
  }, [dateRange, filters, onFiltersChange]);

  const handleViewModeChange = useCallback((viewMode: 'all' | 'personal' | 'following') => {
    onFiltersChange({
      ...filters,
      view_mode: viewMode
    });
  }, [filters, onFiltersChange]);

  const handleSystemToggle = useCallback(() => {
    onFiltersChange({
      ...filters,
      include_system: !filters.include_system
    });
  }, [filters, onFiltersChange]);

  const handleReset = useCallback(() => {
    setSearchQuery('');
    setDateRange({ start: '', end: '' });
    onFiltersChange(DEFAULT_ACTIVITY_FILTERS);
  }, [onFiltersChange]);

  // Get active filter count
  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.activity_types.length > 0) count++;
    if (filters.entity_types.length > 0) count++;
    if (filters.users.length > 0) count++;
    if (filters.importance_levels.length < 5) count++;
    if (filters.date_range.start || filters.date_range.end) count++;
    if (filters.search_query) count++;
    if (filters.view_mode !== 'all') count++;
    if (!filters.include_system) count++;
    return count;
  };

  const activeFilterCount = getActiveFilterCount();

  // Group activity types by category
  const activityTypesByCategory = {
    meeting: Object.entries(ACTIVITY_TYPE_CONFIG).filter(([_, config]) => config.category === 'meeting'),
    document: Object.entries(ACTIVITY_TYPE_CONFIG).filter(([_, config]) => config.category === 'document'),
    message: Object.entries(ACTIVITY_TYPE_CONFIG).filter(([_, config]) => config.category === 'message'),
    user: Object.entries(ACTIVITY_TYPE_CONFIG).filter(([_, config]) => config.category === 'user'),
    system: Object.entries(ACTIVITY_TYPE_CONFIG).filter(([_, config]) => config.category === 'system')
  };

  const entityTypes: EntityType[] = [
    'meeting', 'document', 'folder', 'message', 'thread', 'user', 'workspace', 'system'
  ];

  return (
    <div className={`activity-filters bg-white border border-gray-200 rounded-lg ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <Filter className="w-5 h-5 text-[#00365b]" />
          <h3 className="font-semibold text-[#00365b]">Filtros de Actividad</h3>
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center px-2 py-1 rounded-full bg-[#fdb933] text-xs font-medium text-white">
              {activeFilterCount}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:text-[#00365b] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Limpiar
            </button>
          )}
          
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:text-[#00365b] transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {isExpanded ? 'Menos' : 'Más'}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Quick filters */}
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar actividades..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
            />
          </div>

          {/* View mode */}
          <div className="flex gap-2">
            <button
              onClick={() => handleViewModeChange('all')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filters.view_mode === 'all'
                  ? 'bg-[#00365b] text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Ver Todo
            </button>
            <button
              onClick={() => handleViewModeChange('personal')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filters.view_mode === 'personal'
                  ? 'bg-[#00365b] text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Mis Actividades
            </button>
          </div>

          {/* Include system activities */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.include_system}
              onChange={handleSystemToggle}
              className="rounded border-gray-300 text-[#fdb933] focus:ring-[#fdb933]"
            />
            <span className="text-sm text-gray-700">Incluir actividades del sistema</span>
          </label>
        </div>

        {/* Advanced filters */}
        {isExpanded && (
          <div className="space-y-6 pt-4 border-t border-gray-200">
            {/* Date range */}
            <div className="space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <Calendar className="w-4 h-4" />
                Rango de Fechas
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Desde</label>
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    onBlur={handleDateRangeChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Hasta</label>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    onBlur={handleDateRangeChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Importance levels */}
            <div className="space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <Zap className="w-4 h-4" />
                Nivel de Importancia
              </h4>
              <div className="flex flex-wrap gap-2">
                {IMPORTANCE_LEVELS.map((level) => (
                  <button
                    key={level.score}
                    onClick={() => handleImportanceToggle(level.score)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      filters.importance_levels.includes(level.score)
                        ? 'text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    style={{
                      backgroundColor: filters.importance_levels.includes(level.score) ? level.color : undefined
                    }}
                  >
                    <span>{level.label}</span>
                    {filters.importance_levels.includes(level.score) && (
                      <X className="w-3 h-3" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Activity types */}
            <div className="space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <ActivityIcon className="w-4 h-4" />
                Tipos de Actividad
              </h4>
              <div className="space-y-4">
                {Object.entries(activityTypesByCategory).map(([category, types]) => (
                  <div key={category} className="space-y-2">
                    <h5 className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                      {category === 'meeting' ? 'Reuniones' :
                       category === 'document' ? 'Documentos' :
                       category === 'message' ? 'Mensajes' :
                       category === 'user' ? 'Usuarios' : 'Sistema'}
                    </h5>
                    <div className="flex flex-wrap gap-2">
                      {types.map(([type, config]) => (
                        <button
                          key={type}
                          onClick={() => handleActivityTypeToggle(type as ActivityType)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                            filters.activity_types.includes(type as ActivityType)
                              ? 'bg-[#00365b] text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          <span role="img" aria-label={config.label}>{config.icon}</span>
                          <span>{config.label}</span>
                          {filters.activity_types.includes(type as ActivityType) && (
                            <X className="w-3 h-3" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Entity types */}
            <div className="space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <Tag className="w-4 h-4" />
                Tipos de Entidad
              </h4>
              <div className="flex flex-wrap gap-2">
                {entityTypes.map((entityType) => (
                  <button
                    key={entityType}
                    onClick={() => handleEntityTypeToggle(entityType)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      filters.entity_types.includes(entityType)
                        ? 'bg-[#fdb933] text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {entityType === 'meeting' ? 'Reunión' :
                     entityType === 'document' ? 'Documento' :
                     entityType === 'folder' ? 'Carpeta' :
                     entityType === 'message' ? 'Mensaje' :
                     entityType === 'thread' ? 'Hilo' :
                     entityType === 'user' ? 'Usuario' :
                     entityType === 'workspace' ? 'Espacio' : 'Sistema'}
                    {filters.entity_types.includes(entityType) && (
                      <X className="w-3 h-3 ml-2 inline" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Users */}
            {availableUsers.length > 0 && (
              <div className="space-y-3">
                <h4 className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  <Users className="w-4 h-4" />
                  Usuarios ({availableUsers.length})
                </h4>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {availableUsers.map((user) => (
                    <label key={user.id} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
                      <input
                        type="checkbox"
                        checked={filters.users.includes(user.id)}
                        onChange={() => handleUserToggle(user.id)}
                        className="rounded border-gray-300 text-[#fdb933] focus:ring-[#fdb933]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{user.name}</div>
                        <div className="text-xs text-gray-600">
                          {user.role === 'lider_comunidad' ? 'Líder' : 
                           user.role === 'admin' ? 'Admin' : 'Docente'}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats summary */}
        {stats && (
          <div className="pt-4 border-t border-gray-200">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
              <div className="space-y-1">
                <div className="text-lg font-semibold text-[#00365b]">
                  {stats.total_activities}
                </div>
                <div className="text-xs text-gray-600">Total</div>
              </div>
              <div className="space-y-1">
                <div className="text-lg font-semibold text-[#fdb933]">
                  {stats.activities_today}
                </div>
                <div className="text-xs text-gray-600">Hoy</div>
              </div>
              <div className="space-y-1">
                <div className="text-lg font-semibold text-green-600">
                  {stats.activities_this_week}
                </div>
                <div className="text-xs text-gray-600">Semana</div>
              </div>
              <div className="space-y-1">
                <div className={`text-lg font-semibold ${
                  stats.engagement_trend === 'up' ? 'text-green-600' :
                  stats.engagement_trend === 'down' ? 'text-red-600' : 'text-gray-600'
                }`}>
                  {stats.engagement_trend === 'up' ? '↗️' :
                   stats.engagement_trend === 'down' ? '↘️' : '→'}
                </div>
                <div className="text-xs text-gray-600">Tendencia</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityFilters;