// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Count,
  EmptyState,
  LoadingBlock,
  Notice,
  PageHeader,
  Skeleton,
  Spinner,
} from '../../../../components/ui/kit';

/** Redesign 5c — Badge, Count, Card, Notice, EmptyState, the loading pieces and PageHeader. */
describe('Badge and Count', () => {
  it('a badge shows its word for every tone; the dot is hidden from screen readers', () => {
    const tones = ['neutral', 'success', 'warning', 'error', 'info', 'accent'] as const;
    render(
      <>
        {tones.map((tone) => (
          <Badge key={tone} tone={tone} data-testid={`badge-${tone}`}>
            {`Estado ${tone}`}
          </Badge>
        ))}
        <Badge plain data-testid="badge-plain">
          Docente
        </Badge>
      </>
    );
    for (const tone of tones) {
      const badge = screen.getByTestId(`badge-${tone}`);
      expect(badge).toHaveTextContent(`Estado ${tone}`);
      expect(badge).toHaveAttribute('data-tone', tone);
      expect(badge.querySelector('[aria-hidden="true"]')).not.toBeNull();
    }
    expect(screen.getByTestId('badge-plain').querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('a count shows its number, and says what it counts when given a label', () => {
    render(
      <>
        <Count value={7} data-testid="count-bare" />
        <Count value={3} label="3 materiales" data-testid="count-named" />
      </>
    );
    expect(screen.getByTestId('count-bare')).toHaveTextContent('7');
    expect(screen.getByText('3 materiales')).toBeInTheDocument();
  });
});

describe('Card', () => {
  it('a plain card holds its parts', () => {
    render(
      <Card data-testid="card-plain">
        <CardHeader>
          <CardTitle>Próxima sesión</CardTitle>
        </CardHeader>
        <CardBody>Jueves 19 de noviembre</CardBody>
        <CardFooter>
          <Button size="sm">Ver sesión</Button>
        </CardFooter>
      </Card>
    );
    expect(screen.getByTestId('card-plain').tagName).toBe('DIV');
    expect(screen.getByRole('heading', { level: 3, name: 'Próxima sesión' })).toBeInTheDocument();
  });

  it('an interactive card with onClick is one button that activates on Enter', async () => {
    const onClick = vi.fn();
    render(
      <Card interactive onClick={onClick} data-testid="card-button">
        <CardBody>Aprendizaje basado en proyectos</CardBody>
      </Card>
    );
    const card = screen.getByRole('button', { name: 'Aprendizaje basado en proyectos' });
    expect(card).toHaveAttribute('type', 'button');
    card.focus();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('an interactive card with href is one link', () => {
    render(
      <Card interactive href="/mi-aprendizaje" leading>
        <CardBody>Mi aprendizaje</CardBody>
      </Card>
    );
    expect(screen.getByRole('link', { name: 'Mi aprendizaje' })).toHaveAttribute('href', '/mi-aprendizaje');
  });
});

describe('Notice', () => {
  it('is a status, an alert for an error; its lead and text are read', () => {
    render(
      <>
        <Notice title="Borrador guardado." data-testid="n-neutral">
          Puedes seguir más tarde.
        </Notice>
        <Notice tone="success">Registro enviado.</Notice>
        <Notice tone="warning">Solo lectura.</Notice>
        <Notice tone="error" title="No se pudo cargar.">
          Revisa tu conexión.
        </Notice>
      </>
    );
    expect(screen.getAllByRole('status')).toHaveLength(3);
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar. Revisa tu conexión.');
    expect(screen.getByTestId('n-neutral')).toHaveTextContent('Borrador guardado. Puedes seguir más tarde.');
  });
});

describe('EmptyState', () => {
  it('shows its title, its sentence and its one action', async () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="Sin notificaciones"
        description="Te avisaremos cuando tengas algo nuevo."
        action={
          <Button variant="outline" size="sm" onClick={onClick}>
            Ver todas
          </Button>
        }
      />
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Sin notificaciones' })).toBeInTheDocument();
    expect(screen.getByText('Te avisaremos cuando tengas algo nuevo.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver todas' }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('Loading', () => {
  it('a skeleton is hidden from screen readers', () => {
    render(<Skeleton width="40%" height={14} data-testid="bone" />);
    expect(screen.getByTestId('bone')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('bone')).toHaveStyle({ width: '40%', height: '14px' });
  });

  it('a spinner says «Cargando…» to screen readers, or shows its label', () => {
    render(
      <>
        <Spinner data-testid="spin-bare" />
        <Spinner label="Guardando cambios" data-testid="spin-named" />
      </>
    );
    expect(screen.getByTestId('spin-bare')).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('spin-bare')).toHaveTextContent('Cargando…');
    expect(screen.getByTestId('spin-named')).toHaveTextContent('Guardando cambios');
    expect(screen.getByTestId('spin-named')).not.toHaveTextContent('Cargando…');
  });

  it('a loading block is a status with its words', () => {
    render(<LoadingBlock />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
  });
});

describe('PageHeader', () => {
  it('has the page title as h1, the eyebrow, the description and the actions', async () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    render(
      <PageHeader
        eyebrow="Configuración"
        title="Piezas de la interfaz"
        description="Una línea que explica la página."
        primaryAction={{ label: 'Nuevo usuario', onClick: onPrimary }}
        secondaryAction={{ label: 'Exportar', onClick: onSecondary }}
        actions={<Button variant="quiet">Ayuda</Button>}
      >
        <p>Filtros</p>
      </PageHeader>
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Piezas de la interfaz' })).toBeInTheDocument();
    expect(screen.getByText('Configuración')).toBeInTheDocument();
    expect(screen.getByText('Una línea que explica la página.')).toBeInTheDocument();
    expect(screen.getByText('Filtros')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    await userEvent.click(screen.getByRole('button', { name: 'Exportar' }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Ayuda' })).toBeInTheDocument();
  });

  it('carries FunctionalPageHeader\'s search box: value, handler, placeholder', async () => {
    function Searching() {
      const [q, setQ] = React.useState('');
      return (
        <>
          <PageHeader title="Usuarios" icon={<svg />} searchValue={q} onSearchChange={setQ} />
          <p data-testid="q">{q}</p>
        </>
      );
    }
    render(<Searching />);
    const search = screen.getByRole('searchbox', { name: 'Buscar' });
    expect(search).toHaveAttribute('placeholder', 'Buscar...');
    await userEvent.type(search, 'ana');
    expect(screen.getByTestId('q')).toHaveTextContent('ana');
  });
});
