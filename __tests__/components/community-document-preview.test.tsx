// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentPreview from '../../components/documents/DocumentPreview';
import { DocumentWithDetails } from '../../types/documents';

// F12d (EC-S3): the preview never builds a store address itself. When it
// opens it asks the link route (getDocumentLink) for a five-minute signed
// link and uses exactly that for the image, the PDF frame, the video and
// «Abrir»; it shows the existing spinner while waiting and a clear message
// when no link comes; it asks again once a link is four minutes old. The
// stored value (storage_path) is never used as an address. Synthetic data.

const h = vi.hoisted(() => ({ getDocumentLink: vi.fn() }));
vi.mock('../../utils/documentUtils', () => ({
  isPreviewSupported: () => true, getFileTypeIcon: () => 'FileText',
  getFileTypeColor: () => '#000', formatRelativeTime: () => 'Ahora',
  getDocumentLink: (...args: unknown[]) => h.getDocumentLink(...args),
}));

const SIGNED = 'http://127.0.0.1:54321/storage/v1/object/sign/community-documents/documents/ws/root/1-a.png?token=t1';
const SIGNED_2 = 'http://127.0.0.1:54321/storage/v1/object/sign/community-documents/documents/ws/root/1-a.png?token=t2';
const FAILED = 'No se pudo abrir el documento. Inténtalo de nuevo.';

function documentOf(id: string, storage_path: string, mime_type = 'image/png') {
  return { id, title: 'Synthetic preview', file_name: 'synthetic.png',
    file_size: 10, storage_path, mime_type, created_at: '2026-10-06', tags: [],
    view_count: 0, download_count: 0, version_number: 1 } as unknown as DocumentWithDetails;
}
function show(storage_path: string, mime_type = 'image/png', id = 'doc-1') {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://synthetic.supabase.co');
  const document = documentOf(id, storage_path, mime_type);
  const view = render(<DocumentPreview isOpen onClose={() => {}} document={document} onDownload={() => {}} />);
  return { ...view, document };
}

beforeEach(() => {
  h.getDocumentLink.mockReset();
  h.getDocumentLink.mockResolvedValue(SIGNED);
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('repository document preview uses the link route', () => {
  it('an image: the src is the link the route gave, asked for this document', async () => {
    show('documents/workspace/image.png');
    await waitFor(() => expect(screen.getByAltText('Synthetic preview')).toHaveAttribute('src', SIGNED));
    expect(h.getDocumentLink).toHaveBeenCalledWith('doc-1');
  });

  it('a PDF: the frame shows the link the route gave', async () => {
    show('documents/workspace/document.pdf', 'application/pdf');
    await waitFor(() => expect(screen.getByTitle('Synthetic preview')).toHaveAttribute('src', `${SIGNED}#view=FitH`));
  });

  it('a video: the source is the link the route gave', async () => {
    const { container } = show('documents/workspace/clip.mp4', 'video/mp4');
    await waitFor(() => expect(container.querySelector('video source')).toHaveAttribute('src', SIGNED));
  });

  it('no address is ever built from the stored value (no public address, not even for an old full address)', async () => {
    const { container } = show('https://synthetic.supabase.co/storage/v1/object/public/resources/documents/ws/root/a.png');
    await waitFor(() => expect(screen.getByAltText('Synthetic preview')).toHaveAttribute('src', SIGNED));
    expect(container.innerHTML).not.toContain('/object/public/');
  });

  it('while the link is on its way: the existing spinner, and no image yet', async () => {
    let resolve!: (url: string) => void;
    h.getDocumentLink.mockReturnValue(new Promise<string>((r) => { resolve = r; }));
    const { container } = show('documents/workspace/image.png');
    expect(screen.getByText('Cargando vista previa...')).toBeInTheDocument();
    expect(container.querySelector('img,iframe,video')).toBeNull();
    await act(async () => resolve(SIGNED));
    await waitFor(() => expect(screen.getByAltText('Synthetic preview')).toHaveAttribute('src', SIGNED));
  });

  it('no link (refused, expired session, network) → «No se pudo abrir el documento. Inténtalo de nuevo.» and nothing loaded', async () => {
    h.getDocumentLink.mockRejectedValue(new Error('failed'));
    const { container } = show('documents/workspace/image.png');
    await waitFor(() => expect(screen.getByText(FAILED)).toBeInTheDocument());
    expect(container.querySelector('img,iframe,video')).toBeNull();
  });
});

describe('«Abrir» for a file that cannot be previewed', () => {
  it('reserves the tab first, then points it at a fresh link; no store address is opened directly', async () => {
    vi.resetModules();
    vi.doMock('../../utils/documentUtils', () => ({
      isPreviewSupported: () => false, getFileTypeIcon: () => 'File',
      getFileTypeColor: () => '#000', formatRelativeTime: () => 'Ahora',
      getDocumentLink: (...args: unknown[]) => h.getDocumentLink(...args),
    }));
    const { default: Preview } = await import('../../components/documents/DocumentPreview');
    let resolve!: (url: string) => void;
    h.getDocumentLink.mockReturnValue(new Promise<string>((r) => { resolve = r; }));
    const tab = { opener: {} as unknown, location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as any);
    render(<Preview isOpen onClose={() => {}} document={documentOf('doc-z', 'documents/ws/root/a.zip', 'application/zip')} onDownload={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Abrir/ }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(tab.opener).toBeNull();
    expect(tab.location.href).toBe('');
    await act(async () => resolve(SIGNED));
    await waitFor(() => expect(tab.location.href).toBe(SIGNED));
    expect(h.getDocumentLink).toHaveBeenCalledWith('doc-z');
    vi.doUnmock('../../utils/documentUtils');
  });

  it('no link → the reserved tab is closed and the message is shown', async () => {
    vi.resetModules();
    vi.doMock('../../utils/documentUtils', () => ({
      isPreviewSupported: () => false, getFileTypeIcon: () => 'File',
      getFileTypeColor: () => '#000', formatRelativeTime: () => 'Ahora',
      getDocumentLink: (...args: unknown[]) => h.getDocumentLink(...args),
    }));
    const { default: Preview } = await import('../../components/documents/DocumentPreview');
    h.getDocumentLink.mockRejectedValue(new Error('failed'));
    const tab = { opener: {} as unknown, location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as any);
    render(<Preview isOpen onClose={() => {}} document={documentOf('doc-z', 'documents/ws/root/a.zip', 'application/zip')} onDownload={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Abrir/ }));
    await waitFor(() => expect(tab.close).toHaveBeenCalled());
    expect(tab.location.href).toBe('');
    await waitFor(() => expect(screen.getByText(FAILED)).toBeInTheDocument());
    vi.doUnmock('../../utils/documentUtils');
  });
});

describe('a link is not kept longer than four minutes', () => {
  it('reopened within four minutes → the same link; reopened later → asked again', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    h.getDocumentLink.mockResolvedValueOnce(SIGNED).mockResolvedValueOnce(SIGNED_2);
    const document = documentOf('doc-1', 'documents/ws/root/a.png');
    const { rerender } = render(<DocumentPreview isOpen onClose={() => {}} document={document} onDownload={() => {}} />);
    await waitFor(() => expect(screen.getByAltText('Synthetic preview')).toHaveAttribute('src', SIGNED));
    expect(h.getDocumentLink).toHaveBeenCalledTimes(1);

    rerender(<DocumentPreview isOpen={false} onClose={() => {}} document={document} onDownload={() => {}} />);
    now.mockReturnValue(1_000_000 + 3 * 60_000);
    rerender(<DocumentPreview isOpen onClose={() => {}} document={document} onDownload={() => {}} />);
    await waitFor(() => expect(screen.getByAltText('Synthetic preview')).toHaveAttribute('src', SIGNED));
    expect(h.getDocumentLink).toHaveBeenCalledTimes(1);

    rerender(<DocumentPreview isOpen={false} onClose={() => {}} document={document} onDownload={() => {}} />);
    now.mockReturnValue(1_000_000 + 4 * 60_000 + 1);
    rerender(<DocumentPreview isOpen onClose={() => {}} document={document} onDownload={() => {}} />);
    await waitFor(() => expect(screen.getByAltText('Synthetic preview')).toHaveAttribute('src', SIGNED_2));
    expect(h.getDocumentLink).toHaveBeenCalledTimes(2);
  });
});

// Send-back 1 (EC-S3): a preview that stays OPEN must not keep a link that
// dies after five minutes. While it is open a fresh link is asked for every
// four minutes and swapped in (a video keeps its position and playing
// state); on a media or frame load error ONE fresh link is tried before the
// error panel is shown. Only setInterval/clearInterval/Date are faked, so
// waitFor keeps its real timeouts.
describe('an open preview renews its link', () => {
  const FOUR_MIN = 4 * 60_000;
  const SIGNED_3 = SIGNED.replace('t1', 't3');

  it('after four minutes open: a new link is asked for and the image source changes to it', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    h.getDocumentLink.mockResolvedValueOnce(SIGNED).mockResolvedValueOnce(SIGNED_2);
    show('documents/ws/root/a.png');
    await waitFor(() => expect(screen.getByAltText('Synthetic preview')).toHaveAttribute('src', SIGNED));
    expect(h.getDocumentLink).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(FOUR_MIN); });
    await waitFor(() => expect(screen.getByAltText('Synthetic preview')).toHaveAttribute('src', SIGNED_2));
    expect(h.getDocumentLink).toHaveBeenCalledTimes(2);
    expect(h.getDocumentLink).toHaveBeenLastCalledWith('doc-1');
  });

  it('a video keeps its position and keeps playing across the swap', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    h.getDocumentLink.mockResolvedValueOnce(SIGNED).mockResolvedValueOnce(SIGNED_2);
    const { container } = show('documents/ws/root/clip.mp4', 'video/mp4');
    await waitFor(() => expect(container.querySelector('video source')).toHaveAttribute('src', SIGNED));
    const video = container.querySelector('video') as HTMLVideoElement;
    let position = 0;
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => position, set: (v: number) => { position = v; } });
    Object.defineProperty(video, 'paused', { configurable: true, get: () => false });
    position = 312.5;
    await act(async () => { vi.advanceTimersByTime(FOUR_MIN); });
    await waitFor(() => expect(container.querySelector('video source')).toHaveAttribute('src', SIGNED_2));
    expect(container.querySelector('video')).toBe(video);
    expect(load).toHaveBeenCalledTimes(1);
    position = 0; // load() starts the element from the beginning
    fireEvent(video, new Event('loadedmetadata'));
    expect(position).toBe(312.5);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('the timer stops when the preview closes', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const document = documentOf('doc-1', 'documents/ws/root/a.png');
    const { rerender } = render(<DocumentPreview isOpen onClose={() => {}} document={document} onDownload={() => {}} />);
    await waitFor(() => expect(screen.getByAltText('Synthetic preview')).toHaveAttribute('src', SIGNED));
    rerender(<DocumentPreview isOpen={false} onClose={() => {}} document={document} onDownload={() => {}} />);
    await act(async () => { vi.advanceTimersByTime(3 * FOUR_MIN); });
    expect(h.getDocumentLink).toHaveBeenCalledTimes(1);
  });

  it('a video load error: ONE new link is asked for and the source retried before the error panel', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    h.getDocumentLink.mockResolvedValueOnce(SIGNED).mockResolvedValueOnce(SIGNED_2).mockResolvedValueOnce(SIGNED_3);
    const { container } = show('documents/ws/root/clip.mp4', 'video/mp4');
    await waitFor(() => expect(container.querySelector('video source')).toHaveAttribute('src', SIGNED));
    fireEvent.error(container.querySelector('video') as HTMLVideoElement);
    await waitFor(() => expect(container.querySelector('video source')).toHaveAttribute('src', SIGNED_2));
    expect(h.getDocumentLink).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Error al cargar el video')).toBeNull();
    fireEvent.error(container.querySelector('video') as HTMLVideoElement);
    await waitFor(() => expect(screen.getByText('Error al cargar el video')).toBeInTheDocument());
    expect(h.getDocumentLink).toHaveBeenCalledTimes(2);
  });

  // A frame has no load-error event React passes on (nor does a browser fire
  // one when the store answers an error inside a frame), so the PDF frame is
  // kept alive by the four-minute renewal only.
  it('a PDF frame left open: after four minutes its source is the new link', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    h.getDocumentLink.mockResolvedValueOnce(SIGNED).mockResolvedValueOnce(SIGNED_2);
    show('documents/ws/root/a.pdf', 'application/pdf');
    await waitFor(() => expect(screen.getByTitle('Synthetic preview')).toHaveAttribute('src', `${SIGNED}#view=FitH`));
    await act(async () => { vi.advanceTimersByTime(FOUR_MIN); });
    await waitFor(() => expect(screen.getByTitle('Synthetic preview')).toHaveAttribute('src', `${SIGNED_2}#view=FitH`));
  });

  it('the retry link is refused too → the existing error panel', async () => {
    h.getDocumentLink.mockResolvedValueOnce(SIGNED).mockRejectedValueOnce(new Error('expired'));
    show('documents/ws/root/a.png');
    await waitFor(() => expect(screen.getByAltText('Synthetic preview')).toHaveAttribute('src', SIGNED));
    fireEvent.error(screen.getByAltText('Synthetic preview'));
    await waitFor(() => expect(screen.getByText('Error al cargar la imagen')).toBeInTheDocument());
    expect(h.getDocumentLink).toHaveBeenCalledTimes(2);
  });
});
