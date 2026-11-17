import * as React from 'react';
import { Button } from './Button';
import { cx } from './cx';
import { EYEBROW } from './Dialog';
import { SearchInput } from './Field';

/**
 * PageHeader: the head of a screen. An eyebrow, the title (the page's `h1`), one line of description,
 * the actions on the right (under the title on a phone), and anything that belongs under it (filters, a
 * search) as children. The successor of `components/layout/FunctionalPageHeader.tsx`: it also takes that
 * header's icon, left addon, search box and primary action (the README says how the props map).
 */

export interface PageHeaderAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  'data-testid'?: string;
}

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  /** One line under the title (FunctionalPageHeader's `subtitle`). */
  description?: React.ReactNode;
  /** Drawn before the title (FunctionalPageHeader's `icon`). Decorative. */
  icon?: React.ReactNode;
  /** Drawn before the icon (FunctionalPageHeader's `leftAddon`: a back button, for example). */
  leftAddon?: React.ReactNode;
  /** Buttons on the right, in reading order (FunctionalPageHeader's `children`). */
  actions?: React.ReactNode;
  /** The ONE main action, drawn last on the right as the yellow button. */
  primaryAction?: PageHeaderAction;
  /** A second action, drawn before the main one as an outline button. */
  secondaryAction?: PageHeaderAction;
  /** A search box among the actions: shown when `onSearchChange` is given. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** Default «Buscar...», as today. */
  searchPlaceholder?: string;
  /** The search box's name for screen readers. Default «Buscar». */
  searchLabel?: string;
  /** Under the title row: filters, tabs. */
  children?: React.ReactNode;
}

export const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(function PageHeader(
  {
    title,
    eyebrow,
    description,
    icon,
    leftAddon,
    actions,
    primaryAction,
    secondaryAction,
    searchValue,
    onSearchChange,
    searchPlaceholder = 'Buscar...',
    searchLabel = 'Buscar',
    children,
    className,
    ...rest
  },
  ref
) {
  const hasActions = Boolean(actions || primaryAction || secondaryAction || onSearchChange);
  return (
    <header
      ref={ref}
      className={cx(
        'border-b border-gray-200 bg-white px-4 py-4 sm:px-6 lg:px-8',
        'nuevo:border-b-0 nuevo:bg-transparent nuevo:px-0 nuevo:pb-0 nuevo:pt-0',
        className
      )}
      {...rest}
    >
      {eyebrow && <p className={cx(EYEBROW, 'mb-1 nuevo:mb-0')}>{eyebrow}</p>}
      <div
        className={cx(
          'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between nuevo:gap-4 nuevo:sm:items-end',
          eyebrow && 'nuevo:mt-2'
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          {leftAddon}
          {icon && (
            <span aria-hidden="true" className="flex-none text-2xl text-brand_primary">
              {icon}
            </span>
          )}
          <div className="grid min-w-0 gap-1">
            <h1 className="text-xl font-semibold text-gray-900 nuevo:text-[1.625rem] nuevo:font-extrabold nuevo:text-brand_primary">{title}</h1>
            {description && <p className="text-sm text-gray-600 nuevo:text-[0.8125rem]">{description}</p>}
          </div>
        </div>
        {hasActions && (
          <div className="flex flex-wrap items-center gap-3 nuevo:gap-[10px]">
            {onSearchChange && (
              <SearchInput
                value={searchValue ?? ''}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchLabel}
                className="sm:w-64"
              />
            )}
            {actions}
            {secondaryAction && (
              <Button variant="outline" onClick={secondaryAction.onClick} data-testid={secondaryAction['data-testid']}>
                {secondaryAction.icon}
                {secondaryAction.label}
              </Button>
            )}
            {primaryAction && (
              <Button variant="primary" onClick={primaryAction.onClick} data-testid={primaryAction['data-testid']}>
                {primaryAction.icon}
                {primaryAction.label}
              </Button>
            )}
          </div>
        )}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
});
