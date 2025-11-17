import React from 'react';
import { SearchIcon } from '@heroicons/react/outline';

interface FunctionalPageHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  children?: React.ReactNode; // For custom actions
}

export default function FunctionalPageHeader({
  icon,
  title,
  subtitle,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar...",
  primaryAction,
  children
}: FunctionalPageHeaderProps) {
  return (
    <div className="bg-white border-b border-gray-200">
      {/* Functional Strip */}
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          {/* Left: Icon + Title */}
          <div className="flex items-center space-x-3">
            <div className="text-[#00365b] text-2xl">
              {icon}
            </div>
            <h1 className="text-xl font-semibold text-gray-900">
              {title}
            </h1>
          </div>

          {/* Right: Search + Actions */}
          <div className="flex items-center space-x-4">
            {/* Search Bar */}
            {onSearchChange && (
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <SearchIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={searchValue || ''}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-[#00365b] focus:border-[#00365b] sm:text-sm"
                  placeholder={searchPlaceholder}
                />
              </div>
            )}

            {/* Custom Children Actions */}
            {children}

            {/* Primary Action Button */}
            {primaryAction && (
              <button
                onClick={primaryAction.onClick}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-[#fdb933] hover:bg-[#f5a623] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#fdb933] transition-colors"
              >
                {primaryAction.icon && (
                  <span className="mr-2">{primaryAction.icon}</span>
                )}
                {primaryAction.label}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Subtitle/Context */}
      {subtitle && (
        <div className="px-4 sm:px-6 lg:px-8 pb-4">
          <p className="text-sm text-gray-600">{subtitle}</p>
        </div>
      )}
    </div>
  );
}

// Mobile-responsive version with stacked layout
export function MobileFunctionalPageHeader({
  icon,
  title,
  subtitle,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar...",
  primaryAction,
  children
}: FunctionalPageHeaderProps) {
  return (
    <div className="bg-white border-b border-gray-200">
      {/* Mobile Functional Strip */}
      <div className="px-4 py-4">
        {/* Top Row: Icon + Title + Primary Action */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className="text-[#00365b] text-xl">
              {icon}
            </div>
            <h1 className="text-lg font-semibold text-gray-900">
              {title}
            </h1>
          </div>
          
          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-[#fdb933] hover:bg-[#f5a623] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#fdb933]"
            >
              {primaryAction.icon && (
                <span className="mr-1">{primaryAction.icon}</span>
              )}
              <span className="hidden sm:inline">{primaryAction.label}</span>
              <span className="sm:hidden">+</span>
            </button>
          )}
        </div>

        {/* Bottom Row: Search */}
        {onSearchChange && (
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <SearchIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchValue || ''}
              onChange={(e) => onSearchChange(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-[#00365b] focus:border-[#00365b] sm:text-sm"
              placeholder={searchPlaceholder}
            />
          </div>
        )}

        {/* Custom Children Actions */}
        {children && (
          <div className="mt-3">
            {children}
          </div>
        )}
      </div>

      {/* Subtitle/Context */}
      {subtitle && (
        <div className="px-4 pb-4">
          <p className="text-sm text-gray-600">{subtitle}</p>
        </div>
      )}
    </div>
  );
}

// Responsive wrapper that automatically switches between desktop and mobile
export function ResponsiveFunctionalPageHeader(props: FunctionalPageHeaderProps) {
  return (
    <>
      {/* Desktop version */}
      <div className="hidden md:block">
        <FunctionalPageHeader {...props} />
      </div>
      
      {/* Mobile version */}
      <div className="md:hidden">
        <MobileFunctionalPageHeader {...props} />
      </div>
    </>
  );
}