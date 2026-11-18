// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// react-pdf needs a browser PDF worker; nothing in this test opens a document.
vi.mock('react-pdf', () => ({
  Document: () => null,
  Page: () => null,
  pdfjs: { version: 'test', GlobalWorkerOptions: {} },
}));
vi.mock('react-pdf/dist/esm/Page/AnnotationLayer.css', () => ({}));
vi.mock('react-pdf/dist/esm/Page/TextLayer.css', () => ({}));

import ContractPDFImporter from '../../../components/contracts/ContractPDFImporter';

/**
 * F7c (GES-1.7): before a file is chosen, the import screen says that the
 * document's text is sent to Anthropic (Claude) to be read.
 */
describe('ContractPDFImporter — Anthropic notice', () => {
  it('shows the notice under the instructions before a file is chosen', () => {
    render(<ContractPDFImporter onExtract={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Arrastra un PDF aquí o haz clic para seleccionar')).toBeInTheDocument();
    const notice = screen.getByTestId('pdf-import-anthropic-notice');
    expect(notice).toHaveTextContent('Al importar, el texto del documento se envía a Anthropic (Claude) para leerlo.');
    expect(notice).toHaveClass('text-sm', 'text-gray-500');
  });
});
