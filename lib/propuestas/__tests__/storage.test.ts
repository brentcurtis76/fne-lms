import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSignedUrl, uploadFile, downloadFile, StorageObjectExistsError } from '../storage';

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

  /**
   * Create-only uploads exist for paths whose object may be authored by someone
   * else — D-05's manual-override brochure path. The conflict is recognised by
   * the SDK's error shape (`StorageApiError` carries `code`, `status` and
   * `statusCode`), never by its message, which no contract pins.
   */
  describe('create-only (upsert: false)', () => {
    function bucketFailingWith(error: Record<string, unknown>) {
      const bucket = makeMockBucket();
      (bucket.upload as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error });
      mockFrom.mockReturnValue(bucket as ReturnType<typeof mockFrom>);
      return bucket;
    }

    it('passes upsert: false through to the SDK', async () => {
      const bucket = makeMockBucket();
      (bucket.upload as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { path: 'pasantias/brochure-v1.pdf' },
        error: null,
      });
      mockFrom.mockReturnValue(bucket as ReturnType<typeof mockFrom>);

      const file = Buffer.from('pdf content');
      await uploadFile('pasantias/brochure-v1.pdf', file, 'application/pdf', { upsert: false });

      expect(bucket.upload).toHaveBeenCalledWith('pasantias/brochure-v1.pdf', file, {
        contentType: 'application/pdf',
        upsert: false,
      });
    });

    it.each([
      ['the service error code', { code: 'ResourceAlreadyExists', message: 'The resource already exists' }],
      ['the HTTP status', { status: 409, message: 'The resource already exists' }],
      ['the string statusCode', { statusCode: '409', message: 'Duplicate' }],
    ])('reports an already-exists conflict from %s', async (_label, error) => {
      const bucket = bucketFailingWith(error);

      await expect(
        uploadFile('pasantias/brochure-v1.pdf', Buffer.from('pdf'), 'application/pdf', {
          upsert: false,
        })
      ).rejects.toBeInstanceOf(StorageObjectExistsError);

      // Terminal, not retried: the object exists, and asking twice cannot change that.
      expect(bucket.upload).toHaveBeenCalledTimes(1);
    });

    it('still reports a genuine failure as a plain upload error', async () => {
      const bucket = bucketFailingWith({ status: 500, message: 'Bucket unavailable' });

      const attempt = uploadFile('pasantias/brochure-v1.pdf', Buffer.from('pdf'), 'application/pdf', {
        upsert: false,
      });

      await expect(attempt).rejects.toThrow(
        'Failed to upload pasantias/brochure-v1.pdf: Bucket unavailable'
      );
      await expect(attempt).rejects.not.toBeInstanceOf(StorageObjectExistsError);
      expect(bucket.upload).toHaveBeenCalledTimes(2);
    });

    /**
     * Upserting callers cannot receive a conflict — the write replaces whatever
     * is there — so a 409 from that path is a real error, not a benign one.
     */
    it('does not classify conflicts away when upserting', async () => {
      bucketFailingWith({ status: 409, message: 'The resource already exists' });

      await expect(
        uploadFile('proposals/output.pdf', Buffer.from('pdf'), 'application/pdf')
      ).rejects.not.toBeInstanceOf(StorageObjectExistsError);
    });
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
