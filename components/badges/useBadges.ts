import { useEffect, useState } from 'react';
import { BadgeService } from '@/lib/services/badgeService';
import type { UserBadgeWithDetails } from '@/types/badges';

/**
 * «Mis Logros»'s state, its one data call and its decisions, one copy for both looks (redesign 6B).
 * Moved word for word out of `BadgesSection.tsx` (the same states in the same order, the same effect
 * with the same dependency list); `BadgesSection` and the new look's section both call it.
 * `maxDisplay` is the section's own prop (how many cards are shown), default 6 as there.
 */
export function useBadges(userId: string, maxDisplay = 6) {
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
  const drawn = !(!loading && badges.length === 0);

  const displayedBadges = badges.slice(0, maxDisplay);
  const hasMore = badges.length > maxDisplay;
  // The «+{n} más» tile's number
  const moreCount = badges.length - maxDisplay;

  // The summary line under the title: «{n} insignia(s) obtenida(s)» and « · {p} puntos» when above 0
  const badgeCountWords = badges.length === 1 ? 'insignia obtenida' : 'insignias obtenidas';
  const pointsSuffix = totalPoints > 0 && ` · ${totalPoints} puntos`;

  return {
    badges,
    totalPoints,
    loading,
    error,
    drawn,
    displayedBadges,
    hasMore,
    moreCount,
    badgeCountWords,
    pointsSuffix,
  };
}
