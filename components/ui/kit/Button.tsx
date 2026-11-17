import * as React from 'react';
import Link from 'next/link';
import { cx } from './cx';
import { SpinnerMark } from './Loading';

/**
 * Button. Today's look: the platform's commonest hand-made buttons (rounded-lg, text-sm, medium weight).
 * New look: a pill in Mont capitals (DESIGN.md section 4). `primary` is the ONE main action of a screen.
 *
 * With `href` it renders a link (Next's `Link` for an address inside the platform, a plain `<a>` for any
 * other), looking the same. `type="button"` by default. `iconOnly` needs an `aria-label` (a type error
 * without one) and gets it as its `title` too, unless a `title` is given. `loading` keeps the label for screen readers, sets `aria-busy` and ignores clicks, but
 * keeps the focus (the button is not disabled).
 */

export type ButtonVariant = 'primary' | 'default' | 'outline' | 'quiet' | 'danger' | 'danger-outline' | 'confirm';
export type ButtonSize = 'md' | 'sm';

const BASE = cx(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium no-underline',
  'transition-colors motion-reduce:transition-none',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
  'nuevo:rounded-full nuevo:border nuevo:font-mont nuevo:uppercase nuevo:leading-[1.2] nuevo:tracking-[0.14em] nuevo:duration-150',
  'nuevo:gap-[0.7em] nuevo:[&_svg]:h-4 nuevo:[&_svg]:w-4 nuevo:[&_svg]:flex-none aria-busy:cursor-progress'
);

const VARIANT: Record<ButtonVariant, string> = {
  primary: cx(
    'bg-brand_accent text-brand_primary hover:bg-brand_accent_hover',
    'nuevo:border-transparent nuevo:bg-[linear-gradient(100deg,#fbbf24_30%,#f59e0b)] nuevo:font-extrabold',
    'nuevo:hover:bg-brand_accent nuevo:hover:bg-none'
  ),
  default: cx('bg-brand_primary text-white hover:bg-brand_gray_dark', 'nuevo:border-transparent nuevo:font-bold'),
  outline: cx(
    'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
    'nuevo:border-brand_primary/50 nuevo:bg-transparent nuevo:font-bold nuevo:text-brand_primary',
    'nuevo:hover:border-brand_primary nuevo:hover:bg-brand_primary/[0.07]'
  ),
  quiet: cx(
    'bg-transparent text-gray-700 hover:bg-gray-100',
    'nuevo:border-transparent nuevo:font-bold nuevo:text-brand_primary nuevo:hover:bg-brand_primary/[0.07]'
  ),
  danger: cx('bg-red-600 text-white hover:bg-red-700', 'nuevo:border-transparent nuevo:font-bold'),
  // Under the pointer the text darkens: red 600 on red 50 measures 4.42:1, red 700 passes.
  'danger-outline': cx(
    'border border-red-300 bg-white text-red-600 hover:bg-red-50 hover:text-red-700',
    'nuevo:border-red-600/55 nuevo:bg-transparent nuevo:font-bold nuevo:text-red-600 nuevo:hover:bg-red-100'
  ),
  // The answer «yes» of a confirmation: black with white text in today's look (as the platform's own
  // confirmation window), the yellow main action in the new look (as the approved sample sheet).
  confirm: cx(
    'bg-brand_primary text-white hover:bg-brand_gray_dark',
    'nuevo:border-transparent nuevo:bg-brand_accent nuevo:bg-[linear-gradient(100deg,#fbbf24_30%,#f59e0b)] nuevo:font-extrabold nuevo:text-brand_primary',
    'nuevo:hover:bg-brand_accent nuevo:hover:bg-none'
  ),
};

// Padding and type size by size; the quiet button has less side padding in the new look.
const SIZE: Record<ButtonSize, { all: string; sides: string; quietSides: string }> = {
  md: {
    all: 'py-2 nuevo:min-h-[40px] nuevo:py-[0.6em] nuevo:text-[0.6875rem]',
    sides: 'px-4 nuevo:px-[1.5em]',
    quietSides: 'px-4 nuevo:px-[0.9em]',
  },
  sm: {
    all: 'py-1.5 nuevo:min-h-[32px] nuevo:py-[0.45em] nuevo:text-[0.625rem]',
    sides: 'px-3 nuevo:px-[1.1em]',
    quietSides: 'px-3 nuevo:px-[0.9em]',
  },
};

const ICON_ONLY = 'h-9 w-9 p-0 nuevo:h-9 nuevo:min-h-[36px] nuevo:w-9 nuevo:p-0';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets `aria-busy`, ignores clicks. The label stays (for screen readers too). */
  loading?: boolean;
  className?: string;
  children?: React.ReactNode;
}

type NativeButton = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children' | 'className'>;
type NativeAnchor = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'aria-label' | 'children' | 'className' | 'href'>;

type AsButton = CommonProps & NativeButton & { href?: undefined };
type AsLink = CommonProps &
  NativeAnchor & {
    /** Renders a link. An address starting with `/` goes through Next's `Link`. */
    href: string;
    /** A disabled link is drawn disabled and goes nowhere. */
    disabled?: boolean;
  };

/** Round, 36 px, no visible words: the name must be given. */
type IconOnly = { iconOnly: true; 'aria-label': string };
type WithLabel = { iconOnly?: false; 'aria-label'?: string };

export type ButtonProps = (AsButton | AsLink) & (IconOnly | WithLabel);

export function buttonClasses({
  variant = 'default',
  size = 'md',
  iconOnly = false,
}: { variant?: ButtonVariant; size?: ButtonSize; iconOnly?: boolean } = {}): string {
  const s = SIZE[size];
  return cx(BASE, VARIANT[variant], iconOnly ? ICON_ONLY : cx(s.all, variant === 'quiet' ? s.quietSides : s.sides));
}

export const Button = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(function Button(props, ref) {
  const { variant = 'default', size = 'md', loading = false, iconOnly = false, className, children, ...given } = props;
  // An icon-only button shows its name to the pointer too: the browser's own tooltip, from a `title`
  // equal to the `aria-label`, unless the caller gave a `title` of their own.
  const rest =
    iconOnly && given.title === undefined ? { ...given, title: (given as { 'aria-label'?: string })['aria-label'] } : given;
  const classes = cx(buttonClasses({ variant, size, iconOnly }), className);
  const content = (
    <>
      {loading && <SpinnerMark size="sm" />}
      {children}
    </>
  );

  if (typeof rest.href === 'string') {
    const { href, disabled, onClick, ...anchor } = rest as Omit<AsLink, keyof CommonProps> & { 'aria-label'?: string };
    const inert = Boolean(disabled || loading);
    if (inert) {
      // No address: a disabled link goes nowhere and leaves the tab order.
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          {...anchor}
          role="link"
          aria-disabled="true"
          aria-busy={loading || undefined}
          className={classes}
        >
          {content}
        </a>
      );
    }
    if (href.startsWith('/')) {
      return (
        <Link ref={ref as React.Ref<HTMLAnchorElement>} href={href} onClick={onClick} {...anchor} className={classes}>
          {content}
        </Link>
      );
    }
    return (
      <a ref={ref as React.Ref<HTMLAnchorElement>} href={href} onClick={onClick} {...anchor} className={classes}>
        {content}
      </a>
    );
  }

  const { type = 'button', onClick, ...button } = rest as Omit<AsButton, keyof CommonProps> & { 'aria-label'?: string };
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type={type}
      {...button}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (loading) {
          // Not clickable while it works; also keeps a submit button from sending its form again.
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={classes}
    >
      {content}
    </button>
  );
});
