import React from 'react';
import { ConfirmDialog as KitConfirmDialog } from '../ui/kit';

/**
 * The new look's confirmation of «Propuestas de Cursos» (redesign 6C): the kit's `ConfirmDialog`, with
 * today's texts and today's behaviour. «Eliminar» calls `onConfirm` and closes at once, as
 * `course-proposals/ConfirmDialog` does (`handleConfirm`, passed in); «Cancelar», the X, Escape and the
 * veil call `onClose`. While `isLoading` the confirm button shows «Eliminando...», as today.
 */
export function ConfirmDialogNuevo({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  cancelText,
  isLoading,
  variant,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Today's `handleConfirm`: `onConfirm()` then `onClose()`. */
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText: string;
  cancelText: string;
  isLoading: boolean;
  variant: 'danger' | 'warning';
}) {
  return (
    <KitConfirmDialog
      open={isOpen}
      onCancel={onClose}
      onConfirm={onConfirm}
      title={title}
      message={description}
      eyebrow="Confirmar"
      confirmLabel={isLoading ? 'Eliminando...' : confirmText}
      cancelLabel={cancelText}
      tone={variant === 'danger' ? 'danger' : 'default'}
      loading={isLoading}
      data-testid="proposal-confirm-dialog"
    />
  );
}

export default ConfirmDialogNuevo;
