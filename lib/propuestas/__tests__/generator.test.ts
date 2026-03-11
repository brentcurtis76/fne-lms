/**
 * Phase 2b — generator tests.
 * Tests generateProposal and mergeSupportingDocs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { ProposalConfig } from '../generator';
import '../fonts';

// Mock storage so we don't hit Supabase
vi.mock('../storage', () => ({
  downloadFile: vi.fn(),
  uploadFile: vi.fn(),
  getSignedUrl: vi.fn(),
}));

import { downloadFile } from '../storage';

const mockDownloadFile = vi.mocked(downloadFile);

// ── Minimal valid ProposalConfig ──────────────────────────────────────────────

const sampleConfig: ProposalConfig = {
  type: 'preparacion',
  schoolName: 'Escuela Test',
  programYear: 2026,
  serviceName: 'Programa Test',
  consultants: [
    {
      nombre: 'Test Consultor',
      titulo: 'Director',
      bio: 'Bio de prueba.',
    },
  ],
  modules: [
    {
      nombre: 'Módulo 1',
      horas_presenciales: 16,
      horas_sincronicas: 8,
      horas_asincronicas: 8,
    },
  ],
  horasPresenciales: 16,
  horasSincronicas: 8,
  horasAsincronicas: 8,
  pricing: {
    mode: 'per_hour',
    precioUf: 1.2,
    totalHours: 32,
    formaPago: '2 cuotas',
  },
  contentBlocks: [
    {
      key: 'test_block',
      titulo: 'Bloque de Prueba',
      contenido: {
        sections: [
          { type: 'heading', text: 'Título de Prueba', level: 1 },
          { type: 'paragraph', text: 'Texto de prueba.' },
        ],
      },
      imagenes: null,
    },
  ],
};

// ── generateProposal ──────────────────────────────────────────────────────────

describe('generateProposal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('produces a valid PDF buffer for preparacion type', async () => {
    const { generateProposal } = await import('../generator');
    const buf = await generateProposal(sampleConfig);

    expect(buf.length).toBeGreaterThan(0);
    expect(buf.toString('ascii', 0, 5)).toBe('%PDF-');
  }, 30000);

  it('produces a valid PDF buffer for evoluciona type', async () => {
    const { generateProposal } = await import('../generator');
    const config: ProposalConfig = { ...sampleConfig, type: 'evoluciona' };
    const buf = await generateProposal(config);

    expect(buf.toString('ascii', 0, 5)).toBe('%PDF-');
  }, 30000);

  it('returns main PDF when no supporting documents', async () => {
    const { generateProposal } = await import('../generator');
    const config: ProposalConfig = { ...sampleConfig, supportingDocuments: [] };
    const buf = await generateProposal(config);

    expect(buf.toString('ascii', 0, 5)).toBe('%PDF-');
    expect(mockDownloadFile).not.toHaveBeenCalled();
  }, 30000);
});

// ── mergeSupportingDocs ───────────────────────────────────────────────────────

describe('mergeSupportingDocs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function makeMinimalPdf(): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.addPage();
    return Buffer.from(await doc.save());
  }

  it('merges valid supporting PDFs into the main document', async () => {
    const { mergeSupportingDocs } = await import('../generator');
    const mainPdf = await makeMinimalPdf();
    const supportPdf = await makeMinimalPdf();

    mockDownloadFile.mockResolvedValue(supportPdf);

    const result = await mergeSupportingDocs(mainPdf, ['support/doc.pdf']);

    expect(result.toString('ascii', 0, 5)).toBe('%PDF-');
    expect(mockDownloadFile).toHaveBeenCalledWith('support/doc.pdf');

    // Merged doc should have 2 pages (1 main + 1 support)
    const merged = await PDFDocument.load(result);
    expect(merged.getPageCount()).toBe(2);
  }, 30000);

  it('skips malformed supporting docs and returns valid PDF', async () => {
    const { mergeSupportingDocs } = await import('../generator');
    const mainPdf = await makeMinimalPdf();

    mockDownloadFile.mockResolvedValue(Buffer.from('this is not a pdf'));

    const result = await mergeSupportingDocs(mainPdf, ['bad/doc.pdf']);

    expect(result.toString('ascii', 0, 5)).toBe('%PDF-');
    // Only the 1 main page should be present
    const merged = await PDFDocument.load(result);
    expect(merged.getPageCount()).toBe(1);
  }, 30000);

  it('skips docs that fail to download and continues', async () => {
    const { mergeSupportingDocs } = await import('../generator');
    const mainPdf = await makeMinimalPdf();

    mockDownloadFile.mockRejectedValue(new Error('File not found'));

    const result = await mergeSupportingDocs(mainPdf, ['missing/doc.pdf']);

    expect(result.toString('ascii', 0, 5)).toBe('%PDF-');
    const merged = await PDFDocument.load(result);
    expect(merged.getPageCount()).toBe(1);
  }, 30000);

  it('handles empty docPaths array', async () => {
    const { mergeSupportingDocs } = await import('../generator');
    const mainPdf = await makeMinimalPdf();
    const result = await mergeSupportingDocs(mainPdf, []);

    expect(result.toString('ascii', 0, 5)).toBe('%PDF-');
    expect(mockDownloadFile).not.toHaveBeenCalled();
  }, 30000);
});
