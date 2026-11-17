import React from 'react';
import { Skeleton } from '../ui/kit';

/**
 * The new look's «Mi Panel» while it loads (redesign 6B, approved change 7): grey placeholder
 * shapes inside the frame, in place of today's full-page spinner: the welcome band, then the two
 * columns of cards. It reads nothing of the panel. Screen readers hear «Cargando...», today's word.
 */
export function PanelSkeleton() {
  return (
    <div role="status" data-testid="panel-nuevo-loading">
      <span className="sr-only">Cargando...</span>
      <div className="bg-gray-100 px-4 py-[18px] lg:px-7 lg:py-[22px]">
        <div className="mx-auto flex max-w-[1360px] items-center gap-4">
          <Skeleton className="flex-none rounded-full" width={80} height={80} />
          <div className="grid flex-1 gap-2">
            <Skeleton width="40%" height={26} />
            <Skeleton width="60%" height={13} />
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-[1360px] grid-cols-[minmax(0,1fr)] items-start gap-[22px] px-4 pb-8 pt-[18px] lg:gap-7 lg:px-7 lg:pb-10 lg:pt-6 min-[1180px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-[22px] lg:gap-7">
          {[1, 2].map((section) => (
            <div key={section} className="grid gap-3">
              <Skeleton width={220} height={17} />
              <div className="flex gap-[14px] overflow-hidden">
                {[1, 2, 3].map((card) => (
                  <Skeleton key={card} className="w-[248px] flex-none lg:w-[268px]" height={240} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-[22px] lg:gap-7">
          <Skeleton height={96} />
          <Skeleton height={120} />
          <Skeleton height={120} />
        </div>
      </div>
    </div>
  );
}

export default PanelSkeleton;
