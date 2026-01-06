import React, { useState, useEffect, useRef } from 'react';
import { BellIcon } from '@heroicons/react/outline';
import { BellIcon as BellSolidIcon } from '@heroicons/react/solid';
import { useRealtimeNotifications } from '../../lib/realtimeNotifications';
import NotificationDropdown from './NotificationDropdown';
import { useAuth } from '../../hooks/useAuth';

interface RealtimeNotificationBellProps {
  className?: string;
}

const RealtimeNotificationBell: React.FC<RealtimeNotificationBellProps> = ({ className = '' }) => {
  const { user } = useAuth();
  const { 
    notifications, 
    unreadCount, 
    loading, 
    error,
    markAsRead,
    markAllAsRead,
    refresh
  } = useRealtimeNotifications(user?.id);
  
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  // Handle click outside to close dropdown
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

  // Request browser notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Handle bell click
  const handleBellClick = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className={`relative ${className}`}>
      {/* Bell Button */}
      <button
        ref={bellRef}
        onClick={handleBellClick}
        className={`
          notification-bell-icon
          relative p-2 rounded-lg transition-all duration-200 transform hover:scale-105
          ${isOpen 
            ? 'bg-white/20 text-[#fbbf24]' 
            : 'text-white/80 hover:text-white hover:bg-white/10'
          }
          ${className}
        `}
        aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} no leídas)` : ''}`}
      >
        {/* Bell Icon */}
        {unreadCount > 0 ? (
          <BellSolidIcon className="h-6 w-6" />
        ) : (
          <BellIcon className="h-6 w-6" />
        )}
        
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className={`
            notification-badge
            absolute -top-1 -right-1 flex items-center justify-center
            min-w-[18px] h-[18px] px-1 text-xs font-bold
            bg-red-500 text-white rounded-full shadow-lg
            transform transition-all duration-300
          `}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div ref={dropdownRef}>
          <NotificationDropdown
            notifications={notifications}
            unreadCount={unreadCount}
            loading={loading}
            error={error}
            onMarkAsRead={markAsRead}
            onMarkAllAsRead={markAllAsRead}
            onRefresh={refresh}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}
    </div>
  );
};

export default RealtimeNotificationBell;