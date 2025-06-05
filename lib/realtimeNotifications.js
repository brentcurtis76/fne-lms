import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';

/**
 * Hook for real-time notification updates
 * Subscribes to notification changes and provides live updates
 */
export function useRealtimeNotifications(userId) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load initial notifications
  const loadNotifications = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      
      // Fetch notifications
      const { data: notifs, error: notifError } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (notifError) throw notifError;

      setNotifications(notifs || []);
      
      // Count unread
      const unread = (notifs || []).filter(n => !n.read_at).length;
      setUnreadCount(unread);
      
    } catch (err) {
      console.error('Error loading notifications:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Show browser notification if enabled
  const showBrowserNotification = useCallback(async (notification) => {
    if (!('Notification' in window)) return;
    
    if (Notification.permission === 'granted') {
      try {
        const notif = new Notification(notification.title, {
          body: notification.description,
          icon: '/icon-192x192.png',
          badge: '/badge-72x72.png',
          tag: notification.id,
          data: { url: notification.related_url }
        });

        notif.onclick = () => {
          window.focus();
          if (notification.related_url) {
            window.location.href = notification.related_url;
          }
          notif.close();
        };
      } catch (err) {
        console.error('Error showing browser notification:', err);
      }
    }
  }, []);

  // Play notification sound if enabled
  const playNotificationSound = useCallback(async (priority = 'medium') => {
    try {
      // Check if user has sound enabled (from preferences)
      const audio = new Audio(`/sounds/notification-${priority}.mp3`);
      audio.volume = 0.5;
      await audio.play();
    } catch (err) {
      // Autoplay might be blocked
      console.log('Could not play notification sound:', err.message);
    }
  }, []);

  // Update bell badge animation
  const updateBellBadge = useCallback((count) => {
    // Trigger bell shake animation
    const bell = document.querySelector('.notification-bell-icon');
    if (bell) {
      bell.classList.add('bell-new-notification');
      setTimeout(() => {
        bell.classList.remove('bell-new-notification');
      }, 500);
    }

    // Update badge with pulse animation
    const badge = document.querySelector('.notification-badge');
    if (badge) {
      badge.classList.add('badge-updated');
      setTimeout(() => {
        badge.classList.remove('badge-updated');
      }, 400);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;

    // Load initial notifications
    loadNotifications();

    // Subscribe to real-time changes
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('New notification received:', payload);
          
          // Add new notification to state
          setNotifications(prev => [payload.new, ...prev]);
          setUnreadCount(prev => prev + 1);
          
          // Show browser notification
          showBrowserNotification(payload.new);
          
          // Play notification sound based on priority
          playNotificationSound(payload.new.priority);
          
          // Update bell badge animation
          updateBellBadge(unreadCount + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('Notification updated:', payload);
          
          // Update notification in state
          setNotifications(prev => 
            prev.map(n => n.id === payload.new.id ? payload.new : n)
          );
          
          // Update unread count if notification was marked as read
          if (payload.new.read_at && !payload.old.read_at) {
            setUnreadCount(prev => Math.max(0, prev - 1));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('Notification deleted:', payload);
          
          // Remove notification from state
          setNotifications(prev => 
            prev.filter(n => n.id !== payload.old.id)
          );
          
          // Update unread count if deleted notification was unread
          if (!payload.old.read_at) {
            setUnreadCount(prev => Math.max(0, prev - 1));
          }
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    // Cleanup subscription
    return () => {
      console.log('Unsubscribing from realtime notifications');
      supabase.removeChannel(channel);
    };
  }, [userId, loadNotifications, showBrowserNotification, playNotificationSound, updateBellBadge]);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('read_at', null);

      if (error) throw error;
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  }, [userId]);

  // Delete notification
  const deleteNotification = useCallback(async (notificationId) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refresh: loadNotifications
  };
}