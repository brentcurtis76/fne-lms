// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type RecordedRequest } from '../../helpers/recordingSupabase';

/**
 * F21h (GES-3.29): a receipt upload never puts back an older copy of the form:
 * what was typed while it was in flight stays, and two uploads started
 * together both keep their receipt links. Synthetic data only.
 */

const fake = vi.hoisted(() => ({ ref: null as any, pending: [] as Array<{ name: string; resolve: () => void }> }));
vi.mock('@supabase/auth-helpers-react', async () => {
  const { createRecordingSupabase } = await import('../../helpers/recordingSupabase');
  fake.ref = createRecordingSupabase();
  fake.ref.client.storage = {
    from: () => ({
      upload: (name: string) =>
        new Promise((resolve) => {
          fake.pending.push({ name, resolve: () => resolve({ data: { path: name }, error: null }) });
        }),
    }),
  };
  return { useSupabaseClient: () => fake.ref.client };
});
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { toast, default: toast };
});

(globalThis as any).React = React;

import ExpenseReportForm from '../../../components/expenses/ExpenseReportForm';

const h = fake.ref.state as { requests: RecordedRequest[] };
const CATEGORIES = [{ id: 'cat-1', name: 'Transporte', description: '', color: '#000000', is_active: true }];

beforeEach(() => {
  h.requests.length = 0;
  fake.pending.length = 0;
  (URL as any).createObjectURL = vi.fn(() => 'blob:synthetic');
  (URL as any).revokeObjectURL = vi.fn();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

const fileInputs = (c: HTMLElement) => c.querySelectorAll('input[type="file"]');
const choose = (input: Element, name: string) =>
  fireEvent.change(input, { target: { files: [new File(['x'], name, { type: 'application/pdf' })] } });

describe('F21h GES-3.29 a receipt upload keeps what was typed', () => {
  it('text typed while an upload is in flight is still there after it', async () => {
    const { container } = render(<ExpenseReportForm categories={CATEGORIES} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    choose(fileInputs(container)[0], 'boleta-taxi.pdf');
    await waitFor(() => expect(fake.pending).toHaveLength(1));

    fireEvent.change(screen.getByPlaceholderText('Descripción del gasto'), { target: { value: 'Taxi al aeropuerto' } });
    fireEvent.change(screen.getByPlaceholderText('Nombre del proveedor'), { target: { value: 'Taxi Sintético' } });

    await act(async () => fake.pending[0].resolve());
    await waitFor(() => expect(screen.getByText(/boleta-taxi\.pdf/)).toBeTruthy());
    expect(screen.getByDisplayValue('Taxi al aeropuerto')).toBeTruthy();
    expect(screen.getByDisplayValue('Taxi Sintético')).toBeTruthy();
  });

  it('two uploads started together: both rows keep their receipt links', async () => {
    const { container } = render(<ExpenseReportForm categories={CATEGORIES} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('Agregar Gasto'));
    choose(fileInputs(container)[0], 'boleta-uno.pdf');
    choose(fileInputs(container)[1], 'boleta-dos.pdf');
    await waitFor(() => expect(fake.pending).toHaveLength(2));

    await act(async () => fake.pending[0].resolve());
    await act(async () => fake.pending[1].resolve());
    await waitFor(() => expect(screen.getByText(/boleta-uno\.pdf/)).toBeTruthy());
    expect(screen.getByText(/boleta-dos\.pdf/)).toBeTruthy();
    expect(fileInputs(container)).toHaveLength(0);
  });
});
