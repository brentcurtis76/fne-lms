// Badge Service for FNE LMS
// Handles badge retrieval and awarding

import { supabase } from '../supabase-wrapper';
import type { UserBadgeWithDetails, GetUserBadgesResponse, AwardBadgeResponse } from '@/types/badges';

export class BadgeService {
  /**
   * Get all badges for a user
   */
  static async getUserBadges(userId: string): Promise<GetUserBadgesResponse> {
    try {
      const { data, error } = await supabase
        .from('user_badges_with_details')
        .select('*')
        .eq('user_id', userId)
        .order('earned_at', { ascending: false });

      if (error) {
        // Handle case where tables don't exist yet
        if (error.message.includes('does not exist') || error.code === '42P01') {
          console.warn('Badge tables not configured yet');
          return { badges: [], total_points: 0 };
        }
        throw error;
      }

      const badges = (data || []) as UserBadgeWithDetails[];
      const total_points = badges.reduce((sum, badge) => sum + (badge.points_value || 0), 0);

      return { badges, total_points };
    } catch (error) {
      console.error('Error fetching user badges:', error);
      return { badges: [], total_points: 0 };
    }
  }

  /**
   * Award a course completion badge to a user
   * This is called from the course completion API
   */
  static async awardCourseCompletionBadge(
    userId: string,
    courseId: string,
    courseName: string
  ): Promise<AwardBadgeResponse> {
    try {
      // Use the database function to award the badge
      const { data, error } = await supabase
        .rpc('award_course_completion_badge', {
          p_user_id: userId,
          p_course_id: courseId,
          p_course_name: courseName
        });

      if (error) {
        // Handle case where function doesn't exist yet
        if (error.message.includes('does not exist') || error.code === '42883') {
          console.warn('Badge award function not configured yet');
          return { success: false, message: 'Badge system not configured' };
        }
        throw error;
      }

      // If data is null, badge already exists
      if (data === null) {
        return {
          success: true,
          message: 'Badge already awarded',
          already_awarded: true
        };
      }

      return {
        success: true,
        user_badge_id: data,
        message: 'Badge awarded successfully'
      };
    } catch (error) {
      console.error('Error awarding badge:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to award badge'
      };
    }
  }

  /**
   * Check if a user has a specific badge for a course
   */
  static async hasCourseBadge(userId: string, courseId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('user_badges')
        .select('id')
        .eq('user_id', userId)
        .eq('course_id', courseId)
        .maybeSingle();

      if (error) {
        console.error('Error checking badge:', error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error('Error checking badge:', error);
      return false;
    }
  }

  /**
   * Get total badge count for a user
   */
  static async getBadgeCount(userId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('user_badges')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (error) {
        console.error('Error getting badge count:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Error getting badge count:', error);
      return 0;
    }
  }
}

export default BadgeService;
