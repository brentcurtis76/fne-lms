// =============================================================================
// Genera - Message Filters Component
// =============================================================================
// Advanced filtering interface for messaging system
// Phase 4 of Collaborative Workspace System

import React, { useState } from 'react';
import {
  Search,
  Filter,
  X,
  Calendar,
  User,
  MessageCircle,
  Paperclip,
  SortAsc,
  SortDesc,
  ChevronDown,
  RefreshCw,
  Hash,
  AtSign,
  Megaphone,
  Eye,
} from 'lucide-react';
import {
  MessageFilters as MessageFiltersType,
  ThreadFilters,
  ThreadCategory,
  MessageType,
  THREAD_CATEGORIES,
  ThreadCategoryConfig,
} from '../../types/messaging';

interface MessageFiltersProps {
  messageFilters: MessageFiltersType;
  threadFilters: ThreadFilters;
  onMessageFiltersChange: (filters: MessageFiltersType) => void;
  onThreadFiltersChange: (filters: ThreadFilters) => void;
  availableAuthors: Array<{ id: string; name: string }>;
  activeView: 'messages' | 'threads';
  onViewChange: (view: 'messages' | 'threads') => void;
  loading?: boolean;
}

export default function MessageFilters({
  messageFilters,
  threadFilters,
  onMessageFiltersChange,
  onThreadFiltersChange,
  availableAuthors,
  activeView,
  onViewChange,
  loading = false,
}: MessageFiltersProps) {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Update message filters
  const updateMessageFilters = (updates: Partial<MessageFiltersType>) => {
    onMessageFiltersChange({ ...messageFilters, ...updates });
  };

  // Update thread filters
  const updateThreadFilters = (updates: Partial<ThreadFilters>) => {
    onThreadFiltersChange({ ...threadFilters, ...updates });
  };

  // Clear all filters
  const clearFilters = () => {
    if (activeView === 'messages') {
      onMessageFiltersChange({
        search: '',
        thread_id: '',
        category: undefined,
        mention_filter: 'all',
        attachment_filter: 'all',
        date_from: '',
        date_to: '',
        author_id: '',
        message_type: undefined,
        sort_by: 'created_at',
        sort_order: 'desc',
      });
    } else {
      onThreadFiltersChange({
        search: '',
        category: undefined,
        status: 'all',
        participant_filter: 'all',
        date_from: '',
        date_to: '',
        created_by: '',
        sort_by: 'last_message_at',
        sort_order: 'desc',
      });
    }
    setShowAdvancedFilters(false);
  };

  // Get active filter count
  const getActiveFilterCount = () => {
    if (activeView === 'messages') {
      let count = 0;
      if (messageFilters.search) count++;
      if (messageFilters.thread_id) count++;
      if (messageFilters.category) count++;
      if (messageFilters.mention_filter !== 'all') count++;
      if (messageFilters.attachment_filter !== 'all') count++;
      if (messageFilters.author_id) count++;
      if (messageFilters.message_type) count++;
      if (messageFilters.date_from || messageFilters.date_to) count++;
      return count;
    } else {
      let count = 0;
      if (threadFilters.search) count++;
      if (threadFilters.category) count++;
      if (threadFilters.status !== 'all') count++;
      if (threadFilters.participant_filter !== 'all') count++;
      if (threadFilters.created_by) count++;
      if (threadFilters.date_from || threadFilters.date_to) count++;
      return count;
    }
  };

  const activeFilterCount = getActiveFilterCount();

  return (
    <div className="bg-white border-b border-gray-200 p-4 space-y-4">
      {/* Top Row - Search, View Toggle, and Actions */}
      <div className="flex items-center space-x-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={activeView === 'messages' ? (messageFilters.search || '') : (threadFilters.search || '')}
            onChange={(e) => {
              if (activeView === 'messages') {
                updateMessageFilters({ search: e.target.value });
              } else {
                updateThreadFilters({ search: e.target.value });
              }
            }}
            placeholder={
              activeView === 'messages'
                ? "Buscar mensajes por contenido, autor o menciones..."
                : "Buscar hilos por título, descripción o categoría..."
            }
            disabled={loading}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
          {((activeView === 'messages' && messageFilters.search) || 
            (activeView === 'threads' && threadFilters.search)) && (
            <button
              onClick={() => {
                if (activeView === 'messages') {
                  updateMessageFilters({ search: '' });
                } else {
                  updateThreadFilters({ search: '' });
                }
              }}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* View Toggle */}
        <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
          <button
            onClick={() => onViewChange('messages')}
            className={`px-3 py-2 flex items-center space-x-2 text-sm ${
              activeView === 'messages'
                ? 'bg-[#0a0a0a] text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            } transition-colors`}
          >
            <MessageCircle className="w-4 h-4" />
            <span>Mensajes</span>
          </button>
          <button
            onClick={() => onViewChange('threads')}
            className={`px-3 py-2 flex items-center space-x-2 text-sm ${
              activeView === 'threads'
                ? 'bg-[#0a0a0a] text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            } transition-colors`}
          >
            <Hash className="w-4 h-4" />
            <span>Hilos</span>
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
          {activeView === 'messages' ? (
            // Message Filters
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Category Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Categoría
                </label>
                <div className="relative">
                  <select
                    value={messageFilters.category || ''}
                    onChange={(e) => updateMessageFilters({ 
                      category: e.target.value as ThreadCategory || undefined 
                    })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                  >
                    <option value="">Todas las categorías</option>
                    {THREAD_CATEGORIES.map(category => (
                      <option key={category.type} value={category.type}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                  <Hash className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Mention Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Menciones
                </label>
                <div className="relative">
                  <select
                    value={messageFilters.mention_filter || 'all'}
                    onChange={(e) => updateMessageFilters({ 
                      mention_filter: e.target.value as 'all' | 'mentions_only' | 'my_messages'
                    })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                  >
                    <option value="all">Todos los mensajes</option>
                    <option value="mentions_only">Solo menciones</option>
                    <option value="my_messages">Mis mensajes</option>
                  </select>
                  <AtSign className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Attachment Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Archivos Adjuntos
                </label>
                <div className="relative">
                  <select
                    value={messageFilters.attachment_filter || 'all'}
                    onChange={(e) => updateMessageFilters({ 
                      attachment_filter: e.target.value as 'all' | 'with_attachments' | 'no_attachments'
                    })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                  >
                    <option value="all">Todos los mensajes</option>
                    <option value="with_attachments">Con archivos</option>
                    <option value="no_attachments">Sin archivos</option>
                  </select>
                  <Paperclip className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Author Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Autor
                </label>
                <div className="relative">
                  <select
                    value={messageFilters.author_id || ''}
                    onChange={(e) => updateMessageFilters({ author_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                  >
                    <option value="">Todos los autores</option>
                    {availableAuthors.map(author => (
                      <option key={author.id} value={author.id}>
                        {author.name}
                      </option>
                    ))}
                  </select>
                  <User className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Message Type Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Mensaje
                </label>
                <div className="relative">
                  <select
                    value={messageFilters.message_type || ''}
                    onChange={(e) => updateMessageFilters({ 
                      message_type: e.target.value as MessageType || undefined 
                    })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                  >
                    <option value="">Todos los tipos</option>
                    <option value="regular">Regular</option>
                    <option value="system">Sistema</option>
                    <option value="announcement">Anuncio</option>
                  </select>
                  <Megaphone className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Date Range Filter */}
              <div className="md:col-span-2 lg:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rango de Fechas
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <input
                      type="date"
                      value={messageFilters.date_from || ''}
                      onChange={(e) => updateMessageFilters({ date_from: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Desde"
                    />
                    <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <div className="relative">
                    <input
                      type="date"
                      value={messageFilters.date_to || ''}
                      onChange={(e) => updateMessageFilters({ date_to: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Hasta"
                    />
                    <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Thread Filters
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Category Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Categoría
                </label>
                <div className="relative">
                  <select
                    value={threadFilters.category || ''}
                    onChange={(e) => updateThreadFilters({ 
                      category: e.target.value as ThreadCategory || undefined 
                    })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                  >
                    <option value="">Todas las categorías</option>
                    {THREAD_CATEGORIES.map(category => (
                      <option key={category.type} value={category.type}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                  <Hash className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estado
                </label>
                <div className="relative">
                  <select
                    value={threadFilters.status || 'all'}
                    onChange={(e) => updateThreadFilters({ 
                      status: e.target.value as 'all' | 'active' | 'pinned' | 'archived'
                    })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                  >
                    <option value="all">Todos los hilos</option>
                    <option value="active">Activos</option>
                    <option value="pinned">Fijados</option>
                    <option value="archived">Archivados</option>
                  </select>
                  <Eye className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Participation Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Participación
                </label>
                <div className="relative">
                  <select
                    value={threadFilters.participant_filter || 'all'}
                    onChange={(e) => updateThreadFilters({ 
                      participant_filter: e.target.value as 'all' | 'participating' | 'not_participating'
                    })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                  >
                    <option value="all">Todos los hilos</option>
                    <option value="participating">Participando</option>
                    <option value="not_participating">No participando</option>
                  </select>
                  <User className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Creator Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Creado por
                </label>
                <div className="relative">
                  <select
                    value={threadFilters.created_by || ''}
                    onChange={(e) => updateThreadFilters({ created_by: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                  >
                    <option value="">Todos los creadores</option>
                    {availableAuthors.map(author => (
                      <option key={author.id} value={author.id}>
                        {author.name}
                      </option>
                    ))}
                  </select>
                  <User className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Date Range Filter */}
              <div className="md:col-span-2 lg:col-span-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rango de Fechas de Creación
                </label>
                <div className="grid grid-cols-2 gap-2 max-w-md">
                  <div className="relative">
                    <input
                      type="date"
                      value={threadFilters.date_from || ''}
                      onChange={(e) => updateThreadFilters({ date_from: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Desde"
                    />
                    <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <div className="relative">
                    <input
                      type="date"
                      value={threadFilters.date_to || ''}
                      onChange={(e) => updateThreadFilters({ date_to: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Hasta"
                    />
                    <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sort Options */}
          <div className="flex items-center space-x-4 pt-4 border-t border-gray-200">
            <label className="text-sm font-medium text-gray-700">
              Ordenar por:
            </label>
            
            <select
              value={
                activeView === 'messages' 
                  ? (messageFilters.sort_by || 'created_at')
                  : (threadFilters.sort_by || 'last_message_at')
              }
              onChange={(e) => {
                if (activeView === 'messages') {
                  updateMessageFilters({ 
                    sort_by: e.target.value as 'created_at' | 'relevance' | 'thread_activity'
                  });
                } else {
                  updateThreadFilters({ 
                    sort_by: e.target.value as 'last_message_at' | 'created_at' | 'message_count' | 'participant_count' | 'thread_title'
                  });
                }
              }}
              className="px-3 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {activeView === 'messages' ? (
                <>
                  <option value="created_at">Fecha de creación</option>
                  <option value="relevance">Relevancia</option>
                  <option value="thread_activity">Actividad del hilo</option>
                </>
              ) : (
                <>
                  <option value="last_message_at">Último mensaje</option>
                  <option value="created_at">Fecha de creación</option>
                  <option value="message_count">Número de mensajes</option>
                  <option value="participant_count">Participantes</option>
                  <option value="thread_title">Título</option>
                </>
              )}
            </select>

            <button
              onClick={() => {
                const currentOrder = activeView === 'messages' 
                  ? messageFilters.sort_order 
                  : threadFilters.sort_order;
                const newOrder = currentOrder === 'asc' ? 'desc' : 'asc';
                
                if (activeView === 'messages') {
                  updateMessageFilters({ sort_order: newOrder });
                } else {
                  updateThreadFilters({ sort_order: newOrder });
                }
              }}
              className="flex items-center space-x-1 px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              {((activeView === 'messages' ? messageFilters.sort_order : threadFilters.sort_order) === 'desc') ? (
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
          
          {/* Common filters */}
          {((activeView === 'messages' && messageFilters.search) || 
            (activeView === 'threads' && threadFilters.search)) && (
            <span className="inline-flex items-center px-2 py-1 rounded bg-blue-100 text-blue-800">
              Búsqueda: &quot;{activeView === 'messages' ? messageFilters.search : threadFilters.search}&quot;
              <button
                onClick={() => {
                  if (activeView === 'messages') {
                    updateMessageFilters({ search: '' });
                  } else {
                    updateThreadFilters({ search: '' });
                  }
                }}
                className="ml-1 text-blue-600 hover:text-blue-800"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          
          {((activeView === 'messages' && messageFilters.category) || 
            (activeView === 'threads' && threadFilters.category)) && (
            <span className="inline-flex items-center px-2 py-1 rounded bg-green-100 text-green-800">
              Categoría específica
            </span>
          )}

          {/* Message-specific filters */}
          {activeView === 'messages' && (
            <>
              {messageFilters.mention_filter !== 'all' && (
                <span className="inline-flex items-center px-2 py-1 rounded bg-amber-100 text-amber-800">
                  Filtro de menciones
                </span>
              )}
              {messageFilters.attachment_filter !== 'all' && (
                <span className="inline-flex items-center px-2 py-1 rounded bg-orange-100 text-orange-800">
                  Filtro de archivos
                </span>
              )}
              {messageFilters.author_id && (
                <span className="inline-flex items-center px-2 py-1 rounded bg-yellow-100 text-yellow-800">
                  Autor específico
                </span>
              )}
              {messageFilters.message_type && (
                <span className="inline-flex items-center px-2 py-1 rounded bg-pink-100 text-pink-800">
                  Tipo específico
                </span>
              )}
            </>
          )}

          {/* Thread-specific filters */}
          {activeView === 'threads' && (
            <>
              {threadFilters.status !== 'all' && (
                <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-800">
                  Estado específico
                </span>
              )}
              {threadFilters.participant_filter !== 'all' && (
                <span className="inline-flex items-center px-2 py-1 rounded bg-teal-100 text-teal-800">
                  Filtro de participación
                </span>
              )}
              {threadFilters.created_by && (
                <span className="inline-flex items-center px-2 py-1 rounded bg-cyan-100 text-cyan-800">
                  Creador específico
                </span>
              )}
            </>
          )}

          {/* Date range filters */}
          {((activeView === 'messages' && (messageFilters.date_from || messageFilters.date_to)) ||
            (activeView === 'threads' && (threadFilters.date_from || threadFilters.date_to))) && (
            <span className="inline-flex items-center px-2 py-1 rounded bg-red-100 text-red-800">
              Rango de fechas
            </span>
          )}
        </div>
      )}
    </div>
  );
}