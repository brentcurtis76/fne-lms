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

import { toast } from 'react-hot-toast';
import ContractPDFImporter from '../../../components/contracts/ContractPDFImporter';

/**
 * F10a (GES-2.3): the PDF import says and enforces its real limit. The file
 * travels as base64 inside JSON (a third larger), and the route accepts a
 * 4 MB body, so the screen allows 2,9 MB: a larger file is refused before it
 * is sent, with the same message a 413 answer gives. Synthetic bytes only.
 */
const TOO_LARGE =
  'El PDF es demasiado grande para leerlo automáticamente (máximo 2,9 MB). Ingrese los datos manualmente.';
const MB = 1024 * 1024;

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
  fetchSpy = vi.fn(async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: 'respuesta sintética' }),
  }));
  vi.stubGlobal('fetch', fetchSpy);
  (URL as any).createObjectURL = vi.fn(() => 'blob:synthetic');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function choose(container: HTMLElement, sizeBytes: number) {
  const file = new File([new Uint8Array(sizeBytes)], 'contrato-sintetico.pdf', { type: 'application/pdf' });
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

describe('ContractPDFImporter — size limit (GES-2.3)', () => {
  it('says «Máximo 2,9 MB» on the screen', () => {
    render(<ContractPDFImporter onExtract={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/Máximo 2,9 MB/)).toBeInTheDocument();
    expect(screen.queryByText(/10MB/)).not.toBeInTheDocument();
  });

  it('refuses a 3 MB file before sending it, with the too-large message', async () => {
    const { container } = render(<ContractPDFImporter onExtract={vi.fn()} onCancel={vi.fn()} />);
    choose(container, 3 * MB);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(TOO_LARGE));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends a 2,5 MB file to the reader', async () => {
    const { container } = render(<ContractPDFImporter onExtract={vi.fn()} onCancel={vi.fn()} />);
    choose(container, 2.5 * MB);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/contracts/extract-pdf');
    expect(toast.error).not.toHaveBeenCalledWith(TOO_LARGE);
  });

  it('a 413 answer without a JSON body shows the too-large message', async () => {
    fetchSpy.mockImplementation(async () => ({
      ok: false,
      status: 413,
      json: async () => {
        throw new SyntaxError('Unexpected token R in JSON');
      },
    }));
    const { container } = render(<ContractPDFImporter onExtract={vi.fn()} onCancel={vi.fn()} />);
    choose(container, 1 * MB);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(TOO_LARGE), { timeout: 4000 });
  });

  it('a successful extraction of a 2,5 MB file is shown as before', async () => {
    fetchSpy.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        extracted: {
          contract: { numero_contrato: 'SYN-001', fecha_contrato: '2026-01-01', confidence: 0.95 },
          client: { nombre_legal: 'Colegio Sintético', rut: '', confidence: 0.95 },
          financial: { precio_total: 100, moneda: 'UF', confidence: 0.95 },
          overall_confidence: 0.95,
        },
        validationErrors: [],
        existingClient: null,
        requiresReview: false,
      }),
    }));
    const { container } = render(<ContractPDFImporter onExtract={vi.fn()} onCancel={vi.fn()} />);
    choose(container, 2.5 * MB);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Extracción completada con alta confianza'), {
      timeout: 4000,
    });
    expect(toast.error).not.toHaveBeenCalled();
  });
});
