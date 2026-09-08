// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SessionStartControl from '../../../components/sessions/SessionStartControl';

vi.mock('lucide-react', () => ({
  AlertTriangle: () => <span data-testid="alert-icon" />,
  Play: () => <span data-testid="play-icon" />,
  RefreshCw: () => <span data-testid="refresh-icon" />,
}));

const baseProps = {
  isManagedZoom: true,
  meetingStatus: null,
  meetingStatusLoading: false,
  meetingStatusError: false,
  actionInProgress: false,
  onStart: vi.fn(),
} as const;

describe('SessionStartControl', () => {
  it('blocks start while a managed Zoom meeting is not ready', () => {
    const onStart = vi.fn();
    render(<SessionStartControl {...baseProps} onStart={onStart} />);

    const button = screen.getByTestId('session-start-button');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Preparando Zoom…');
    expect(screen.getByRole('status')).toHaveTextContent(
      'La sesión se podrá iniciar cuando Zoom confirme la reunión.'
    );

    fireEvent.click(button);
    expect(onStart).not.toHaveBeenCalled();
  });

  it.each(['scheduled', 'live'] as const)(
    'enables start when the managed meeting is %s',
    (meetingStatus) => {
      const onStart = vi.fn();
      render(
        <SessionStartControl
          {...baseProps}
          meetingStatus={meetingStatus}
          onStart={onStart}
        />
      );

      const button = screen.getByTestId('session-start-button');
      expect(button).toBeEnabled();
      expect(button).toHaveTextContent('Iniciar y continuar a Zoom');
      expect(screen.getByText(/pasará a En Progreso/i)).toHaveTextContent(
        'La sesión pasará a En Progreso y luego podrás unirte a Zoom.'
      );
      fireEvent.click(button);
      expect(onStart).toHaveBeenCalledTimes(1);
    }
  );

  it('keeps an unmanaged session independent of Zoom readiness', () => {
    render(<SessionStartControl {...baseProps} isManagedZoom={false} />);

    expect(screen.getByTestId('session-start-button')).toHaveTextContent('Iniciar Sesión');
    expect(screen.getByTestId('session-start-button')).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(/pasará a En Progreso/i)).not.toBeInTheDocument();
  });

  it('shows a retry message when readiness verification fails', () => {
    render(<SessionStartControl {...baseProps} meetingStatusError />);

    expect(screen.getByTestId('session-start-button')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'No pudimos verificar la reunión. Reintentaremos automáticamente.'
    );
  });

  it.each(['ended', 'cancelled'] as const)(
    'shows a terminal message and keeps start blocked when Zoom is %s',
    (meetingStatus) => {
      render(<SessionStartControl {...baseProps} meetingStatus={meetingStatus} />);

      expect(screen.getByTestId('session-start-button')).toBeDisabled();
      expect(screen.getByTestId('session-start-button')).toHaveTextContent(
        'Zoom no disponible'
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'La reunión terminó o fue cancelada. Cancela o reprograma la sesión.'
      );
    }
  );
});
