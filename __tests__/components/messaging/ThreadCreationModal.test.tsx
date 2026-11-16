// @vitest-environment jsdom
import React from 'react';
import { render, fireEvent, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The «Crear Nuevo Hilo de Conversación» modal (GENERA fixes F11, send-back 1
 * item 1): when creating the conversation fails, everything the person typed
 * stays in the modal, the modal stays open, and the page's own message is the
 * only one shown. Synthetic text only.
 */

vi.mock('react-hot-toast', () => {
  const toast = { error: vi.fn(), success: vi.fn() };
  return { toast, default: toast };
});

import { toast } from 'react-hot-toast';
import ThreadCreationModal from '../../../components/messaging/ThreadCreationModal';

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

function fill() {
  fireEvent.change(screen.getByLabelText(/Título del Hilo/), { target: { value: 'Planificación' } });
  fireEvent.change(screen.getByLabelText(/Descripción/), { target: { value: 'Semestre dos' } });
  fireEvent.change(screen.getByLabelText(/Categoría/), { target: { value: 'custom' } });
  fireEvent.change(screen.getByLabelText(/Nombre de la categoría personalizada/), { target: { value: 'Convivencia' } });
  fireEvent.change(screen.getByLabelText(/Mensaje Inicial/), { target: { value: 'Mi texto de planificación' } });
}

describe('send-back 1 (1) the modal when creating fails', () => {
  it('keeps everything typed and stays open; only the page says what happened', async () => {
    const onClose = vi.fn();
    const onCreateThread = vi.fn().mockRejectedValueOnce(new Error('first message failed'));
    render(<ThreadCreationModal isOpen onClose={onClose} onCreateThread={onCreateThread} />);
    fill();

    await act(async () => {
      fireEvent.click(screen.getByText('Crear Hilo'));
    });
    await waitFor(() => expect(onCreateThread).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Crear Hilo')).toBeTruthy());

    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/Título del Hilo/) as HTMLInputElement).value).toBe('Planificación');
    expect((screen.getByLabelText(/Descripción/) as HTMLTextAreaElement).value).toBe('Semestre dos');
    expect((screen.getByLabelText(/Categoría/) as HTMLSelectElement).value).toBe('custom');
    expect((screen.getByLabelText(/Nombre de la categoría personalizada/) as HTMLInputElement).value).toBe('Convivencia');
    expect((screen.getByLabelText(/Mensaje Inicial/) as HTMLTextAreaElement).value).toBe('Mi texto de planificación');
    // The page shows «No se pudo crear la conversación…»; the modal adds no second, different message.
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('the next press sends the same text again', async () => {
    const onClose = vi.fn();
    const onCreateThread = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(undefined);
    render(<ThreadCreationModal isOpen onClose={onClose} onCreateThread={onCreateThread} />);
    fill();
    await act(async () => {
      fireEvent.click(screen.getByText('Crear Hilo'));
    });
    await waitFor(() => expect(screen.getByText('Crear Hilo')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByText('Crear Hilo'));
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onCreateThread.mock.calls[1][0]).toEqual(onCreateThread.mock.calls[0][0]);
    expect(onCreateThread.mock.calls[1][0]).toMatchObject({
      thread_title: 'Planificación',
      custom_category_name: 'Convivencia',
      initial_message: 'Mi texto de planificación',
    });
  });
});
