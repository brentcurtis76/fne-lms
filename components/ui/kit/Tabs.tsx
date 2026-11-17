import * as React from 'react';
import Link from 'next/link';
import { cx } from './cx';

/**
 * Tabs: `Tabs` holds the choice (controlled with `value` + `onValueChange`, or uncontrolled with
 * `defaultValue`), `TabList` the row of `Tab`s (`role="tablist"`/`"tab"`), `TabPanel` the content of
 * each (`role="tabpanel"`, named by its tab). Keyboard: Left/Right move to the previous/next tab and
 * select it, Home/End to the first/last; only the selected tab is in the tab order. The row scrolls
 * sideways when it does not fit.
 *
 * `TabLinks`: the same row for tabs that are addresses (each a link; the current one `aria-current="page"`).
 */

interface TabsState {
  baseId: string;
  value: string;
  select: (value: string) => void;
}

const TabsContext = React.createContext<TabsState | null>(null);

function useTabs(part: string): TabsState {
  const state = React.useContext(TabsContext);
  if (!state) throw new Error(`${part} must be inside <Tabs>`);
  return state;
}

const safe = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '_');
const tabId = (base: string, value: string) => `${base}-tab-${safe(value)}`;
const panelId = (base: string, value: string) => `${base}-panel-${safe(value)}`;

export interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

export function Tabs({ value, defaultValue = '', onValueChange, children, ...rest }: TabsProps) {
  const baseId = React.useId();
  const [own, setOwn] = React.useState(defaultValue);
  const current = value ?? own;
  const select = React.useCallback(
    (next: string) => {
      if (value === undefined) setOwn(next);
      onValueChange?.(next);
    },
    [value, onValueChange]
  );
  return (
    <TabsContext.Provider value={{ baseId, value: current, select }}>
      <div {...rest}>{children}</div>
    </TabsContext.Provider>
  );
}

const ROW = cx(
  'flex space-x-8 overflow-x-auto border-b border-gray-200',
  'nuevo:gap-1 nuevo:space-x-0 nuevo:border-brand_primary/[0.24]'
);

const TAB = cx(
  '-mb-px inline-flex flex-none items-center gap-2 whitespace-nowrap border-b-2 px-1 py-2 text-sm font-medium no-underline',
  'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand_accent motion-reduce:transition-none',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'nuevo:gap-[0.6em] nuevo:border-b-[3px] nuevo:px-[14px] nuevo:py-3 nuevo:font-mont nuevo:text-[0.6875rem] nuevo:font-bold nuevo:uppercase nuevo:tracking-[0.14em]',
  'nuevo:focus-visible:[outline-offset:-3px]'
);
const TAB_ON = 'border-brand_accent text-brand_primary nuevo:border-brand_accent nuevo:text-brand_primary';
const TAB_OFF = cx(
  'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
  'nuevo:text-gray-600 nuevo:hover:border-transparent nuevo:hover:text-brand_primary'
);

export interface TabListProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Names the row for screen readers (required). */
  label: string;
}

export function TabList({ label, className, children, onKeyDown, ...rest }: TabListProps) {
  const rowRef = React.useRef<HTMLDivElement>(null);
  return (
    <div
      ref={rowRef}
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className={cx(ROW, className)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        const tabs = Array.from(rowRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])') ?? []);
        const at = tabs.indexOf(document.activeElement as HTMLButtonElement);
        if (at < 0 || tabs.length === 0) return;
        const to =
          event.key === 'ArrowRight'
            ? (at + 1) % tabs.length
            : event.key === 'ArrowLeft'
              ? (at - 1 + tabs.length) % tabs.length
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? tabs.length - 1
                  : -1;
        if (to < 0) return;
        event.preventDefault();
        tabs[to].focus();
        tabs[to].click();
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface TabProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  value: string;
}

export const Tab = React.forwardRef<HTMLButtonElement, TabProps>(function Tab({ value, className, onClick, ...rest }, ref) {
  const { baseId, value: current, select } = useTabs('Tab');
  const selected = current === value;
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={tabId(baseId, value)}
      aria-selected={selected}
      aria-controls={panelId(baseId, value)}
      tabIndex={selected ? 0 : -1}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) select(value);
      }}
      className={cx(TAB, selected ? TAB_ON : TAB_OFF, className)}
      {...rest}
    />
  );
});

export interface TabPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

/** Only the selected tab's panel is drawn. */
export function TabPanel({ value, className, ...rest }: TabPanelProps) {
  const { baseId, value: current } = useTabs('TabPanel');
  if (current !== value) return null;
  return (
    <div
      role="tabpanel"
      id={panelId(baseId, value)}
      aria-labelledby={tabId(baseId, value)}
      tabIndex={0}
      className={cx('focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent', className)}
      {...rest}
    />
  );
}

export interface TabLinkItem {
  href: string;
  label: React.ReactNode;
  current?: boolean;
  'data-testid'?: string;
}

export interface TabLinksProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children'> {
  /** Names the row for screen readers (required). */
  label: string;
  items: TabLinkItem[];
}

/** Tabs that are addresses: a `<nav>` of links; the current one carries `aria-current="page"`. */
export function TabLinks({ label, items, className, ...rest }: TabLinksProps) {
  return (
    <nav aria-label={label} className={cx(ROW, className)} {...rest}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.current ? 'page' : undefined}
          data-testid={item['data-testid']}
          className={cx(TAB, item.current ? TAB_ON : TAB_OFF)}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
