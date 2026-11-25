// @vitest-environment jsdom
/**
 * F26b (EC-F3): the attachment preview shows pictures, PDFs, videos and audio
 * through /api/community/message-attachments/<attachment id> (five-minute
 * links for the conversation's readers), and «Abrir» / «Abrir en Nueva
 * Ventana» open that route in a new tab without handing it this window.
 * Never the address stored in the row. Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';

const preview = vi.hoisted(() => ({ supported: true }));
vi.mock('../../../utils/documentUtils', () => ({
  getFileTypeIcon: () => 'FileText',
  getFileTypeColor: () => '#000000',
  formatRelativeTime: () => 'hace un momento',
  isPreviewSupported: () => preview.supported,
}));

import AttachmentPreview from '../../../components/messaging/AttachmentPreview';

const STORED = 'https://example.invalid/storage/v1/object/public/message-attachments/ws-1/m1/archivo';

function attachment(id: string, mime_type: string, file_name: string) {
  return {
    id,
    message_id: 'm1',
    file_name,
    file_size: 1200,
    mime_type,
    storage_path: `${STORED}-${id}`,
    uploaded_by: 'user-2',
    is_active: true,
    created_at: '2026-11-20T10:00:00.000Z',
  };
}

function show(a: ReturnType<typeof attachment>) {
  return render(<AttachmentPreview isOpen onClose={() => undefined} attachment={a as any} onDownload={() => undefined} />);
}

let openMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  preview.supported = true;
  openMock = vi.fn();
  vi.stubGlobal('open', openMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AttachmentPreview — every file through the attachment route (F26b)', () => {
  it('a picture: <img> src is the route; zoom, rotate and «Restablecer» still work', () => {
    const utils = show(attachment('att-img', 'image/png', 'foto.png'));
    const img = utils.getByAltText('foto.png') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/api/community/message-attachments/att-img');
    expect(utils.getByText('100%')).toBeTruthy();
    fireEvent.click(utils.getByText('Restablecer'));
    expect(utils.getByText('100%')).toBeTruthy();
    expect(utils.container.innerHTML).not.toContain('example.invalid');
  });

  it('a PDF: the iframe src is the route with #view=FitH', () => {
    const utils = show(attachment('att-pdf', 'application/pdf', 'acta.pdf'));
    const frame = utils.getByTitle('acta.pdf') as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toBe('/api/community/message-attachments/att-pdf#view=FitH');
    expect(utils.container.innerHTML).not.toContain('example.invalid');
  });

  it('a video and an audio: the <source> src is the route', () => {
    const video = show(attachment('att-vid', 'video/mp4', 'clase.mp4'));
    expect(video.container.querySelector('video source')?.getAttribute('src')).toBe('/api/community/message-attachments/att-vid');
    cleanup();
    const audio = show(attachment('att-aud', 'audio/mpeg', 'nota.mp3'));
    expect(audio.container.querySelector('audio source')?.getAttribute('src')).toBe('/api/community/message-attachments/att-aud');
    expect(audio.container.innerHTML).not.toContain('example.invalid');
  });

  it('«Abrir en Nueva Ventana» opens the route in a new tab with noopener,noreferrer', () => {
    const utils = show(attachment('att-pdf', 'application/pdf', 'acta.pdf'));
    fireEvent.click(utils.getByText('Abrir en Nueva Ventana'));
    expect(openMock).toHaveBeenCalledTimes(1);
    expect(openMock).toHaveBeenCalledWith('/api/community/message-attachments/att-pdf', '_blank', 'noopener,noreferrer');
  });

  it('a file that cannot be previewed: «Abrir» opens the same route the same way', () => {
    preview.supported = false;
    const utils = show(attachment('att-doc', 'application/msword', 'informe.doc'));
    fireEvent.click(utils.getByText('Abrir'));
    expect(openMock).toHaveBeenCalledWith('/api/community/message-attachments/att-doc', '_blank', 'noopener,noreferrer');
  });
});

// F26b send-back 1, point 1: a 6.5-minute video stopped at 2:29 when its
// five-minute link ran out (the store answered 400 to the next range). The
// player now asks the route again and continues at the same position; it
// never builds an address of its own. jsdom has no media pipeline, so the
// element's state (error, paused, currentTime) is set by hand and load()/play()
// are recorded.
describe('AttachmentPreview — a long video or audio renews its link through the route (send-back 1)', () => {
  let load: ReturnType<typeof vi.spyOn>;
  let play: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    // Only the clock is faked (renewal times); React and the DOM keep real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T10:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    load.mockRestore();
    play.mockRestore();
  });

  function mediaState(media: HTMLMediaElement, state: { code: number | null; paused: boolean; at: number }) {
    let at = state.at;
    Object.defineProperty(media, 'error', { configurable: true, get: () => (state.code === null ? null : { code: state.code }) });
    Object.defineProperty(media, 'paused', { configurable: true, get: () => state.paused });
    Object.defineProperty(media, 'currentTime', { configurable: true, get: () => at, set: (v: number) => { at = v; } });
    return state;
  }

  it('a video playing at 2:29 when the link expires: asks the route again, goes back to 2:29 and plays; a later expiry renews again', () => {
    const utils = show(attachment('att-vid', 'video/mp4', 'clase.mp4'));
    const video = utils.container.querySelector('video') as HTMLVideoElement;
    const state = mediaState(video, { code: 2, paused: false, at: 149 });

    fireEvent.error(video);
    expect(load).toHaveBeenCalledTimes(1);
    expect(utils.queryByText('Error al cargar el video')).toBeNull();
    expect(video.querySelector('source')?.getAttribute('src')).toBe('/api/community/message-attachments/att-vid');

    video.currentTime = 0;
    state.code = null;
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(149);
    expect(play).toHaveBeenCalledTimes(1);
    fireEvent.canPlay(video);

    // The next expiry comes minutes later (send-back 2: an error within 60 s gives up).
    vi.setSystemTime(Date.now() + 221_000);
    state.code = 2;
    video.currentTime = 370;
    fireEvent.error(video);
    expect(load).toHaveBeenCalledTimes(2);
    expect(utils.queryByText('Error al cargar el video')).toBeNull();
  });

  it('a paused video sought to 5:00 after the link expired: renewed at 5:00, stays paused', () => {
    const utils = show(attachment('att-vid', 'video/mp4', 'clase.mp4'));
    const video = utils.container.querySelector('video') as HTMLVideoElement;
    mediaState(video, { code: 2, paused: true, at: 300 });
    fireEvent.error(video);
    expect(load).toHaveBeenCalledTimes(1);
    video.currentTime = 0;
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(300);
    expect(play).not.toHaveBeenCalled();
  });

  it('an audio renews the same way', () => {
    const utils = show(attachment('att-aud', 'audio/mpeg', 'nota.mp3'));
    const audio = utils.container.querySelector('audio') as HTMLAudioElement;
    mediaState(audio, { code: 2, paused: false, at: 200 });
    fireEvent.error(audio);
    expect(load).toHaveBeenCalledTimes(1);
    expect(utils.queryByText('Error al cargar el audio')).toBeNull();
    audio.currentTime = 0;
    fireEvent.loadedMetadata(audio);
    expect(audio.currentTime).toBe(200);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('the route refuses the renewal (no longer allowed, file gone): the usual error, no second try', () => {
    const utils = show(attachment('att-vid', 'video/mp4', 'clase.mp4'));
    const video = utils.container.querySelector('video') as HTMLVideoElement;
    mediaState(video, { code: 2, paused: false, at: 149 });
    fireEvent.error(video);
    expect(load).toHaveBeenCalledTimes(1);
    fireEvent.error(video.querySelector('source') as HTMLSourceElement);
    expect(utils.getByText('Error al cargar el video')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('the renewed link fails again before it can play: the usual error, no loop', () => {
    const utils = show(attachment('att-vid', 'video/mp4', 'clase.mp4'));
    const video = utils.container.querySelector('video') as HTMLVideoElement;
    mediaState(video, { code: 2, paused: false, at: 149 });
    fireEvent.error(video);
    fireEvent.error(video);
    expect(load).toHaveBeenCalledTimes(1);
    expect(utils.getByText('Error al cargar el video')).toBeTruthy();
  });

  it('the route refuses the first load (the source cannot be fetched): the usual error as before, no renewal', () => {
    const utils = show(attachment('att-vid', 'video/mp4', 'clase.mp4'));
    const video = utils.container.querySelector('video') as HTMLVideoElement;
    fireEvent.error(video.querySelector('source') as HTMLSourceElement);
    expect(load).not.toHaveBeenCalled();
    expect(utils.getByText('Error al cargar el video')).toBeTruthy();
  });

  // Send-back 2: canplay clears `renewing`, so without a time rule
  // error -> loadedmetadata -> canplay -> error could renew without end.
  it('an error again within 60 seconds of the renewal, after canplay: the usual error, load() only once', () => {
    const utils = show(attachment('att-vid', 'video/mp4', 'clase.mp4'));
    const video = utils.container.querySelector('video') as HTMLVideoElement;
    const state = mediaState(video, { code: 2, paused: false, at: 149 });
    fireEvent.error(video);
    expect(load).toHaveBeenCalledTimes(1);
    state.code = null;
    fireEvent.loadedMetadata(video);
    fireEvent.canPlay(video);
    vi.setSystemTime(Date.now() + 30_000);
    state.code = 2;
    fireEvent.error(video);
    expect(load).toHaveBeenCalledTimes(1);
    expect(utils.getByText('Error al cargar el video')).toBeTruthy();
  });

  it('an error 61 seconds after the renewal, after canplay: renews again, no error', () => {
    const utils = show(attachment('att-vid', 'video/mp4', 'clase.mp4'));
    const video = utils.container.querySelector('video') as HTMLVideoElement;
    const state = mediaState(video, { code: 2, paused: false, at: 149 });
    fireEvent.error(video);
    expect(load).toHaveBeenCalledTimes(1);
    state.code = null;
    fireEvent.loadedMetadata(video);
    fireEvent.canPlay(video);
    vi.setSystemTime(Date.now() + 61_000);
    state.code = 2;
    fireEvent.error(video);
    expect(load).toHaveBeenCalledTimes(2);
    expect(utils.queryByText('Error al cargar el video')).toBeNull();
  });

  it('a file that cannot be decoded: the usual error at once, no renewal', () => {
    const utils = show(attachment('att-vid', 'video/mp4', 'clase.mp4'));
    const video = utils.container.querySelector('video') as HTMLVideoElement;
    mediaState(video, { code: 3, paused: false, at: 10 });
    fireEvent.error(video);
    expect(load).not.toHaveBeenCalled();
    expect(utils.getByText('Error al cargar el video')).toBeTruthy();
  });
});

