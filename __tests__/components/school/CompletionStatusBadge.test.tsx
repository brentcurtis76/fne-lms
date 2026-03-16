// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  CheckCircle: () => <span data-testid="icon-check-circle" />,
  Clock: () => <span data-testid="icon-clock" />,
}));

import CompletionStatusBadge from '../../../components/school/CompletionStatusBadge';

describe('CompletionStatusBadge', () => {
  it('renders "Pendiente" badge with Clock icon when isCompleted is false', () => {
    render(<CompletionStatusBadge isCompleted={false} />);

    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByTestId('icon-clock')).toBeInTheDocument();
    expect(screen.queryByText('Completado')).not.toBeInTheDocument();
  });

  it('renders "Completado" badge with CheckCircle icon when isCompleted is true', () => {
    render(<CompletionStatusBadge isCompleted={true} />);

    expect(screen.getByText('Completado')).toBeInTheDocument();
    expect(screen.getByTestId('icon-check-circle')).toBeInTheDocument();
    expect(screen.queryByText('Pendiente')).not.toBeInTheDocument();
  });

  it('shows tooltip on hover with completed-by name and date', () => {
    render(
      <CompletionStatusBadge
        isCompleted={true}
        completedByName="Ana García"
        completedAt="2026-03-10T12:00:00Z"
      />
    );

    // Tooltip should not be visible initially
    expect(screen.queryByText(/Completado por Ana García/)).not.toBeInTheDocument();

    // Hover to show tooltip
    fireEvent.mouseEnter(screen.getByText('Completado'));
    expect(screen.getByText(/Completado por Ana García/)).toBeInTheDocument();

    // Mouse leave to hide tooltip
    fireEvent.mouseLeave(screen.getByText('Completado'));
    expect(screen.queryByText(/Completado por Ana García/)).not.toBeInTheDocument();
  });

  it('shows tooltip on focus (keyboard accessibility)', () => {
    render(
      <CompletionStatusBadge
        isCompleted={true}
        completedByName="Carlos López"
        completedAt="2026-02-15T10:00:00Z"
      />
    );

    // Tooltip should not be visible initially
    expect(screen.queryByText(/Completado por Carlos López/)).not.toBeInTheDocument();

    // Focus to show tooltip
    fireEvent.focus(screen.getByText('Completado'));
    expect(screen.getByText(/Completado por Carlos López/)).toBeInTheDocument();
  });

  it('hides tooltip on blur', () => {
    render(
      <CompletionStatusBadge
        isCompleted={true}
        completedByName="Carlos López"
        completedAt="2026-02-15T10:00:00Z"
      />
    );

    // Focus then blur
    fireEvent.focus(screen.getByText('Completado'));
    expect(screen.getByText(/Completado por Carlos López/)).toBeInTheDocument();

    fireEvent.blur(screen.getByText('Completado'));
    expect(screen.queryByText(/Completado por Carlos López/)).not.toBeInTheDocument();
  });

  it('formats date in Chilean locale (es-CL)', () => {
    render(
      <CompletionStatusBadge
        isCompleted={true}
        completedByName="Ana García"
        completedAt="2026-03-10T12:00:00Z"
      />
    );

    fireEvent.mouseEnter(screen.getByText('Completado'));

    // es-CL format: "10 de marzo de 2026"
    const tooltipText = screen.getByText(/Completado por Ana García/).textContent;
    expect(tooltipText).toContain('2026');
    expect(tooltipText).toContain('10');
  });

  it('does not show tooltip when no name/date data provided', () => {
    render(<CompletionStatusBadge isCompleted={true} />);

    fireEvent.mouseEnter(screen.getByText('Completado'));

    // No tooltip content should appear since no name/date
    expect(screen.queryByText(/Completado por/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Última modificación/)).not.toBeInTheDocument();
  });

  it('has role="status" and aria-label for screen readers', () => {
    render(
      <CompletionStatusBadge
        isCompleted={true}
        completedByName="Ana García"
      />
    );

    const badge = screen.getByRole('status');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('aria-label', 'Completado por Ana García');
  });

  it('has aria-label without name when completedByName is not provided', () => {
    render(<CompletionStatusBadge isCompleted={true} />);

    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute('aria-label', 'Completado');
  });

  it('shows last-updated info in tooltip when provided', () => {
    render(
      <CompletionStatusBadge
        isCompleted={true}
        completedByName="Ana García"
        completedAt="2026-03-10T12:00:00Z"
        lastUpdatedByName="Pedro Ruiz"
        lastUpdatedAt="2026-03-12T14:00:00Z"
      />
    );

    fireEvent.mouseEnter(screen.getByText('Completado'));

    expect(screen.getByText(/Completado por Ana García/)).toBeInTheDocument();
    expect(screen.getByText(/Última modificación por Pedro Ruiz/)).toBeInTheDocument();
  });

  it('has tabIndex={0} for keyboard focusability', () => {
    render(<CompletionStatusBadge isCompleted={true} />);

    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute('tabindex', '0');
  });
});
