import React from 'react';

interface ConsultantIndicatorProps {
  hasConsultant: boolean;
  consultantName?: string;
  assignmentType?: string;
  isActive?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export default function ConsultantIndicator({ 
  hasConsultant, 
  consultantName, 
  assignmentType,
  isActive = true,
  size = 'md',
  className = '' 
}: ConsultantIndicatorProps) {
  if (!hasConsultant) {
    return (
      <span className={`
        inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
        bg-gray-100 text-gray-600 ${className}
      `}>
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        Sin Consultor
      </span>
    );
  }

  const getTypeConfig = (type?: string) => {
    switch (type) {
      case 'monitoring':
        return {
          icon: '👁',
          label: 'Monitoreo',
          color: 'bg-blue-100 text-blue-800'
        };
      case 'mentoring':
        return {
          icon: '🎯',
          label: 'Mentoría',
          color: 'bg-amber-100 text-amber-800'
        };
      case 'evaluation':
        return {
          icon: '📊',
          label: 'Evaluación',
          color: 'bg-orange-100 text-orange-800'
        };
      case 'support':
        return {
          icon: '🤝',
          label: 'Apoyo',
          color: 'bg-green-100 text-green-800'
        };
      default:
        return {
          icon: '👨‍💼',
          label: 'Consultoría',
          color: 'bg-slate-100 text-slate-800'
        };
    }
  };

  const typeConfig = getTypeConfig(assignmentType);
  const sizeClasses = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1 text-sm';

  return (
    <div className={`inline-flex items-center space-x-1 ${className}`}>
      <span className={`
        inline-flex items-center rounded-full font-medium
        ${typeConfig.color} ${sizeClasses}
        ${!isActive ? 'opacity-60' : ''}
      `}>
        <span className="mr-1">{typeConfig.icon}</span>
        {consultantName || typeConfig.label}
      </span>
      {!isActive && (
        <span className="text-xs text-gray-400">(Inactivo)</span>
      )}
    </div>
  );
}