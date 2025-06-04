/**
 * Meeting Filters Component
 * Professional filtering interface for meetings with date range, status, and search
 */

import React, { useState } from 'react';
import { 
  CalendarDaysIcon, 
  FunnelIcon, 
  MagnifyingGlassIcon,
  XMarkIcon,
  UserIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import { 
  MeetingFilters as MeetingFiltersType, 
  MeetingStatus, 
  TaskPriority,
  meetingStatusLabels,
  priorityLabels,
  meetingStatusColors,
  priorityColors
} from '../../types/meetings';

interface MeetingFiltersProps {
  filters: MeetingFiltersType;
  onFiltersChange: (filters: MeetingFiltersType) => void;
  onClearFilters: () => void;
  className?: string;
}

const MeetingFilters: React.FC<MeetingFiltersProps> = ({
  filters,
  onFiltersChange,
  onClearFilters,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSearchChange = (search: string) => {
    onFiltersChange({ ...filters, search });
  };

  const handleDateRangeChange = (field: 'start' | 'end', value: string) => {
    onFiltersChange({
      ...filters,
      dateRange: {
        ...filters.dateRange,
        [field]: value || undefined
      }
    });
  };

  const handleStatusChange = (status: MeetingStatus, checked: boolean) => {
    const newStatuses = checked
      ? [...filters.status, status]
      : filters.status.filter(s => s !== status);
    
    onFiltersChange({ ...filters, status: newStatuses });
  };

  const handlePriorityChange = (priority: TaskPriority, checked: boolean) => {
    const currentPriorities = filters.priority || [];
    const newPriorities = checked
      ? [...currentPriorities, priority]
      : currentPriorities.filter(p => p !== priority);
    
    onFiltersChange({ 
      ...filters, 
      priority: newPriorities.length > 0 ? newPriorities : undefined 
    });
  };

  const toggleAssignedToMe = () => {
    onFiltersChange({ ...filters, assignedToMe: !filters.assignedToMe });
  };

  const toggleCreatedByMe = () => {
    onFiltersChange({ ...filters, createdByMe: !filters.createdByMe });
  };

  const toggleOverdueTasks = () => {
    onFiltersChange({ ...filters, overdueTasks: !filters.overdueTasks });
  };

  const hasActiveFilters = () => {
    return (
      filters.search ||
      filters.dateRange.start ||
      filters.dateRange.end ||
      filters.status.length > 0 ||
      filters.assignedToMe ||
      filters.createdByMe ||
      filters.overdueTasks ||
      (filters.priority && filters.priority.length > 0)
    );
  };

  const statusOptions: MeetingStatus[] = ['programada', 'en_progreso', 'completada', 'cancelada', 'pospuesta'];
  const priorityOptions: TaskPriority[] = ['critica', 'alta', 'media', 'baja'];

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Search Bar */}
      <div className="p-4 border-b border-gray-200">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar reuniones..."
            value={filters.search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent text-sm"
          />
        </div>
      </div>

      {/* Filter Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-[#00365b]"
        >
          <FunnelIcon className="h-4 w-4" />
          <span>Filtros</span>
          {hasActiveFilters() && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[#fdb933] text-[#00365b]">
              Activos
            </span>
          )}
        </button>

        {hasActiveFilters() && (
          <button
            onClick={onClearFilters}
            className="flex items-center space-x-1 text-xs text-gray-500 hover:text-red-600"
          >
            <XMarkIcon className="h-3 w-3" />
            <span>Limpiar</span>
          </button>
        )}
      </div>

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="p-4 space-y-6">
          {/* Date Range */}
          <div>
            <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-3">
              <CalendarDaysIcon className="h-4 w-4" />
              <span>Rango de Fechas</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Desde</label>
                <input
                  type="date"
                  value={filters.dateRange.start || ''}
                  onChange={(e) => handleDateRangeChange('start', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Hasta</label>
                <input
                  type="date"
                  value={filters.dateRange.end || ''}
                  onChange={(e) => handleDateRangeChange('end', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent text-sm"
                />
              </div>
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Estado de Reunión
            </label>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map(status => (
                <label key={status} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.status.includes(status)}
                    onChange={(e) => handleStatusChange(status, e.target.checked)}
                    className="sr-only"
                  />
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors duration-200 ${
                      filters.status.includes(status)
                        ? meetingStatusColors[status]
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {meetingStatusLabels[status]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Priority Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Prioridad de Tareas
            </label>
            <div className="flex flex-wrap gap-2">
              {priorityOptions.map(priority => (
                <label key={priority} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.priority?.includes(priority) || false}
                    onChange={(e) => handlePriorityChange(priority, e.target.checked)}
                    className="sr-only"
                  />
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors duration-200 ${
                      filters.priority?.includes(priority)
                        ? priorityColors[priority]
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {priorityLabels[priority]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Quick Filters */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Filtros Rápidos
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.assignedToMe}
                  onChange={toggleAssignedToMe}
                  className="h-4 w-4 text-[#fdb933] focus:ring-[#fdb933] border-gray-300 rounded"
                />
                <UserIcon className="h-4 w-4 text-gray-400 ml-2 mr-1" />
                <span className="text-sm text-gray-700">Tareas asignadas a mí</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.createdByMe}
                  onChange={toggleCreatedByMe}
                  className="h-4 w-4 text-[#fdb933] focus:ring-[#fdb933] border-gray-300 rounded"
                />
                <UserIcon className="h-4 w-4 text-gray-400 ml-2 mr-1" />
                <span className="text-sm text-gray-700">Reuniones creadas por mí</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.overdueTasks}
                  onChange={toggleOverdueTasks}
                  className="h-4 w-4 text-[#fdb933] focus:ring-[#fdb933] border-gray-300 rounded"
                />
                <ClockIcon className="h-4 w-4 text-red-400 ml-2 mr-1" />
                <span className="text-sm text-gray-700">Con tareas vencidas</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetingFilters;