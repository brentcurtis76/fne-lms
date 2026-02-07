// Badge System Types
// Based on Genera Brand Guidelines

export interface Badge {
  id: string;
  name: string;
  description: string | null;
  badge_type: 'course_completion' | 'module_completion' | 'milestone' | 'special';
  icon_name: string;
  color_primary: string; // Default: #fbbf24 (Brand Amarillo)
  color_secondary: string; // Default: #0a0a0a (Brand Negro)
  criteria: Record<string, unknown>;
  points_value: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserBadge {
  id: string;
  user_id: string;
  badge_id: string;
  course_id: string | null;
  earned_at: string;
  displayed_in_community: boolean;
  metadata: {
    course_name?: string;
    completed_at?: string;
    [key: string]: unknown;
  };
  created_at: string;
}

export interface UserBadgeWithDetails extends UserBadge {
  badge_name: string;
  badge_description: string | null;
  badge_type: Badge['badge_type'];
  icon_name: string;
  color_primary: string;
  color_secondary: string;
  points_value: number;
  course_title?: string;
  course_thumbnail?: string;
}

// API response types
export interface GetUserBadgesResponse {
  badges: UserBadgeWithDetails[];
  total_points: number;
}

export interface AwardBadgeResponse {
  success: boolean;
  badge_id?: string;
  user_badge_id?: string;
  message?: string;
  already_awarded?: boolean;
}

// Component props
export interface BadgeCardProps {
  badge: UserBadgeWithDetails;
  size?: 'sm' | 'md' | 'lg';
  showCourseName?: boolean;
  onClick?: () => void;
}

export interface BadgesSectionProps {
  userId: string;
  maxDisplay?: number;
  showViewAll?: boolean;
  onViewAll?: () => void;
}
