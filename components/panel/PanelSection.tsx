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

/**
 * The props a text cut to its lines takes (the cut is CSS only; the DOM holds the whole text): its
 * whole text as `title`, the browser's own tooltip under the pointer. One pattern for every title the
 * new view cuts: spread it on the element, `{...fullTitle(text)}`. Nothing when there is no text.
 */
export const fullTitle = (text: string | null | undefined): { title?: string } => (text ? { title: text } : {});

/**
 * ONE rule for the title of every card of the new view written in the card-title style (the course
 * card, the upcoming card, the route card, the proposal card): Mont capitals, widely spaced; closed,
 * up to three lines before it is cut (with `fullTitle` beside it, so its whole text is its tooltip);
 * while the card's «Detalles» is open, written whole, with no cut at all. No line is reserved: the
 * cards of a row take the row's height and push their last row to their bottom instead.
 */
const CARD_TITLE_STYLE = 'font-mont text-[0.8125rem] font-bold uppercase leading-[1.5] tracking-[0.1em] text-brand_primary';
export const CARD_TITLE = `line-clamp-3 ${CARD_TITLE_STYLE}`;
export const CARD_TITLE_OPEN = CARD_TITLE_STYLE;
/** The title's classes for a card closed (the default) or opened. */
export const cardTitleClass = (open = false): string => (open ? CARD_TITLE_OPEN : CARD_TITLE);

/**
 * The keyboard ring drawn INSIDE an element (the look's ring sits 2 px outside it, 2 px wide): for an
 * element that fills a card which clips what overflows it (a bar, a row of a list), where the look's
 * ring would be cut away entirely. The `nuevo:` variant makes it one step more specific than the
 * look's own ring rule, so only the offset changes; the ring's colour and width stay the look's.
 */
export const INSET_RING = 'nuevo:focus-visible:[outline-offset:-4px]';

const H2 ='font-mont text-[1.0625rem] font-extrabold uppercase leading-[1.4] tracking-[0.06em] text-brand_primary';

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
  /**
   * When this value CHANGES from one given value to another (never on the first draw, nor when it is
   * first given after draws without it), the row goes back to its start, so that a card
   * just added in front is seen. The caller decides when it changes (for example, a counter of cards
   * added at the front).
   */
  startKey?: string | number;
  'data-testid'?: string;
  children?: React.ReactNode;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

export function PanelSection({ title, icon, sub, action, row = false, itemsKey, startKey, children, ...rest }: PanelSectionProps) {
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

  // Back to the start when `startKey` changes from one given value to another; the first value given
  // is only remembered (the same section may first be drawn without a key, as a loading state).
  const startSeen = useRef(startKey);
  useEffect(() => {
    if (startSeen.current === startKey) return;
    const first = startSeen.current === undefined || startKey === undefined;
    startSeen.current = startKey;
    if (first) return;
    const el = rowRef.current;
    if (!row || !el) return;
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ left: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    } else {
      el.scrollLeft = 0;
    }
  }, [row, startKey]);

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
        // The track keeps 4 px of room around its cards (taken back by a negative margin): the room the
        // look's keyboard ring takes outside an element, so the scrolling track does not cut it. The
        // browser does not anchor the track's scroll: a card added in front is not pushed out of view.
        // Its cards are stretched to the row's height (a card fills its slot), so the last rows of the
        // cards of one row line up whatever the length of their titles.
        <div
          ref={rowRef}
          onScroll={measure}
          className="-m-1 flex snap-x snap-proximity items-stretch gap-[14px] overflow-x-auto p-1 pb-2 scrollbar-hide [overflow-anchor:none]"
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
