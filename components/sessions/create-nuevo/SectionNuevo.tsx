import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Card } from '../../ui/kit';

/** The section heading of the new look's form: the Mont capitals of the new look's cards. */
export const SECTION_TITLE =
  'flex items-center gap-[10px] font-mont text-[0.9375rem] font-extrabold uppercase leading-[1.4] tracking-[0.06em] text-brand_primary';

/**
 * One numbered card of the new look's form «Programar Sesión» (redesign 6, release SB): a number in a
 * black disc, the section's title (an `h2` that names the section) and its fields.
 */
export function SectionNuevo({
  id,
  n,
  title,
  children,
  testId,
}: {
  id: string;
  n: number;
  title: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <Card className="min-w-0 scroll-mt-24" data-testid={testId}>
      <section aria-labelledby={id} className="grid min-w-0 gap-4 p-4 sm:p-5">
        <h2 id={id} className={SECTION_TITLE}>
          <span
            aria-hidden="true"
            className="inline-grid h-[22px] w-[22px] flex-none place-content-center rounded-full bg-brand_primary text-[0.6875rem] tracking-normal text-white"
          >
            {n}
          </span>
          <span className="min-w-0">{title}</span>
        </h2>
        {children}
      </section>
    </Card>
  );
}

/** The red message under a field (the kit's `Field` draws its own; this one is for blocks that are not a `Field`). */
export function FieldMessage({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <span id={id} className="flex items-start gap-1.5 text-xs text-red-600">
      <AlertCircle aria-hidden="true" className="mt-px h-3.5 w-3.5 flex-none" />
      <span className="min-w-0">{children}</span>
    </span>
  );
}
