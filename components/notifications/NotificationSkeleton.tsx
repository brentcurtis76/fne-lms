import React from 'react';

interface NotificationSkeletonProps {
  count?: number;
  className?: string;
}

export function NotificationSkeleton({ count = 3, className = '' }: NotificationSkeletonProps) {
  return (
    <div className={`notification-skeleton ${className}`}>
      {[...Array(count)].map((_, i) => (
        <div key={i} className="p-4 border-b border-gray-100 animate-pulse">
          <div className="flex items-start space-x-3">
            {/* Icon skeleton */}
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
            </div>
            
            {/* Content skeleton */}
            <div className="flex-1">
              {/* Title */}
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              
              {/* Description */}
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 rounded w-full"></div>
                <div className="h-3 bg-gray-200 rounded w-5/6"></div>
              </div>
              
              {/* Time */}
              <div className="mt-2 h-3 bg-gray-200 rounded w-24"></div>
            </div>
            
            {/* Action skeleton */}
            <div className="flex-shrink-0">
              <div className="w-6 h-6 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      ))}
      
      <style jsx>{`
        .notification-skeleton {
          position: relative;
          overflow: hidden;
        }
        
        .notification-skeleton::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.4),
            transparent
          );
          animation: shimmer 1.5s infinite;
        }
        
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(200%);
          }
        }
      `}</style>
    </div>
  );
}

// Full dropdown skeleton
export function NotificationDropdownSkeleton() {
  return (
    <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
      {/* Header skeleton */}
      <div className="bg-gradient-to-r from-[#00365b] to-[#004d82] p-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-6 bg-white/20 rounded w-32"></div>
          <div className="flex space-x-2">
            <div className="w-8 h-8 bg-white/20 rounded"></div>
            <div className="w-8 h-8 bg-white/20 rounded"></div>
          </div>
        </div>
      </div>
      
      {/* Notifications skeleton */}
      <div className="max-h-[400px] overflow-y-auto">
        <NotificationSkeleton count={4} />
      </div>
      
      {/* Footer skeleton */}
      <div className="border-t border-gray-200 p-3 animate-pulse">
        <div className="h-10 bg-gray-200 rounded"></div>
      </div>
    </div>
  );
}

// Mobile skeleton
export function MobileNotificationSkeleton() {
  return (
    <div className="fixed inset-0 bg-white z-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#00365b] to-[#004d82] p-4 pt-safe animate-pulse">
        <div className="flex items-center justify-between">
          <div className="w-10 h-10 bg-white/20 rounded"></div>
          <div className="h-6 bg-white/20 rounded w-32"></div>
          <div className="w-10 h-10 bg-white/20 rounded"></div>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <NotificationSkeleton count={6} />
      </div>
    </div>
  );
}

// Inline loading state for real-time updates
export function NotificationInlineLoader() {
  return (
    <div className="flex items-center justify-center p-2 text-sm text-gray-500">
      <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
        <circle 
          className="opacity-25" 
          cx="12" 
          cy="12" 
          r="10" 
          stroke="currentColor" 
          strokeWidth="4"
          fill="none"
        />
        <path 
          className="opacity-75" 
          fill="currentColor" 
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span>Cargando nuevas notificaciones...</span>
    </div>
  );
}