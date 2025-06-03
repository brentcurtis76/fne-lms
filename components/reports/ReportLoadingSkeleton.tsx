import React from 'react';
import { motion } from 'framer-motion';

interface ReportLoadingSkeletonProps {
  variant: 'dashboard' | 'table' | 'chart' | 'filters' | 'kpi-cards' | 'mobile-cards';
  count?: number;
  className?: string;
}

const shimmer = {
  animate: {
    backgroundPosition: ["200% 0", "-200% 0"],
  },
  transition: {
    duration: 2,
    ease: "linear",
    repeat: Infinity,
  }
};

const SkeletonBox: React.FC<{ className: string; style?: React.CSSProperties }> = ({ className, style }) => (
  <motion.div
    className={`bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded ${className}`}
    style={{
      backgroundSize: "200% 100%",
      ...style
    }}
    {...shimmer}
  />
);

export default function ReportLoadingSkeleton({ 
  variant, 
  count = 5, 
  className = "" 
}: ReportLoadingSkeletonProps) {
  const renderDashboardSkeleton = () => (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="space-y-3">
        <SkeletonBox className="h-8 w-1/3" />
        <SkeletonBox className="h-4 w-1/2" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <SkeletonBox className="h-6 w-24" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBox key={i} className="h-10" />
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <SkeletonBox className="h-4 w-20" />
                <SkeletonBox className="h-6 w-16" />
                <SkeletonBox className="h-3 w-24" />
              </div>
              <SkeletonBox className="h-10 w-10 rounded-full" />
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-100">
              <SkeletonBox className="h-6 w-32" />
            </div>
            <div className="p-4">
              <SkeletonBox className="h-64 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTableSkeleton = () => (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      {/* Search Bar */}
      <div className="p-4 border-b border-gray-200">
        <SkeletonBox className="h-10 w-full" />
      </div>

      {/* Table Header */}
      <div className="bg-gray-50 p-4">
        <div className="grid grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBox key={i} className="h-4" />
          ))}
        </div>
      </div>

      {/* Table Rows */}
      <div className="divide-y divide-gray-200">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="p-4">
            <div className="grid grid-cols-6 gap-4 items-center">
              {Array.from({ length: 6 }).map((_, j) => (
                <SkeletonBox key={j} className={`h-4 ${j === 0 ? 'w-full' : 'w-3/4'}`} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <SkeletonBox className="h-4 w-48" />
          <div className="flex space-x-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonBox key={i} className="h-8 w-8" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderChartSkeleton = () => (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <SkeletonBox className="h-6 w-40" />
        <SkeletonBox className="h-8 w-8" />
      </div>
      <div className="p-6">
        <SkeletonBox className="h-64 w-full" />
      </div>
    </div>
  );

  const renderFiltersSkeleton = () => (
    <div className={`bg-white rounded-lg shadow p-4 ${className}`}>
      <div className="space-y-4">
        <SkeletonBox className="h-6 w-24" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <SkeletonBox className="h-4 w-20" />
              <SkeletonBox className="h-10 w-full" />
            </div>
          ))}
        </div>
        <div className="flex space-x-3">
          <SkeletonBox className="h-9 w-20" />
          <SkeletonBox className="h-9 w-24" />
        </div>
      </div>
    </div>
  );

  const renderKPICardsSkeleton = () => (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg shadow p-6 border-l-4 border-gray-200">
          <div className="flex items-center justify-between">
            <div className="space-y-2 flex-1">
              <SkeletonBox className="h-4 w-24" />
              <div className="flex items-baseline space-x-2">
                <SkeletonBox className="h-8 w-16" />
                <SkeletonBox className="h-4 w-12" />
              </div>
              <SkeletonBox className="h-3 w-20" />
            </div>
            <div className="p-3 rounded-full bg-gray-100">
              <SkeletonBox className="h-6 w-6" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderMobileCardsSkeleton = () => (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg shadow border border-gray-200 p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 space-y-2">
              <div className="flex items-center space-x-2">
                <SkeletonBox className="h-4 w-32" />
                <SkeletonBox className="h-2 w-2 rounded-full" />
              </div>
              <SkeletonBox className="h-3 w-40" />
            </div>
            <SkeletonBox className="h-8 w-8 rounded-full" />
          </div>

          {/* Progress Bar */}
          <div className="space-y-2 mb-3">
            <div className="flex justify-between">
              <SkeletonBox className="h-3 w-16" />
              <SkeletonBox className="h-3 w-8" />
            </div>
            <SkeletonBox className="h-2 w-full rounded-full" />
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="bg-gray-50 rounded p-2 text-center space-y-1">
                <SkeletonBox className="h-4 w-8 mx-auto" />
                <SkeletonBox className="h-3 w-12 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const skeletonVariants = {
    dashboard: renderDashboardSkeleton,
    table: renderTableSkeleton,
    chart: renderChartSkeleton,
    filters: renderFiltersSkeleton,
    'kpi-cards': renderKPICardsSkeleton,
    'mobile-cards': renderMobileCardsSkeleton,
  };

  return skeletonVariants[variant]();
}