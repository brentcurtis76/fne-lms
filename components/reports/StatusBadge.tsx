import React from 'react';

interface StatusBadgeProps {
  value: number;
  type?: 'completion' | 'engagement' | 'performance';
  size?: 'sm' | 'md' | 'lg';
  showProgress?: boolean;
  className?: string;
}

export default function StatusBadge({ 
  value, 
  type = 'completion', 
  size = 'md', 
  showProgress = false,
  className = '' 
}: StatusBadgeProps) {
  const getStatusConfig = (val: number) => {
    if (val >= 80) {
      return {
        color: 'bg-green-100 text-green-800 border-green-200',
        progressColor: 'bg-green-500',
        icon: '✓',
        label: 'Excelente'
      };
    } else if (val >= 60) {
      return {
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        progressColor: 'bg-yellow-500',
        icon: '⚡',
        label: 'Bueno'
      };
    } else if (val >= 40) {
      return {
        color: 'bg-orange-100 text-orange-800 border-orange-200',
        progressColor: 'bg-orange-500',
        icon: '⚠',
        label: 'Regular'
      };
    } else {
      return {
        color: 'bg-red-100 text-red-800 border-red-200',
        progressColor: 'bg-red-500',
        icon: '!',
        label: 'Bajo'
      };
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'px-2 py-1 text-xs';
      case 'lg':
        return 'px-4 py-2 text-base';
      default:
        return 'px-3 py-1 text-sm';
    }
  };

  const config = getStatusConfig(value);
  const percentage = Math.round(value || 0);

  if (showProgress) {
    return (
      <div className={`inline-flex items-center space-x-2 ${className}`}>
        <div className="flex items-center space-x-1">
          <span className="text-xs text-gray-500">{config.icon}</span>
          <span className="text-sm font-medium text-gray-900">{percentage}%</span>
        </div>
        <div className="w-16 bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full ${config.progressColor}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          ></div>
        </div>
      </div>
    );
  }

  return (
    <span className={`
      inline-flex items-center rounded-full border font-medium
      ${config.color} ${getSizeClasses()} ${className}
    `}>
      <span className="mr-1">{config.icon}</span>
      {percentage}%
    </span>
  );
}