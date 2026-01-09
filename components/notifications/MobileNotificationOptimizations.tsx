import React, { useEffect, useState } from 'react';
import { useSwipeable } from 'react-swipeable';

interface MobileNotificationOptimizationsProps {
  children: React.ReactNode;
}

export function MobileNotificationOptimizations({ children }: MobileNotificationOptimizationsProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect mobile device
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      
      // Detect iOS for specific optimizations
      const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      setIsIOS(isIOSDevice);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Add mobile-specific CSS
  useEffect(() => {
    if (isMobile) {
      document.documentElement.classList.add('mobile-device');
      if (isIOS) {
        document.documentElement.classList.add('ios-device');
      }
    } else {
      document.documentElement.classList.remove('mobile-device', 'ios-device');
    }
  }, [isMobile, isIOS]);

  return (
    <>
      <style jsx global>{`
        /* Mobile-optimized notification styles */
        .mobile-device .notification-container {
          position: relative;
        }

        .mobile-device .notification-dropdown {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: 9999 !important;
          background: white;
          margin: 0 !important;
          border-radius: 0 !important;
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }

        /* Mobile header with close button */
        .mobile-device .notification-dropdown::before {
          content: '';
          position: absolute;
          top: 10px;
          left: 50%;
          transform: translateX(-50%);
          width: 40px;
          height: 4px;
          background: #e2e8f0;
          border-radius: 2px;
        }

        /* Smaller notifications on mobile */
        .mobile-device .notification-card {
          padding: 12px !important;
          font-size: 14px !important;
          border-radius: 8px !important;
          margin-bottom: 8px !important;
        }

        /* Touch-friendly buttons */
        .mobile-device button,
        .mobile-device a {
          min-height: 44px !important;
          min-width: 44px !important;
          display: flex;
          align-items: center;
          justify-content: center;
          touch-action: manipulation;
        }

        /* Better tap targets */
        .mobile-device .notification-bell-icon {
          padding: 12px !important;
        }

        /* iOS-specific fixes */
        .ios-device .notification-dropdown {
          padding-top: env(safe-area-inset-top);
          padding-bottom: env(safe-area-inset-bottom);
        }

        /* Swipe to dismiss */
        .mobile-device .swipeable-notification {
          position: relative;
          transition: transform 0.3s ease-out, opacity 0.3s ease-out;
        }

        .mobile-device .swipeable-notification.swiping-left {
          transform: translateX(-100px);
          opacity: 0.5;
        }

        .mobile-device .swipeable-notification.swiping-right {
          transform: translateX(100px);
          opacity: 0.5;
        }

        /* Loading skeleton optimized for mobile */
        .mobile-device .notification-skeleton {
          padding: 12px;
        }

        .mobile-device .notification-skeleton .skeleton-line {
          height: 12px;
          margin-bottom: 8px;
        }

        /* Optimized scrolling */
        .mobile-device .notification-list {
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
        }

        /* Reduced motion for accessibility */
        @media (prefers-reduced-motion: reduce) {
          .mobile-device .notification-dropdown,
          .mobile-device .notification-card,
          .mobile-device .swipeable-notification {
            animation: none !important;
            transition: none !important;
          }
        }

        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
          .mobile-device .notification-dropdown {
            background: #1a202c;
            color: #e2e8f0;
          }

          .mobile-device .notification-card {
            background: #2d3748;
            border-color: #4a5568;
          }
        }

        /* Landscape mode adjustments */
        @media (orientation: landscape) and (max-width: 768px) {
          .mobile-device .notification-dropdown {
            max-height: 100vh;
            overflow-y: auto;
          }
        }
      `}</style>
      {children}
    </>
  );
}

// Swipeable notification item component
interface SwipeableNotificationProps {
  notification: any;
  onDismiss: (id: string) => void;
  onMarkAsRead: (id: string) => void;
  children: React.ReactNode;
}

export function SwipeableNotification({ 
  notification, 
  onDismiss, 
  onMarkAsRead, 
  children 
}: SwipeableNotificationProps) {
  const [swiping, setSwiping] = useState<'left' | 'right' | null>(null);

  const handlers = useSwipeable({
    onSwipedLeft: () => {
      setSwiping('left');
      setTimeout(() => {
        onDismiss(notification.id);
      }, 300);
    },
    onSwipedRight: () => {
      setSwiping('right');
      setTimeout(() => {
        onMarkAsRead(notification.id);
        setSwiping(null);
      }, 300);
    },
    onSwiping: (eventData) => {
      if (Math.abs(eventData.deltaX) > 50) {
        setSwiping(eventData.dir === 'Left' ? 'left' : 'right');
      } else {
        setSwiping(null);
      }
    },
    preventScrollOnSwipe: true,
    trackMouse: false,
    trackTouch: true
  });

  return (
    <div
      {...handlers}
      className={`
        swipeable-notification
        ${swiping === 'left' ? 'swiping-left' : ''}
        ${swiping === 'right' ? 'swiping-right' : ''}
      `}
    >
      {children}
    </div>
  );
}

// Hook for mobile detection
export function useMobileDetection() {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    
    // Mobile detection
    const mobile = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    const tablet = /ipad|tablet|playbook|silk/i.test(userAgent);
    const ios = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    const android = /android/i.test(userAgent);

    setIsMobile(mobile && !tablet);
    setIsTablet(tablet);
    setIsIOS(ios);
    setIsAndroid(android);
  }, []);

  return { isMobile, isTablet, isIOS, isAndroid };
}