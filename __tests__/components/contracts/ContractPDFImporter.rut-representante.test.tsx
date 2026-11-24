// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// react-pdf needs a browser PDF worker; nothing in this test renders a document.
vi.mock('react-pdf', () => ({
  Document: () => null,
  Page: () => null,
  pdfjs: { version: 'test', GlobalWorkerOptions: {} },
}));
vi.mock('react-pdf/dist/esm/Page/AnnotationLayer.css', () => ({}));
vi.mock('react-pdf/dist/esm/Page/TextLayer.css', () => ({}));
vi.mock('react-hot-toast', () => {
  const toast: any = vi.fn();
  toast.error = vi.fn();
  toast.success = vi.fn();
  return { toast };
});

import ContractPDFImporter from '../../../components/contracts/ContractPDFImporter';

/**
 * F22e, E2: a PDF that gives no representative's RUT passes an EMPTY value
 * on (the contract form then asks for it), never the filler 11.111.111-1.
 * Synthetic data only.
 */
const answer = (client: Record<string, unknown>) => ({
  ok: true,
  status: 200,
  json: async () => ({
    extracted: {
      contract: { numero_contrato: 'SYN-001', fecha_contrato: '2026-01-01', confidence: 0.95 },
      client: { nombre_legal: 'Colegio Sintético', rut: '76.123.456-0', confidence: 0.95, ...client },
      financial: { precio_total: 100, moneda: 'UF', confidence: 0.95 },
      overall_confidence: 0.95,
    },
    validationErrors: [],
    existingClient: null,
    requiresReview: false,
  }),
});

beforeEach(() => {
  (URL as any).createObjectURL = vi.fn(() => 'blob:synthetic');
});
afterEach(() => vi.unstubAllGlobals());

async function importWith(client: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async () => answer(client)));
  const onExtract = vi.fn();
  const { container } = render(<ContractPDFImporter onExtract={onExtract} onCancel={vi.fn()} />);
  const file = new File([new Uint8Array(1024)], 'contrato-sintetico.pdf', { type: 'application/pdf' });
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
  const confirm = screen.getByRole('button', { name: /Confirmar e Importar/ });
  await waitFor(() => expect(confirm).toBeEnabled(), { timeout: 4000 });
  fireEvent.click(confirm);
  await waitFor(() => expect(onExtract).toHaveBeenCalledTimes(1));
  return onExtract.mock.calls[0][0];
}

describe('ContractPDFImporter — the representative\'s RUT', () => {
  it('a PDF without it passes an empty value, not the filler', async () => {
    const data = await importWith({});
    expect(data.client.rut_representante).toBe('');
  });

  it('a RUT the PDF gives is passed on unchanged', async () => {
    const data = await importWith({ rut_representante: '12.345.678-5' });
    expect(data.client.rut_representante).toBe('12.345.678-5');
  });
});
