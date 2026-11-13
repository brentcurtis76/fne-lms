import React, { useEffect, useRef } from 'react';

interface FlipbookDialogProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the brochure. */
  title: string;
  /** Heyzine flipbook shown inside the dialog. */
  src: string;
  /** Optional link that opens the brochure in its own tab. */
  externalHref?: string;
}

/**
 * A brochure flipbook in a native dialog. The iframe only exists while the
 * dialog is open, so the brochure is not loaded (or found in the page) until
 * somebody asks for it.
 */
export default function FlipbookDialog({ open, onClose, title, src, externalHref }: FlipbookDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="libro"
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          {externalHref && (
            <a className="fuera" href={externalHref} target="_blank" rel="noopener noreferrer">
              Abrir en nueva pestaña →
            </a>
          )}
          <button type="button" className="cerrar" onClick={onClose} data-testid="flipbook-cerrar">
            Cerrar ✕
          </button>
          <iframe className="fp-iframe" allowFullScreen allow="clipboard-write" scrolling="no" title={title} src={src} />
        </>
      )}
    </dialog>
  );
}
