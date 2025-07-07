import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '../components/layout/MainLayout';
import {
  BellIcon,
  SearchIcon,
  FilterIcon,
  TrashIcon,
  RefreshIcon,
  CogIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  ArrowLeftIcon,
} from '@heroicons/react/outline';
import {
  ShieldCheckIcon,
  BookOpenIcon,
  ChatAlt2Icon,
  CogIcon as SystemIcon,
  UserGroupIcon,
  AcademicCapIcon,
  ChatIcon,
  OfficeBuildingIcon,
  QuestionMarkCircleIcon,
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
  const session = useSession();
  const supabase = useSupabaseClient();
  const [loading, setLoading] = useState(true);
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
    dateRange: 'all',
  });

  // UI state
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);

  const loadNotifications = useCallback(async () => {
    if (!session) return;
    try {
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
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
      toast.error('Error al cargar notificaciones.');
    } finally {
      setRefreshing(false);
    }
  }, [session, supabase]);

  const loadInitialData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role, avatar_url')
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        setIsAdmin(profileData.role === 'admin');
        setAvatarUrl(profileData.avatar_url);
      }
      await loadNotifications();
    } catch (error) {
      console.error('Error loading initial data:', error);
      toast.error('Error al cargar los datos iniciales.');
    } finally {
      setLoading(false);
    }
  }, [session, supabase, loadNotifications]);

  useEffect(() => {
    if (session) {
      loadInitialData();
    } else if (session === null) {
      router.push('/login');
    }
  }, [session, router, loadInitialData]);

  const applyFilters = useCallback(() => {
    let tempNotifications = [...notifications];
    if (filters.search) {
      tempNotifications = tempNotifications.filter(n =>
        n.title.toLowerCase().includes(filters.search.toLowerCase()) ||
        n.description?.toLowerCase().includes(filters.search.toLowerCase())
      );
    }
    if (filters.category !== 'all') {
        tempNotifications = tempNotifications.filter(n => n.notification_type.category === filters.category);
    }
    if (filters.status !== 'all') {
      tempNotifications = tempNotifications.filter(n => filters.status === 'read' ? n.is_read : !n.is_read);
    }
    if (filters.dateRange !== 'all') {
      const now = new Date();
      let startDate = new Date();
      if (filters.dateRange === 'today') startDate.setHours(0, 0, 0, 0);
      else if (filters.dateRange === 'week') startDate.setDate(now.getDate() - 7);
      else if (filters.dateRange === 'month') startDate.setMonth(now.getMonth() - 1);
      tempNotifications = tempNotifications.filter(n => new Date(n.created_at) >= startDate);
    }
    setFilteredNotifications(tempNotifications);
  }, [notifications, filters]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  useEffect(() => {
    setTotalPages(Math.ceil(filteredNotifications.length / notificationsPerPage));
    setCurrentPage(1);
    setSelectedNotifications(new Set());
  }, [filteredNotifications, notificationsPerPage]);

  const paginatedNotifications = React.useMemo(() => {
    const startIndex = (currentPage - 1) * notificationsPerPage;
    const endIndex = startIndex + notificationsPerPage;
    return filteredNotifications.slice(startIndex, endIndex);
  }, [currentPage, notificationsPerPage, filteredNotifications]);


  const handleRefresh = () => {
    setRefreshing(true);
    setSelectedNotifications(new Set());
    loadNotifications();
  };

  const handleMarkAsRead = async (notificationIds: string[]) => {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('id', notificationIds);
      if (error) throw error;
      setNotifications(prev =>
        prev.map(n => notificationIds.includes(n.id) ? { ...n, is_read: true } : n)
      );
      setSelectedNotifications(new Set());
      toast.success(`${notificationIds.length} notificación(es) marcada(s) como leída(s)`);
    } catch (error) {
      console.error('Error marking as read:', error);
      toast.error('Error al marcar como leído');
    }
  };

  const handleMarkAsUnread = async (notificationIds: string[]) => {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: false, read_at: null })
        .in('id', notificationIds);
      if (error) throw error;
      setNotifications(prev =>
        prev.map(n => notificationIds.includes(n.id) ? { ...n, is_read: false } : n)
      );
      setSelectedNotifications(new Set());
      toast.success(`${notificationIds.length} notificación(es) marcada(s) como no leída(s)`);
    } catch (error) {
      console.error('Error marking as unread:', error);
      toast.error('Error al marcar como no leído');
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
      setNotifications(prev => prev.filter(n => !deleteTargetIds.includes(n.id)));
      setSelectedNotifications(new Set());
      toast.success(`${deleteTargetIds.length} notificación(es) eliminada(s)`);
    } catch (error) {
      console.error('Error deleting notifications:', error);
      toast.error('Error al eliminar notificaciones');
    } finally {
      setShowDeleteModal(false);
      setDeleteTargetIds([]);
    }
  };

  const handleNotificationClick = async (notification: UserNotification) => {
    if (!session) return;
    if (!notification.is_read) {
      // Optimistically update UI, then mark as read
      setNotifications(prev =>
        prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
      );
      await handleMarkAsRead([notification.id]);
    }

    if (notification.related_url) {
      const hasAccess = await checkUserAccess(notification.related_url, session.user.id);

      if (hasAccess) {
        router.push(notification.related_url);
      } else {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        const alternativeUrl = getAlternativeUrl(
          notification.related_url,
          profile?.role || 'docente',
          notification.notification_type?.name
        );

        if (alternativeUrl) {
          toast.error('No tienes permisos. Redirigiendo...');
          setTimeout(() => router.push(alternativeUrl), 1500);
        } else {
          toast.error('No tienes permisos para acceder a esta página');
        }
      }
    }
  };

  const toggleSelectAll = () => {
    if (selectedNotifications.size === paginatedNotifications.length && paginatedNotifications.length > 0) {
      setSelectedNotifications(new Set());
    } else {
      setSelectedNotifications(new Set(paginatedNotifications.map(n => n.id)));
    }
  };

  const toggleSelectNotification = (id: string) => {
    const newSelection = new Set(selectedNotifications);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedNotifications(newSelection);
  };

  const getCategoryIcon = (category: string) => {
    const iconMap: { [key: string]: React.ElementType } = {
      admin: ShieldCheckIcon,
      assignments: AcademicCapIcon,
      courses: BookOpenIcon,
      messaging: ChatIcon,
      social: UserGroupIcon,
      feedback: ChatAlt2Icon,
      system: SystemIcon,
      workspace: OfficeBuildingIcon,
    };
    return iconMap[category] || QuestionMarkCircleIcon;
  };

  const getCategoryName = (category: string) => {
    const nameMap: { [key: string]: string } = {
      admin: 'Administración',
      assignments: 'Tareas',
      courses: 'Cursos',
      messaging: 'Mensajes',
      social: 'Social',
      feedback: 'Feedback',
      system: 'Sistema',
      workspace: 'Workspace',
    };
    return nameMap[category] || category;
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 365) return date.toLocaleDateString();
    if (days > 30) return `hace ${Math.floor(days / 30)} mes(es)`;
    if (days > 0) return `hace ${days} día(s)`;
    if (hours > 0) return `hace ${hours} hora(s)`;
    if (minutes > 0) return `hace ${minutes} minuto(s)`;
    return 'justo ahora';
  };

  if (loading) {
    return (
      <MainLayout user={session?.user} currentPage="notifications" pageTitle="Notificaciones" isAdmin={isAdmin} onLogout={() => supabase.auth.signOut()} avatarUrl={avatarUrl}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00365b]"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout user={session?.user} currentPage="notifications" pageTitle="Notificaciones" isAdmin={isAdmin} onLogout={() => supabase.auth.signOut()} avatarUrl={avatarUrl}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Todas las Notificaciones</h1>
              <p className="text-gray-600 mt-1">
                {filteredNotifications.length} notificación(es) • {filteredNotifications.filter(n => !n.is_read).length} sin leer
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button onClick={() => router.push('/configuracion')} className="p-2 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100" title="Configuración">
                <CogIcon className="h-5 w-5" />
              </button>
              <button onClick={handleRefresh} disabled={refreshing} className="p-2 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-50" title="Refrescar">
                <RefreshIcon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setShowFilters(!showFilters)} className={`p-2 rounded-full ${showFilters ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`} title="Filtros">
                <FilterIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as 'all' | 'read' | 'unread' })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
              >
                <option value="all">Todas</option>
                <option value="unread">No leídas</option>
                <option value="read">Leídas</option>
              </select>
              <select
                value={filters.dateRange}
                onChange={(e) => setFilters({ ...filters, dateRange: e.target.value as 'all' | 'today' | 'week' | 'month' })}
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
                    checked={paginatedNotifications.length > 0 && selectedNotifications.size === paginatedNotifications.length}
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
                          : 'bg-blue-50 hover:bg-blue-100'
                        }
                        ${isSelected ? 'bg-blue-100' : ''}
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