import * as React from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

/**
 * ConfirmDialog: a question with two answers, the replacement of the browser's `confirm()`. The focus
 * starts on the CANCEL button, so an Enter pressed by habit does not confirm. Escape, the veil and the X
 * answer «cancel». While `loading` the window cannot be dismissed and the confirm button shows a spinner.
 *
 * `useConfirm()` turns it into a promise, for call sites that today read `if (!confirm(q)) return;`:
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   if (!(await confirm(q))) return;          // the same question, the same two answers
 *   …
 *   return <>…{confirmDialog}</>;               // rendered once, anywhere in the component
 */

export type ConfirmTone = 'default' | 'danger';

export interface ConfirmDialogProps {
  open: boolean;
  title: React.ReactNode;
  message?: React.ReactNode;
  /** Default «Confirmar». */
  confirmLabel?: React.ReactNode;
  /** Default «Cancelar». */
  cancelLabel?: React.ReactNode;
  /** `danger`: the confirm button is red (deleting, rejecting). */
  tone?: ConfirmTone;
  eyebrow?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  'data-testid'?: string;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  eyebrow,
  onConfirm,
  onCancel,
  loading = false,
  'data-testid': testId,
}: ConfirmDialogProps) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!loading) onCancel();
      }}
      title={title}
      eyebrow={eyebrow}
      dismissable={!loading}
      initialFocusRef={cancelRef}
      data-testid={testId}
      footer={
        <>
          <Button
            ref={cancelRef}
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            data-testid={testId ? `${testId}-cancel` : undefined}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            data-testid={testId ? `${testId}-confirm` : undefined}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message && (typeof message === 'string' ? <p>{message}</p> : message)}
    </Dialog>
  );
}

export interface ConfirmOptions {
  title: React.ReactNode;
  message?: React.ReactNode;
  confirmLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  tone?: ConfirmTone;
  eyebrow?: React.ReactNode;
}

/** The title used when `confirm` is given only a question, as `window.confirm(question)` is. */
export const DEFAULT_CONFIRM_TITLE = 'Confirmar acción';

type Pending = { options: ConfirmOptions; resolve: (answer: boolean) => void };

/**
 * `confirm(question)` or `confirm({ title, message, tone, … })` opens a ConfirmDialog and resolves `true`
 * for confirm, `false` for every other way out (cancel, Escape, veil, X, a second `confirm` while one is
 * open, the component going away). Render `confirmDialog` once.
 */
export function useConfirm(testId?: string): {
  confirm: (question: string | ConfirmOptions) => Promise<boolean>;
  confirmDialog: React.ReactElement;
} {
  const [pending, setPending] = React.useState<Pending | null>(null);
  const pendingRef = React.useRef<Pending | null>(null);

  const settle = React.useCallback((answer: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(answer);
  }, []);

  React.useEffect(() => () => pendingRef.current?.resolve(false), []);

  const confirm = React.useCallback((question: string | ConfirmOptions) => {
    const options: ConfirmOptions = typeof question === 'string' ? { title: DEFAULT_CONFIRM_TITLE, message: question } : question;
    return new Promise<boolean>((resolve) => {
      pendingRef.current?.resolve(false);
      const next = { options, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const confirmDialog = (
    <ConfirmDialog
      open={pending !== null}
      title={pending?.options.title ?? DEFAULT_CONFIRM_TITLE}
      message={pending?.options.message}
      confirmLabel={pending?.options.confirmLabel}
      cancelLabel={pending?.options.cancelLabel}
      tone={pending?.options.tone}
      eyebrow={pending?.options.eyebrow}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
      data-testid={testId}
    />
  );

  return { confirm, confirmDialog };
}
