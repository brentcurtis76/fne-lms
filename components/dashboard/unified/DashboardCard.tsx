import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, MoreHorizontal, RefreshCw, AlertCircle } from 'lucide-react';
import LoadingSkeleton from '../../common/LoadingSkeleton';

export interface DashboardCardProps {
  // Card Identification
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  
  // Content & State
  children: React.ReactNode;
  loading?: boolean;
  error?: string;
  isEmpty?: boolean;
  
  // Progressive Disclosure
  expandable?: boolean;
  defaultExpanded?: boolean;
  expandedContent?: React.ReactNode;
  
  // Visual Properties
  size?: 'small' | 'medium' | 'large' | 'wide';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  className?: string;
  
  // Interactions
  onRefresh?: () => void;
  onExpand?: (expanded: boolean) => void;
  onMenuAction?: (action: string) => void;
  
  // Metadata
  lastUpdated?: string;
  updateFrequency?: string;
  
  // Accessibility
  ariaLabel?: string;
  role?: string;
}

const DashboardCard: React.FC<DashboardCardProps> = ({
  id,
  type,
  title,
  subtitle,
  children,
  loading = false,
  error,
  isEmpty = false,
  expandable = false,
  defaultExpanded = false,
  expandedContent,
  size = 'medium',
  priority = 'medium',
  className = '',
  onRefresh,
  onExpand,
  onMenuAction,
  lastUpdated,
  updateFrequency,
  ariaLabel,
  role = 'region'
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Handle expand/collapse
  const handleToggleExpand = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    onExpand?.(newExpanded);
  };

  // Handle refresh with loading state
  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500); // Minimum loading time for UX
    }
  };

  // Auto-focus on error for accessibility
  useEffect(() => {
    if (error && cardRef.current) {
      cardRef.current.focus();
    }
  }, [error]);

  // Size classes mapping
  const sizeClasses = {
    small: 'col-span-1 h-48',
    medium: 'col-span-2 h-64',
    large: 'col-span-2 h-80',
    wide: 'col-span-4 h-64'
  };

  // Priority classes for visual indicators
  const priorityClasses = {
    low: 'border-gray-200',
    medium: 'border-gray-300', 
    high: 'border-blue-300',
    critical: 'border-red-300'
  };

  const priorityAccents = {
    low: 'bg-gray-50',
    medium: 'bg-white',
    high: 'bg-blue-50',
    critical: 'bg-red-50'
  };

  return (
    <div
      ref={cardRef}
      className={`
        dashboard-card
        ${sizeClasses[size]}
        ${priorityClasses[priority]}
        ${priorityAccents[priority]}
        bg-white rounded-lg border shadow-sm transition-all duration-200
        hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50
        ${error ? 'border-red-300 bg-red-50' : ''}
        ${className}
      `}
      role={role}
      aria-label={ariaLabel || `${title} dashboard card`}
      tabIndex={error ? 0 : -1}
      data-card-id={id}
      data-card-type={type}
    >
      {/* Card Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 truncate">
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm text-gray-600 truncate mt-1">
              {subtitle}
            </p>
          )}
        </div>
        
        <div className="flex items-center space-x-2 ml-4">
          {/* Refresh Button */}
          {onRefresh && (
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || loading}
              className={`
                p-1 rounded hover:bg-gray-100 transition-colors
                ${isRefreshing ? 'animate-spin' : ''}
              `}
              aria-label={`Refresh ${title} data`}
              title="Refresh data"
            >
              <RefreshCw className="w-4 h-4 text-gray-500" />
            </button>
          )}
          
          {/* Expand/Collapse Button */}
          {expandable && (
            <button
              onClick={handleToggleExpand}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${title}`}
              aria-expanded={isExpanded}
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </button>
          )}
          
          {/* Menu Button */}
          {onMenuAction && (
            <button
              onClick={() => onMenuAction('menu')}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
              aria-label={`${title} options menu`}
            >
              <MoreHorizontal className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>
      </div>

      {/* Card Content */}
      <div className="flex-1 p-4 overflow-hidden">
        {loading ? (
          <div className="h-full">
            <LoadingSkeleton count={3} height="1.5rem" className="mb-3" />
            <LoadingSkeleton height="4rem" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-600">
            <div className="text-center">
              <AlertCircle className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm font-medium">Error loading data</p>
              <p className="text-xs text-red-500 mt-1">{error}</p>
              {onRefresh && (
                <button
                  onClick={handleRefresh}
                  className="mt-2 text-xs text-red-600 hover:text-red-800 underline"
                >
                  Try again
                </button>
              )}
            </div>
          </div>
        ) : isEmpty ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <p className="text-sm font-medium">No data available</p>
              <p className="text-xs text-gray-400 mt-1">
                Check your filters or try refreshing
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-auto">
            {children}
            
            {/* Expanded Content */}
            {expandable && isExpanded && expandedContent && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                {expandedContent}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card Footer */}
      {(lastUpdated || updateFrequency) && (
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 rounded-b-lg">
          <div className="flex items-center justify-between text-xs text-gray-500">
            {lastUpdated && (
              <span>Last updated: {new Date(lastUpdated).toLocaleString()}</span>
            )}
            {updateFrequency && (
              <span>Updates {updateFrequency}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardCard;
