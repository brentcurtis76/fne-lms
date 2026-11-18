/**
 * What turns a badge into its texts, one copy for both looks (redesign 6B). Moved word for word out
 * of `BadgeCard.tsx`, which imports them back; the new look's badge card calls the same functions.
 */
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { UserBadgeWithDetails } from '@/types/badges';

/** The relative time since the badge was earned («hace 9 días»); empty for a date that is not one. */
export const formatEarnedAt = (dateString: string) => {
  try {
    return formatDistanceToNow(new Date(dateString), {
      addSuffix: true,
      locale: es,
    });
  } catch {
    return '';
  }
};

// Use metadata.course_name if available, otherwise fall back to course_title
export const badgeCourseName = (badge: UserBadgeWithDetails) => badge.metadata?.course_name || badge.course_title || '';

/** The colours the badge's icon is drawn in (the brand's yellow and black when it names none). */
export const badgeColours = (badge: UserBadgeWithDetails) => ({
  primary: badge.color_primary || '#fbbf24',
  secondary: badge.color_secondary || '#0a0a0a',
});

/** The points pill «+{p}» is drawn: above 0, and not on the small card. */
export const showsBadgePoints = (badge: UserBadgeWithDetails, size: 'sm' | 'md' | 'lg') =>
  badge.points_value > 0 && size !== 'sm';
