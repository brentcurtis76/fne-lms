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

import { toast } from 'react-hot-toast';
import ExpenseReportForm from '../../../components/expenses/ExpenseReportForm';

const h = fake.ref.state as {
  requests: RecordedRequest[];
  respond: (req: RecordedRequest, terminal: string) => { data: unknown; error: unknown };
};
const CATEGORIES = [{ id: 'cat-1', name: 'Transporte', description: '', color: '#000000', is_active: true }];

beforeEach(() => {
  h.requests.length = 0;
  h.respond = (req, terminal) =>
    req.target === 'expense_reports' && terminal === 'single' ? { data: { id: 'new-1' }, error: null } : { data: null, error: null };
  vi.mocked(toast.error).mockClear();
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

/**
 * Send-back 1: an upload remembers the stable key of its row (an existing
 * item's id, or a key made when the row is added — never sent, never stored)
 * and writes its link to that row when it finishes; a row removed meanwhile
 * gets nothing. While a row uploads, its file control is switched off.
 */
const describeRows = (c: HTMLElement) => c.querySelectorAll('h4');
const fillComplete = async (container: HTMLElement, index: number, description: string) => {
  fireEvent.change(screen.getAllByDisplayValue('Seleccionar categoría')[0], { target: { value: 'cat-1' } });
  fireEvent.change(screen.getAllByPlaceholderText('Descripción del gasto')[index], { target: { value: description } });
  fireEvent.change(container.querySelectorAll('input[type="date"]')[2 + index], { target: { value: '2026-11-02' } });
  fireEvent.change(screen.getAllByTestId('expense-amount-input')[index], { target: { value: '5000' } });
  await act(async () => { await Promise.resolve(); }); // the amount's conversion settles
};
const fillReport = (container: HTMLElement) => {
  fireEvent.change(screen.getByPlaceholderText('Ej: Gastos Marzo 2025'), { target: { value: 'Viaje sintético' } });
  const dates = container.querySelectorAll('input[type="date"]');
  fireEvent.change(dates[0], { target: { value: '2026-11-01' } });
  fireEvent.change(dates[1], { target: { value: '2026-11-10' } });
};
const ITEM_COLUMNS = ['id', 'category_id', 'description', 'amount', 'original_amount', 'currency', 'conversion_rate',
  'conversion_date', 'expense_date', 'vendor', 'expense_number', 'receipt_url', 'receipt_filename', 'notes'];

describe('F21h send-back 1 a receipt goes to the row it was uploaded for', () => {
  it('(a) an upload on row 2, row 1 removed before it finishes: the link is on the row that was row 2', async () => {
    const { container } = render(<ExpenseReportForm categories={CATEGORIES} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Descripción del gasto'), { target: { value: 'Taxi' } });
    fireEvent.click(screen.getByText('Agregar Gasto'));
    fireEvent.change(screen.getAllByPlaceholderText('Descripción del gasto')[1], { target: { value: 'Hotel' } });
    fireEvent.change(screen.getAllByPlaceholderText('Nombre del proveedor')[1], { target: { value: 'Hotel Sintético' } });
    choose(fileInputs(container)[1], 'boleta-hotel.pdf');
    await waitFor(() => expect(fake.pending).toHaveLength(1));

    fireEvent.click(screen.getAllByTitle('Eliminar gasto')[0]);
    await waitFor(() => expect(describeRows(container)).toHaveLength(1));
    await act(async () => fake.pending[0].resolve());

    await waitFor(() => expect(screen.getByText(/boleta-hotel\.pdf/)).toBeTruthy());
    expect(screen.queryByDisplayValue('Taxi')).toBeNull();
    expect(screen.getByDisplayValue('Hotel')).toBeTruthy();
    expect(screen.getByDisplayValue('Hotel Sintético')).toBeTruthy();
  });

  it('(b) an upload on a row that is then removed: no row gets the link, no error, the form still saves', async () => {
    const onSuccess = vi.fn();
    const { container } = render(<ExpenseReportForm categories={CATEGORIES} onSuccess={onSuccess} onCancel={vi.fn()} />);
    fillReport(container);
    await fillComplete(container, 0, 'Taxi');
    fireEvent.click(screen.getByText('Agregar Gasto'));
    choose(fileInputs(container)[1], 'boleta-perdida.pdf');
    await waitFor(() => expect(fake.pending).toHaveLength(1));

    fireEvent.click(screen.getAllByTitle('Eliminar gasto')[1]);
    await waitFor(() => expect(describeRows(container)).toHaveLength(1));
    await act(async () => fake.pending[0].resolve());

    expect(screen.queryByText(/boleta-perdida\.pdf/)).toBeNull();
    expect(screen.getByDisplayValue('Taxi')).toBeTruthy();
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Guardar Reporte'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const insert = h.requests.find((r) => r.target === 'expense_items' && r.ops.some((o) => o.method === 'insert'))!;
    const items = insert.ops.find((o) => o.method === 'insert')!.args[0] as any[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ description: 'Taxi', receipt_url: null, receipt_filename: null });
  });

  it('(c) while a row uploads, its file control is off and the other row\'s is not', async () => {
    const { container } = render(<ExpenseReportForm categories={CATEGORIES} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('Agregar Gasto'));
    choose(fileInputs(container)[0], 'boleta-uno.pdf');
    await waitFor(() => expect(fake.pending).toHaveLength(1));
    await waitFor(() => expect((fileInputs(container)[0] as HTMLInputElement).disabled).toBe(true));
    expect((fileInputs(container)[1] as HTMLInputElement).disabled).toBe(false);
    // typing stays possible meanwhile
    fireEvent.change(screen.getAllByPlaceholderText('Descripción del gasto')[0], { target: { value: 'Taxi' } });
    expect(screen.getByDisplayValue('Taxi')).toBeTruthy();
    await act(async () => fake.pending[0].resolve());
    await waitFor(() => expect(screen.getByText(/boleta-uno\.pdf/)).toBeTruthy());
    expect(fileInputs(container)).toHaveLength(1);
    expect((fileInputs(container)[0] as HTMLInputElement).disabled).toBe(false);
  });

  it('(e) the payload of a save holds no row key: an edit (function call) and a new report', async () => {
    const onSuccess = vi.fn();
    const editing = {
      id: 'r-1', report_name: 'Viaje sintético', description: '', start_date: '2026-11-01', end_date: '2026-11-10', status: 'draft',
      expense_items: [{ id: 'i-1', report_id: 'r-1', category_id: 'cat-1', description: 'Taxi', amount: 1000, currency: 'CLP',
        original_amount: 1000, conversion_rate: 1, expense_date: '2026-11-02', vendor: '', expense_number: '', notes: '' }],
    };
    const { container, unmount } = render(
      <ExpenseReportForm categories={CATEGORIES} editingReport={editing} onSuccess={onSuccess} onCancel={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByDisplayValue('Taxi')).toBeTruthy());
    fireEvent.click(screen.getByText('Agregar Gasto'));
    await fillComplete(container, 1, 'Hotel');
    fireEvent.click(screen.getByText('Actualizar Reporte'));
    await waitFor(() => expect(vi.mocked(toast.error).mock.calls).toEqual([]));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const call = h.requests.find((r) => r.kind === 'rpc' && r.target === 'save_expense_report')!;
    const pItems = (call.args as any).p_items as Record<string, unknown>[];
    expect(pItems).toHaveLength(2);
    pItems.forEach((it) => Object.keys(it).forEach((k) => expect(ITEM_COLUMNS).toContain(k)));
    expect(pItems[1]).not.toHaveProperty('id');
    unmount();

    h.requests.length = 0;
    const onCreated = vi.fn();
    const view = render(<ExpenseReportForm categories={CATEGORIES} onSuccess={onCreated} onCancel={vi.fn()} />);
    fillReport(view.container);
    await fillComplete(view.container, 0, 'Taxi');
    fireEvent.click(screen.getByText('Guardar Reporte'));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const insert = h.requests.find((r) => r.target === 'expense_items' && r.ops.some((o) => o.method === 'insert'))!;
    const items = insert.ops.find((o) => o.method === 'insert')!.args[0] as Record<string, unknown>[];
    items.forEach((it) => Object.keys(it).forEach((k) => expect(['report_id', ...ITEM_COLUMNS]).toContain(k)));
  });
});
