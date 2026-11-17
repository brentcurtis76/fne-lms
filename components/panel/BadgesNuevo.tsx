import React from 'react';
import Link from 'next/link';
import { ArrowRight, Award, Trophy } from 'lucide-react';
import { Badge, Button, Card, Notice, Skeleton } from '../ui/kit';
import { GeneraBadgeIcon } from '../badges/BadgeIcon';
import { useBadges } from '../badges/useBadges';
import { formatEarnedAt, badgeCourseName, badgeColours, showsBadgePoints } from '../badges/badgeCardText';
import type { UserBadgeWithDetails } from '../../types/badges';
import { PanelSection } from './PanelSection';

/**
 * The new look's «Mis Logros» (redesign 6B). It reads `useBadges(userId, maxDisplay)`, the state,
 * call and decisions today's section uses: not drawn when today's is not, the same summary line,
 * the same cards shown, the same «+{n} más» tile and «Ver todos» (both to the address today's go to).
 */

function BadgeCardNuevo({ badge }: { badge: UserBadgeWithDetails }) {
  const colours = badgeColours(badge);
  const courseName = badgeCourseName(badge);
  return (
    <Card className="flex h-full items-start gap-3 p-3.5" data-testid={`panel-badge-${badge.id}`}>
      <span className="flex-none">
        <GeneraBadgeIcon size={44} colorPrimary={colours.primary} colorSecondary={colours.secondary} />
      </span>
      <div className="grid min-w-0 gap-0.5">
        {/* A third-level heading, as every card title of the new view (today's card keeps its own) */}
        <h3 className="truncate text-[0.8125rem] font-semibold text-brand_primary">{badge.badge_name}</h3>
        {courseName && <span className="truncate text-[0.8125rem] text-gray-600">{courseName}</span>}
        <span className="text-xs text-gray-600">{formatEarnedAt(badge.earned_at)}</span>
        {showsBadgePoints(badge, 'md') && (
          <Badge tone="accent" plain className="justify-self-start">
            +{badge.points_value}
          </Badge>
        )}
      </div>
    </Card>
  );
}

export function BadgesNuevo({
  userId,
  maxDisplay = 6,
  showViewAll = true,
}: {
  userId: string;
  maxDisplay?: number;
  showViewAll?: boolean;
}) {
  const { badges, loading, error, drawn, displayedBadges, hasMore, moreCount, badgeCountWords, pointsSuffix } =
    useBadges(userId, maxDisplay);

  if (!drawn) return null;

  const showsRow = !loading && !error && badges.length > 0;

  return (
    <PanelSection
      title="Mis Logros"
      icon={<Trophy />}
      sub={
        <>
          {badges.length} {badgeCountWords}
          {pointsSuffix}
        </>
      }
      action={
        showViewAll && badges.length > 0 ? (
          <Button variant="quiet" size="sm" href="/mi-aprendizaje/logros">
            Ver todos <ArrowRight aria-hidden="true" />
          </Button>
        ) : undefined
      }
      row={showsRow}
      itemsKey={displayedBadges.map((badge) => badge.id).join(' ')}
      data-testid="panel-section-badges"
    >
      {loading && (
        <div className="flex gap-[14px] overflow-hidden">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="w-[200px] flex-none" height={96} />
          ))}
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {showsRow && (
        <>
          {displayedBadges.map((badge) => (
            <div key={badge.id} className="w-[232px] flex-none snap-start">
              <BadgeCardNuevo badge={badge} />
            </div>
          ))}
          {hasMore && showViewAll && (
            <Link
              href="/mi-aprendizaje/logros"
              className="grid w-[124px] flex-none snap-start place-content-center justify-items-center gap-1 self-stretch rounded border border-brand_primary/[0.12] bg-white p-3.5 text-[0.8125rem] font-bold text-brand_primary no-underline transition-[border-color,box-shadow] duration-150 hover:border-brand_primary/[0.24] motion-reduce:transition-none"
              data-testid="panel-badges-more"
            >
              <Award aria-hidden="true" className="h-[22px] w-[22px] text-brand_accent_text" />
              <span>+{moreCount} más</span>
            </Link>
          )}
        </>
      )}
    </PanelSection>
  );
}

export default BadgesNuevo;
