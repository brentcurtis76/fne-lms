// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import DocumentPreview from '@/components/licitaciones/DocumentPreview';
import ArchiveView from '@/components/licitaciones/ArchiveView';
import DocumentCenter from '@/components/licitaciones/DocumentCenter';
import { extractDocxText, getPreviewType } from '@/lib/licitaciones/documentPreview';
import type { LicitacionDocumento } from '@/types/licitaciones';

const doc: LicitacionDocumento = { id: 'doc-1', licitacion_id: 'lic-1', tipo: 'anexos', nombre: 'Documento sintético', file_name: 'ejemplo.pdf', storage_path: 'private/test.pdf', created_at: '2026-09-23' };
const fetchMock = vi.fn();
const download = vi.fn();
const createUrl = vi.fn(() => 'blob:preview');
const revokeUrl = vi.fn();
const signed = { ok: true, json: async () => ({ data: { signedUrl: 'http://localhost/storage/signed' } }) };
const file = { ok: true, headers: new Headers(), blob: async () => new Blob(['synthetic']) };

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('URL', class extends URL { static createObjectURL = createUrl; static revokeObjectURL = revokeUrl; });
  fetchMock.mockImplementation(async (url: string) => url.includes('download-doc') ? signed : file);
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

function open(documento = doc) {
  render(<DocumentPreview licitacionId="lic-1" documento={documento} onDownload={download} />);
  fireEvent.click(screen.getByRole('button', { name: `Vista previa de ${documento.nombre}` }));
}

describe('Bidding document preview', () => {
  it('uses the scoped signing route, renders PDF inline and revokes its blob on close', async () => {
    open();
    await screen.findByTitle(`Vista previa de ${doc.nombre}`);
    expect(fetchMock).toHaveBeenCalledWith('/api/licitaciones/lic-1/download-doc?doc_id=doc-1', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.getByTitle(`Vista previa de ${doc.nombre}`)).toHaveAttribute('src', 'blob:preview');
    expect(download).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar vista previa' }));
    expect(revokeUrl).toHaveBeenCalledWith('blob:preview');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('shows a permission error without requesting storage, and supports retry', async () => {
    let denied = true;
    fetchMock.mockImplementation(async (url: string) => url.includes('download-doc') ? (denied ? { ok: false, status: 403 } : signed) : file);
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    denied = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByTitle(`Vista previa de ${doc.nombre}`);
  });
  it('cancels pending previews on close and ignores late responses', async () => {
    let resolve!: (value: typeof signed) => void;
    fetchMock.mockImplementation((url: string) => url.includes('download-doc') ? new Promise(r => { resolve = r; }) : Promise.resolve(file));
    open();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando');
    const signal = fetchMock.mock.calls[0][1].signal;
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar vista previa' }));
    expect(signal.aborted).toBe(true);
    resolve(signed);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(createUrl).not.toHaveBeenCalled();
  });
  it('previews images without triggering download', async () => {
    open({ ...doc, file_name: 'imagen.png' });
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'blob:preview');
    expect(download).not.toHaveBeenCalled();
  });
  it('offers explicit download for unsupported legacy Word without fetching', async () => {
    open({ ...doc, file_name: 'legacy.doc' });
    expect(screen.getByText(/Este formato no admite/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Descargar documento' }));
    expect(download).toHaveBeenCalledTimes(1);
  });
  it('rejects oversized documents before requesting a URL', async () => {
    open({ ...doc, file_size: 26 * 1024 * 1024 });
    expect(await screen.findByRole('alert')).toHaveTextContent('supera los 25 MB');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([ArchiveView, DocumentCenter])('includes preview for anexos in %p', async Component => {
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ data: { documentos: [doc] } }) }));
    render(<Component licitacionId="lic-1" />);
    expect(await screen.findByRole('button', { name: `Vista previa de ${doc.nombre}` })).toBeInTheDocument();
  });
});

describe('local DOCX text extraction', () => {
  async function word(xml: string) {
    const zip = new JSZip(); zip.file('word/document.xml', xml);
    return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  }
  it('extracts paragraph text, leaves markup escaped and ignores remote links/images', async () => {
    const text = await extractDocxText(await word('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>&lt;script&gt;alert(1)&lt;/script&gt;</w:t></w:r></w:p><w:p><w:r><w:t>Texto sintético</w:t></w:r></w:p></w:document>'));
    expect(text).toBe('<script>alert(1)</script>\n\nTexto sintético');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('preserves Word tabs, line breaks and table cell paragraphs', async () => {
    const text = await extractDocxText(await word('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Celda A</w:t><w:tab/><w:t>Valor</w:t><w:br/><w:t>Otra línea</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Celda B</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:document>'));
    expect(text).toBe('Celda A\tValor\nOtra línea\n\nCelda B');
  });
  it('rejects XML entity declarations', async () => {
    await expect(extractDocxText(await word('<!DOCTYPE doc [<!ENTITY x SYSTEM "https://example.invalid">]><doc/>'))).rejects.toThrow('XML no permitido');
  });
  it('bounds decompression of oversized XML', async () => {
    await expect(extractDocxText(await word('a'.repeat(5 * 1024 * 1024 + 1)))).rejects.toThrow('demasiado grande');
  });
  it('rejects corrupt Word archives', async () => {
    await expect(extractDocxText(new ArrayBuffer(4))).rejects.toThrow();
  });
  it('does not treat HTML or SVG as active preview content', () => {
    expect(getPreviewType({ file_name: 'unsafe.svg', mime_type: 'image/svg+xml' }).kind).toBe('unsupported');
    expect(getPreviewType({ file_name: 'unsafe.html', mime_type: 'text/html' }).kind).toBe('unsupported');
  });
});
