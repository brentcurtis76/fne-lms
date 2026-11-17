import React, { useId } from 'react';
import { Award, BookOpen, Clock, TrendingUp } from 'lucide-react';
import { Badge, Card } from '../ui/kit';
import { routeState, routeLevel, routePercent, routeActionText, timeSinceAssigned, type RouteProgress } from '../learning-paths/routeCardText';
import { fullTitle } from './PanelSection';

/**
 * The new look's route card (redesign 6B): ONE link to the route (approved change: today it is a
 * `div` with a click, out of the keyboard's reach). Every word and number comes from
 * `components/learning-paths/routeCardText`, as today's card's do.
 */
export function RouteCardNuevo({
  name,
  description,
  assigned_at,
  progress,
  href,
  testId,
}: {
  name: string;
  description?: string;
  assigned_at: string;
  progress?: RouteProgress;
  href: string;
  testId: string;
}) {
  const { progressPercentage, completedCourses, totalCourses, isCompleted, isStarted } = routeState(progress);
  const percent = routePercent(progressPercentage);
  const labelId = useId();

  return (
    <Card interactive href={href} leading={isCompleted} className="flex h-full flex-col gap-2 p-4" data-testid={testId}>
      <span className="flex items-center justify-between gap-2">
        <Badge tone="neutral" plain>
          Nivel {routeLevel(totalCourses)}
        </Badge>
        {isCompleted && (
          <Badge tone="success" plain>
            <Award aria-hidden="true" className="h-3 w-3" />
            Completado
          </Badge>
        )}
      </span>
      <h3 className="line-clamp-2 font-mont text-[0.8125rem] font-bold uppercase leading-[1.5] tracking-[0.1em] text-brand_primary" {...fullTitle(name)}>
        {name}
      </h3>
      {description && <p className="line-clamp-2 text-[0.8125rem] text-gray-600">{description}</p>}
      <span className="mt-auto flex items-end justify-between pt-2">
        <span id={labelId} className="font-mont text-[0.6875rem] font-medium uppercase tracking-[0.26em] text-gray-600">Progreso</span>
        <span className="text-xl font-bold leading-none text-brand_primary">{percent}%</span>
      </span>
      <span
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-labelledby={labelId}
        className="block h-1.5 overflow-hidden rounded-full bg-brand_primary/[0.14]"
      >
        <span
          className="block h-full rounded-full bg-[linear-gradient(100deg,#fbbf24_30%,#f59e0b)]"
          style={{ width: `${progressPercentage}%` }}
        />
      </span>
      <span className="flex flex-wrap justify-between gap-x-3 text-[0.8125rem] text-gray-600">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <BookOpen aria-hidden="true" className="h-[13px] w-[13px]" />
          {completedCourses} de {totalCourses} cursos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock aria-hidden="true" className="h-[13px] w-[13px]" />
          {timeSinceAssigned(assigned_at)}
        </span>
      </span>
      {!isCompleted && (
        <span className="inline-flex items-center gap-[0.7em] self-start border-b border-current pb-1 font-mont text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-brand_primary">
          <TrendingUp aria-hidden="true" className="h-[13px] w-[13px]" />
          {routeActionText(isStarted)}
        </span>
      )}
    </Card>
  );
}

export default RouteCardNuevo;
