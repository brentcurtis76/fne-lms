import React from 'react';
import { Card, EmptyState, Skeleton } from '../../ui/kit';

/**
 * The new look's form «Programar Sesión» while the page loads (redesign 6, release SB, approved:
 * loading inside the frame): grey placeholder cards in the form's two columns, in place of today's
 * full-page spinner. It reads nothing. Screen readers hear «Cargando...».
 */
export function SessionCreateSkeleton() {
  return (
    <div role="status" data-testid="session-create-nuevo-loading" className="px-4 pb-8 pt-[18px] lg:px-7 lg:pt-6">
      <span className="sr-only">Cargando...</span>
      <div className="mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_344px]">
        <div className="grid min-w-0 gap-4">
          <Skeleton width="45%" height={28} />
          {[1, 2, 3].map((card) => (
            <Card key={card} className="grid gap-3 p-4 sm:p-5">
              <Skeleton width="30%" height={14} />
              <Skeleton height={40} />
              <Skeleton height={40} />
            </Card>
          ))}
        </div>
        <Card className="grid gap-3 p-4 sm:p-5">
          <Skeleton width="40%" height={14} />
          <Skeleton height={120} />
          <Skeleton height={40} />
        </Card>
      </div>
    </div>
  );
}

/**
 * «Acceso Denegado» inside the frame (approved), with today's two sentences, shown briefly before
 * the hook's redirect to /dashboard.
 */
export function SessionCreateDenied() {
  return (
    <div className="px-4 pb-8 pt-[18px] lg:px-7 lg:pt-6" data-testid="session-create-nuevo-denied">
      <Card className="mx-auto max-w-[640px]">
        <EmptyState
          title="Acceso Denegado"
          description="No tiene permisos para acceder a esta página."
          headingLevel={2}
        />
      </Card>
    </div>
  );
}
