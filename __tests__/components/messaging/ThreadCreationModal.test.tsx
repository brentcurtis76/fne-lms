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

// ---------------------------------------------------------------------------
// Send-back 2, B: after the first message failed, the conversation's row
// already exists with the first title, description and category: on a retry
// those are read-only, with one line saying so; only the message can change.
// ---------------------------------------------------------------------------

describe('send-back 2 (B) retrying after the first message failed', () => {
  const NOTICE = 'La conversación ya fue creada. Solo falta enviar el primer mensaje.';
  const incomplete = () => Object.assign(new Error('first message failed'), { threadId: 'thread-new' });
  const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;

  it('shows title, description and category read-only with their first values, and the retry sends the changed message', async () => {
    const onClose = vi.fn();
    const onCreateThread = vi.fn().mockRejectedValueOnce(incomplete()).mockResolvedValueOnce(undefined);
    render(<ThreadCreationModal isOpen onClose={onClose} onCreateThread={onCreateThread} />);
    expect(screen.queryByText(NOTICE)).toBeNull();
    fill();
    await act(async () => {
      fireEvent.click(screen.getByText('Crear Hilo'));
    });
    await waitFor(() => expect(screen.getByText('Crear Hilo')).toBeTruthy());

    expect(screen.getByText(NOTICE)).toBeTruthy();
    for (const [label, value] of [
      [/Título del Hilo/, 'Planificación'],
      [/Descripción/, 'Semestre dos'],
      [/Categoría/, 'custom'],
      [/Nombre de la categoría personalizada/, 'Convivencia'],
    ] as const) {
      expect(field(label).disabled).toBe(true);
      expect(field(label).value).toBe(value);
    }
    expect(field(/Mensaje Inicial/).disabled).toBe(false);

    fireEvent.change(field(/Mensaje Inicial/), { target: { value: 'Texto corregido' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Crear Hilo'));
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onCreateThread.mock.calls[1][0]).toMatchObject({
      thread_title: 'Planificación',
      description: 'Semestre dos',
      category: 'custom',
      custom_category_name: 'Convivencia',
      initial_message: 'Texto corregido',
    });
  });

  it('another kind of failure leaves the form editable', async () => {
    const onCreateThread = vi.fn().mockRejectedValueOnce(new Error('refused'));
    render(<ThreadCreationModal isOpen onClose={vi.fn()} onCreateThread={onCreateThread} />);
    fill();
    await act(async () => {
      fireEvent.click(screen.getByText('Crear Hilo'));
    });
    await waitFor(() => expect(screen.getByText('Crear Hilo')).toBeTruthy());
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(field(/Título del Hilo/).disabled).toBe(false);
  });

  it('closed and opened again («Nuevo Hilo»), the form is empty and editable', async () => {
    const onCreateThread = vi.fn().mockRejectedValueOnce(incomplete());
    // The page mounts the modal only while it is shown (workspace.tsx).
    const first = render(<ThreadCreationModal isOpen onClose={vi.fn()} onCreateThread={onCreateThread} />);
    fill();
    await act(async () => {
      fireEvent.click(screen.getByText('Crear Hilo'));
    });
    await waitFor(() => expect(screen.getByText(NOTICE)).toBeTruthy());
    first.unmount();

    render(<ThreadCreationModal isOpen onClose={vi.fn()} onCreateThread={onCreateThread} />);
    expect(screen.queryByText(NOTICE)).toBeNull();
    for (const label of [/Título del Hilo/, /Descripción/, /Categoría/, /Mensaje Inicial/]) {
      expect(field(label).disabled).toBe(false);
    }
    expect(field(/Título del Hilo/).value).toBe('');
    expect(field(/Descripción/).value).toBe('');
    expect(field(/Categoría/).value).toBe('general');
    expect(field(/Mensaje Inicial/).value).toBe('');
  });
});
