import * as React from 'react';
import Link from 'next/link';
import { cx } from './cx';

/**
 * Card: a white panel with `CardHeader`, `CardBody`, `CardFooter` (and `CardTitle` for its heading).
 * `interactive` makes the whole card ONE link (`href`) or button (`onClick`), with hover and focus
 * styles; keep other links and buttons out of an interactive card. `leading` marks the one card of a
 * screen that leads (a yellow top edge in the new look; nothing changes in today's look).
 *
 * Today's look: the platform's commonest card (white, rounded-lg, shadow-md). New look: a hairline
 * border and no resting shadow (DESIGN.md: "cards rest on a hairline border"). The shadow is set off with
 * `box-shadow` itself, because the new look's own rule for `shadow-md` sets the shadow's variable more
 * specifically than any class could undo.
 */

const CARD = cx(
  'block min-w-0 rounded-lg bg-white text-left shadow-md',
  'nuevo:border nuevo:border-brand_primary/[0.12] nuevo:[box-shadow:none]'
);
const INTERACTIVE = cx(
  'w-full cursor-pointer no-underline transition-shadow hover:shadow-lg motion-reduce:transition-none',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent focus-visible:ring-offset-2',
  'nuevo:transition-[box-shadow,border-color] nuevo:duration-150 nuevo:hover:border-brand_primary/[0.24]',
  'nuevo:hover:[box-shadow:0_1px_2px_rgb(10_10_10/0.06),0_10px_24px_-14px_rgb(10_10_10/0.3)]'
);
const LEADING = 'nuevo:border-t-[3px] nuevo:border-t-brand_accent';

interface CardOwnProps {
  leading?: boolean;
  className?: string;
  children?: React.ReactNode;
  'data-testid'?: string;
}

type StaticCard = CardOwnProps & Omit<React.HTMLAttributes<HTMLDivElement>, 'className' | 'children'> & { interactive?: false };
type LinkCard = CardOwnProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children' | 'href'> & { interactive: true; href: string };
type ButtonCard = CardOwnProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & { interactive: true; href?: undefined };

export type CardProps = StaticCard | LinkCard | ButtonCard;

export const Card = React.forwardRef<HTMLElement, CardProps>(function Card(props, ref) {
  const { leading = false, className, children, ...rest } = props;
  if (!rest.interactive) {
    const { interactive: _static, ...div } = rest as StaticCard;
    void _static;
    return (
      <div ref={ref as React.Ref<HTMLDivElement>} {...div} className={cx(CARD, leading && LEADING, className)}>
        {children}
      </div>
    );
  }
  const classes = cx(CARD, INTERACTIVE, leading && LEADING, className);
  if (typeof rest.href === 'string') {
    const { interactive: _link, href, ...anchor } = rest as LinkCard;
    void _link;
    return (
      <Link ref={ref as React.Ref<HTMLAnchorElement>} href={href} {...anchor} className={classes}>
        {children}
      </Link>
    );
  }
  const { interactive: _button, type = 'button', ...button } = rest as ButtonCard;
  void _button;
  return (
    <button ref={ref as React.Ref<HTMLButtonElement>} type={type} {...button} className={classes}>
      {children}
    </button>
  );
});

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function CardHeader({ className, ...rest }: DivProps) {
  return (
    <div
      className={cx(
        'flex items-center justify-between gap-3 border-b border-gray-200 px-6 py-4',
        'nuevo:border-brand_primary/[0.12] nuevo:px-[18px] nuevo:py-[14px]',
        className
      )}
      {...rest}
    />
  );
}

export function CardBody({ className, ...rest }: DivProps) {
  return <div className={cx('p-6 nuevo:p-[18px]', className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: DivProps) {
  return (
    <div
      className={cx(
        'flex flex-wrap justify-end gap-3 border-t border-gray-200 px-6 py-4',
        'nuevo:gap-[10px] nuevo:border-brand_primary/[0.12] nuevo:px-[18px] nuevo:py-3',
        className
      )}
      {...rest}
    />
  );
}

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /** The heading level; default 3. `p` inside a button card (a button may not hold a heading). */
  as?: 'h2' | 'h3' | 'h4' | 'p';
}

export function CardTitle({ as: Tag = 'h3', className, ...rest }: CardTitleProps) {
  return (
    <Tag
      className={cx(
        'text-lg font-semibold text-gray-900',
        'nuevo:font-mont nuevo:text-[0.8125rem] nuevo:font-bold nuevo:uppercase nuevo:leading-[1.5] nuevo:tracking-[0.1em] nuevo:text-brand_primary',
        className
      )}
      {...rest}
    />
  );
}
