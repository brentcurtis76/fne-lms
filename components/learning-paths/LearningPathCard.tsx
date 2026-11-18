import React from 'react';
import { BookOpen, Clock, Award, TrendingUp } from 'lucide-react';
import { routeState, routeLevel, routePercent, routeActionText, timeSinceAssigned, type RouteProgress } from './routeCardText';

type LearningPathProgress = RouteProgress;

interface LearningPathCardProps {
  id: string;
  name: string;
  description?: string;
  assigned_at: string;
  progress?: LearningPathProgress;
  onClick?: () => void;
}

/**
 * Learning Path Card Component
 *
 * A visually striking card with gradient background and prominent progress display.
 * Uses Genera brand colors: brand_primary (black), brand_accent (gold), brand_beige.
 */
export const LearningPathCard: React.FC<LearningPathCardProps> = ({
  id,
  name,
  description,
  assigned_at,
  progress,
  onClick,
}) => {
  // The numbers, states and words: ./routeCardText (shared with the new look)
  const { progressPercentage, completedCourses, totalCourses, isCompleted, isStarted } = routeState(progress);

  // Calculate gradient based on progress
  const getGradientClass = () => {
    if (isCompleted) {
      // Completed: Gold gradient
      return 'bg-gradient-to-br from-amber-500 via-amber-400 to-yellow-300';
    }
    if (isStarted) {
      // In progress: Dark to gold gradient
      return 'bg-gradient-to-br from-brand_primary via-gray-800 to-amber-900';
    }
    // Not started: Dark elegant gradient
    return 'bg-gradient-to-br from-brand_primary via-gray-900 to-gray-800';
  };

  const getTextColorClass = () => {
    if (isCompleted) {
      return 'text-brand_primary';
    }
    return 'text-white';
  };

  const getSecondaryTextColorClass = () => {
    if (isCompleted) {
      return 'text-brand_primary/70';
    }
    return 'text-white/70';
  };

  return (
    <div
      onClick={onClick}
      className={`
        relative overflow-hidden rounded-xl cursor-pointer
        transform transition-all duration-300 ease-out
        hover:scale-[1.02] hover:shadow-2xl
        ${getGradientClass()}
        min-h-[280px] flex flex-col
      `}
    >
      {/* Decorative pattern overlay */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white rounded-full translate-y-1/2 -translate-x-1/2" />
      </div>

      {/* Content */}
      <div className="relative z-10 p-6 flex flex-col h-full">
        {/* Header with level badge */}
        <div className="flex items-start justify-between mb-4">
          <div className={`
            px-3 py-1 rounded-full text-xs font-semibold
            ${isCompleted
              ? 'bg-brand_primary/20 text-brand_primary'
              : 'bg-white/20 text-white backdrop-blur-sm'
            }
          `}>
            Nivel {routeLevel(totalCourses)}
          </div>

          {isCompleted && (
            <div className="flex items-center gap-1 bg-brand_primary/20 px-2 py-1 rounded-full">
              <Award className="w-4 h-4 text-brand_primary" />
              <span className="text-xs font-bold text-brand_primary">Completado</span>
            </div>
          )}
        </div>

        {/* Title */}
        <h3 className={`text-xl font-bold mb-2 line-clamp-2 ${getTextColorClass()}`}>
          {name}
        </h3>

        {/* Description */}
        {description && (
          <p className={`text-sm line-clamp-2 mb-4 ${getSecondaryTextColorClass()}`}>
            {description}
          </p>
        )}

        {/* Spacer */}
        <div className="flex-grow" />

        {/* Progress Section - Prominent */}
        <div className="mt-auto">
          {/* Progress Bar */}
          <div className="mb-3">
            <div className="flex justify-between items-center mb-2">
              <span className={`text-sm font-medium ${getTextColorClass()}`}>
                Progreso
              </span>
              <span className={`text-2xl font-bold ${getTextColorClass()}`}>
                {routePercent(progressPercentage)}%
              </span>
            </div>

            {/* Progress bar track */}
            <div className={`
              w-full h-3 rounded-full overflow-hidden
              ${isCompleted ? 'bg-brand_primary/20' : 'bg-white/20'}
            `}>
              {/* Progress bar fill */}
              <div
                className={`
                  h-full rounded-full transition-all duration-500 ease-out
                  ${isCompleted
                    ? 'bg-brand_primary'
                    : 'bg-gradient-to-r from-brand_accent via-amber-400 to-yellow-300'
                  }
                `}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          {/* Stats row */}
          <div className={`flex items-center justify-between text-sm ${getSecondaryTextColorClass()}`}>
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" />
              <span>{completedCourses} de {totalCourses} cursos</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              <span>
                {timeSinceAssigned(assigned_at)}
              </span>
            </div>
          </div>
        </div>

        {/* Action indicator */}
        {!isCompleted && (
          <div className={`
            mt-4 flex items-center justify-center gap-2 py-2 rounded-lg
            ${isStarted
              ? 'bg-brand_accent/20'
              : 'bg-white/10'
            }
          `}>
            <TrendingUp className={`w-4 h-4 ${getTextColorClass()}`} />
            <span className={`text-sm font-medium ${getTextColorClass()}`}>
              {routeActionText(isStarted)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default LearningPathCard;
