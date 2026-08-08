// @vitest-environment jsdom
/**
 * Dual-zone wiring in the change-request modal (Z2-4c, plan §15).
 *
 * This is the path a consultant uses to propose a move, and the one that now
 * emits `session_rescheduled`. The claim under test is that its time fields say
 * they are Chile time, and that the Spain preview follows the values being
 * *edited* — not the session's stored ones, which is the mistake that would make
 * the preview quietly useless exactly when it matters.
 *
 * Synthetic session data only.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditRequestModal from '../../../components/sessions/EditRequestModal';

const SESSION = {
  session_date: '2027-07-15',
  start_time: '09:00',
  end_time: '10:30',
  modality: 'online' as const,
};

function renderModal(session: typeof SESSION = SESSION) {
  return render(
    <EditRequestModal
      session={session}
      onClose={vi.fn()}
      onSubmit={vi.fn().mockResolvedValue(undefined)}
      submitting={false}
    />
  );
}

const timeInputs = () => Array.from(document.querySelectorAll('input[type="time"]'));

describe('EditRequestModal — dual-zone times', () => {
  it('marks both time fields as Chile time', () => {
    renderModal();

    const startLabel = screen.getByText('Hora de inicio', { exact: false }).closest('label');
    const endLabel = screen.getByText('Hora de término', { exact: false }).closest('label');

    expect(startLabel?.textContent).toContain('(hora Chile)');
    expect(endLabel?.textContent).toContain('(hora Chile)');
  });

  it('previews the stored times in Spain on open', () => {
    renderModal();
    // July: Chile on winter time, Spain on summer time → +6h.
    expect(screen.getByTestId('edit-request-spain-preview')).toHaveTextContent(
      '15:00 a 16:30 (hora España)'
    );
  });

  it('tracks the proposed times, not the stored ones', () => {
    renderModal();

    fireEvent.change(timeInputs()[0], { target: { value: '11:00' } });
    fireEvent.change(timeInputs()[1], { target: { value: '12:00' } });

    expect(screen.getByTestId('edit-request-spain-preview')).toHaveTextContent(
      '17:00 a 18:00 (hora España)'
    );
  });

  it('re-derives when the proposed date crosses the DST divergence', () => {
    renderModal();
    expect(screen.getByTestId('edit-request-spain-preview')).toHaveTextContent(
      '15:00 a 16:30 (hora España)'
    );

    // Same Chile times, opposite side of the year → a different Spain offset.
    fireEvent.change(document.querySelector('input[type="date"]') as Element, {
      target: { value: '2027-01-15' },
    });

    expect(screen.getByTestId('edit-request-spain-preview')).toHaveTextContent(
      '13:00 a 14:30 (hora España)'
    );
  });

  it('renders no preview when the date is cleared, and does not throw', () => {
    renderModal();

    fireEvent.change(document.querySelector('input[type="date"]') as Element, {
      target: { value: '' },
    });

    expect(screen.queryByTestId('edit-request-spain-preview')).toBeNull();
    // The form is still usable — the cleared date is a proposed change like any other.
    expect(screen.getByText('Enviar Solicitud')).toBeInTheDocument();
  });

  it('offers no Spain input — the preview is read-only', () => {
    renderModal();

    const preview = screen.getByTestId('edit-request-spain-preview');
    expect(preview.querySelector('input')).toBeNull();
    // The three structural inputs are the date and the two Chile times, nothing more.
    expect(timeInputs()).toHaveLength(2);
  });
});
