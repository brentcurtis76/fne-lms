import React from 'react';

interface CollapsibleSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
  showOnMobile?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  isExpanded,
  onToggle,
  children,
  className = '',
  showOnMobile = true
}) => {
  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      <button
        onClick={onToggle}
        className="w-full px-4 md:px-6 py-4 flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
      >
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <svg 
          className={`w-5 h-5 text-gray-500 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isExpanded && (
        <div className="px-4 md:px-6 pb-4 md:pb-6 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleSection;