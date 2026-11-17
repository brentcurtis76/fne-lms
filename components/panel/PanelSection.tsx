import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/kit';

/**
 * A section of the new «Mi Panel» (redesign 6B): its icon, its `<h2>` title, an optional line under
 * it, at the right its link or action, and for a ROW its cards side by side with the two arrows.
 *
 * The arrows show whenever the row holds more than fits (not only under the pointer), each disabled
 * when there is nothing more on its side, each moving the row by 80% of its visible width (as today's
 * course row). The row also scrolls by touch, with snapping. The measure is taken again on scroll,
 * on a resize of the window or of the row, and when the cards change (`itemsKey`).
 */

/** The width of a card in a row (about 268 px; 248 px under 1,024 px, as the mock-up). */
export const ROW_ITEM = 'flex-none w-[248px] lg:w-[268px] snap-start';

const H2 = 'font-mont text-[1.0625rem] font-extrabold uppercase leading-[1.4] tracking-[0.06em] text-brand_primary';

interface PanelSectionProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  sub?: React.ReactNode;
  /** Its link or its action, at the right of the title. */
  action?: React.ReactNode;
  /** The cards sit in a row that scrolls sideways, with the arrows. */
  row?: boolean;
  /** Changes when the row's cards change: the arrows are measured again. */
  itemsKey?: string;
  'data-testid'?: string;
  children?: React.ReactNode;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

export function PanelSection({ title, icon, sub, action, row = false, itemsKey, children, ...rest }: PanelSectionProps) {
  const testId = rest['data-testid'];
  const rowRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ any: false, left: false, right: false });

  const measure = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    const any = el.scrollWidth > el.clientWidth + 1;
    const next = {
      any,
      left: any && el.scrollLeft > 4,
      right: any && el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    };
    setMore((now) => (now.any === next.any && now.left === next.left && now.right === next.right ? now : next));
  }, []);

  const count = React.Children.count(children);
  useEffect(() => {
    if (!row) return undefined;
    measure();
    window.addEventListener('resize', measure);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && rowRef.current) {
      observer = new ResizeObserver(() => measure());
      observer.observe(rowRef.current);
    }
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [row, measure, count, itemsKey]);

  const move = (direction: -1 | 1) => {
    const el = rowRef.current;
    if (!el) return;
    const left = direction * el.clientWidth * 0.8;
    if (typeof el.scrollBy === 'function') {
      el.scrollBy({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    } else {
      el.scrollLeft += left;
    }
  };

  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3" data-testid={testId}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && (
              <span aria-hidden="true" className="flex-none text-brand_accent_text [&>svg]:h-[18px] [&>svg]:w-[18px]">
                {icon}
              </span>
            )}
            <h2 className={H2}>{title}</h2>
          </div>
          {sub && <p className="text-[0.8125rem] text-gray-600">{sub}</p>}
        </div>
        {(action || (row && more.any)) && (
          <div className="flex items-center gap-2.5">
            {action}
            {row && more.any && (
              <span className="inline-flex gap-1">
                <Button
                  variant="outline"
                  iconOnly
                  aria-label="Desplazar izquierda"
                  disabled={!more.left}
                  onClick={() => move(-1)}
                  data-testid={testId ? `${testId}-left` : undefined}
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <Button
                  variant="outline"
                  iconOnly
                  aria-label="Desplazar derecha"
                  disabled={!more.right}
                  onClick={() => move(1)}
                  data-testid={testId ? `${testId}-right` : undefined}
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </span>
            )}
          </div>
        )}
      </div>
      {row ? (
        <div
          ref={rowRef}
          onScroll={measure}
          className="-m-0.5 flex snap-x snap-proximity items-start gap-[14px] overflow-x-auto p-0.5 pb-1.5 scrollbar-hide"
          data-testid={testId ? `${testId}-row` : undefined}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export default PanelSection;
