import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { 
  BellIcon, 
  CheckIcon,
  ArrowRightIcon,
  RefreshIcon,
  ShieldCheckIcon,
  BookOpenIcon,
  ChatAlt2Icon,
  CogIcon,
  DocumentIcon,
  UserGroupIcon
} from '@heroicons/react/outline';
import { BellIcon as BellSolidIcon } from '@heroicons/react/solid';

interface NotificationItem {
  id: string;
  title: string;
  description: string;
  category: string;
  is_read: boolean;
  created_at: string;
  related_url?: string;
}

interface ModernNotificationCenterProps {
  className?: string;
}

const ModernNotificationCenter: React.FC<ModernNotificationCenterProps> = ({ className = '' }) => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const lastFetchRef = useRef<number>(0);
  const isFetchingRef = useRef<boolean>(false);

  // Auto-refresh interval (30 seconds)
  const REFRESH_INTERVAL = 30000;

  // Fetch notifications directly from Supabase - memoized to prevent infinite loops
  const fetchNotifications = useCallback(async (showLoading = false) => {
    // Debounce mechanism - prevent fetches within 1 second of each other
    const now = Date.now();
    if (now - lastFetchRef.current < 1000) {
      console.log('Skipping fetch - too soon after last fetch');
      return;
    }
    
    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      console.log('Skipping fetch - already fetching');
      return;
    }
    
    isFetchingRef.current = true;
    lastFetchRef.current = now;
    
    try {
      if (showLoading) setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.log('No session found');
        return;
      }

      console.log('Fetching notifications for user:', session.user.id);

      // Fetch user's notifications directly
      const { data: notifications, error: notifError } = await supabase
        .from('user_notifications')
        .select(`
          id,
          title,
          description,
          is_read,
          related_url,
          created_at,
          notification_type_id
        `)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(20);  // Increased from 10 to show more notifications

      if (notifError) {
        console.error('Error fetching notifications:', notifError);
        throw new Error('Failed to fetch notifications');
      }

      console.log('Notifications found:', notifications?.length || 0);

      // Count unread notifications
      const { count: unreadCount, error: countError } = await supabase
        .from('user_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .eq('is_read', false);

      if (countError) {
        console.error('Error counting unread notifications:', countError);
      }

      // Transform to match our interface
      const transformedNotifications = (notifications || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description || '',
        category: getCategoryFromType(item.notification_type_id),
        is_read: item.is_read || false,
        created_at: item.created_at,
        related_url: item.related_url
      }));

      setNotifications(transformedNotifications);
      setUnreadCount(unreadCount || 0);
      console.log('Set notifications:', transformedNotifications.length, 'unread:', unreadCount);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
      
      // Don't use mock data - show real error
      setNotifications([]);
      setUnreadCount(0);
      return;
      
      // Fall back to mock data if API fails
      const mockNotifications: NotificationItem[] = [
        {
          id: '1',
          title: 'Nueva tarea: Análisis de Liderazgo',
          description: 'Se ha asignado una nueva tarea para el módulo de Gestión de Equipos',
          category: 'assignments',
          is_read: false,
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          related_url: '/assignments/123'
        },
        {
          id: '2', 
          title: 'Curso completado exitosamente',
          description: 'Has finalizado el curso "Innovación en Educación" con excelencia',
          category: 'courses',
          is_read: false,
          created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
          related_url: '/courses/456'
        },
        {
          id: '3',
          title: 'Nuevo mensaje de María González',
          description: 'Te ha enviado información sobre el proyecto colaborativo',
          category: 'messaging',
          is_read: false,
          created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          related_url: '/messages/789'
        }
      ];
      
      setNotifications(mockNotifications);
      setUnreadCount(mockNotifications.filter(n => !n.is_read).length);
    } finally {
      if (showLoading) setLoading(false);
      isFetchingRef.current = false;
    }
  }, [supabase]); // Only depend on supabase client

  // Initial fetch and setup auto-refresh
  useEffect(() => {
    let mounted = true;
    let hasFetched = false;
    
    const fetchWithGuard = async () => {
      if (mounted && !hasFetched) {
        hasFetched = true;
        await fetchNotifications(true);
      }
    };
    
    fetchWithGuard();
    
    const interval = setInterval(() => {
      if (mounted) {
        fetchNotifications(false);
      }
    }, REFRESH_INTERVAL);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []); // Empty dependency array - only run once on mount

  // Helper function to map notification type to category
  const getCategoryFromType = (typeId: string | null): string => {
    if (!typeId) return 'system';
    
    // Map actual notification_type_id values to categories
    const typeMapping: Record<string, string> = {
      // Admin category
      'user_approved': 'admin',
      'consultant_assigned': 'admin',
      'role_assigned': 'admin',
      
      // Assignments category
      'assignment_assigned': 'assignments',
      'assignment_graded': 'assignments',
      'assignment_due': 'assignments',
      'assignment_created': 'assignments',
      'group_assignment': 'assignments',
      'quiz': 'assignments',
      
      // Courses category
      'course_assigned': 'courses',
      'course_completed': 'courses',
      'lesson_available': 'courses',
      
      // Messaging category
      'feedback_received': 'messaging',
      'message_received': 'messaging',
      'message_mentioned': 'messaging',
      
      // System category
      'account_security': 'system',
      'system_update': 'system',
      'system_maintenance': 'system',
      
      // Workspace category
      'document_shared': 'workspace',
      'meeting_scheduled': 'workspace',
      'mention_received': 'workspace',
      
      // Social category
      'post_mentioned': 'social',
      
      // Legacy simple types
      'assignment': 'assignments',
      'course': 'courses',
      'message': 'messaging',
      'feedback': 'messaging',
      'system': 'system',
      'general': 'system'
    };
    
    return typeMapping[typeId] || 'system';
  };

  // Get category icon and color
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'admin':
        return { Icon: ShieldCheckIcon, color: 'text-red-500', bg: 'bg-red-50' };
      case 'assignments':
        return { Icon: CheckIcon, color: 'text-green-500', bg: 'bg-green-50' };
      case 'courses':
        return { Icon: BookOpenIcon, color: 'text-blue-500', bg: 'bg-blue-50' };
      case 'messaging':
        return { Icon: ChatAlt2Icon, color: 'text-purple-500', bg: 'bg-purple-50' };
      case 'system':
        return { Icon: CogIcon, color: 'text-gray-500', bg: 'bg-gray-50' };
      case 'workspace':
        return { Icon: UserGroupIcon, color: 'text-indigo-500', bg: 'bg-indigo-50' };
      case 'social':
        return { Icon: DocumentIcon, color: 'text-pink-500', bg: 'bg-pink-50' };
      default:
        return { Icon: DocumentIcon, color: 'text-gray-500', bg: 'bg-gray-50' };
    }
  };

  // Format relative time
  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (minutes < 1) return 'ahora';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    
    return date.toLocaleDateString('es-ES', { 
      day: 'numeric', 
      month: 'short' 
    });
  };

  // Handle notification click
  const handleNotificationClick = async (notification: NotificationItem) => {
    if (!notification.is_read) {
      // Optimistic update
      setNotifications(prev => prev.map(n => 
        n.id === notification.id ? { ...n, is_read: true } : n
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));

      // Mark as read in database
      try {
        const { error } = await supabase
          .from('user_notifications')
          .update({ is_read: true })
          .eq('id', notification.id);

        if (error) {
          throw error;
        }
      } catch (error) {
        console.error('Error marking notification as read:', error);
        // Revert optimistic update on error
        setNotifications(prev => prev.map(n => 
          n.id === notification.id ? { ...n, is_read: false } : n
        ));
        setUnreadCount(prev => prev + 1);
      }
    }

    // Navigate to related content or fallback
    if (notification.related_url) {
      setIsOpen(false);
      router.push(notification.related_url);
    } else {
      // Provide fallback navigation for notifications without related_url
      let fallbackUrl = '/dashboard';
      
      // Determine fallback URL based on notification content
      if (notification.title.includes('Feedback') || notification.title.includes('feedback')) {
        fallbackUrl = '/admin/feedback';
      } else if (notification.title.includes('curso') || notification.title.includes('Course')) {
        fallbackUrl = '/course-manager';
      } else if (notification.title.includes('tarea') || notification.title.includes('assignment')) {
        fallbackUrl = '/tareas';
      } else if (notification.notification_type?.category) {
        // Use category-based fallbacks
        switch (notification.notification_type.category) {
          case 'admin':
            fallbackUrl = '/admin';
            break;
          case 'courses':
            fallbackUrl = '/course-manager';
            break;
          case 'assignments':
            fallbackUrl = '/tareas';
            break;
          case 'feedback':
            fallbackUrl = '/admin/feedback';
            break;
          default:
            fallbackUrl = '/dashboard';
        }
      }
      
      console.log(`📍 No related_url for notification "${notification.title}", using fallback: ${fallbackUrl}`);
      
      setIsOpen(false);
      router.push(fallbackUrl);
    }
  };

  // Mark all as read
  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) return;
    
    setMarkingAllRead(true);
    
    // Store original state for potential revert
    const originalNotifications = notifications;
    const originalUnreadCount = unreadCount;
    
    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('No session');
      }

      // Mark all unread notifications as read
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true })
        .eq('user_id', session.user.id)
        .eq('is_read', false);

      if (error) {
        throw error;
      }
      
      setMarkingAllRead(false);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      setMarkingAllRead(false);
      // Revert optimistic update on error
      setNotifications(originalNotifications);
      setUnreadCount(originalUnreadCount);
    }
  };

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        bellRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !bellRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={`relative ${className}`}>
      {/* Bell Button */}
      <button
        ref={bellRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`
          relative p-2.5 rounded-xl transition-all duration-300 transform hover:scale-105 group
          ${isOpen 
            ? 'bg-white/20 text-white shadow-lg' 
            : 'bg-white/10 hover:bg-white/15 text-white/90 hover:text-white'
          }
        `}
        aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
      >
        {/* Bell Icon */}
        {unreadCount > 0 ? (
          <BellSolidIcon className="h-6 w-6" />
        ) : (
          <BellIcon className="h-6 w-6" />
        )}
        
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-[20px] px-1.5 text-xs font-bold bg-gradient-to-r from-red-500 to-red-600 text-white rounded-full shadow-lg transform scale-100 group-hover:scale-110 transition-transform duration-200">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}

        {/* Pulse effect for new notifications */}
        {isOpen && (
          <span className="absolute inset-0 rounded-xl bg-white/20 animate-pulse"></span>
        )}
      </button>

      {/* Modern Dropdown */}
      {isOpen && (
        <div 
          ref={dropdownRef}
          className="fixed top-16 left-80 w-[420px] max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden transform transition-all duration-300 ease-out animate-in slide-in-from-top-2 sm:w-[420px] sm:left-80 max-sm:left-4 max-sm:right-4 max-sm:w-auto"
          style={{
            boxShadow: '0 10px 40px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)'
          }}
        >
          {/* Header with Gradient */}
          <div className="bg-gradient-to-r from-slate-50 to-blue-50 px-6 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Notificaciones</h3>
                <p className="text-sm text-slate-600 mt-0.5">
                  {unreadCount > 0 
                    ? `${unreadCount} notificación${unreadCount !== 1 ? 'es' : ''} sin leer`
                    : 'Todas las notificaciones leídas'
                  }
                </p>
              </div>
              
              {/* Mark All Read Button */}
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  disabled={markingAllRead}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all duration-200 disabled:opacity-50"
                >
                  {markingAllRead ? (
                    <RefreshIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckIcon className="h-4 w-4" />
                  )}
                  <span>Marcar todas</span>
                </button>
              )}
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-96 overflow-y-auto">
            {error && !loading && (
              // Error State
              <div className="flex flex-col items-center justify-center py-8 px-6 text-center">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-3">
                  <RefreshIcon className="h-6 w-6 text-red-500" />
                </div>
                <h4 className="text-sm font-medium text-red-900 mb-2">Error al cargar</h4>
                <p className="text-xs text-red-600 mb-3">{error}</p>
                <button
                  onClick={() => fetchNotifications(true)}
                  className="text-xs font-medium text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Reintentar
                </button>
              </div>
            )}
            
            {loading ? (
              // Loading State
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center space-y-3">
                  <RefreshIcon className="h-8 w-8 animate-spin text-blue-500" />
                  <span className="text-sm text-slate-600">Cargando notificaciones...</span>
                </div>
              </div>
            ) : notifications.length === 0 ? (
              // Empty State
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                  <BellIcon className="h-8 w-8 text-slate-400" />
                </div>
                <h4 className="text-sm font-medium text-slate-900 mb-1">Sin notificaciones</h4>
                <p className="text-sm text-slate-500">Te notificaremos cuando tengas algo nuevo</p>
              </div>
            ) : (
              // Notifications
              <div className="divide-y divide-gray-50">
                {notifications.map((notification, index) => {
                  const { Icon, color, bg } = getCategoryIcon(notification.category);
                  const isUnread = !notification.is_read;
                  
                  return (
                    <div
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`
                        px-6 py-4 cursor-pointer transition-all duration-200 hover:bg-slate-50 group relative
                        ${isUnread ? 'bg-blue-50/30' : ''}
                        ${index === 0 ? '' : ''}
                      `}
                    >
                      {/* Unread Indicator */}
                      {isUnread && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-blue-600"></div>
                      )}
                      
                      <div className="flex items-start space-x-3">
                        {/* Category Icon */}
                        <div className={`flex-shrink-0 p-2 rounded-xl ${bg} group-hover:scale-105 transition-transform duration-200`}>
                          <Icon className={`h-5 w-5 ${color}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <h4 className={`text-sm leading-5 ${
                                isUnread 
                                  ? 'font-semibold text-slate-900' 
                                  : 'font-medium text-slate-700'
                              }`}>
                                {notification.title.length > 60 
                                  ? `${notification.title.substring(0, 57)}...`
                                  : notification.title
                                }
                              </h4>
                              <p className={`text-sm mt-1 leading-5 ${
                                isUnread ? 'text-slate-700' : 'text-slate-500'
                              }`}>
                                {notification.description.length > 90
                                  ? `${notification.description.substring(0, 87)}...`
                                  : notification.description
                                }
                              </p>
                            </div>
                            
                            {/* Timestamp and Unread Dot */}
                            <div className="flex flex-col items-end space-y-1 ml-3">
                              <span className="text-xs text-slate-500 font-medium">
                                {getRelativeTime(notification.created_at)}
                              </span>
                              {isUnread && (
                                <div className="w-2.5 h-2.5 bg-blue-500 rounded-full shadow-sm"></div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="bg-slate-50 px-6 py-3 border-t border-gray-100">
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push('/notifications');
                }}
                className="w-full flex items-center justify-center space-x-2 text-sm font-medium text-slate-700 hover:text-slate-900 py-2 px-4 rounded-lg hover:bg-white transition-all duration-200 group"
              >
                <span>Ver todas las notificaciones</span>
                <ArrowRightIcon className="h-4 w-4 group-hover:translate-x-0.5 transition-transform duration-200" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ModernNotificationCenter;