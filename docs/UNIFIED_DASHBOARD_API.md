# Unified Dashboard API Specification

## Overview
This specification defines a single, consolidated API endpoint that replaces the scattered reporting endpoints with a unified, performant, and user-centric dashboard data service.

## Design Principles
- **5-Second Rule**: Primary data loads in <100ms for immediate comprehension
- **Card-Based Structure**: Data organized into self-contained, modular components
- **Progressive Disclosure**: Summary data first, detailed data on demand
- **Role-Based Personalization**: Default layouts optimized per user persona

## API Endpoint

### `GET /api/dashboard/unified`

#### Query Parameters
```typescript
interface DashboardQuery {
  // View Configuration
  view?: 'overview' | 'detailed' | 'collaborative' | 'custom'
  cards?: string[]  // Comma-separated list of requested cards
  
  // Filters
  timeRange?: '7d' | '30d' | '90d' | '1y' | 'custom'
  startDate?: string  // ISO date for custom range
  endDate?: string    // ISO date for custom range
  
  // Organizational Filters
  schoolId?: string
  generationId?: string
  communityId?: string
  courseId?: string
  
  // Pagination & Performance
  limit?: number      // For detailed data cards
  offset?: number
  includeDetails?: boolean  // Whether to include drill-down data
}
```

#### Response Structure

```typescript
interface UnifiedDashboardResponse {
  // Meta Information
  metadata: {
    userId: string
    userRole: string
    generatedAt: string
    timeRange: string
    appliedFilters: Record<string, any>
    permissions: string[]
    loadTimeMs: number
  }
  
  // Core Dashboard Cards (Always Included)
  cards: {
    // KPI Overview Cards
    kpiSummary: KPISummaryCard
    engagementMetrics: EngagementMetricsCard
    progressOverview: ProgressOverviewCard
    
    // Learning Analytics Cards
    courseAnalytics?: CourseAnalyticsCard
    learningPaths?: LearningPathsCard
    performanceMetrics?: PerformanceMetricsCard
    
    // Collaborative Analytics Cards
    communityHealth?: CommunityHealthCard
    workspaceActivity?: WorkspaceActivityCard
    socialLearning?: SocialLearningCard
    
    // Organizational Views
    schoolsOverview?: SchoolsOverviewCard
    communitiesOverview?: CommunitiesOverviewCard
    
    // Detailed Data (if requested)
    userDetails?: UserDetailsCard
    courseDetails?: CourseDetailsCard
  }
  
  // Quick Actions & Navigation
  quickActions: QuickAction[]
  
  // Real-time Updates Channel
  realtimeChannel?: string
}
```

## Card Specifications

### KPI Summary Card
```typescript
interface KPISummaryCard {
  type: 'kpi-summary'
  title: string
  data: {
    totalUsers: KPIMetric
    activeUsers: KPIMetric
    avgCompletionRate: KPIMetric
    totalTimeSpent: KPIMetric
    coursesInProgress: KPIMetric
    atRiskUsers: KPIMetric
  }
  trends: {
    period: string
    percentageChanges: Record<string, number>
  }
  lastUpdated: string
}

interface KPIMetric {
  value: number
  label: string
  format: 'number' | 'percentage' | 'duration' | 'currency'
  status: 'positive' | 'negative' | 'neutral'
  change: number  // Percentage change from previous period
}
```

### Community Health Card
```typescript
interface CommunityHealthCard {
  type: 'community-health'
  title: string
  data: {
    overallScore: number  // 0-100 health score
    communities: Array<{
      id: string
      name: string
      healthScore: number
      memberCount: number
      activeMembers: number
      recentActivity: number
      collaborationIndex: number
      trendDirection: 'up' | 'down' | 'stable'
    }>
  }
  insights: Array<{
    type: 'warning' | 'success' | 'info'
    message: string
    communityId?: string
    actionSuggestion?: string
  }>
  chartData: {
    healthTrends: Array<{
      date: string
      score: number
      communityId: string
    }>
  }
}
```

### Workspace Activity Card
```typescript
interface WorkspaceActivityCard {
  type: 'workspace-activity'
  title: string
  data: {
    totalActivities: number
    activitiesThisPeriod: number
    mostActiveWorkspaces: Array<{
      workspaceId: string
      workspaceName: string
      activityCount: number
      uniqueParticipants: number
      activityTypes: Record<string, number>
    }>
    activityTimeline: Array<{
      date: string
      activityCount: number
      activityTypes: Record<string, number>
    }>
    engagementMetrics: {
      averageParticipantsPerActivity: number
      messageVolume: number
      documentShares: number
      meetingAttendance: number
    }
  }
  realTimeUpdates: boolean
}
```

### Social Learning Card
```typescript
interface SocialLearningCard {
  type: 'social-learning'
  title: string
  data: {
    peerInteractions: {
      totalMentions: number
      documentShares: number
      collaborativeProjects: number
      peerSupport: number
    }
    networkAnalysis: {
      mostConnectedUsers: Array<{
        userId: string
        userName: string
        connectionCount: number
        influenceScore: number
      }>
      communityConnections: Array<{
        fromCommunity: string
        toCommunity: string
        connectionStrength: number
      }>
    }
    collaborationPatterns: {
      peakHours: number[]
      preferredMethods: Record<string, number>
      crossCommunityRate: number
    }
  }
}
```

## Performance Requirements

### Load Time Targets
- **KPI Summary**: <50ms
- **Essential Cards**: <100ms
- **Detailed Cards**: <200ms
- **Full Dashboard**: <500ms

### Caching Strategy
- **Summary Data**: 5-minute cache
- **Detailed Analytics**: 15-minute cache
- **Real-time Metrics**: No cache, WebSocket updates
- **User-specific Data**: 2-minute cache per user

### Data Optimization
- Pre-aggregated summary tables for fast KPI retrieval
- Lazy loading for detailed card data
- Progressive enhancement for collaborative features
- Role-based data filtering at query level

## Security & Access Control

### Role-Based Data Access
```typescript
interface RolePermissions {
  admin: ['all-cards', 'all-filters', 'sensitive-data']
  supervisor_de_red: ['network-cards', 'network-filters', 'network-data']
  lider_comunidad: ['community-cards', 'community-filters', 'community-data']
  consultor: ['assigned-cards', 'consultation-data']
  docente: ['course-cards', 'student-data']
}
```

### Data Privacy
- User data anonymization for aggregated views
- Sensitive information filtering based on role
- Audit logging for data access
- GDPR compliance for EU users

## Real-time Updates

### WebSocket Integration
- Live updates for collaborative metrics
- Real-time notifications for critical alerts
- Activity feed streaming for workspace cards
- Connection management with reconnection logic

### Update Channels
```typescript
interface RealtimeChannels {
  'dashboard:{userId}': UserSpecificUpdates
  'community:{communityId}': CommunityUpdates
  'workspace:{workspaceId}': WorkspaceUpdates
  'system': SystemWideUpdates
}
```

## Error Handling

### Error Response Format
```typescript
interface ErrorResponse {
  error: {
    code: string
    message: string
    details?: any
    timestamp: string
    requestId: string
  }
  fallbackData?: Partial<UnifiedDashboardResponse>
}
```

### Graceful Degradation
- Show cached data if real-time update fails
- Display cards progressively as data loads
- Provide user-friendly error messages
- Maintain functionality with reduced feature set

## Migration Strategy

### Phase 1: Core Implementation
1. Build unified API endpoint alongside existing endpoints
2. Implement KPI and engagement cards
3. Add basic filtering and role-based access
4. Create performance monitoring

### Phase 2: Collaborative Features
1. Integrate workspace activity analytics
2. Add community health scoring
3. Implement social learning metrics
4. Add real-time updates

### Phase 3: Advanced Features
1. Add predictive analytics cards
2. Implement custom dashboard layouts
3. Add export and sharing functionality
4. Optimize for mobile performance

This unified API design consolidates reporting functionality while maintaining performance, security, and user experience standards. It follows the card-based, progressive disclosure principles we established while providing the technical foundation for both current and future dashboard features.