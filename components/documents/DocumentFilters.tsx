// =============================================================================
// Genera - Document Filters Component
// =============================================================================
// Advanced filtering interface for document repository

import React, { useState } from 'react';
import {
  Search,
  Filter,
  X,
  Calendar,
  User,
  Tag,
  FileType,
  SortAsc,
  SortDesc,
  Grid,
  List,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import {
  DocumentFilterOptions,
  DocumentViewMode,
  DocumentSortBy,
  DocumentSortOrder,
  FileTypeConfig,
  SUPPORTED_FILE_TYPES,
} from '../../types/documents';

interface DocumentFiltersProps {
  filters: DocumentFilterOptions;
  onFiltersChange: (filters: DocumentFilterOptions) => void;
  availableTags: string[];
  availableUploaders: Array<{ id: string; name: string }>;
  onViewModeChange: (viewMode: DocumentViewMode) => void;
  viewMode: DocumentViewMode;
  loading?: boolean;
}

export default function DocumentFilters({
  filters,
  onFiltersChange,
  availableTags,
  availableUploaders,
  onViewModeChange,
  viewMode,
  loading = false,
}: DocumentFiltersProps) {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [tagInput, setTagInput] = useState('');

  // Update filters
  const updateFilters = (updates: Partial<DocumentFilterOptions>) => {
    onFiltersChange({ ...filters, ...updates });
  };

  // Clear all filters
  const clearFilters = () => {
    onFiltersChange({
      search: '',
      tags: [],
      mime_types: [],
      uploaded_by: '',
      date_from: '',
      date_to: '',
      sort_by: 'created_at',
      sort_order: 'desc',
    });
    setShowAdvancedFilters(false);
  };

  // Add tag filter
  const addTagFilter = (tag: string) => {
    if (!filters.tags?.includes(tag)) {
      updateFilters({
        tags: [...(filters.tags || []), tag],
      });
    }
    setTagInput('');
  };

  // Remove tag filter
  const removeTagFilter = (tag: string) => {
    updateFilters({
      tags: (filters.tags || []).filter(t => t !== tag),
    });
  };

  // Toggle mime type filter
  const toggleMimeTypeFilter = (mimeType: string) => {
    const currentMimeTypes = filters.mime_types || [];
    if (currentMimeTypes.includes(mimeType)) {
      updateFilters({
        mime_types: currentMimeTypes.filter(t => t !== mimeType),
      });
    } else {
      updateFilters({
        mime_types: [...currentMimeTypes, mimeType],
      });
    }
  };

  // Get active filter count
  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.search) count++;
    if (filters.tags?.length) count++;
    if (filters.mime_types?.length) count++;
    if (filters.uploaded_by) count++;
    if (filters.date_from || filters.date_to) count++;
    return count;
  };

  const activeFilterCount = getActiveFilterCount();

  return (
    <div className="bg-white border-b border-gray-200 p-4 space-y-4">
      {/* Top Row - Search, View Mode, and Actions */}
      <div className="flex items-center space-x-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={filters.search || ''}
            onChange={(e) => updateFilters({ search: e.target.value })}
            placeholder="Buscar documentos por título, descripción o nombre de archivo..."
            disabled={loading}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
          {filters.search && (
            <button
              onClick={() => updateFilters({ search: '' })}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
          <button
            onClick={() => onViewModeChange('grid')}
            className={`p-2 flex items-center space-x-1 ${
              viewMode === 'grid'
                ? 'bg-[#0a0a0a] text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            } transition-colors`}
          >
            <Grid className="w-4 h-4" />
            <span className="text-sm hidden sm:inline">Cuadrícula</span>
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            className={`p-2 flex items-center space-x-1 ${
              viewMode === 'list'
                ? 'bg-[#0a0a0a] text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            } transition-colors`}
          >
            <List className="w-4 h-4" />
            <span className="text-sm hidden sm:inline">Lista</span>
          </button>
        </div>

        {/* Advanced Filters Toggle */}
        <button
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          className={`flex items-center space-x-2 px-3 py-2 border rounded-lg transition-colors ${
            showAdvancedFilters || activeFilterCount > 0
              ? 'border-[#0a0a0a] bg-[#0a0a0a] text-white'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Filter className="w-4 h-4" />
          <span className="text-sm">Filtros</span>
          {activeFilterCount > 0 && (
            <span className="bg-[#fbbf24] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform ${
              showAdvancedFilters ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Clear Filters */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="text-gray-600 hover:text-gray-800 text-sm flex items-center space-x-1"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Limpiar</span>
          </button>
        )}
      </div>

      {/* Advanced Filters Panel */}
      {showAdvancedFilters && (
        <div className="border-t border-gray-200 pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Tags Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Etiquetas
              </label>
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && tagInput.trim()) {
                        addTagFilter(tagInput.trim());
                      }
                    }}
                    placeholder="Agregar etiqueta..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Tag className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
                
                {/* Available tags */}
                {availableTags.length > 0 && (
                  <div className="max-h-24 overflow-y-auto">
                    <div className="flex flex-wrap gap-1">
                      {availableTags
                        .filter(tag => 
                          !filters.tags?.includes(tag) &&
                          tag.toLowerCase().includes(tagInput.toLowerCase())
                        )
                        .slice(0, 8)
                        .map(tag => (
                          <button
                            key={tag}
                            onClick={() => addTagFilter(tag)}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-blue-100 hover:text-blue-800 transition-colors"
                          >
                            {tag}
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {/* Selected tags */}
                {filters.tags && filters.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {filters.tags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800"
                      >
                        {tag}
                        <button
                          onClick={() => removeTagFilter(tag)}
                          className="ml-1 text-blue-600 hover:text-blue-800"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* File Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipos de Archivo
              </label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {SUPPORTED_FILE_TYPES.map(fileType => (
                  <label key={fileType.mime_type} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.mime_types?.includes(fileType.mime_type) || false}
                      onChange={() => toggleMimeTypeFilter(fileType.mime_type)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      {fileType.extension.toUpperCase()}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Uploader Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subido por
              </label>
              <div className="relative">
                <select
                  value={filters.uploaded_by || ''}
                  onChange={(e) => updateFilters({ uploaded_by: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                >
                  <option value="">Todos los usuarios</option>
                  {availableUploaders.map(uploader => (
                    <option key={uploader.id} value={uploader.id}>
                      {uploader.name}
                    </option>
                  ))}
                </select>
                <User className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Date Range Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha de Subida
              </label>
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type="date"
                    value={filters.date_from || ''}
                    onChange={(e) => updateFilters({ date_from: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Desde"
                  />
                  <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                <div className="relative">
                  <input
                    type="date"
                    value={filters.date_to || ''}
                    onChange={(e) => updateFilters({ date_to: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Hasta"
                  />
                  <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* Sort Options */}
          <div className="flex items-center space-x-4 pt-4 border-t border-gray-200">
            <label className="text-sm font-medium text-gray-700">
              Ordenar por:
            </label>
            
            <select
              value={filters.sort_by || 'created_at'}
              onChange={(e) => updateFilters({ sort_by: e.target.value as DocumentSortBy })}
              className="px-3 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="created_at">Fecha de subida</option>
              <option value="name">Nombre</option>
              <option value="size">Tamaño</option>
              <option value="downloads">Descargas</option>
              <option value="views">Visualizaciones</option>
            </select>

            <button
              onClick={() => 
                updateFilters({ 
                  sort_order: filters.sort_order === 'asc' ? 'desc' : 'asc' 
                })
              }
              className="flex items-center space-x-1 px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              {filters.sort_order === 'desc' ? (
                <>
                  <SortDesc className="w-4 h-4" />
                  <span>Descendente</span>
                </>
              ) : (
                <>
                  <SortAsc className="w-4 h-4" />
                  <span>Ascendente</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Active Filters Summary */}
      {activeFilterCount > 0 && !showAdvancedFilters && (
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <span>Filtros activos:</span>
          {filters.search && (
            <span className="inline-flex items-center px-2 py-1 rounded bg-blue-100 text-blue-800">
              Búsqueda: &quot;{filters.search}&quot;
              <button
                onClick={() => updateFilters({ search: '' })}
                className="ml-1 text-blue-600 hover:text-blue-800"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.tags && filters.tags.length > 0 && (
            <span className="inline-flex items-center px-2 py-1 rounded bg-green-100 text-green-800">
              {filters.tags.length} etiqueta(s)
            </span>
          )}
          {filters.mime_types && filters.mime_types.length > 0 && (
            <span className="inline-flex items-center px-2 py-1 rounded bg-amber-100 text-amber-800">
              {filters.mime_types.length} tipo(s) de archivo
            </span>
          )}
          {filters.uploaded_by && (
            <span className="inline-flex items-center px-2 py-1 rounded bg-orange-100 text-orange-800">
              Usuario específico
            </span>
          )}
          {(filters.date_from || filters.date_to) && (
            <span className="inline-flex items-center px-2 py-1 rounded bg-red-100 text-red-800">
              Rango de fechas
            </span>
          )}
        </div>
      )}
    </div>
  );
}