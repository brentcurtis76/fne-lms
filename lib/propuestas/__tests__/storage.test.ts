import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSignedUrl, uploadFile, downloadFile } from '../storage';

// Mock the supabaseAdmin module
vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    storage: {
      from: vi.fn(),
    },
  },
}));

import { supabaseAdmin } from '@/lib/supabaseAdmin';

const mockFrom = vi.mocked(supabaseAdmin.storage.from);

function makeMockBucket(overrides: Record<string, unknown> = {}) {
  return {
    createSignedUrl: vi.fn(),
    upload: vi.fn(),
    download: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// getSignedUrl
// ============================================================
describe('getSignedUrl', () => {
  it('returns the signed URL on success', async () => {
    const bucket = makeMockBucket();
    (bucket.createSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed' },
      error: null,
    });
    mockFrom.mockReturnValue(bucket as ReturnType<typeof mockFrom>);

    const url = await getSignedUrl('proposals/doc.pdf');
    expect(url).toBe('https://example.com/signed');
    expect(mockFrom).toHaveBeenCalledWith('propuestas');
    expect(bucket.createSignedUrl).toHaveBeenCalledWith('proposals/doc.pdf', 3600);
  });

  it('passes custom expiresIn to createSignedUrl', async () => {
    const bucket = makeMockBucket();
    (bucket.createSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed' },
      error: null,
    });
    mockFrom.mockReturnValue(bucket as ReturnType<typeof mockFrom>);

    await getSignedUrl('proposals/doc.pdf', 7200);
    expect(bucket.createSignedUrl).toHaveBeenCalledWith('proposals/doc.pdf', 7200);
  });

  it('throws an error when createSignedUrl fails', async () => {
    const bucket = makeMockBucket();
    (bucket.createSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'Object not found' },
    });
    mockFrom.mockReturnValue(bucket as ReturnType<typeof mockFrom>);

    await expect(getSignedUrl('missing/file.pdf')).rejects.toThrow(
      'Failed to create signed URL for missing/file.pdf: Object not found'
    );
  });
});

// ============================================================
// uploadFile
// ============================================================
describe('uploadFile', () => {
  it('returns the path on success', async () => {
    const bucket = makeMockBucket();
    (bucket.upload as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { path: 'proposals/output.pdf' },
      error: null,
    });
    mockFrom.mockReturnValue(bucket as ReturnType<typeof mockFrom>);

    const file = Buffer.from('pdf content');
    const result = await uploadFile('proposals/output.pdf', file, 'application/pdf');
    expect(result).toBe('proposals/output.pdf');
    expect(mockFrom).toHaveBeenCalledWith('propuestas');
    expect(bucket.upload).toHaveBeenCalledWith(
      'proposals/output.pdf',
      file,
      { contentType: 'application/pdf', upsert: true }
    );
  });

  it('throws an error when upload fails', async () => {
    const bucket = makeMockBucket();
    (bucket.upload as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'Bucket not found' },
    });
    mockFrom.mockReturnValue(bucket as ReturnType<typeof mockFrom>);

    await expect(
      uploadFile('proposals/output.pdf', Buffer.from(''), 'application/pdf')
    ).rejects.toThrow('Failed to upload proposals/output.pdf: Bucket not found');
  });
});

// ============================================================
// downloadFile
// ============================================================
describe('downloadFile', () => {
  it('returns a Buffer of the file content on success', async () => {
    const content = new Uint8Array([80, 68, 70]); // "PDF"
    const mockBlob = {
      arrayBuffer: vi.fn().mockResolvedValue(content.buffer),
    };
    const bucket = makeMockBucket();
    (bucket.download as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockBlob,
      error: null,
    });
    mockFrom.mockReturnValue(bucket as ReturnType<typeof mockFrom>);

    const result = await downloadFile('proposals/doc.pdf');
    expect(result).toBeInstanceOf(Buffer);
    expect(Buffer.from(result).toString()).toBe('PDF');
    expect(mockFrom).toHaveBeenCalledWith('propuestas');
    expect(bucket.download).toHaveBeenCalledWith('proposals/doc.pdf');
  });

  it('throws an error when download fails', async () => {
    const bucket = makeMockBucket();
    (bucket.download as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'File not found' },
    });
    mockFrom.mockReturnValue(bucket as ReturnType<typeof mockFrom>);

    await expect(downloadFile('proposals/missing.pdf')).rejects.toThrow(
      'Failed to download proposals/missing.pdf: File not found'
    );
  });
});
