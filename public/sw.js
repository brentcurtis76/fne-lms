// Genera Service Worker for Push Notifications
// Version: 1.0.0

// Listen for push notifications
self.addEventListener('push', function(event) {
  console.log('[Service Worker] Push notification received');
  
  if (event.data) {
    const data = event.data.json();
    console.log('[Service Worker] Push data:', data);
    
    const options = {
      body: data.description || data.body,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      tag: data.id || 'notification',
      requireInteraction: data.priority === 'high',
      silent: data.priority === 'low',
      data: {
        url: data.related_url || data.url || '/',
        notificationId: data.id
      },
      actions: [
        {
          action: 'view',
          title: 'Ver',
          icon: '/icons/view.png'
        },
        {
          action: 'dismiss',
          title: 'Descartar',
          icon: '/icons/dismiss.png'
        }
      ],
      // Custom vibration pattern
      vibrate: data.priority === 'high' ? [200, 100, 200] : [200]
    };
    
    // Show the notification
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] Notification click received');
  
  event.notification.close();
  
  if (event.action === 'view' || !event.action) {
    // Open the URL in a new window or focus existing one
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(function(clientList) {
        const url = event.notification.data.url;
        
        // Check if there's already a window/tab open with the target URL
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url.includes('fne-lms') && 'focus' in client) {
            // Navigate to the specific URL and focus the window
            client.navigate(url);
            return client.focus();
          }
        }
        
        // If no window is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
    
    // Mark notification as read (send to server)
    if (event.notification.data.notificationId) {
      markNotificationAsRead(event.notification.data.notificationId);
    }
  }
});

// Background sync for offline notifications
self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotifications());
  }
});

// Helper function to mark notification as read
async function markNotificationAsRead(notificationId) {
  try {
    const response = await fetch(`/api/notifications/${notificationId}/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('[Service Worker] Marked notification as read:', notificationId);
  } catch (error) {
    console.error('[Service Worker] Error marking notification as read:', error);
  }
}

// Sync notifications when back online
async function syncNotifications() {
  try {
    const response = await fetch('/api/notifications/sync', {
      method: 'POST'
    });
    
    if (response.ok) {
      console.log('[Service Worker] Notifications synced successfully');
    }
  } catch (error) {
    console.error('[Service Worker] Error syncing notifications:', error);
  }
}

// Cache static assets for offline support
const CACHE_NAME = 'fne-lms-v1';
const urlsToCache = [
  '/',
  '/offline.html',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/badge-72x72.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event for offline support
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    ).catch(function() {
      // If both cache and network fail, show offline page
      if (event.request.destination === 'document') {
        return caches.match('/offline.html');
      }
    })
  );
});