import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { GeneraBadgeIcon } from './BadgeIcon';
import type { BadgeCardProps } from '@/types/badges';

/**
 * Badge Card Component
 *
 * Displays a single badge with course completion information.
 * Uses Genera brand colors: Amarillo (#fbbf24), Negro (#0a0a0a)
 * Font: Inter (as per brand guidelines)
 */
export const BadgeCard: React.FC<BadgeCardProps> = ({
  badge,
  size = 'md',
  showCourseName = true,
  onClick,
}) => {
  const sizeConfig = {
    sm: {
      iconSize: 32,
      containerClass: 'p-3',
      titleClass: 'text-xs font-semibold',
      subtitleClass: 'text-[10px]',
      dateClass: 'text-[10px]',
    },
    md: {
      iconSize: 48,
      containerClass: 'p-4',
      titleClass: 'text-sm font-semibold',
      subtitleClass: 'text-xs',
      dateClass: 'text-xs',
    },
    lg: {
      iconSize: 64,
      containerClass: 'p-5',
      titleClass: 'text-base font-bold',
      subtitleClass: 'text-sm',
      dateClass: 'text-sm',
    },
  };

  const config = sizeConfig[size];

  const formatDate = (dateString: string) => {
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
  const courseName = badge.metadata?.course_name || badge.course_title || '';

  return (
    <div
      onClick={onClick}
      className={`
        bg-white rounded-xl border border-gray-200
        hover:border-brand_accent hover:shadow-lg
        transition-all duration-200
        ${onClick ? 'cursor-pointer' : ''}
        ${config.containerClass}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Badge Icon */}
        <div className="flex-shrink-0">
          <GeneraBadgeIcon
            size={config.iconSize}
            colorPrimary={badge.color_primary || '#fbbf24'}
            colorSecondary={badge.color_secondary || '#0a0a0a'}
          />
        </div>

        {/* Badge Info */}
        <div className="flex-1 min-w-0">
          {/* Badge Name */}
          <h4 className={`text-brand_primary ${config.titleClass} line-clamp-1`}>
            {badge.badge_name}
          </h4>

          {/* Course Name */}
          {showCourseName && courseName && (
            <p className={`text-gray-600 ${config.subtitleClass} line-clamp-1 mt-0.5`}>
              {courseName}
            </p>
          )}

          {/* Earned Date */}
          <p className={`text-gray-400 ${config.dateClass} mt-1`}>
            {formatDate(badge.earned_at)}
          </p>
        </div>

        {/* Points Badge */}
        {badge.points_value > 0 && size !== 'sm' && (
          <div className="flex-shrink-0">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand_accent/10 text-brand_accent">
              +{badge.points_value}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default BadgeCard;
