import * as React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cx } from './cx';

/**
 * Dialog (a pop-up window), on `@radix-ui/react-dialog`: a veil over the page, the title that names the
 * window, an optional eyebrow and description, the body, a footer with its buttons on the right and a
 * close X («Cerrar»). Escape and a click on the veil close it unless `dismissable={false}` (then the X is
 * not drawn either). The focus stays inside while it is open and goes back to where it was; the page does
 * not scroll behind it. On a phone (under 560 px) the new look draws it as a sheet from the bottom whose
 * footer buttons share the width.
 *
 * Controlled: the caller keeps `open` and closes it in `onClose`.
 */

export type DialogSize = 'md' | 'wide';

export interface DialogProps {
  open: boolean;
  /** Called for Escape, the veil and the X. The caller sets `open` to false. */
  onClose: () => void;
  /** Names the window (required). */
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** The buttons, in reading order; drawn on the right. */
  footer?: React.ReactNode;
  size?: DialogSize;
  /** `false`: Escape and the veil do not close it, and there is no X. Default `true`. */
  dismissable?: boolean;
  /** The element that gets the focus on opening. Default: the first field or button of the body, then of the footer. */
  initialFocusRef?: React.RefObject<HTMLElement>;
  className?: string;
  'data-testid'?: string;
}

const FOCUSABLE = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

const VEIL = cx(
  'fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4',
  'nuevo:bg-brand_primary/[0.62]',
  'nuevo:max-[559px]:items-end nuevo:max-[559px]:p-0'
);

const BOX = cx(
  'relative flex max-h-[90vh] w-full flex-col rounded-lg bg-white shadow-xl focus:outline-none',
  'nuevo:max-h-[calc(100vh-32px)] nuevo:border-t-[3px] nuevo:border-brand_accent',
  'nuevo:max-[559px]:max-h-[92vh] nuevo:max-[559px]:max-w-none nuevo:max-[559px]:rounded-b-none'
);

const SIZE: Record<DialogSize, string> = {
  md: 'max-w-md nuevo:max-w-[520px]',
  wide: 'max-w-2xl nuevo:max-w-[760px]',
};

export const EYEBROW = cx(
  'text-xs font-medium uppercase tracking-wide text-gray-500',
  'nuevo:flex nuevo:items-center nuevo:gap-[0.9em] nuevo:font-mont nuevo:text-[0.6875rem] nuevo:leading-[1.6] nuevo:tracking-[0.26em] nuevo:text-gray-600',
  "nuevo:before:h-px nuevo:before:w-[2.4em] nuevo:before:flex-none nuevo:before:bg-current nuevo:before:opacity-70 nuevo:before:content-['']"
);

export function Dialog({
  open,
  onClose,
  title,
  eyebrow,
  description,
  children,
  footer,
  size = 'md',
  dismissable = true,
  initialFocusRef,
  className,
  'data-testid': testId,
}: DialogProps) {
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const footerRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const returnTo = React.useRef<HTMLElement | null>(null);

  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={VEIL} data-kit="dialog-veil">
          <RadixDialog.Content
            ref={contentRef}
            data-testid={testId}
            className={cx(BOX, SIZE[size], className)}
            {...(description ? {} : { 'aria-describedby': undefined })}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              // Radix gives the focus back only to its own Trigger, which this piece does not use: the
              // element that had the focus when the window opened is remembered here instead.
              returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
              const target =
                initialFocusRef?.current ??
                bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
                footerRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
                closeRef.current ??
                contentRef.current;
              target?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const target = returnTo.current;
              returnTo.current = null;
              if (target?.isConnected) target.focus();
            }}
            onEscapeKeyDown={(event) => {
              if (!dismissable) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (!dismissable) event.preventDefault();
            }}
            onInteractOutside={(event) => {
              if (!dismissable) event.preventDefault();
            }}
          >
            <div
              className={cx(
                'flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4',
                'nuevo:border-b-0 nuevo:px-5 nuevo:pb-3 nuevo:pt-[18px]'
              )}
            >
              <div className="grid min-w-0 gap-1">
                {eyebrow && <p className={EYEBROW}>{eyebrow}</p>}
                <RadixDialog.Title
                  className={cx(
                    'text-lg font-semibold text-gray-900',
                    'nuevo:font-mont nuevo:text-[1.0625rem] nuevo:font-extrabold nuevo:uppercase nuevo:leading-[1.4] nuevo:tracking-[0.06em] nuevo:text-brand_primary'
                  )}
                >
                  {title}
                </RadixDialog.Title>
                {description && (
                  <RadixDialog.Description className="text-sm text-gray-600 nuevo:text-[0.8125rem]">{description}</RadixDialog.Description>
                )}
              </div>
              {dismissable && (
                <RadixDialog.Close
                  ref={closeRef}
                  aria-label="Cerrar"
                  data-testid={testId ? `${testId}-close` : undefined}
                  className={cx(
                    'flex-none rounded text-gray-400 transition-colors hover:text-gray-500 motion-reduce:transition-none',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent',
                    'nuevo:grid nuevo:h-8 nuevo:w-8 nuevo:place-content-center nuevo:rounded-full nuevo:text-gray-600',
                    'nuevo:hover:bg-brand_primary/[0.08] nuevo:hover:text-brand_primary'
                  )}
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </RadixDialog.Close>
              )}
            </div>
            <div
              ref={bodyRef}
              className={cx(
                'space-y-4 overflow-y-auto p-6 text-sm text-gray-700',
                'nuevo:grid nuevo:gap-[14px] nuevo:space-y-0 nuevo:px-5 nuevo:pb-[18px] nuevo:pt-1 nuevo:text-[0.9375rem] nuevo:text-brand_primary'
              )}
            >
              {children}
            </div>
            {footer && (
              <div
                ref={footerRef}
                className={cx(
                  'flex flex-wrap justify-end gap-3 border-t border-gray-200 px-6 py-4',
                  'nuevo:gap-[10px] nuevo:rounded-b-lg nuevo:border-brand_primary/[0.12] nuevo:bg-gray-50 nuevo:px-5 nuevo:py-[14px]',
                  'nuevo:max-[559px]:rounded-none nuevo:max-[559px]:[&>*]:flex-1'
                )}
              >
                {footer}
              </div>
            )}
          </RadixDialog.Content>
        </RadixDialog.Overlay>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
