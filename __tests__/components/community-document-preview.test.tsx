// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import DocumentPreview from '../../components/documents/DocumentPreview';
import { DocumentWithDetails } from '../../types/documents';

vi.mock('../../utils/documentUtils', () => ({
  isPreviewSupported: () => true, getFileTypeIcon: () => 'FileText',
  getFileTypeColor: () => '#000', formatRelativeTime: () => 'Ahora',
}));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
function show(storage_path: string, mime_type = 'image/png') {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://synthetic.supabase.co');
  const document = { id: 'synthetic', title: 'Synthetic preview', file_name: 'synthetic.png',
    file_size: 10, storage_path, mime_type, created_at: '2026-10-06', tags: [],
    view_count: 0, download_count: 0, version_number: 1 } as unknown as DocumentWithDetails;
  return render(<DocumentPreview isOpen onClose={() => {}} document={document} onDownload={() => {}} />);
}
describe('repository document preview URL boundary', () => {
  it('renders a relative image key from the configured public bucket', () => {
    show('documents/workspace/image.png');
    expect(screen.getByAltText('Synthetic preview')).toHaveAttribute('src', 'https://synthetic.supabase.co/storage/v1/object/public/resources/documents/workspace/image.png');
  });
  it('renders a relative PDF key from Storage rather than the app route', () => {
    show('documents/workspace/document.pdf', 'application/pdf');
    expect(screen.getByTitle('Synthetic preview')).toHaveAttribute('src', 'https://synthetic.supabase.co/storage/v1/object/public/resources/documents/workspace/document.pdf#view=FitH');
  });
  it('never loads an untrusted stored URL in the preview', () => {
    const { container } = show('https://untrusted.test/file.png');
    expect(container.querySelector('img,iframe,video')).toBeNull();
  });
});
