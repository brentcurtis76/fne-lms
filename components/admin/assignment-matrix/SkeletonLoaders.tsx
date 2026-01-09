import React from 'react';

/**
 * Skeleton loader components for the Assignment Matrix
 * Provides visual feedback while data is loading
 */

// Base skeleton pulse animation class
const pulseClass = "animate-pulse bg-gray-200 rounded";

/**
 * User list item skeleton
 */
export function UserItemSkeleton() {
  return (
    <div className="px-4 py-3 border-l-4 border-transparent">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className={`h-4 w-32 ${pulseClass}`} />
          <div className={`h-3 w-48 mt-1.5 ${pulseClass}`} />
          <div className={`h-3 w-24 mt-1 ${pulseClass}`} />
        </div>
        <div className="ml-2">
          <div className={`h-5 w-16 ${pulseClass}`} />
        </div>
      </div>
    </div>
  );
}

/**
 * Group list item skeleton
 */
export function GroupItemSkeleton() {
  return (
    <div className="px-4 py-3 border-l-4 border-transparent">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-4 w-4 ${pulseClass}`} />
          <div className={`h-4 w-40 ${pulseClass}`} />
        </div>
      </div>
    </div>
  );
}

/**
 * Assignment card skeleton
 */
export function AssignmentCardSkeleton() {
  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className={`h-5 w-5 ${pulseClass}`} />
            <div className={`h-5 w-48 ${pulseClass}`} />
          </div>
          <div className={`h-3 w-72 mt-2 ${pulseClass}`} />
          <div className="flex items-center gap-2 mt-3">
            <div className={`h-5 w-16 ${pulseClass}`} />
            <div className={`h-3 w-24 ${pulseClass}`} />
          </div>
        </div>
        <div className={`h-8 w-8 ${pulseClass}`} />
      </div>
      {/* Progress bar skeleton */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        <div className="flex items-center gap-2">
          <div className={`h-2 flex-1 ${pulseClass}`} />
          <div className={`h-3 w-8 ${pulseClass}`} />
        </div>
      </div>
    </div>
  );
}

/**
 * User assignments header skeleton
 */
export function UserHeaderSkeleton() {
  return (
    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
      <div className="flex items-start justify-between">
        <div>
          <div className={`h-6 w-40 ${pulseClass}`} />
          <div className={`h-4 w-56 mt-2 ${pulseClass}`} />
          <div className="flex items-center gap-3 mt-2">
            <div className={`h-4 w-24 ${pulseClass}`} />
            <div className={`h-4 w-20 ${pulseClass}`} />
          </div>
        </div>
        <div className={`h-8 w-8 ${pulseClass}`} />
      </div>
    </div>
  );
}

/**
 * Stats bar skeleton
 */
export function StatsSkeleton() {
  return (
    <div className="px-6 py-3 bg-white border-b border-gray-200">
      <div className="flex items-center gap-4">
        <div className={`h-4 w-20 ${pulseClass}`} />
        <div className={`h-4 w-24 ${pulseClass}`} />
        <div className={`h-4 w-32 ${pulseClass}`} />
      </div>
    </div>
  );
}

/**
 * Full user list skeleton (multiple items)
 */
export function UserListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: count }).map((_, i) => (
        <UserItemSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Full group list skeleton (multiple items)
 */
export function GroupListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: count }).map((_, i) => (
        <GroupItemSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Full assignment list skeleton (multiple items)
 */
export function AssignmentListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <AssignmentCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Empty state component for when there's no data
 */
interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="text-gray-300 mb-4">
        {icon}
      </div>
      <h3 className="text-sm font-medium text-gray-900 mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-gray-500 max-w-sm">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-4">
          {action}
        </div>
      )}
    </div>
  );
}

export default {
  UserItemSkeleton,
  GroupItemSkeleton,
  AssignmentCardSkeleton,
  UserHeaderSkeleton,
  StatsSkeleton,
  UserListSkeleton,
  GroupListSkeleton,
  AssignmentListSkeleton,
  EmptyState
};
