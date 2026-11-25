// @vitest-environment jsdom
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

/**
 * EC-M7 (GENERA fixes F11): a message card shows an open/download control for
 * a PDF (non-image) attachment and calls the download action it is handed.
 * The page now hands that action to every card
 * (__tests__/pages/community/workspace.messages.test.tsx). Synthetic data only.
 */

import MessageCard from '../../../components/messaging/MessageCard';

const PERMISSIONS = {
  can_view_messages: true,
  can_send_messages: true,
  can_create_threads: true,
  can_edit_own_messages: false,
  can_delete_own_messages: false,
  can_moderate_messages: false,
  can_pin_threads: false,
  can_archive_threads: false,
  can_upload_attachments: false,
  can_mention_all: false,
  can_view_analytics: false,
  can_manage_reactions: false,
};

const PDF = {
  id: 'att-1',
  message_id: 'm1',
  file_name: 'acta.pdf',
  mime_type: 'application/pdf',
  file_size: 1200,
  storage_path: 'https://example.invalid/acta.pdf',
};

const MESSAGE: any = {
  id: 'm1',
  workspace_id: 'ws-1',
  thread_id: 't1',
  author_id: 'user-2',
  author_name: 'María-José Núñez',
  author_avatar: null,
  content: 'Adjunto el acta',
  created_at: '2026-11-16T12:00:00.000Z',
  is_edited: false,
  is_deleted: false,
  reactions: [],
  attachments: [PDF],
  mentions: [],
};

describe('EC-M7 MessageCard', () => {
  it('a PDF attachment renders its download control, which calls the handler with the attachment', () => {
    const onDownloadAttachment = vi.fn();
    const utils = render(
      <MessageCard message={MESSAGE} currentUserId="user-1" permissions={PERMISSIONS} onDownloadAttachment={onDownloadAttachment} />
    );
    expect(utils.getByText('acta.pdf')).toBeTruthy();
    const control = utils.getByTitle('Descargar');
    fireEvent.click(control);
    expect(onDownloadAttachment).toHaveBeenCalledWith(PDF);
  });

  it('F26b: an image attachment is shown through /api/community/message-attachments/<attachment id>, never the stored value', () => {
    const IMAGE = {
      id: 'att-2',
      message_id: 'm1',
      file_name: 'foto.png',
      mime_type: 'image/png',
      file_size: 900,
      storage_path: 'https://example.invalid/storage/v1/object/public/message-attachments/ws-1/m1/foto.png',
    };
    const onPreviewAttachment = vi.fn();
    const utils = render(
      <MessageCard
        message={{ ...MESSAGE, attachments: [IMAGE] }}
        currentUserId="user-1"
        permissions={PERMISSIONS}
        onPreviewAttachment={onPreviewAttachment}
      />
    );
    const img = utils.getByAltText('foto.png') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/api/community/message-attachments/att-2');
    expect(utils.container.innerHTML).not.toContain('example.invalid');
    fireEvent.click(img);
    expect(onPreviewAttachment).toHaveBeenCalledWith(IMAGE);
  });
});
