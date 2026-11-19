// @vitest-environment node
/**
 * GENERA fixes F20, LIC-D7: «Descargar Todo» keeps two (or three) files that
 * share a name in the same folder: the second becomes «nombre (2).ext», the
 * third «nombre (3).ext». Synthetic data only.
 */
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { h } = vi.hoisted(() => ({
  h: { documentos: [] as Array<Record<string, unknown>> },
}));

vi.mock('@/lib/api-auth', () => {
  const chain = (table: string) => {
    const q: any = {
      select: () => q,
      eq: () => q,
      order: async () => ({ data: h.documentos, error: null }),
      single: async () => (table === 'licitaciones'
        ? { data: { id: TENDER, school_id: 1, numero_licitacion: 'LIC-1-2026-001' }, error: null }
        : { data: null, error: null }),
    };
    return q;
  };
  const client = {
    from: (table: string) => chain(table),
    storage: {
      from: () => ({
        download: async (path: string) => {
          const bytes = new TextEncoder().encode(`contenido de ${path}`);
          return { data: { arrayBuffer: async () => bytes.buffer }, error: null };
        },
      }),
    },
  };
  return {
    getApiUser: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, error: null }),
    createServiceRoleClient: () => client,
    sendAuthError: (res: any, error: string, status: number) => res.status(status).json({ error }),
    logApiRequest: vi.fn(),
    handleMethodNotAllowed: (res: any) => res.status(405).json({ error: 'method' }),
  };
});
vi.mock('@/utils/roleUtils', () => ({
  getUserRoles: vi.fn(async () => [{ role_type: 'admin', school_id: null }]),
}));

import handler from '@/pages/api/licitaciones/[id]/download-zip';

const TENDER = '22222222-2222-4222-8222-222222222222';

const doc = (n: number, tipo: string, file_name: string) => ({
  id: `doc-${n}`, licitacion_id: TENDER, tipo, nombre: `Documento ${n}`, file_name,
  storage_path: `licitaciones/${TENDER}/u${n}_${file_name}`, file_size: 100, created_at: `2026-11-0${n}T10:00:00Z`,
});

async function download() {
  const { req, res } = createMocks({ method: 'POST', query: { id: TENDER } });
  await handler(req as any, res as any);
  expect(res._getStatusCode()).toBe(200);
  const zip = await JSZip.loadAsync(res._getBuffer());
  const files = Object.keys(zip.files).filter(k => !zip.files[k].dir).sort();
  return { zip, files };
}

beforeEach(() => { h.documentos = []; });

describe('POST /api/licitaciones/[id]/download-zip — same file name in the same folder', () => {
  it('two proposals named Propuesta.pdf: both stay, the second as «Propuesta (2).pdf»', async () => {
    h.documentos = [doc(1, 'propuesta', 'Propuesta.pdf'), doc(2, 'propuesta', 'Propuesta.pdf')];
    const { zip, files } = await download();
    expect(files).toEqual([
      'LIC-1-2026-001/03-propuestas/Propuesta (2).pdf',
      'LIC-1-2026-001/03-propuestas/Propuesta.pdf',
    ]);
    expect(await zip.file('LIC-1-2026-001/03-propuestas/Propuesta.pdf')!.async('string')).toContain('u1_');
    expect(await zip.file('LIC-1-2026-001/03-propuestas/Propuesta (2).pdf')!.async('string')).toContain('u2_');
  });

  it('three: «(2)» and «(3)»', async () => {
    h.documentos = [1, 2, 3].map(n => doc(n, 'propuesta', 'Propuesta.pdf'));
    const { files } = await download();
    expect(files).toEqual([
      'LIC-1-2026-001/03-propuestas/Propuesta (2).pdf',
      'LIC-1-2026-001/03-propuestas/Propuesta (3).pdf',
      'LIC-1-2026-001/03-propuestas/Propuesta.pdf',
    ]);
  });

  it('the same name in two different folders is left as it is', async () => {
    h.documentos = [doc(1, 'propuesta', 'Documento.pdf'), doc(2, 'otro', 'Documento.pdf')];
    const { files } = await download();
    expect(files).toEqual([
      'LIC-1-2026-001/03-propuestas/Documento.pdf',
      'LIC-1-2026-001/06-otros/Documento.pdf',
    ]);
  });

  it('two kinds sharing one folder (bases generadas and enviadas) with the same name both stay', async () => {
    h.documentos = [doc(1, 'bases_generadas', 'Bases.docx'), doc(2, 'bases_enviadas', 'Bases.docx')];
    const { files } = await download();
    expect(files).toEqual([
      'LIC-1-2026-001/02-bases/Bases (2).docx',
      'LIC-1-2026-001/02-bases/Bases.docx',
    ]);
  });
});
