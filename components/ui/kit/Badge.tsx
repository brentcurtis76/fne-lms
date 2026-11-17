import * as React from 'react';
import { cx } from './cx';

/**
 * Badge: a short state word («Activo», «Pendiente»). The word carries the meaning, the colour only helps.
 * In the new look a dot comes before the word unless `plain`. `Count`: a small round number (unread
 * notifications, materials); give it a `label` when the number alone says too little.
 */

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'accent';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-gray-100 text-gray-800 nuevo:bg-gray-100 nuevo:text-gray-600',
  success: 'bg-green-100 text-green-800 nuevo:bg-green-100 nuevo:text-green-600',
  warning: 'bg-yellow-100 text-yellow-800 nuevo:bg-amber-100 nuevo:text-amber-700',
  error: 'bg-red-100 text-red-800 nuevo:bg-red-100 nuevo:text-red-600',
  info: 'bg-blue-100 text-blue-800 nuevo:bg-blue-50 nuevo:text-brand_gray_dark',
  accent: 'bg-brand_accent/20 text-brand_primary nuevo:bg-brand_accent nuevo:text-brand_primary',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** No dot before the word. */
  plain?: boolean;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = 'neutral', plain = false, className, children, ...rest },
  ref
) {
  return (
    <span
      ref={ref}
      data-tone={tone}
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        'nuevo:gap-[0.5em] nuevo:rounded-sm nuevo:px-[0.8em] nuevo:py-[0.5em] nuevo:font-mont nuevo:text-[0.625rem] nuevo:font-bold nuevo:uppercase nuevo:leading-none nuevo:tracking-[0.12em]',
        TONE[tone],
        className
      )}
      {...rest}
    >
      {!plain && <span aria-hidden="true" className="hidden h-1.5 w-1.5 flex-none rounded-full bg-current nuevo:inline-block" />}
      {children}
    </span>
  );
});

export interface CountProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  value: number;
  /** What the number counts, for screen readers («3 materiales»). Replaces the bare number for them. */
  label?: string;
}

export const Count = React.forwardRef<HTMLSpanElement, CountProps>(function Count({ value, label, className, ...rest }, ref) {
  return (
    <span
      ref={ref}
      className={cx(
        'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand_accent px-1.5 text-xs font-medium leading-none text-brand_primary',
        'nuevo:min-w-[20px] nuevo:px-[6px] nuevo:font-mont nuevo:text-[0.6875rem] nuevo:font-extrabold',
        className
      )}
      {...rest}
    >
      {label ? (
        <>
          <span aria-hidden="true">{value}</span>
          <span className="sr-only">{label}</span>
        </>
      ) : (
        value
      )}
    </span>
  );
});
