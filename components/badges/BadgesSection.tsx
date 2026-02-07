import React, { useEffect, useState } from 'react';
import { Award, ArrowRight, Trophy } from 'lucide-react';
import Link from 'next/link';
import { BadgeCard } from './BadgeCard';
import { GeneraBadgeIcon } from './BadgeIcon';
import { BadgeService } from '@/lib/services/badgeService';
import type { UserBadgeWithDetails } from '@/types/badges';

interface BadgesSectionProps {
  userId: string;
  maxDisplay?: number;
  showViewAll?: boolean;
}

/**
 * Badges Section Component for Dashboard
 *
 * Displays user's earned badges in a horizontal scrollable row.
 * Uses Genera brand guidelines:
 * - Colors: Negro (#0a0a0a), Amarillo (#fbbf24), Blanco (#ffffff)
 * - Font: Inter
 * - High contrast (4.5:1 minimum)
 */
export const BadgesSection: React.FC<BadgesSectionProps> = ({
  userId,
  maxDisplay = 6,
  showViewAll = true,
}) => {
  const [badges, setBadges] = useState<UserBadgeWithDetails[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBadges = async () => {
      if (!userId) return;

      setLoading(true);
      setError(null);

      try {
        const response = await BadgeService.getUserBadges(userId);
        setBadges(response.badges);
        setTotalPoints(response.total_points);
      } catch (err) {
        console.error('Error fetching badges:', err);
        setError('Error al cargar los logros');
      } finally {
        setLoading(false);
      }
    };

    fetchBadges();
  }, [userId]);

  // Don't render if no badges and not loading
  if (!loading && badges.length === 0) {
    return null;
  }

  const displayedBadges = badges.slice(0, maxDisplay);
  const hasMore = badges.length > maxDisplay;

  return (
    <section className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand_accent/10 rounded-lg">
            <Trophy className="w-5 h-5 text-brand_accent" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-brand_primary">Mis Logros</h2>
            <p className="text-sm text-gray-500">
              {badges.length} {badges.length === 1 ? 'insignia obtenida' : 'insignias obtenidas'}
              {totalPoints > 0 && ` · ${totalPoints} puntos`}
            </p>
          </div>
        </div>

        {showViewAll && badges.length > 0 && (
          <Link
            href="/mi-aprendizaje/logros"
            className="text-sm font-medium text-brand_primary hover:text-brand_accent transition-colors flex items-center gap-1"
          >
            Ver todos <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex-none w-[200px] h-24 bg-gray-100 rounded-xl animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Badges Grid/Row */}
      {!loading && !error && badges.length > 0 && (
        <div className="relative">
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
            {displayedBadges.map((badge) => (
              <div
                key={badge.id}
                className="flex-none w-[220px] snap-start"
              >
                <BadgeCard badge={badge} size="md" />
              </div>
            ))}

            {/* "View More" card if there are more badges */}
            {hasMore && showViewAll && (
              <Link
                href="/mi-aprendizaje/logros"
                className="flex-none w-[120px] snap-start"
              >
                <div className="h-full bg-gray-50 rounded-xl border border-gray-200 hover:border-brand_accent hover:bg-brand_accent/5 transition-all duration-200 flex flex-col items-center justify-center p-4 cursor-pointer">
                  <div className="p-3 bg-brand_accent/10 rounded-full mb-2">
                    <Award className="w-6 h-6 text-brand_accent" />
                  </div>
                  <span className="text-sm font-medium text-brand_primary">
                    +{badges.length - maxDisplay} más
                  </span>
                </div>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Empty State with Encouragement */}
      {!loading && !error && badges.length === 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 text-center">
          <GeneraBadgeIcon size={64} className="mx-auto mb-4 opacity-30" />
          <h3 className="text-lg font-semibold text-gray-600 mb-2">
            Tus logros aparecerán aquí
          </h3>
          <p className="text-sm text-gray-500">
            Completa cursos para ganar insignias y reconocimientos
          </p>
        </div>
      )}
    </section>
  );
};

export default BadgesSection;
