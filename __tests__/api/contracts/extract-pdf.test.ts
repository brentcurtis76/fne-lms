// @vitest-environment node
/**
 * F7c (GES-1.7): the contract import never fetches a web address the request
 * names. A body carrying `pdfUrl` is answered 400 before anything is done with
 * it; an uploaded document (`pdfBase64`) goes on to the reader as before.
 * The sign-in, the database, pdf-parse, the Anthropic client and global fetch
 * are all fakes: nothing leaves the test. Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const mocks = vi.hoisted(() => ({
  caller: vi.fn(),
  client: vi.fn(),
  create: vi.fn(),
  pdfParse: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  requireVerifiedCaller: mocks.caller,
  createApiSupabaseClient: mocks.client,
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    messages = { create: mocks.create };
  },
}));
vi.mock('pdf-parse', () => ({ default: mocks.pdfParse }));

import handler, * as route from '../../../pages/api/contracts/extract-pdf';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const EXTRACTED = {
  contract: { numero_contrato: 'SYN-001', fecha_contrato: '2026-01-01', confidence: 0.9 },
  client: { nombre_legal: 'Colegio Sintético', rut: '', confidence: 0.9 },
  financial: { precio_total: 100, moneda: 'UF', confidence: 0.9 },
  overall_confidence: 0.9,
};

let fetchSpy: ReturnType<typeof vi.fn>;
const savedKey = process.env.ANTHROPIC_API_KEY;

function fakeSupabase() {
  const q: any = {};
  for (const m of ['select', 'eq', 'gte']) q[m] = () => q;
  q.single = () => Promise.resolve({ data: { role_type: 'admin' }, error: null });
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], count: 0, error: null }).then(resolve);
  return { from: () => q };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  process.env.ANTHROPIC_API_KEY = 'synthetic-test-key';
  mocks.caller.mockResolvedValue({ user: { id: ADMIN_ID }, status: null, body: null });
  mocks.client.mockResolvedValue(fakeSupabase());
  mocks.pdfParse.mockResolvedValue({ text: 'Contrato sintético de prueba' });
  mocks.create.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(EXTRACTED) }] });
  fetchSpy = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = savedKey;
});

async function post(body: Record<string, unknown>) {
  const { req, res } = createMocks({ method: 'POST', body });
  await handler(req as never, res as never);
  return res;
}

describe('POST /api/contracts/extract-pdf (GES-1.7)', () => {
  it('refuses a pdfUrl with 400 and never fetches it', async () => {
    const res = await post({ pdfUrl: 'http://169.254.169.254/latest/meta-data/', fileName: 'x.pdf' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'pdfUrl no está permitido: suba el documento' });
    expect(mocks.pdfParse).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('refuses a pdfUrl even when a pdfBase64 is sent with it', async () => {
    const res = await post({ pdfUrl: 'http://127.0.0.1/secret', pdfBase64: Buffer.from('%PDF').toString('base64') });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res._getStatusCode()).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('asks for pdfBase64 when no document is sent', async () => {
    const res = await post({ fileName: 'x.pdf' });
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'Se requiere pdfBase64' });
  });

  it('reads an uploaded document (pdfBase64) as before, through the fake reader', async () => {
    const res = await post({ pdfBase64: Buffer.from('%PDF-1.4 synthetic').toString('base64'), fileName: 'contrato.pdf' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.pdfParse).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(res._getStatusCode()).toBe(200);
  });
});

describe('extract-pdf body size (GES-2.3)', () => {
  it('accepts a body of up to 4 MB (a 2,9 MB PDF as base64 inside JSON)', () => {
    const config = (route as { config?: { api?: { bodyParser?: { sizeLimit?: string } } } }).config;
    expect(config?.api?.bodyParser?.sizeLimit).toBe('4mb');
  });
});

/**
 * F21b (GES-3.11, send-back 2): the import finds a known client by its RUT
 * however the PDF and the stored row write it: the lookup asks for the usual
 * spellings of the same RUT at once (lib/contracts/rut-spellings.ts). Before the
 * fix it compared the exact text read from the PDF. No stored row is rewritten.
 */
describe('extract-pdf client lookup by RUT, any spelling (GES-3.11)', () => {
  function recordingSupabase(stored: Array<Record<string, unknown>>, asked: unknown[], writes: string[]) {
    return {
      from: (table: string) => {
        const filters: Record<string, unknown> = {};
        const q: any = {};
        for (const m of ['select', 'gte', 'order', 'limit']) q[m] = () => q;
        for (const m of ['insert', 'update', 'upsert', 'delete']) q[m] = () => { writes.push(`${m}:${table}`); return q; };
        q.eq = (col: string, value: unknown) => { filters[col] = value; return q; };
        q.in = (col: string, value: unknown) => { filters[col] = value; return q; };
        const answer = () => {
          if (table === 'clientes') {
            asked.push(filters.rut);
            const list = Array.isArray(filters.rut) ? filters.rut : [filters.rut];
            const row = stored.find((r) => list.includes(r.rut)) ?? null;
            return Promise.resolve({ data: row, error: null });
          }
          return Promise.resolve({ data: { role_type: 'admin' }, error: null });
        };
        q.single = answer;
        q.maybeSingle = answer;
        q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], count: 0, error: null }).then(resolve);
        return q;
      },
    };
  }

  const importWith = async (pdfRut: string, stored: Array<Record<string, unknown>>) => {
    const asked: unknown[] = [];
    const writes: string[] = [];
    mocks.client.mockResolvedValue(recordingSupabase(stored, asked, writes));
    mocks.create.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ ...EXTRACTED, client: { ...EXTRACTED.client, rut: pdfRut } }) }],
    });
    const res = await post({ pdfBase64: Buffer.from('%PDF-1.4 synthetic').toString('base64'), fileName: 'contrato.pdf' });
    return { res, asked, writes };
  };

  it.each(['761234560', '76123456-0', '76.123.456-0'])('a PDF RUT «%s» finds the client stored as «76.123.456-0»', async (rut) => {
    const STORED = { id: 'cliente-1', rut: '76.123.456-0' };
    const { res, asked } = await importWith(rut, [STORED]);
    expect(res._getStatusCode()).toBe(200);
    expect(asked).toEqual([['76.123.456-0', '76123456-0', '761234560']]);
    expect(res._getJSONData().existingClient).toEqual(STORED);
  });

  it.each(['761234560', '76123456-0'])('a client STORED as «%s» is found from a PDF RUT «76.123.456-0»; nothing is written', async (storedRut) => {
    const STORED = { id: 'cliente-1', rut: storedRut };
    const { res, writes } = await importWith('76.123.456-0', [STORED]);
    expect(res._getJSONData().existingClient).toEqual(STORED);
    expect(writes).toEqual([]);
  });

  it('«12.345.678-K» finds a client stored «12345678-k»', async () => {
    const STORED = { id: 'cliente-k', rut: '12345678-k' };
    const { res } = await importWith('12.345.678-K', [STORED]);
    expect(res._getJSONData().existingClient).toEqual(STORED);
  });
});
