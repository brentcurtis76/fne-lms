import * as React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cx } from './cx';

/**
 * Notice: a message that stays on the page (not a toast): an icon, an optional bold lead, the text.
 * `role="status"`, or `role="alert"` for an error. The icon and the words carry the meaning, never the
 * colour alone.
 */

export type NoticeTone = 'neutral' | 'success' | 'warning' | 'error';

const TONE: Record<NoticeTone, { box: string; icon: string; Icon: typeof Info }> = {
  neutral: {
    box: 'border-gray-200 bg-gray-50 text-gray-800 nuevo:border-brand_primary/20 nuevo:border-l-brand_primary nuevo:bg-brand_primary/5',
    icon: 'text-gray-500 nuevo:text-brand_primary',
    Icon: Info,
  },
  success: {
    box: 'border-green-200 bg-green-50 text-green-800 nuevo:border-green-600/25 nuevo:border-l-green-600 nuevo:bg-green-100',
    icon: 'text-green-600 nuevo:text-green-600',
    Icon: CheckCircle2,
  },
  warning: {
    box: 'border-yellow-200 bg-yellow-50 text-yellow-800 nuevo:border-brand_accent_hover/40 nuevo:border-l-brand_accent_hover nuevo:bg-amber-100',
    icon: 'text-yellow-600 nuevo:text-amber-700',
    Icon: AlertTriangle,
  },
  error: {
    box: 'border-red-200 bg-red-50 text-red-800 nuevo:border-red-600/25 nuevo:border-l-red-600 nuevo:bg-red-100',
    icon: 'text-red-600 nuevo:text-red-600',
    Icon: AlertCircle,
  },
};

export interface NoticeProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: NoticeTone;
  /** A short bold lead before the text («Borrador guardado.»). */
  title?: React.ReactNode;
  /** Another icon in place of the tone's own. */
  icon?: React.ReactNode;
}

export const Notice = React.forwardRef<HTMLDivElement, NoticeProps>(function Notice(
  { tone = 'neutral', title, icon, role, className, children, ...rest },
  ref
) {
  const t = TONE[tone];
  return (
    <div
      ref={ref}
      role={role ?? (tone === 'error' ? 'alert' : 'status')}
      data-tone={tone}
      className={cx(
        'flex items-start gap-3 rounded-lg border p-4 text-sm',
        'nuevo:rounded nuevo:border-l-4 nuevo:px-[14px] nuevo:py-3 nuevo:text-[0.8125rem] nuevo:text-brand_primary',
        t.box,
        className
      )}
      {...rest}
    >
      <span aria-hidden="true" className={cx('mt-px flex-none [&>svg]:h-5 [&>svg]:w-5 nuevo:[&>svg]:h-[18px] nuevo:[&>svg]:w-[18px]', t.icon)}>
        {icon ?? <t.Icon />}
      </span>
      <div className="min-w-0">
        {title && (
          <>
            <strong className="font-semibold">{title}</strong>{' '}
          </>
        )}
        {children}
      </div>
    </div>
  );
});
