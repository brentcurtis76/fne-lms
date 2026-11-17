// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, ConfirmDialog, Dialog, Field, Input, useConfirm } from '../../../../components/ui/kit';

/**
 * Redesign 5c — Dialog, ConfirmDialog and useConfirm. The veil is clicked without user-event's
 * pointer-events check: while a modal is open Radix sets `pointer-events: none` on <body>, and jsdom
 * does not apply the veil's own `auto` the way a browser does (the browser test clicks it for real).
 */
const user = () => userEvent.setup({ pointerEventsCheck: 0 });
const veil = () => document.querySelector('[data-kit="dialog-veil"]') as HTMLElement;

function Opener({ dismissable, withField = true }: { dismissable?: boolean; withField?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const onClose = vi.fn(() => setOpen(false));
  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir ventana</Button>
      <Dialog
        open={open}
        onClose={onClose}
        title="Gestión de roles"
        eyebrow="Usuarios"
        description="Elige el rol y el colegio."
        dismissable={dismissable}
        data-testid="kit-dialog"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button>Asignar rol</Button>
          </>
        }
      >
        {withField ? (
          <Field label="Rol">
            <Input />
          </Field>
        ) : (
          <p>Sin campos.</p>
        )}
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('opens; the title names it, the description describes it; the focus starts in the first field', async () => {
    const u = user();
    render(<Opener />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Abrir ventana' }));
    const dialog = screen.getByRole('dialog', { name: 'Gestión de roles' });
    expect(dialog).toHaveAccessibleDescription('Elige el rol y el colegio.');
    expect(screen.getByText('Usuarios')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Rol')).toHaveFocus());
  });

  it('with nothing to fill in the body, the focus starts on the first footer button', async () => {
    const u = user();
    render(<Opener withField={false} />);
    await u.click(screen.getByRole('button', { name: 'Abrir ventana' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus());
  });

  it('Escape closes it and the focus returns to the opener', async () => {
    const u = user();
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Abrir ventana' });
    await u.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('the X («Cerrar») closes it', async () => {
    const u = user();
    render(<Opener />);
    await u.click(screen.getByRole('button', { name: 'Abrir ventana' }));
    await u.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a click on the veil closes it; a click inside does not', async () => {
    const u = user();
    render(<Opener />);
    await u.click(screen.getByRole('button', { name: 'Abrir ventana' }));
    await u.click(screen.getByText('Usuarios'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await u.click(veil());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('dismissable={false}: no X, and neither Escape nor the veil close it', async () => {
    const u = user();
    render(<Opener dismissable={false} />);
    await u.click(screen.getByRole('button', { name: 'Abrir ventana' }));
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull();
    await u.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await u.click(veil());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Tab keeps the focus inside the window', async () => {
    const u = user();
    render(<Opener />);
    await u.click(screen.getByRole('button', { name: 'Abrir ventana' }));
    const dialog = screen.getByRole('dialog');
    for (let i = 0; i < 6; i += 1) {
      await u.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('locks the page scroll while open', async () => {
    const u = user();
    render(<Opener />);
    await u.click(screen.getByRole('button', { name: 'Abrir ventana' }));
    // react-remove-scroll marks the body while a modal holds the page.
    await waitFor(() => expect(document.body).toHaveAttribute('data-scroll-locked'));
    await u.keyboard('{Escape}');
    await waitFor(() => expect(document.body).not.toHaveAttribute('data-scroll-locked'));
  });
});

describe('ConfirmDialog', () => {
  function Harness({ loading = false, onConfirm = vi.fn(), onCancel = vi.fn() }: { loading?: boolean; onConfirm?: () => void; onCancel?: () => void }) {
    return (
      <ConfirmDialog
        open
        title="¿Eliminar este curso?"
        message="Esta acción no se puede deshacer."
        tone="danger"
        confirmLabel="Eliminar"
        onConfirm={onConfirm}
        onCancel={onCancel}
        loading={loading}
        data-testid="kit-confirm"
      />
    );
  }

  it('asks the question with two answers; the focus starts on cancel', async () => {
    render(<Harness />);
    expect(screen.getByRole('dialog', { name: '¿Eliminar este curso?' })).toBeInTheDocument();
    expect(screen.getByText('Esta acción no se puede deshacer.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
  });

  it('defaults to «Confirmar» / «Cancelar»', () => {
    render(<ConfirmDialog open title="¿Seguir?" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('confirm and cancel call their callbacks; Escape is a cancel', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const u = user();
    render(<Harness onConfirm={onConfirm} onCancel={onCancel} />);
    await u.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await u.click(screen.getByRole('button', { name: 'Cancelar' }));
    await u.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('while loading: the confirm is busy, nothing answers, Escape does nothing', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const u = user();
    render(<Harness loading onConfirm={onConfirm} onCancel={onCancel} />);
    const confirm = screen.getByRole('button', { name: 'Eliminar' });
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    await u.click(confirm);
    await u.keyboard('{Escape}');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('useConfirm', () => {
  function Caller({ onAnswer }: { onAnswer: (answer: boolean) => void }) {
    const { confirm, confirmDialog } = useConfirm('kit-ask');
    return (
      <>
        <Button
          onClick={async () => {
            onAnswer(await confirm('¿Enviar el registro?'));
          }}
        >
          Enviar
        </Button>
        <Button
          onClick={async () => {
            onAnswer(await confirm({ title: '¿Eliminar?', message: 'No se puede deshacer.', tone: 'danger', confirmLabel: 'Eliminar' }));
          }}
        >
          Eliminar
        </Button>
        {confirmDialog}
      </>
    );
  }

  it('resolves true for confirm; a bare question gets the default title', async () => {
    const onAnswer = vi.fn();
    const u = user();
    render(<Caller onAnswer={onAnswer} />);
    await u.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(screen.getByRole('dialog', { name: 'Confirmar acción' })).toBeInTheDocument();
    expect(screen.getByText('¿Enviar el registro?')).toBeInTheDocument();
    await u.click(screen.getByTestId('kit-ask-confirm'));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(true));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar' })).toHaveFocus());
  });

  it('resolves false for cancel and for Escape', async () => {
    const onAnswer = vi.fn();
    const u = user();
    render(<Caller onAnswer={onAnswer} />);
    await u.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(screen.getByRole('dialog', { name: '¿Eliminar?' })).toBeInTheDocument();
    await u.click(screen.getByTestId('kit-ask-cancel'));
    await waitFor(() => expect(onAnswer).toHaveBeenLastCalledWith(false));
    await u.click(screen.getByRole('button', { name: 'Enviar' }));
    await u.keyboard('{Escape}');
    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(2));
    expect(onAnswer).toHaveBeenLastCalledWith(false);
  });

  it('resolves false when the component goes away while asking', async () => {
    const onAnswer = vi.fn();
    const u = user();
    const view = render(<Caller onAnswer={onAnswer} />);
    await u.click(screen.getByRole('button', { name: 'Enviar' }));
    view.unmount();
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(false));
  });
});
