import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import MainLayout from '../components/layout/MainLayout';
import { 
  BellIcon, 
  ArrowLeftIcon,
  SearchIcon,
  FilterIcon,
  TrashIcon,
  RefreshIcon,
  CogIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon
} from '@heroicons/react/outline';
import { 
  ShieldCheckIcon,
  CheckIcon as CheckSquareIcon,
  BookOpenIcon,
  ChatAlt2Icon,
  CogIcon as SystemIcon,
  DocumentIcon,
  UserGroupIcon
} from '@heroicons/react/solid';
import { toast } from 'react-hot-toast';
import { checkUserAccess, getAlternativeUrl } from '../utils/notificationPermissions';
import { UserNotification } from './api/notifications/index';
import NotificationDeleteModal from '../components/notifications/NotificationDeleteModal';

interface NotificationFilters {
  search: string;
  category: string;
  status: 'all' | 'unread' | 'read';
  dateRange: 'all' | 'today' | 'week' | 'month';
}

export default function NotificationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  
  // Notifications state
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [filteredNotifications, setFilteredNotifications] = useState<UserNotification[]>([]);
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const notificationsPerPage = 20;
  
  // Filters
  const [filters, setFilters] = useState<NotificationFilters>({
    search: '',
    category: 'all',
    status: 'all',
    dateRange: 'all'
  });
  
  // UI state
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);

  useEffect(() => {
    checkUserAuth();
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadNotifications();
    }
  }, [currentUser]);

  useEffect(() => {
    applyFilters();
  }, [notifications, filters]);

  useEffect(() => {
    // Calculate total pages whenever filtered notifications change
    setTotalPages(Math.ceil(filteredNotifications.length / notificationsPerPage));
    setCurrentPage(1); // Reset to first page when filters change
  }, [filteredNotifications]);

  const checkUserAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }

      setCurrentUser(session.user);

      // Get user profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role, avatar_url')
        .eq('id', session.user.id)
        .single();
        
      if (profileData) {
        setIsAdmin(profileData.role === 'admin');
        setAvatarUrl(profileData.avatar_url);
      }
      
    } catch (error) {
      console.error('Authentication error:', error);
      router.push('/login');
    }
  };

  const loadNotifications = async () => {
    try {
      setLoading(true);
      
      // First, let's try a simple query to see if the table is accessible
      console.log('Loading notifications for user:', currentUser.id);
      
      const { data, error } = await supabase
        .from('user_notifications')
        .select(`
          *,
          notification_type:notification_types!notification_type_id(
            id,
            name,
            category
          )
        `)
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error details:', error);
        throw error;
      }

      console.log('Notifications loaded:', data?.length || 0);
      setNotifications(data || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
      toast.error('Error al cargar las notificaciones');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...notifications];

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(n => 
        n.title.toLowerCase().includes(searchLower) ||
        n.description?.toLowerCase().includes(searchLower)
      );
    }

    // Category filter
    if (filters.category !== 'all') {
      filtered = filtered.filter(n => n.notification_type?.category === filters.category);
    }

    // Status filter
    if (filters.status === 'unread') {
      filtered = filtered.filter(n => !n.is_read);
    } else if (filters.status === 'read') {
      filtered = filtered.filter(n => n.is_read);
    }

    // Date range filter
    if (filters.dateRange !== 'all') {
      const now = new Date();
      const startDate = new Date();
      
      switch (filters.dateRange) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          break;
      }
      
      filtered = filtered.filter(n => new Date(n.created_at) >= startDate);
    }

    setFilteredNotifications(filtered);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
    toast.success('Notificaciones actualizadas');
  };

  const handleMarkAsRead = async (notificationIds: string[]) => {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('id', notificationIds);

      if (error) throw error;

      // Update local state
      setNotifications(prev => 
        prev.map(n => 
          notificationIds.includes(n.id) 
            ? { ...n, is_read: true, read_at: new Date().toISOString() }
            : n
        )
      );

      toast.success(`${notificationIds.length} notificación(es) marcada(s) como leída(s)`);
    } catch (error) {
      console.error('Error marking as read:', error);
      toast.error('Error al marcar como leídas');
    }
  };

  const handleMarkAsUnread = async (notificationIds: string[]) => {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: false, read_at: null })
        .in('id', notificationIds);

      if (error) throw error;

      // Update local state
      setNotifications(prev => 
        prev.map(n => 
          notificationIds.includes(n.id) 
            ? { ...n, is_read: false, read_at: null }
            : n
        )
      );

      toast.success(`${notificationIds.length} notificación(es) marcada(s) como no leída(s)`);
    } catch (error) {
      console.error('Error marking as unread:', error);
      toast.error('Error al marcar como no leídas');
    }
  };

  const handleDeleteClick = (notificationIds: string[]) => {
    setDeleteTargetIds(notificationIds);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .delete()
        .in('id', deleteTargetIds);

      if (error) throw error;

      // Update local state
      setNotifications(prev => prev.filter(n => !deleteTargetIds.includes(n.id)));
      setSelectedNotifications(new Set());

      toast.success(`${deleteTargetIds.length} notificación(es) eliminada(s)`);
      setShowDeleteModal(false);
      setDeleteTargetIds([]);
    } catch (error) {
      console.error('Error deleting notifications:', error);
      toast.error('Error al eliminar notificaciones');
    }
  };

  const handleNotificationClick = async (notification: UserNotification) => {
    // Mark as read if unread
    if (!notification.is_read) {
      await handleMarkAsRead([notification.id]);
    }

    // Navigate to URL if available
    if (notification.related_url) {
      const hasAccess = await checkUserAccess(notification.related_url, currentUser.id);
      
      if (hasAccess) {
        router.push(notification.related_url);
      } else {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', currentUser.id)
          .single();
          
        const alternativeUrl = getAlternativeUrl(
          notification.related_url, 
          profile?.role || 'docente',
          notification.notification_type?.name
        );
        
        if (alternativeUrl) {
          toast.error('No tienes permisos para acceder a esta página. Redirigiendo...');
          setTimeout(() => {
            router.push(alternativeUrl);
          }, 1500);
        } else {
          toast.error('No tienes permisos para acceder a esta página');
        }
      }
    }
  };

  const toggleSelectAll = () => {
    const pageNotifications = getPaginatedNotifications();
    if (selectedNotifications.size === pageNotifications.length) {
      setSelectedNotifications(new Set());
    } else {
      setSelectedNotifications(new Set(pageNotifications.map(n => n.id)));
    }
  };

  const toggleSelectNotification = (id: string) => {
    const newSelected = new Set(selectedNotifications);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedNotifications(newSelected);
  };

  const getPaginatedNotifications = () => {
    const startIndex = (currentPage - 1) * notificationsPerPage;
    const endIndex = startIndex + notificationsPerPage;
    return filteredNotifications.slice(startIndex, endIndex);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'admin': return ShieldCheckIcon;
      case 'assignments': return CheckSquareIcon;
      case 'courses': return BookOpenIcon;
      case 'messaging': return ChatAlt2Icon;
      case 'social': return UserGroupIcon;
      case 'feedback': return ChatAlt2Icon;
      case 'system': return SystemIcon;
      case 'workspace': return DocumentIcon;
      default: return BellIcon;
    }
  };

  const getCategoryName = (category: string) => {
    switch (category) {
      case 'admin': return 'Administración';
      case 'assignments': return 'Tareas';
      case 'courses': return 'Cursos';
      case 'messaging': return 'Mensajes';
      case 'social': return 'Social';
      case 'feedback': return 'Feedback';
      case 'system': return 'Sistema';
      case 'workspace': return 'Workspace';
      default: return 'Otras';
    }
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (minutes < 1) return 'ahora mismo';
    if (minutes < 60) return `hace ${minutes} min`;
    if (hours < 24) return `hace ${hours}h`;
    if (days < 7) return `hace ${days}d`;
    
    return date.toLocaleDateString('es-ES', { 
      day: 'numeric', 
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  if (loading) {
    return (
      <MainLayout 
        user={currentUser} 
        currentPage="notifications"
        pageTitle="Notificaciones"
        isAdmin={isAdmin}
        avatarUrl={avatarUrl}
      >
        <div className="flex items-center justify-center min-h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00365b]"></div>
        </div>
      </MainLayout>
    );
  }

  const paginatedNotifications = getPaginatedNotifications();

  return (
    <MainLayout 
      user={currentUser} 
      currentPage="notifications"
      pageTitle="Notificaciones"
      isAdmin={isAdmin}
      avatarUrl={avatarUrl}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Todas las Notificaciones</h1>
              <p className="text-gray-600 mt-1">
                {filteredNotifications.length} notificación(es) • 
                {filteredNotifications.filter(n => !n.is_read).length} sin leer
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              {/* Preferences Link */}
              <button
                onClick={() => router.push('/configuracion')}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Preferencias de notificaciones"
              >
                <CogIcon className="h-5 w-5" />
              </button>
              
              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Actualizar"
              >
                <RefreshIcon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              
              {/* Filters Toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-2 rounded-lg transition-colors ${
                  showFilters 
                    ? 'bg-[#00365b] text-white' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
                title="Filtros"
              >
                <FilterIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Search */}
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar notificaciones..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                />
              </div>

              {/* Category Filter */}
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
              >
                <option value="all">Todas las categorías</option>
                <option value="admin">Administración</option>
                <option value="assignments">Tareas</option>
                <option value="courses">Cursos</option>
                <option value="messaging">Mensajes</option>
                <option value="social">Social</option>
                <option value="feedback">Feedback</option>
                <option value="system">Sistema</option>
                <option value="workspace">Workspace</option>
              </select>

              {/* Status Filter */}
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
              >
                <option value="all">Todas</option>
                <option value="unread">No leídas</option>
                <option value="read">Leídas</option>
              </select>

              {/* Date Range Filter */}
              <select
                value={filters.dateRange}
                onChange={(e) => setFilters({ ...filters, dateRange: e.target.value as any })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
              >
                <option value="all">Todo el tiempo</option>
                <option value="today">Hoy</option>
                <option value="week">Última semana</option>
                <option value="month">Último mes</option>
              </select>
            </div>
          </div>
        )}

        {/* Bulk Actions */}
        {selectedNotifications.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center justify-between">
            <span className="text-sm text-blue-700">
              {selectedNotifications.size} notificación(es) seleccionada(s)
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleMarkAsRead(Array.from(selectedNotifications))}
                className="px-3 py-1 text-sm bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <EyeIcon className="h-4 w-4 inline mr-1" />
                Marcar como leídas
              </button>
              <button
                onClick={() => handleMarkAsUnread(Array.from(selectedNotifications))}
                className="px-3 py-1 text-sm bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <EyeOffIcon className="h-4 w-4 inline mr-1" />
                Marcar como no leídas
              </button>
              <button
                onClick={() => handleDeleteClick(Array.from(selectedNotifications))}
                className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                <TrashIcon className="h-4 w-4 inline mr-1" />
                Eliminar
              </button>
            </div>
          </div>
        )}

        {/* Notifications List */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          {paginatedNotifications.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <BellIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No hay notificaciones
              </h3>
              <p className="text-gray-600">
                {filters.search || filters.category !== 'all' || filters.status !== 'all' || filters.dateRange !== 'all'
                  ? 'No se encontraron notificaciones con los filtros aplicados'
                  : 'No tienes notificaciones en este momento'
                }
              </p>
            </div>
          ) : (
            <>
              {/* Select All */}
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedNotifications.size === paginatedNotifications.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 text-[#00365b] focus:ring-[#00365b] border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">Seleccionar todas</span>
                </label>
              </div>

              {/* Notification Items */}
              <div className="divide-y divide-gray-200">
                {paginatedNotifications.map((notification) => {
                  const IconComponent = getCategoryIcon(notification.notification_type?.category || '');
                  const isSelected = selectedNotifications.has(notification.id);
                  
                  return (
                    <div
                      key={notification.id}
                      className={`
                        px-4 py-4 transition-all duration-200
                        ${notification.is_read 
                          ? 'hover:bg-gray-50' 
                          : 'bg-blue-50 hover:bg-blue-100 border-l-4 border-l-[#fdb933]'
                        }
                      `}
                    >
                      <div className="flex items-start space-x-3">
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectNotification(notification.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 h-4 w-4 text-[#00365b] focus:ring-[#00365b] border-gray-300 rounded"
                        />

                        {/* Icon */}
                        <div className={`
                          flex-shrink-0 p-2 rounded-full
                          ${notification.is_read 
                            ? 'bg-gray-100 text-gray-500' 
                            : 'bg-[#00365b] text-white'
                          }
                        `}>
                          <IconComponent className="h-5 w-5" />
                        </div>

                        {/* Content */}
                        <div 
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => handleNotificationClick(notification)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className={`
                                text-sm font-medium
                                ${notification.is_read ? 'text-gray-900' : 'text-[#00365b]'}
                              `}>
                                {notification.title}
                              </p>
                              
                              {notification.description && (
                                <p className={`
                                  text-sm mt-1
                                  ${notification.is_read ? 'text-gray-600' : 'text-gray-700'}
                                `}>
                                  {notification.description}
                                </p>
                              )}
                              
                              <div className="flex items-center justify-between mt-2">
                                <div className="flex items-center space-x-4 text-xs text-gray-500">
                                  <span className="flex items-center">
                                    <ClockIcon className="h-3 w-3 mr-1" />
                                    {getRelativeTime(notification.created_at)}
                                  </span>
                                  
                                  {notification.notification_type && (
                                    <span className={`
                                      inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
                                      ${notification.is_read 
                                        ? 'bg-gray-100 text-gray-600' 
                                        : 'bg-[#fdb933]/20 text-[#00365b]'
                                      }
                                    `}>
                                      {getCategoryName(notification.notification_type.category)}
                                    </span>
                                  )}
                                </div>

                                {notification.related_url && (
                                  <ArrowLeftIcon className="h-4 w-4 text-gray-400 rotate-180" />
                                )}
                              </div>
                            </div>

                            {/* Unread Indicator */}
                            {!notification.is_read && (
                              <div className="flex-shrink-0 ml-4">
                                <div className="w-2 h-2 bg-[#fdb933] rounded-full"></div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 text-sm bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Anterior
                    </button>
                    
                    <span className="text-sm text-gray-700">
                      Página {currentPage} de {totalPages}
                    </span>
                    
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 text-sm bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <NotificationDeleteModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeleteTargetIds([]);
        }}
        onConfirm={handleDeleteConfirm}
        count={deleteTargetIds.length}
      />
    </MainLayout>
  );
}