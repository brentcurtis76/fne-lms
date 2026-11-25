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
