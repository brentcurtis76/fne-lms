// Unified Dashboard Components - Export Index
// Centralized exports for clean imports throughout the application

export { default as UnifiedDashboard } from './UnifiedDashboard';
export { default as DashboardCard } from './DashboardCard';
export { default as KPISummaryCard } from './KPISummaryCard';
export { default as CommunityHealthCard } from './CommunityHealthCard';
export { default as WorkspaceActivityCard } from './WorkspaceActivityCard';
export { default as AdvancedFilters } from './AdvancedFilters';

// Type exports for external usage
export type { UnifiedDashboardProps } from './UnifiedDashboard';
export type { DashboardCardProps } from './DashboardCard';

// Re-export common types used across dashboard components
export interface DashboardFilters {
  timeRange: '7d' | '30d' | '90d' | '1y' | 'custom';
  startDate?: string;
  endDate?: string;
  schoolId?: string;
  generationId?: string;
  communityId?: string;
  courseId?: string;
  searchQuery?: string;
}

export interface KPIMetric {
  value: number;
  label: string;
  format: 'number' | 'percentage' | 'duration' | 'currency';
  status: 'positive' | 'negative' | 'neutral';
  change: number;
  icon?: React.ComponentType<any>;
}