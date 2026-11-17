import * as React from 'react';
import { cx } from './cx';

/**
 * Loading pieces. `Skeleton`: a grey block that holds the place of what is coming (hidden from screen
 * readers). `Spinner`: a turning ring that says «Cargando…» to screen readers (or shows its label).
 * `LoadingBlock`: a centred spinner with words, for a panel that has nothing else to draw yet.
 * Motion stops under `prefers-reduced-motion`.
 */

export type SpinnerSize = 'sm' | 'md' | 'lg';

const MARK_SIZE: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

/** The ring alone, hidden from screen readers. Used inside other pieces (a loading button). */
export function SpinnerMark({ size = 'sm', className }: { size?: SpinnerSize; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-kit="spinner-mark"
      className={cx(
        'inline-block flex-none animate-spin rounded-full border-b-2 border-current motion-reduce:animate-none',
        'nuevo:border-2 nuevo:border-current nuevo:border-r-transparent',
        MARK_SIZE[size],
        className
      )}
    />
  );
}

export interface SpinnerProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  size?: SpinnerSize;
  /** Shown next to the ring. Without it the ring says «Cargando…» to screen readers only. */
  label?: React.ReactNode;
}

export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { size = 'md', label, className, ...rest },
  ref
) {
  return (
    <span
      ref={ref}
      role="status"
      className={cx('inline-flex items-center gap-2 text-brand_primary', className)}
      {...rest}
    >
      <SpinnerMark size={size} />
      {label ? <span className="text-sm text-gray-600 nuevo:text-[0.8125rem]">{label}</span> : <span className="sr-only">Cargando…</span>}
    </span>
  );
});

export interface SkeletonProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Width and height as CSS lengths (`'60%'`, `14`). Classes work too. */
  width?: number | string;
  height?: number | string;
}

export const Skeleton = React.forwardRef<HTMLSpanElement, SkeletonProps>(function Skeleton(
  { width, height, className, style, ...rest },
  ref
) {
  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-kit="skeleton"
      className={cx(
        'block animate-pulse rounded bg-gray-200 motion-reduce:animate-none',
        'nuevo:rounded-sm nuevo:bg-brand_primary/10',
        className
      )}
      style={{ width, height: height ?? 12, ...style }}
      {...rest}
    />
  );
});

export interface LoadingBlockProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The words under the ring. Default «Cargando…». */
  label?: React.ReactNode;
}

export const LoadingBlock = React.forwardRef<HTMLDivElement, LoadingBlockProps>(function LoadingBlock(
  { label = 'Cargando…', className, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      role="status"
      className={cx(
        'flex flex-col items-center justify-center gap-3 px-4 py-12 text-center text-sm text-gray-500',
        'nuevo:gap-[14px] nuevo:px-5 nuevo:py-10 nuevo:text-[0.8125rem] nuevo:text-gray-600',
        className
      )}
      {...rest}
    >
      <SpinnerMark size="lg" className="text-brand_primary" />
      <span>{label}</span>
    </div>
  );
});
