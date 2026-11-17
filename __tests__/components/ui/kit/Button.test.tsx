// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../../../../components/ui/kit';

/** Redesign 5c — Button: behaviour, not classes. */
describe('Button', () => {
  it('is a button of type "button" by default and calls onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Guardar</Button>);
    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps a type it is given', () => {
    render(<Button type="submit">Enviar</Button>);
    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveAttribute('type', 'submit');
  });

  it('a disabled button ignores clicks', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Guardar
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('loading: aria-busy, the label stays, clicks are ignored, a form is not sent again, the focus stays', async () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" loading onClick={onClick}>
          Guardando
        </Button>
      </form>
    );
    const button = screen.getByRole('button', { name: 'Guardando' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).not.toBeDisabled();
    button.focus();
    await userEvent.click(button);
    await userEvent.keyboard('{Enter}');
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(button).toHaveFocus();
  });

  it('without loading there is no aria-busy', () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole('button', { name: 'Guardar' })).not.toHaveAttribute('aria-busy');
  });

  it('with href it is a link to that address (inside and outside the platform)', () => {
    render(
      <>
        <Button href="/configuracion/apariencia">Apariencia</Button>
        <Button href="https://example.com/ayuda" variant="outline">
          Ayuda
        </Button>
      </>
    );
    expect(screen.getByRole('link', { name: 'Apariencia' })).toHaveAttribute('href', '/configuracion/apariencia');
    expect(screen.getByRole('link', { name: 'Ayuda' })).toHaveAttribute('href', 'https://example.com/ayuda');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a disabled link has no address and says it is disabled', () => {
    render(
      <Button href="/dashboard" disabled>
        Panel
      </Button>
    );
    const link = screen.getByRole('link', { name: 'Panel' });
    expect(link).not.toHaveAttribute('href');
    expect(link).toHaveAttribute('aria-disabled', 'true');
  });

  it('forwards the ref and native attributes', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} data-testid="kit-save" aria-describedby="nota" name="accion" value="guardar">
        Guardar
      </Button>
    );
    expect(ref.current).toBe(screen.getByTestId('kit-save'));
    expect(ref.current?.tagName).toBe('BUTTON');
    expect(ref.current).toHaveAttribute('aria-describedby', 'nota');
    expect(ref.current).toHaveAttribute('name', 'accion');
  });

  it('forwards the ref of a link too', () => {
    const ref = React.createRef<HTMLAnchorElement>();
    render(
      <Button ref={ref} href="/dashboard">
        Panel
      </Button>
    );
    expect(ref.current?.tagName).toBe('A');
  });

  it('icon only: named by its aria-label', () => {
    render(
      <Button iconOnly aria-label="Más acciones" variant="quiet">
        <svg aria-hidden="true" />
      </Button>
    );
    expect(screen.getByRole('button', { name: 'Más acciones' })).toBeInTheDocument();
  });

  it('icon only: a button carries a title equal to its aria-label, for the pointer', () => {
    render(
      <Button iconOnly aria-label="Más acciones" variant="quiet">
        <svg aria-hidden="true" />
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Más acciones' });
    expect(button).toHaveAttribute('title', 'Más acciones');
    expect(button).toHaveAttribute('aria-label', 'Más acciones');
  });

  it('icon only: a link carries a title equal to its aria-label (inside, outside, disabled)', () => {
    render(
      <>
        <Button iconOnly href="/dashboard" aria-label="Ir al panel">
          <svg aria-hidden="true" />
        </Button>
        <Button iconOnly href="https://example.com/ayuda" aria-label="Abrir la ayuda">
          <svg aria-hidden="true" />
        </Button>
        <Button iconOnly href="/dashboard" disabled aria-label="Panel no disponible">
          <svg aria-hidden="true" />
        </Button>
      </>
    );
    for (const name of ['Ir al panel', 'Abrir la ayuda', 'Panel no disponible']) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('title', name);
    }
  });

  it('icon only: a title the caller gives wins over the aria-label; without one the aria-label is used', () => {
    render(
      <>
        <Button iconOnly aria-label="Cerrar" title="Cerrar la ventana">
          <svg aria-hidden="true" />
        </Button>
        <Button iconOnly href="/dashboard" aria-label="Panel" title="Volver al panel">
          <svg aria-hidden="true" />
        </Button>
        <Button iconOnly aria-label="Editar">
          <svg aria-hidden="true" />
        </Button>
      </>
    );
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveAttribute('title', 'Cerrar la ventana');
    expect(screen.getByRole('link', { name: 'Panel' })).toHaveAttribute('title', 'Volver al panel');
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveAttribute('title', 'Editar');
  });

  it('a button or link with visible words gets no title it was not given (an icon-only one beside it does)', () => {
    render(
      <>
        <Button aria-label="Guardar el registro">Guardar</Button>
        <Button href="/dashboard">Panel</Button>
        <Button iconOnly aria-label="Borrar">
          <svg aria-hidden="true" />
        </Button>
      </>
    );
    expect(screen.getByRole('button', { name: 'Guardar el registro' })).not.toHaveAttribute('title');
    expect(screen.getByRole('link', { name: 'Panel' })).not.toHaveAttribute('title');
    expect(screen.getByRole('button', { name: 'Borrar' })).toHaveAttribute('title', 'Borrar');
  });

  it('every variant and size renders a button with its words', () => {
    const variants = ['primary', 'default', 'outline', 'quiet', 'danger', 'danger-outline'] as const;
    render(
      <>
        {variants.map((variant) => (
          <Button key={variant} variant={variant} size="sm">
            {variant}
          </Button>
        ))}
      </>
    );
    for (const variant of variants) expect(screen.getByRole('button', { name: variant })).toBeInTheDocument();
  });
});

// That an icon-only button without an aria-label is a type error is proved by
// components/ui/kit/Button.typecheck.tsx, which the type-check reads (it skips __tests__/).
