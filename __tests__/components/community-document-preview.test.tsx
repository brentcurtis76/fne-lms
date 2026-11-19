// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentPreview from '../../components/documents/DocumentPreview';
import { DocumentWithDetails } from '../../types/documents';

// F12d (EC-S3): the preview never builds a store address itself. When it
// opens it asks the link route (getDocumentLink) for a five-minute signed
// link and uses exactly that to fetch the image or PDF (shown from an object
// address, send-back 2), as the video's source and for «Abrir»; it shows the existing spinner while waiting and a clear message
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

// Send-back 2: pictures and PDFs are fetched whole and shown from an object
// address. jsdom has no object addresses: createObjectURL / revokeObjectURL
// and fetch are stubbed for every test; `created` lists the addresses made.
const OBJECT = /^blob:/;
let created: string[];
let revoke: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;
const okBody = () => ({ ok: true, status: 200, blob: async () => new Blob(['synthetic']) });

beforeEach(() => {
  h.getDocumentLink.mockReset();
  h.getDocumentLink.mockResolvedValue(SIGNED);
  created = [];
  let n = 0;
  (URL as any).createObjectURL = vi.fn(() => { const u = `blob:http://localhost/object-${++n}`; created.push(u); return u; });
  revoke = vi.fn();
  (URL as any).revokeObjectURL = revoke;
  fetchMock = vi.fn(async () => okBody());
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals();
  delete (URL as any).createObjectURL;
  delete (URL as any).revokeObjectURL;
});

describe('repository document preview uses the link route', () => {
  it('an image: the file is fetched from the link the route gave, asked for this document', async () => {
    show('documents/workspace/image.png');
    await waitFor(() => expect(screen.getByAltText('Synthetic preview')).toHaveAttribute('src', created[0]));
    expect(created[0]).toMatch(OBJECT);
    expect(fetchMock).toHaveBeenCalledWith(SIGNED);
    expect(h.getDocumentLink).toHaveBeenCalledWith('doc-1');
  });

  it('a PDF: the frame shows the file fetched from the link the route gave', async () => {
    show('documents/workspace/document.pdf', 'application/pdf');
    await waitFor(() => expect(screen.getByTitle('Synthetic preview')).toHaveAttribute('src', `${created[0]}#view=FitH`));
    expect(created[0]).toMatch(OBJECT);
    expect(fetchMock).toHaveBeenCalledWith(SIGNED);
  });

  it('a video: the source is the link the route gave', async () => {
    const { container } = show('documents/workspace/clip.mp4', 'video/mp4');
    await waitFor(() => expect(container.querySelector('video source')).toHaveAttribute('src', SIGNED));
  });

  it('no address is ever built from the stored value (no public address, not even for an old full address)', async () => {
    const { container } = show('https://synthetic.supabase.co/storage/v1/object/public/resources/documents/ws/root/a.png');
    await waitFor(() => expect(screen.getByAltText('Synthetic preview')).toHaveAttribute('src', expect.stringMatching(OBJECT)));
    expect(fetchMock.mock.calls).toEqual([[SIGNED]]);
    expect(container.innerHTML).not.toContain('/object/public/');
  });

  it('while the link is on its way: the existing spinner, and no image yet', async () => {
    let resolve!: (url: string) => void;
    h.getDocumentLink.mockReturnValue(new Promise<string>((r) => { resolve = r; }));
    const { container } = show('documents/workspace/image.png');
    expect(screen.getByText('Cargando vista previa...')).toBeInTheDocument();
    expect(container.querySelector('img,iframe,video')).toBeNull();
    await act(async () => resolve(SIGNED));
    await waitFor(() => expect(screen.getByAltText('Synthetic preview')).toHaveAttribute('src', expect.stringMatching(OBJECT)));
    expect(fetchMock).toHaveBeenCalledWith(SIGNED);
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
    await waitFor(() => expect(screen.getByAltText('Synthetic preview')).toHaveAttribute('src', expect.stringMatching(OBJECT)));
    expect(fetchMock.mock.calls).toEqual([[SIGNED]]);
    expect(h.getDocumentLink).toHaveBeenCalledTimes(1);

    rerender(<DocumentPreview isOpen={false} onClose={() => {}} document={document} onDownload={() => {}} />);
    now.mockReturnValue(1_000_000 + 3 * 60_000);
    rerender(<DocumentPreview isOpen onClose={() => {}} document={document} onDownload={() => {}} />);
    await waitFor(() => expect(fetchMock.mock.calls).toEqual([[SIGNED], [SIGNED]]));
    expect(h.getDocumentLink).toHaveBeenCalledTimes(1);

    rerender(<DocumentPreview isOpen={false} onClose={() => {}} document={document} onDownload={() => {}} />);
    now.mockReturnValue(1_000_000 + 4 * 60_000 + 1);
    rerender(<DocumentPreview isOpen onClose={() => {}} document={document} onDownload={() => {}} />);
    await waitFor(() => expect(fetchMock.mock.calls).toEqual([[SIGNED], [SIGNED], [SIGNED_2]]));
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

  // Send-back 2: renewal is for a video only (a picture is fetched whole).
  it('after four minutes open: a new link is asked for and the video source changes to it', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    h.getDocumentLink.mockResolvedValueOnce(SIGNED).mockResolvedValueOnce(SIGNED_2);
    const { container } = show('documents/ws/root/clip.mp4', 'video/mp4');
    await waitFor(() => expect(container.querySelector('video source')).toHaveAttribute('src', SIGNED));
    expect(h.getDocumentLink).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(FOUR_MIN); });
    await waitFor(() => expect(container.querySelector('video source')).toHaveAttribute('src', SIGNED_2));
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
    const document = documentOf('doc-1', 'documents/ws/root/clip.mp4', 'video/mp4');
    const { container, rerender } = render(<DocumentPreview isOpen onClose={() => {}} document={document} onDownload={() => {}} />);
    await waitFor(() => expect(container.querySelector('video source')).toHaveAttribute('src', SIGNED));
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

  // Send-back 2: the PDF frame is no longer renewed (it reloaded the PDF and
  // sent the reader back to page 1); it shows the file fetched whole — see
  // "a PDF is shown from an object address" below.

  it('an image whose fetch fails: the retry link is refused too → the existing error panel', async () => {
    h.getDocumentLink.mockResolvedValueOnce(SIGNED).mockRejectedValueOnce(new Error('expired'));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, blob: async () => new Blob([]) });
    const { container } = show('documents/ws/root/a.png');
    await waitFor(() => expect(screen.getByText(FAILED)).toBeInTheDocument());
    expect(h.getDocumentLink).toHaveBeenCalledTimes(2);
    expect(container.querySelector('img,iframe,video')).toBeNull();
  });

  it('an image whose fetch fails twice → the existing «Error al cargar la imagen» panel, nothing more asked', async () => {
    h.getDocumentLink.mockResolvedValueOnce(SIGNED).mockResolvedValueOnce(SIGNED_2);
    fetchMock.mockRejectedValue(new Error('network'));
    show('documents/ws/root/a.png');
    await waitFor(() => expect(screen.getByText('Error al cargar la imagen')).toBeInTheDocument());
    expect(fetchMock.mock.calls).toEqual([[SIGNED], [SIGNED_2]]);
    expect(h.getDocumentLink).toHaveBeenCalledTimes(2);
    expect(created).toHaveLength(0);
  });
});

// Send-back 2 (EC-S3): an open preview no longer depends on a link that
// expires. Pictures and PDFs are fetched ONCE, whole, when the preview opens
// and shown from an object address (blob:) that never expires; videos keep
// streaming from the signed link with the four-minute renewal. One guard
// drops every late completion once the preview has closed or shows another
// document. fetch and URL.createObjectURL / revokeObjectURL are stubbed (jsdom
// has no object addresses).
describe('send-back 2: an open preview does not depend on a link that expires', () => {
  const FOUR_MIN = 4 * 60_000;
  const SIGNED_A = SIGNED.replace('1-a.png', 'a.png');
  const SIGNED_B = SIGNED.replace('1-a.png', 'b.png');
  function deferred<T>() {
    let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  it('a retry for image A that ends after the switch to document B leaves B\'s preview untouched', async () => {
    const fetchA = deferred<any>();
    const retryLinkA = deferred<string>();
    let callsA = 0;
    h.getDocumentLink.mockImplementation((id: string) => {
      if (id === 'doc-a') return ++callsA === 1 ? Promise.resolve(SIGNED_A) : retryLinkA.promise;
      return Promise.resolve(SIGNED_B);
    });
    fetchMock.mockImplementation((url: string) => (url === SIGNED_A ? fetchA.promise : Promise.resolve(okBody())));
    const a = documentOf('doc-a', 'documents/ws/root/a.png');
    const b = { ...documentOf('doc-b', 'documents/ws/root/b.png'), title: 'Synthetic B' } as DocumentWithDetails;
    const { rerender } = render(<DocumentPreview isOpen onClose={() => {}} document={a} onDownload={() => {}} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(SIGNED_A));
    await act(async () => fetchA.reject(new Error('slow failure')));
    await waitFor(() => expect(callsA).toBe(2));
    rerender(<DocumentPreview isOpen onClose={() => {}} document={b} onDownload={() => {}} />);
    await waitFor(() => expect(screen.getByAltText('Synthetic B')).toHaveAttribute('src', expect.stringMatching(/^blob:/)));
    await act(async () => retryLinkA.reject(new Error('retry refused')));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByAltText('Synthetic B')).toHaveAttribute('src', expect.stringMatching(/^blob:/));
    expect(screen.queryByText(FAILED)).toBeNull();
    expect(screen.queryByText('Error al cargar la imagen')).toBeNull();
  });

  it('a video whose retry link is THE SAME address is really reloaded once; a second error → the panel, no third request', async () => {
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    h.getDocumentLink.mockResolvedValue(SIGNED);
    const { container } = show('documents/ws/root/clip.mp4', 'video/mp4');
    await waitFor(() => expect(container.querySelector('video source')).toHaveAttribute('src', SIGNED));
    fireEvent.error(container.querySelector('video') as HTMLVideoElement);
    await waitFor(() => expect(h.getDocumentLink).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Error al cargar el video')).toBeNull();
    expect(container.querySelector('video source')).toHaveAttribute('src', SIGNED);
    fireEvent.error(container.querySelector('video') as HTMLVideoElement);
    await waitFor(() => expect(screen.getByText('Error al cargar el video')).toBeInTheDocument());
    expect(h.getDocumentLink).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('a PDF is shown from an object address, fetched once; ten minutes later no new link and the same source', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    show('documents/ws/root/a.pdf', 'application/pdf');
    await waitFor(() => expect(screen.getByTitle('Synthetic preview')).toHaveAttribute('src', expect.stringMatching(/^blob:.*#view=FitH$/)));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(SIGNED);
    const src = screen.getByTitle('Synthetic preview').getAttribute('src');
    expect(src).not.toContain('/storage/v1/');
    await act(async () => { vi.advanceTimersByTime(10 * 60_000); });
    expect(h.getDocumentLink).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle('Synthetic preview')).toHaveAttribute('src', src!);
  });

  it('an image is shown from an object address, fetched once; ten minutes later no new link and the same source', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    show('documents/ws/root/a.png');
    await waitFor(() => expect(screen.getByAltText('Synthetic preview')).toHaveAttribute('src', expect.stringMatching(/^blob:/)));
    expect(fetchMock).toHaveBeenCalledWith(SIGNED);
    const src = screen.getByAltText('Synthetic preview').getAttribute('src');
    await act(async () => { vi.advanceTimersByTime(10 * 60_000); });
    expect(h.getDocumentLink).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByAltText('Synthetic preview')).toHaveAttribute('src', src!);
  });

  it('a video: after four minutes a new link is asked for and applied; after close no further request', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    h.getDocumentLink.mockResolvedValueOnce(SIGNED).mockResolvedValueOnce(SIGNED_2);
    const document = documentOf('doc-1', 'documents/ws/root/clip.mp4', 'video/mp4');
    const { container, rerender } = render(<DocumentPreview isOpen onClose={() => {}} document={document} onDownload={() => {}} />);
    await waitFor(() => expect(container.querySelector('video source')).toHaveAttribute('src', SIGNED));
    await act(async () => { vi.advanceTimersByTime(FOUR_MIN); });
    await waitFor(() => expect(container.querySelector('video source')).toHaveAttribute('src', SIGNED_2));
    expect(h.getDocumentLink).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
    rerender(<DocumentPreview isOpen={false} onClose={() => {}} document={document} onDownload={() => {}} />);
    await act(async () => { vi.advanceTimersByTime(3 * FOUR_MIN); });
    expect(h.getDocumentLink).toHaveBeenCalledTimes(2);
  });

  it('changing the document and closing the preview release every object address created', async () => {
    h.getDocumentLink.mockImplementation((id: string) => Promise.resolve(id === 'doc-a' ? SIGNED_A : SIGNED_B));
    const a = documentOf('doc-a', 'documents/ws/root/a.png');
    const b = { ...documentOf('doc-b', 'documents/ws/root/b.pdf', 'application/pdf'), title: 'Synthetic B' } as DocumentWithDetails;
    const { rerender } = render(<DocumentPreview isOpen onClose={() => {}} document={a} onDownload={() => {}} />);
    await waitFor(() => expect(screen.getByAltText('Synthetic preview')).toHaveAttribute('src', expect.stringMatching(/^blob:/)));
    rerender(<DocumentPreview isOpen onClose={() => {}} document={b} onDownload={() => {}} />);
    await waitFor(() => expect(screen.getByTitle('Synthetic B')).toHaveAttribute('src', expect.stringMatching(/^blob:/)));
    expect(revoke).toHaveBeenCalledWith(created[0]);
    rerender(<DocumentPreview isOpen={false} onClose={() => {}} document={b} onDownload={() => {}} />);
    expect(created).toHaveLength(2);
    for (const url of created) expect(revoke).toHaveBeenCalledWith(url);
  });
});
