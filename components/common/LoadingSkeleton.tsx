import React from 'react';

interface LoadingSkeletonProps {
  variant?: 'card' | 'table' | 'chart' | 'text' | 'avatar';
  width?: string;
  height?: string;
  count?: number;
  className?: string;
}

const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  variant = 'text',
  width = 'w-full',
  height = 'h-4',
  count = 1,
  className = ''
}) => {
  const getSkeletonContent = () => {
    switch (variant) {
      case 'card':
        return (
          <div className={`bg-white rounded-lg shadow p-6 space-y-4 ${className}`}>
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/3"></div>
            </div>
          </div>
        );
      
      case 'table':
        return (
          <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="animate-pulse h-5 bg-gray-200 rounded w-1/4"></div>
            </div>
            <div className="divide-y divide-gray-200">
              {Array.from({ length: count }).map((_, index) => (
                <div key={index} className="px-6 py-4 animate-pulse">
                  <div className="flex items-center space-x-4">
                    <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                    </div>
                    <div className="h-4 bg-gray-200 rounded w-16"></div>
                    <div className="h-4 bg-gray-200 rounded w-20"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      
      case 'chart':
        return (
          <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
            <div className="animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
          </div>
        );
      
      case 'avatar':
        return (
          <div className={`animate-pulse ${className}`}>
            <div className={`bg-gray-200 rounded-full ${width} ${height}`}></div>
          </div>
        );
      
      case 'text':
      default:
        return (
          <div className={`animate-pulse space-y-2 ${className}`}>
            {Array.from({ length: count }).map((_, index) => (
              <div key={index} className={`bg-gray-200 rounded ${height} ${width}`}></div>
            ))}
          </div>
        );
    }
  };

  return <>{getSkeletonContent()}</>;
};

export default LoadingSkeleton;