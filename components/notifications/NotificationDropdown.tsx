import React from 'react';
import { useRouter } from 'next/router';
import { 
  ShieldCheckIcon,
  CheckIcon as CheckSquareIcon,
  BookOpenIcon,
  ChatAlt2Icon,
  CogIcon,
  DocumentIcon,
  CalendarIcon,
  UserGroupIcon,
  ExclamationIcon,
  CheckIcon,
  RefreshIcon,
  EyeIcon
} from '@heroicons/react/outline';
import { MenuIcon as LoaderIcon } from '@heroicons/react/outline';
import { UserNotification } from '../../pages/api/notifications/index';

interface NotificationDropdownProps {
  notifications: UserNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  onMarkAsRead: (notificationId: string) => void;
  onMarkAllAsRead: () => void;
  onRefresh: () => void;
  onClose: () => void;
}

const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  notifications,
  unreadCount,
  loading,
  error,
  onMarkAsRead,
  onMarkAllAsRead,
  onRefresh,
  onClose
}) => {
  const router = useRouter();

  // Get icon for notification category
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'admin':
        return ShieldCheckIcon;
      case 'assignments':
        return CheckSquareIcon;
      case 'courses':
        return BookOpenIcon;
      case 'messaging':
        return ChatAlt2Icon;
      case 'social':
        return UserGroupIcon;
      case 'feedback':
        return ChatAlt2Icon;
      case 'system':
        return CogIcon;
      case 'workspace':
        return DocumentIcon;
      default:
        return DocumentIcon;
    }
  };

  // Get relative time string
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
      month: 'short' 
    });
  };

  // Handle notification click
  const handleNotificationClick = (notification: UserNotification) => {
    // Mark as read if unread
    if (!notification.is_read) {
      onMarkAsRead(notification.id);
    }

    // Navigate to related URL if available
    if (notification.related_url) {
      onClose();
      router.push(notification.related_url);
    }
  };

  // Handle "View All" click
  const handleViewAll = () => {
    onClose();
    router.push('/notifications'); // We could create a full notifications page later
  };

  return (
    <div className="absolute top-full right-0 mt-2 w-96 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 transform transition-all duration-200 ease-out animate-in slide-in-from-top-2">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Notificaciones
          </h3>
          <div className="flex items-center space-x-2">
            {/* Refresh Button */}
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-1 text-gray-500 hover:text-[#00365b] transition-colors duration-200"
              title="Actualizar"
            >
              <RefreshIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            
            {/* Mark All Read Button */}
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllAsRead}
                className="text-xs font-medium text-[#00365b] hover:text-[#004a7a] transition-colors duration-200"
                title="Marcar todas como leídas"
              >
                Marcar todas como leídas
              </button>
            )}
          </div>
        </div>
        
        {/* Unread Count */}
        {unreadCount > 0 && (
          <p className="text-xs text-gray-600 mt-1">
            {unreadCount} notificación{unreadCount !== 1 ? 'es' : ''} sin leer
          </p>
        )}
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {/* Loading State */}
        {loading && notifications.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <RefreshIcon className="h-6 w-6 animate-spin text-[#00365b]" />
            <span className="ml-2 text-gray-600">Cargando notificaciones...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="px-4 py-6 text-center">
            <ExclamationIcon className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-red-600 mb-3">{error}</p>
            <button
              onClick={onRefresh}
              className="text-xs font-medium text-[#00365b] hover:text-[#004a7a] transition-colors duration-200"
            >
              Intentar de nuevo
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && notifications.length === 0 && (
          <div className="px-4 py-8 text-center">
            <CheckIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">No tienes notificaciones</p>
          </div>
        )}

        {/* Notifications List */}
        {!loading && !error && notifications.length > 0 && (
          <div className="divide-y divide-gray-100">
            {notifications.map((notification) => {
              const IconComponent = getCategoryIcon(notification.notification_type?.category || '');
              
              return (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`
                    px-4 py-3 transition-all duration-200 cursor-pointer
                    ${notification.is_read 
                      ? 'hover:bg-gray-50' 
                      : 'bg-blue-50 hover:bg-blue-100 border-l-4 border-l-[#fdb933]'
                    }
                  `}
                >
                  <div className="flex items-start space-x-3">
                    {/* Icon */}
                    <div className={`
                      flex-shrink-0 p-2 rounded-full
                      ${notification.is_read 
                        ? 'bg-gray-100 text-gray-500' 
                        : 'bg-[#00365b] text-white'
                      }
                    `}>
                      <IconComponent className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
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
                              text-xs mt-1 line-clamp-2
                              ${notification.is_read ? 'text-gray-600' : 'text-gray-700'}
                            `}>
                              {notification.description}
                            </p>
                          )}
                          
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-gray-500">
                              {getRelativeTime(notification.created_at)}
                            </span>
                            
                            {/* Category Badge */}
                            {notification.notification_type && (
                              <span className={`
                                inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
                                ${notification.is_read 
                                  ? 'bg-gray-100 text-gray-600' 
                                  : 'bg-[#fdb933]/20 text-[#00365b]'
                                }
                              `}>
                                {notification.notification_type.category === 'admin' && 'Admin'}
                                {notification.notification_type.category === 'assignments' && 'Tareas'}
                                {notification.notification_type.category === 'courses' && 'Cursos'}
                                {notification.notification_type.category === 'messaging' && 'Mensajes'}
                                {notification.notification_type.category === 'social' && 'Social'}
                                {notification.notification_type.category === 'feedback' && 'Feedback'}
                                {notification.notification_type.category === 'system' && 'Sistema'}
                                {notification.notification_type.category === 'workspace' && 'Workspace'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Unread Indicator */}
                        {!notification.is_read && (
                          <div className="flex-shrink-0 ml-2">
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
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            onClick={handleViewAll}
            className="w-full text-sm font-medium text-[#00365b] hover:text-[#004a7a] transition-colors duration-200 flex items-center justify-center space-x-1"
          >
            <EyeIcon className="h-4 w-4" />
            <span>Ver todas las notificaciones</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;