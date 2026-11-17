import * as React from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

/**
 * ConfirmDialog: a question with two answers, the replacement of the browser's `confirm()`. The focus
 * starts on the CANCEL button, so an Enter pressed by habit does not confirm. Escape, the veil and the X
 * answer «cancel». While `loading` the window cannot be dismissed and the confirm button shows a spinner.
 * The confirm button is the Button's `confirm` variant (black today, the yellow main action in the new
 * look), or red with `tone="danger"` in both looks.
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
  /**
   * Change it to ask another question in a window that stays open: the focus goes back to the cancel
   * button, so an Enter meant for the old question does not confirm the new one. `useConfirm` sets it.
   */
  questionKey?: React.Key;
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
  questionKey,
  'data-testid': testId,
}: ConfirmDialogProps) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  // On opening, the window itself puts the focus on cancel (`initialFocusRef`); a new question in a window
  // that was already open is moved there here.
  const asked = React.useRef<{ open: boolean; key: React.Key | undefined }>({ open: false, key: undefined });
  React.useEffect(() => {
    const before = asked.current;
    asked.current = { open, key: questionKey };
    if (open && before.open && before.key !== questionKey) cancelRef.current?.focus();
  }, [open, questionKey]);
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
            variant={tone === 'danger' ? 'danger' : 'confirm'}
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

type Pending = { options: ConfirmOptions; resolve: (answer: boolean) => void; key: number };

/**
 * `confirm(question)` or `confirm({ title, message, tone, … })` opens a ConfirmDialog and resolves `true`
 * for confirm, `false` for every other way out (cancel, Escape, veil, X, a second `confirm` while one is
 * open, the component going away). A `confirm` called after the component went away (an async handler
 * that finishes after a navigation) resolves `false` at once. Every question starts with the focus on
 * the cancel button, also one that replaces an open question. Render `confirmDialog` once.
 */
export function useConfirm(testId?: string): {
  confirm: (question: string | ConfirmOptions) => Promise<boolean>;
  confirmDialog: React.ReactElement;
} {
  const [pending, setPending] = React.useState<Pending | null>(null);
  const pendingRef = React.useRef<Pending | null>(null);
  const asked = React.useRef(0);
  // Set when the component goes away, cleared when it (re)appears (React's strict mode mounts twice).
  // Not "mounted" set in the effect: a child's effect runs before this one and may already ask.
  const gone = React.useRef(false);

  const settle = React.useCallback((answer: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(answer);
  }, []);

  React.useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
      const current = pendingRef.current;
      pendingRef.current = null;
      current?.resolve(false);
    };
  }, []);

  const confirm = React.useCallback((question: string | ConfirmOptions) => {
    if (gone.current) return Promise.resolve(false);
    const options: ConfirmOptions = typeof question === 'string' ? { title: DEFAULT_CONFIRM_TITLE, message: question } : question;
    return new Promise<boolean>((resolve) => {
      pendingRef.current?.resolve(false);
      asked.current += 1;
      const next = { options, resolve, key: asked.current };
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
      questionKey={pending?.key}
      data-testid={testId}
    />
  );

  return { confirm, confirmDialog };
}
