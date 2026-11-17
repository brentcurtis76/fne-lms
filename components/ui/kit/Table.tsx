import * as React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Button } from './Button';
import { cx } from './cx';

/**
 * Table: real `<table>` markup in composable parts. A header cell can sort (`sort` + `onSort`, with
 * `aria-sort`); a row can be selected (`selected`, drawn as `aria-selected`). With `stackOnPhone`, under
 * 760 px each row becomes a small card and each cell shows its column's name from its `label` prop
 * (a cell with `primary` is the card's title and shows no name). `Pagination` goes under the table.
 *
 * Every part carries its role explicitly (`table`, `rowgroup`, `row`, `columnheader`/`rowheader`, `cell`):
 * the phone's cards make them block and flex boxes, and some browsers then stop telling screen readers
 * that they are a table. The column's name in a card is real text inside the cell, not generated
 * content; it is not displayed at desktop width (so it is not read there either: the column header
 * names the cell), and on a phone it is what is drawn and read.
 */

const StackContext = React.createContext(false);

// Every class below is written out in full: Tailwind finds class names by reading the source text, so a
// name assembled from parts would never be generated. "Phone" here is 760 px and narrower (the mock-up's).

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  /** Under 760 px each row becomes a card (cells need a `label`). */
  stackOnPhone?: boolean;
  /** Classes for the box around the table. */
  boxClassName?: string;
  /** Anything that belongs to the box under the table: a `Pagination`. */
  footer?: React.ReactNode;
}

export const Table = React.forwardRef<HTMLTableElement, TableProps>(function Table(
  { stackOnPhone = false, boxClassName, footer, className, children, ...rest },
  ref
) {
  return (
    <StackContext.Provider value={stackOnPhone}>
      <div
        className={cx(
          'overflow-hidden rounded-lg bg-white shadow',
          'nuevo:border nuevo:border-brand_primary/[0.12] nuevo:[box-shadow:none]',
          boxClassName
        )}
      >
        <div className="overflow-x-auto">
          <table
            ref={ref}
            role="table"
            className={cx(
              'min-w-full divide-y divide-gray-200',
              'nuevo:w-full nuevo:border-collapse nuevo:divide-y-0 nuevo:text-[0.8125rem]',
              stackOnPhone && 'max-[760px]:block',
              className
            )}
            {...rest}
          >
            {children}
          </table>
        </div>
        {footer}
      </div>
    </StackContext.Provider>
  );
});

export const TableHead = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(function TableHead(
  { className, ...rest },
  ref
) {
  const stack = React.useContext(StackContext);
  return <thead ref={ref} role="rowgroup" className={cx('bg-gray-50 nuevo:bg-gray-100', stack && 'max-[760px]:sr-only', className)} {...rest} />;
});

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(function TableBody(
  { className, ...rest },
  ref
) {
  const stack = React.useContext(StackContext);
  return (
    <tbody
      ref={ref}
      role="rowgroup"
      className={cx('divide-y divide-gray-200 bg-white', 'nuevo:divide-y-0', stack && 'max-[760px]:block max-[760px]:w-full', className)}
      {...rest}
    />
  );
});

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  /** Drawn as a selected row; sets `aria-selected`. */
  selected?: boolean;
}

export const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(function TableRow({ selected, className, ...rest }, ref) {
  const stack = React.useContext(StackContext);
  return (
    <tr
      ref={ref}
      role="row"
      aria-selected={selected}
      className={cx(
        'transition-colors hover:bg-gray-50 motion-reduce:transition-none',
        selected && 'bg-gray-100 nuevo:bg-brand_primary/5',
        stack &&
          cx(
            'max-[760px]:block max-[760px]:w-full max-[760px]:px-[14px] max-[760px]:py-3',
            'nuevo:max-[760px]:border-t nuevo:max-[760px]:border-brand_primary/[0.12] nuevo:max-[760px]:first:border-t-0'
          ),
        className
      )}
      {...rest}
    />
  );
});

export type SortDirection = 'ascending' | 'descending' | 'none';

export interface TableHeaderCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /** The current order of this column. Only with `onSort`. */
  sort?: SortDirection;
  /** Makes the header a button that asks for another order. */
  onSort?: () => void;
  align?: 'left' | 'right';
}

const HEAD_TEXT = cx(
  'px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500',
  'nuevo:whitespace-nowrap nuevo:px-[14px] nuevo:py-[10px] nuevo:font-mont nuevo:text-[0.625rem] nuevo:font-bold nuevo:tracking-[0.14em] nuevo:text-gray-600'
);

export const TableHeaderCell = React.forwardRef<HTMLTableCellElement, TableHeaderCellProps>(function TableHeaderCell(
  { sort, onSort, align = 'left', className, children, scope = 'col', ...rest },
  ref
) {
  const sortable = Boolean(onSort);
  const Icon = sort === 'ascending' ? ArrowUp : sort === 'descending' ? ArrowDown : ArrowUpDown;
  return (
    <th
      ref={ref}
      role={scope === 'row' || scope === 'rowgroup' ? 'rowheader' : 'columnheader'}
      scope={scope}
      aria-sort={sortable ? sort ?? 'none' : undefined}
      className={cx(HEAD_TEXT, align === 'right' ? 'text-right' : 'text-left', className)}
      {...rest}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cx(
            'inline-flex items-center gap-1 uppercase tracking-wider hover:text-gray-700',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent',
            'nuevo:gap-[0.5em] nuevo:tracking-[0.14em] nuevo:hover:text-brand_primary'
          )}
        >
          {children}
          <Icon aria-hidden="true" className="h-3 w-3 flex-none" />
        </button>
      ) : (
        children
      )}
    </th>
  );
});

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  /** The column's name, shown before the value when the row stacks on a phone. */
  label?: string;
  /** The row's title when it stacks: shown first, without a name. */
  primary?: boolean;
  align?: 'left' | 'right';
}

// The column's name in a phone card: not displayed (nor read) at desktop width, drawn and read on a phone.
// Gray 600 in both looks: on a selected row's grey, today's gray 500 would measure under 4.5:1.
const CELL_LABEL = cx(
  'hidden flex-none text-left text-xs font-medium uppercase tracking-wider text-gray-600 max-[760px]:inline',
  'nuevo:font-mont nuevo:text-[0.625rem] nuevo:font-bold nuevo:tracking-[0.14em]'
);

export const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(function TableCell(
  { label, primary = false, align = 'left', className, children, ...rest },
  ref
) {
  const stack = React.useContext(StackContext);
  const named = stack && !primary && Boolean(label);
  return (
    <td
      ref={ref}
      role="cell"
      data-label={label}
      className={cx(
        'whitespace-nowrap px-6 py-4 text-sm text-gray-900',
        'nuevo:whitespace-normal nuevo:border-t nuevo:border-brand_primary/[0.12] nuevo:px-[14px] nuevo:py-[10px] nuevo:align-middle nuevo:text-[0.8125rem] nuevo:text-brand_primary',
        align === 'right' && 'text-right',
        stack &&
          (primary
            ? cx(
                'max-[760px]:block max-[760px]:w-full max-[760px]:whitespace-normal max-[760px]:px-0 max-[760px]:pb-1.5 max-[760px]:pt-0',
                'nuevo:max-[760px]:border-0 nuevo:max-[760px]:px-0 nuevo:max-[760px]:pb-1.5 nuevo:max-[760px]:pt-0'
              )
            : cx(
                'max-[760px]:flex max-[760px]:w-full max-[760px]:items-center max-[760px]:justify-between max-[760px]:gap-[10px]',
                'max-[760px]:whitespace-normal max-[760px]:px-0 max-[760px]:py-[3px] max-[760px]:text-right',
                'nuevo:max-[760px]:border-0 nuevo:max-[760px]:px-0 nuevo:max-[760px]:py-[3px]'
              )),
        className
      )}
      {...rest}
    >
      {named && (
        <span data-kit="cell-label" className={CELL_LABEL}>
          {label}
        </span>
      )}
      {children}
    </td>
  );
});

export interface PaginationProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children'> {
  /** The page shown, from 1. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** The word after the total («usuarios»). */
  noun?: string;
  'data-testid'?: string;
}

export function Pagination({ page, pageSize, total, onPageChange, noun, className, 'data-testid': testId, ...rest }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  const shown = total === 0 ? `Mostrando 0 de 0` : `Mostrando ${from}–${to} de ${total}`;
  return (
    <nav
      aria-label="Paginación"
      data-testid={testId}
      className={cx(
        'flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-6 py-3 text-sm text-gray-700',
        'nuevo:border-brand_primary/[0.12] nuevo:px-[14px] nuevo:py-[10px] nuevo:text-[0.8125rem] nuevo:text-gray-600',
        className
      )}
      {...rest}
    >
      <span aria-live="polite" data-testid={testId ? `${testId}-range` : undefined}>
        {noun ? `${shown} ${noun}` : shown}
      </span>
      <span className="inline-flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={current <= 1}
          onClick={() => onPageChange(current - 1)}
          data-testid={testId ? `${testId}-previous` : undefined}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={current >= pages}
          onClick={() => onPageChange(current + 1)}
          data-testid={testId ? `${testId}-next` : undefined}
        >
          Siguiente
        </Button>
      </span>
    </nav>
  );
}
