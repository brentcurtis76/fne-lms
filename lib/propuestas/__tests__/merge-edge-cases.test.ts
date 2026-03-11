/**
 * Phase 5 — PDF merge edge-case tests.
 * Tests mergeSupportingDocs behaviour for unusual inputs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import '../fonts';

vi.mock('../storage', () => ({
  downloadFile: vi.fn(),
  uploadFile: vi.fn(),
  getSignedUrl: vi.fn(),
}));

import { downloadFile } from '../storage';

const mockDownloadFile = vi.mocked(downloadFile);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function makePdf(pages = 1): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return Buffer.from(await doc.save());
}

async function makeLetterPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  // US Letter: 612 x 792 pts
  doc.addPage([612, 792]);
  return Buffer.from(await doc.save());
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('mergeSupportingDocs — edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles merging with an empty PDF (0 pages)', async () => {
    const { mergeSupportingDocs } = await import('../generator');
    const mainPdf = await makePdf(1);
    const emptyPdf = await makePdf(0);

    mockDownloadFile.mockResolvedValue(emptyPdf);

    // Should not crash regardless of how pdf-lib handles 0-page documents
    const result = await mergeSupportingDocs(mainPdf, ['empty/doc.pdf']);
    expect(result.toString('ascii', 0, 5)).toBe('%PDF-');
    const merged = await PDFDocument.load(result);
    // The main PDF contributes 1 page; the empty support PDF contributes 0 or 1
    // depending on pdf-lib's internal behaviour — we only assert no crash and at least 1 page.
    expect(merged.getPageCount()).toBeGreaterThanOrEqual(1);
  }, 15000);

  it('handles merging with a very large PDF mock (does not crash)', async () => {
    const { mergeSupportingDocs } = await import('../generator');
    const mainPdf = await makePdf(1);
    // Simulate a 50-page "large" PDF
    const largePdf = await makePdf(50);

    mockDownloadFile.mockResolvedValue(largePdf);

    const result = await mergeSupportingDocs(mainPdf, ['large/doc.pdf']);

    expect(result.toString('ascii', 0, 5)).toBe('%PDF-');
    const merged = await PDFDocument.load(result);
    expect(merged.getPageCount()).toBe(51); // 1 main + 50 support
  }, 15000);

  it('handles merging with mixed page sizes (A4 + Letter)', async () => {
    const { mergeSupportingDocs } = await import('../generator');
    // A4 main
    const mainPdf = await makePdf(1); // default A4-ish
    const letterPdf = await makeLetterPdf();

    mockDownloadFile.mockResolvedValue(letterPdf);

    const result = await mergeSupportingDocs(mainPdf, ['letter/doc.pdf']);

    expect(result.toString('ascii', 0, 5)).toBe('%PDF-');
    const merged = await PDFDocument.load(result);
    expect(merged.getPageCount()).toBe(2);
  }, 15000);

  it('returns main PDF when all supporting docs fail to load', async () => {
    const { mergeSupportingDocs } = await import('../generator');
    const mainPdf = await makePdf(2);

    mockDownloadFile.mockRejectedValue(new Error('Network timeout'));

    const result = await mergeSupportingDocs(mainPdf, [
      'fail/doc1.pdf',
      'fail/doc2.pdf',
      'fail/doc3.pdf',
    ]);

    // All downloads failed — should still return valid 2-page main PDF
    expect(result.toString('ascii', 0, 5)).toBe('%PDF-');
    const merged = await PDFDocument.load(result);
    expect(merged.getPageCount()).toBe(2);
    expect(mockDownloadFile).toHaveBeenCalledTimes(3);
  }, 15000);

  it('returns main PDF unchanged when 0 supporting docs given', async () => {
    const { mergeSupportingDocs } = await import('../generator');
    const mainPdf = await makePdf(3);

    const result = await mergeSupportingDocs(mainPdf, []);

    expect(result.toString('ascii', 0, 5)).toBe('%PDF-');
    const merged = await PDFDocument.load(result);
    expect(merged.getPageCount()).toBe(3);
    expect(mockDownloadFile).not.toHaveBeenCalled();
  }, 15000);
});
