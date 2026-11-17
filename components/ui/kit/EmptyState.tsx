import * as React from 'react';
import { Inbox } from 'lucide-react';
import { cx } from './cx';

/**
 * EmptyState: what a list or panel shows when it has nothing: an icon (or figure), a title, one sentence
 * and, if there is something to do about it, one action.
 */

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  /** One sentence. */
  description?: React.ReactNode;
  /** An icon or figure in place of the default tray. Decorative. */
  icon?: React.ReactNode;
  /** One action (a `Button`). */
  action?: React.ReactNode;
  /** The title's heading level; default 3. */
  headingLevel?: 2 | 3 | 4;
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { title, description, icon, action, headingLevel = 3, className, ...rest },
  ref
) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  return (
    <div
      ref={ref}
      className={cx(
        'flex flex-col items-center px-4 py-12 text-center',
        'nuevo:gap-[10px] nuevo:px-5 nuevo:py-10',
        className
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className="text-gray-400 [&>svg]:h-12 [&>svg]:w-12 nuevo:text-brand_primary/[0.16] nuevo:[&>svg]:h-[72px] nuevo:[&>svg]:w-[72px]"
      >
        {icon ?? <Inbox strokeWidth={1.25} />}
      </span>
      <Heading
        className={cx(
          'mt-2 text-sm font-medium text-gray-900',
          'nuevo:mt-0 nuevo:font-mont nuevo:text-[0.8125rem] nuevo:font-bold nuevo:uppercase nuevo:leading-[1.5] nuevo:tracking-[0.1em] nuevo:text-brand_primary'
        )}
      >
        {title}
      </Heading>
      {description && (
        <p className="mt-1 max-w-md text-sm text-gray-500 nuevo:mt-0 nuevo:max-w-[44ch] nuevo:text-[0.8125rem] nuevo:text-gray-600">{description}</p>
      )}
      {action && <div className="mt-6 nuevo:mt-1">{action}</div>}
    </div>
  );
});
