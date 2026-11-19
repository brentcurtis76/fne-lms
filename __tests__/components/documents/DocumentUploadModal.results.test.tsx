// @vitest-environment jsdom
// GENERA fixes F18e (EC-D7, EC-D8): the upload window shows each file's own
// outcome, keeps only the failed files for another try, and closes itself
// only when nothing failed. Invented files only; uploadDocument is faked.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  uploadDocument: vi.fn(),
}));

vi.mock('../../../lib/supabase-wrapper', () => ({ supabase: {} }));
vi.mock('../../../utils/workspaceUtils', () => ({ getUserWorkspaceAccess: vi.fn() }));
vi.mock('../../../utils/documentUtils', async () => {
  const actual = await vi.importActual<typeof import('../../../utils/documentUtils')>('../../../utils/documentUtils');
  return {
    ...actual,
    uploadDocument: (...args: unknown[]) => h.uploadDocument(...args),
    createFolder: vi.fn(),
  };
});

import DocumentUploadModal from '../../../components/documents/DocumentUploadModal';

const pdf = (name: string) => new File([new Uint8Array([37, 80, 68, 70])], name, { type: 'application/pdf' });
const record = (id: string, name: string) => ({ id, file_name: name, title: 'Actas' });
const STORE_FAILED = 'No se pudo subir el archivo. Inténtalo de nuevo.';

function open() {
  const onUploadComplete = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <DocumentUploadModal
      isOpen
      onClose={onClose}
      workspaceId="ws-A"
      folders={[]}
      onUploadComplete={onUploadComplete}
      userId="user-1"
    />
  );
  return { ...utils, onUploadComplete, onClose };
}

function choose(container: HTMLElement, files: File[]) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
}

function setTitle(value: string) {
  fireEvent.change(screen.getByPlaceholderText('Título del documento'), { target: { value } });
}

const selectedNames = () => screen.queryAllByTestId('upload-selected-file').map((el) => el.getAttribute('data-file-name'));

beforeEach(() => {
  h.uploadDocument = vi.fn();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DocumentUploadModal: each file reports for itself (F18e)', () => {
  it('three files, the middle one fails: 1 and 3 marked uploaded, 2 failed with its message; onUploadComplete gets the two; the window stays open with only file 2; «Subir» again sends file 2 only', async () => {
    const [uno, dos, tres] = [pdf('Uno.pdf'), pdf('Dos.pdf'), pdf('Tres.pdf')];
    h.uploadDocument = vi.fn(async (_ws: string, data: { files: File[] }) => {
      const f = data.files[0];
      return f.name === 'Dos.pdf'
        ? { uploaded: [], failed: [{ fileName: f.name, message: STORE_FAILED }], warnings: [] }
        : { uploaded: [record(`doc-${f.name}`, f.name)], failed: [], warnings: [] };
    });
    const { container, onUploadComplete, onClose } = open();
    choose(container, [uno, dos, tres]);
    setTitle('Actas');
    fireEvent.click(screen.getByRole('button', { name: /^Subir Documentos/ }));

    await waitFor(() => expect(onUploadComplete).toHaveBeenCalledTimes(1));
    expect(onUploadComplete).toHaveBeenCalledWith([record('doc-Uno.pdf', 'Uno.pdf'), record('doc-Tres.pdf', 'Tres.pdf')]);

    const results = screen.getAllByTestId('upload-result');
    expect(results.map((el) => [el.getAttribute('data-file-name'), el.getAttribute('data-status')])).toEqual([
      ['Uno.pdf', 'success'],
      ['Dos.pdf', 'error'],
      ['Tres.pdf', 'success'],
    ]);
    expect(within(results[1]).getByText(STORE_FAILED)).toBeTruthy();
    expect(selectedNames()).toEqual(['Dos.pdf']);

    await new Promise((r) => setTimeout(r, 1700));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Subir Documentos', { selector: 'h2' })).toBeTruthy();

    h.uploadDocument.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /^Subir Documentos/ }));
    await waitFor(() => expect(h.uploadDocument).toHaveBeenCalled());
    const sent = h.uploadDocument.mock.calls.flatMap((c) => (c[1] as { files: File[] }).files.map((f) => f.name));
    expect(sent).toEqual(['Dos.pdf']);
  });

  it('nothing failed: onUploadComplete gets every document and the window closes itself, as today', async () => {
    h.uploadDocument = vi.fn(async (_ws: string, data: { files: File[] }) => ({
      uploaded: data.files.map((f) => record(`doc-${f.name}`, f.name)), failed: [], warnings: [],
    }));
    const { container, onUploadComplete, onClose } = open();
    choose(container, [pdf('Uno.pdf'), pdf('Dos.pdf')]);
    setTitle('Actas');
    fireEvent.click(screen.getByRole('button', { name: /^Subir Documentos/ }));
    await waitFor(() => expect(onUploadComplete).toHaveBeenCalledTimes(1));
    expect((onUploadComplete.mock.calls[0][0] as unknown[]).length).toBe(2);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it('every file fails: onUploadComplete is not called, the window stays open with every file', async () => {
    h.uploadDocument = vi.fn(async (_ws: string, data: { files: File[] }) => ({
      uploaded: [], failed: data.files.map((f) => ({ fileName: f.name, message: STORE_FAILED })), warnings: [],
    }));
    const { container, onUploadComplete, onClose } = open();
    choose(container, [pdf('Uno.pdf'), pdf('Dos.pdf')]);
    setTitle('Actas');
    fireEvent.click(screen.getByRole('button', { name: /^Subir Documentos/ }));
    await waitFor(() => expect(screen.getAllByTestId('upload-result')).toHaveLength(2));
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(selectedNames()).toEqual(['Uno.pdf', 'Dos.pdf']);
  });

  it('a warning (saved without its version history) is shown for that file', async () => {
    const WARNING = 'El documento se guardó, pero no su historial de versiones.';
    h.uploadDocument = vi.fn(async (_ws: string, data: { files: File[] }) => ({
      uploaded: [record('doc-1', data.files[0].name)], failed: [], warnings: [{ fileName: data.files[0].name, message: WARNING }],
    }));
    const { container } = open();
    choose(container, [pdf('Uno.pdf')]);
    setTitle('Acta');
    fireEvent.click(screen.getByRole('button', { name: /^Subir Documentos/ }));
    const result = await screen.findByTestId('upload-result');
    expect(result.getAttribute('data-status')).toBe('success');
    expect(within(result).getByText(WARNING)).toBeTruthy();
  });

  it('the title field refuses a 201st character (maxLength 200)', () => {
    open();
    expect(screen.getByPlaceholderText('Título del documento').getAttribute('maxLength')).toBe('200');
  });
});
