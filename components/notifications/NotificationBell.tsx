import React, { useState, useEffect, useRef } from 'react';
import { BellIcon } from '@heroicons/react/outline';
import { BellIcon as BellSolidIcon } from '@heroicons/react/solid';
import { supabase } from '../../lib/supabase';
import NotificationDropdown from './NotificationDropdown';
import { UserNotification } from '../../pages/api/notifications/index';

interface NotificationBellProps {
  className?: string;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ className = '' }) => {
  console.log('🔔 NotificationBell component rendering...');
  
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasNewNotification, setHasNewNotification] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  // Auto-refresh interval (30 seconds)
  const REFRESH_INTERVAL = 30000;

  // Fetch notifications from API
  const fetchNotifications = async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/notifications?limit=10', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch notifications: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        const newUnreadCount = result.unreadCount || 0;
        
        // Trigger bell animation if unread count increased
        if (newUnreadCount > unreadCount && unreadCount > 0) {
          setHasNewNotification(true);
          setTimeout(() => setHasNewNotification(false), 2000);
        }

        setNotifications(result.data || []);
        setUnreadCount(newUnreadCount);
      } else {
        throw new Error(result.error || 'Failed to load notifications');
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Mark notification as read
  const markAsRead = async (notificationId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Optimistically update the local state
        setNotifications(prev => prev.map(notification => 
          notification.id === notificationId 
            ? { ...notification, is_read: true, read_at: new Date().toISOString() }
            : notification
        ));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Optimistically update the local state
        setNotifications(prev => prev.map(notification => ({
          ...notification,
          is_read: true,
          read_at: new Date().toISOString()
        })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

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

  // Initial fetch and setup auto-refresh
  useEffect(() => {
    fetchNotifications(true);

    const interval = setInterval(() => {
      fetchNotifications(false);
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  // Handle bell click
  const handleBellClick = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      // Refresh notifications when opening
      fetchNotifications(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Bell Button */}
      <button
        ref={bellRef}
        onClick={handleBellClick}
        className={`
          relative p-2 rounded-lg transition-all duration-200 transform hover:scale-105
          ${isOpen 
            ? 'bg-white/20 text-[#fdb933]' 
            : 'text-white/80 hover:text-white hover:bg-white/10'
          }
          ${hasNewNotification ? 'animate-bounce' : ''}
          ${className}
        `}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
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
            absolute -top-1 -right-1 flex items-center justify-center
            min-w-[18px] h-[18px] px-1 text-xs font-bold
            bg-red-500 text-white rounded-full shadow-lg
            transform transition-all duration-300
            ${hasNewNotification ? 'animate-pulse scale-110' : 'scale-100'}
          `}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}

        {/* Pulse effect for new notifications */}
        {hasNewNotification && (
          <span className="absolute inset-0 rounded-lg bg-[#fdb933] opacity-20 animate-ping"></span>
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
            onRefresh={() => fetchNotifications(true)}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}
    </div>
  );
};

export default NotificationBell;