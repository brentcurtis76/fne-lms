// @vitest-environment jsdom
// EC-V7 (GENERA fixes F18 build D): a failed publish keeps the composition and
// shows a Spanish sentence in the window; the next «Publicar» sends the SAME
// composition id, so the post can exist only once. Synthetic text and files.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

(globalThis as any).React = React;

const editorState = vi.hoisted(() => ({ text: '', clearContent: null as any }));

vi.mock('@tiptap/react', () => ({
  useEditor: () => ({
    getText: () => editorState.text,
    getJSON: () => ({ type: 'doc', content: [] }),
    commands: { clearContent: editorState.clearContent },
  }),
  EditorContent: () => null,
  ReactRenderer: class {},
}));
vi.mock('@tiptap/starter-kit', () => ({ default: {} }));
vi.mock('@tiptap/extension-mention', () => ({ default: { configure: () => ({}) } }));
vi.mock('tippy.js', () => ({ default: () => [] }));
vi.mock('../../../components/feed/MentionList', () => ({ default: () => null }));

import CreatePostModal from '../../../components/feed/CreatePostModal';

const WORKSPACE_ID = '0b9c1d1e-2f3a-4b5c-8d6e-7f8091a2b3c4';
const UPLOAD_FAILED = 'No se pudo subir «acta.pdf». La publicación no se guardó; inténtalo de nuevo.';

function publishError(message: string) {
  const error = new Error(message);
  error.name = 'FeedPublishError';
  return error;
}

function Harness({ onSubmit, onClose }: { onSubmit: any; onClose?: () => void }) {
  const [open, setOpen] = React.useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>abrir</button>
      <CreatePostModal
        isOpen={open}
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
        onSubmit={onSubmit}
        authorName="Autora Sintética"
        workspaceId={WORKSPACE_ID}
      />
    </>
  );
}

const publish = () => fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
const attach = (container: HTMLElement, file: File) =>
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });

describe('CreatePostModal retry (EC-V7)', () => {
  let alertSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    editorState.text = 'Acta de la reunión';
    editorState.clearContent = vi.fn();
    alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a failed publish keeps the text and the files, shows the Spanish sentence, and the retry sends the SAME id', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(publishError(UPLOAD_FAILED)).mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    const { container } = render(<Harness onSubmit={onSubmit} onClose={onClose} />);
    attach(container, new File(['x'], 'acta.pdf', { type: 'application/pdf' }));

    publish();
    expect(await screen.findByRole('alert')).toHaveTextContent(UPLOAD_FAILED);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(editorState.clearContent).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('acta.pdf')).toBeInTheDocument();

    const [firstInput, firstId] = onSubmit.mock.calls[0];
    expect(firstId).toMatch(/^[0-9a-f-]{36}$/);
    expect(firstInput.media.map((f: File) => f.name)).toEqual(['acta.pdf']);

    publish();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][1]).toBe(firstId);
    expect(onSubmit.mock.calls[1][0].media.map((f: File) => f.name)).toEqual(['acta.pdf']);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('a raw English error is never shown: the person reads a Spanish sentence', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('SYNTHETIC duplicate key value violates unique constraint'));
    render(<Harness onSubmit={onSubmit} />);

    publish();
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('No se pudo publicar. Inténtalo de nuevo.');
    expect(notice).not.toHaveTextContent('SYNTHETIC');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('closing and reopening the window gives a new id', async () => {
    const onSubmit = vi.fn().mockRejectedValue(publishError(UPLOAD_FAILED));
    const { container } = render(<Harness onSubmit={onSubmit} />);

    publish();
    await screen.findByRole('alert');
    // The window's backdrop closes it (the same handleClose as its X button).
    fireEvent.click(container.querySelector('.transition-opacity')!);
    fireEvent.click(screen.getByRole('button', { name: 'abrir' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    publish();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(onSubmit.mock.calls[1][1]).not.toBe(onSubmit.mock.calls[0][1]);
  });

  // Send-back 1: the composition id stands for one exact selection of files.
  const removeButtonOf = (name: string) =>
    screen.getByText(name).closest('div.flex')!.querySelector('button') as HTMLButtonElement;

  it('(a) a failed publish, then the file is removed and another picked: a DIFFERENT id', async () => {
    const onSubmit = vi.fn().mockRejectedValue(publishError(UPLOAD_FAILED));
    const { container } = render(<Harness onSubmit={onSubmit} />);
    attach(container, new File(['x'], 'acta.pdf', { type: 'application/pdf' }));
    publish();
    await screen.findByRole('alert');

    fireEvent.click(removeButtonOf('acta.pdf'));
    attach(container, new File(['y'], 'otra-acta.pdf', { type: 'application/pdf' }));
    publish();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));

    expect(onSubmit.mock.calls[1][0].media.map((f: File) => f.name)).toEqual(['otra-acta.pdf']);
    expect(onSubmit.mock.calls[1][1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(onSubmit.mock.calls[1][1]).not.toBe(onSubmit.mock.calls[0][1]);
  });

  it('(b) a failed publish, then only the text is edited: the SAME id', async () => {
    const onSubmit = vi.fn().mockRejectedValue(publishError(UPLOAD_FAILED));
    const { container } = render(<Harness onSubmit={onSubmit} />);
    attach(container, new File(['x'], 'acta.pdf', { type: 'application/pdf' }));
    publish();
    await screen.findByRole('alert');

    editorState.text = 'Acta de la reunión, corregida';
    publish();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));

    expect(onSubmit.mock.calls[1][0].content.text).toBe('Acta de la reunión, corregida');
    expect(onSubmit.mock.calls[1][1]).toBe(onSubmit.mock.calls[0][1]);
  });

  it('(c) a failed publish with two files, then the second is removed: a DIFFERENT id', async () => {
    const onSubmit = vi.fn().mockRejectedValue(publishError(UPLOAD_FAILED));
    const { container } = render(<Harness onSubmit={onSubmit} />);
    attach(container, new File(['x'], 'acta-1.pdf', { type: 'application/pdf' }));
    attach(container, new File(['y'], 'acta-2.pdf', { type: 'application/pdf' }));
    publish();
    await screen.findByRole('alert');
    expect(onSubmit.mock.calls[0][0].media.map((f: File) => f.name)).toEqual(['acta-1.pdf', 'acta-2.pdf']);

    fireEvent.click(removeButtonOf('acta-2.pdf'));
    publish();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));

    expect(onSubmit.mock.calls[1][0].media.map((f: File) => f.name)).toEqual(['acta-1.pdf']);
    expect(onSubmit.mock.calls[1][1]).not.toBe(onSubmit.mock.calls[0][1]);
  });

  it('a successful publish clears the id: the next composition gets a new one', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<Harness onSubmit={onSubmit} />);

    publish();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'abrir' }));
    publish();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][1]).not.toBe(onSubmit.mock.calls[0][1]);
  });
});
