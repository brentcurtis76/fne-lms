// @vitest-environment node
/**
 * Phase A4 — the two Pasantías PDF serving routes.
 *
 * Both routes are the same handler with different parameters, so almost every
 * case runs against both: what differs between them (cache key, filename, and
 * which one may see a price) is exactly what a copy-paste divergence would get
 * wrong. Storage and the A3 generators are mocked — this suite is about the
 * serving contract, not about rendering; `lib/pasantias/__tests__/pdf.test.ts`
 * is where the real documents are rendered and read back.
 *
 * The load-bearing property is D-05's manual override: whatever object sits at
 * the cache path is served AS-IS, because that is how the owner's hand-designed
 * brochure gets published.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockDownloadFile, mockUploadFile, mockGenerateBrochure, mockGenerateFicha } = vi.hoisted(
  () => ({
    mockDownloadFile: vi.fn(),
    mockUploadFile: vi.fn(),
    mockGenerateBrochure: vi.fn(),
    mockGenerateFicha: vi.fn(),
  })
);

vi.mock('@/lib/propuestas/storage', () => ({
  downloadFile: mockDownloadFile,
  uploadFile: mockUploadFile,
}));

vi.mock('@/lib/pasantias/brochure', () => ({ generateBrochure: mockGenerateBrochure }));
vi.mock('@/lib/pasantias/ficha', () => ({ generateFicha: mockGenerateFicha }));

vi.mock('@/lib/securityAuditLog', () => ({ logSecurityIncident: vi.fn() }));

import brochureHandler from '@/pages/api/pasantias/brochure';
import fichaHandler from '@/pages/api/pasantias/ficha';
import { BROCHURE_FILENAME, BROCHURE_VERSION } from '@/lib/pasantias/cohort-commercial';
import {
  FICHA_FILENAME,
  FICHA_VERSION,
  buildContentDisposition,
  encodeRfc5987Filename,
  isRfc5987SafeFilename,
} from '@/lib/pasantias/pdf/filenames';
import { PDF_MAX_AGE_SECONDS, pasantiasCachePath } from '@/lib/pasantias/pdf/serve';

/**
 * Stand-ins for the two sets of bytes a request can end up with. Small on
 * purpose: nothing here renders a PDF, so a valid header and a distinguishable
 * body are all the fixtures need to carry.
 */
const CACHED_PDF = Buffer.from('%PDF-1.7 cached-object\n%%EOF\n', 'utf8');
const GENERATED_PDF = Buffer.from('%PDF-1.7 freshly-generated\n%%EOF\n', 'utf8');

type Handler = (req: unknown, res: unknown) => Promise<void> | void;

interface DocumentUnderTest {
  label: string;
  handler: Handler;
  cachePath: string;
  filename: string;
  generator: ReturnType<typeof vi.fn>;
  other: ReturnType<typeof vi.fn>;
}

const DOCUMENTS: DocumentUnderTest[] = [
  {
    label: 'brochure',
    handler: brochureHandler as unknown as Handler,
    cachePath: `pasantias/brochure-${BROCHURE_VERSION}.pdf`,
    filename: BROCHURE_FILENAME,
    generator: mockGenerateBrochure,
    other: mockGenerateFicha,
  },
  {
    label: 'ficha',
    handler: fichaHandler as unknown as Handler,
    cachePath: `pasantias/ficha-${FICHA_VERSION}.pdf`,
    filename: FICHA_FILENAME,
    generator: mockGenerateFicha,
    other: mockGenerateBrochure,
  },
];

/**
 * The routes carry `lib/rateLimit`'s best-effort dampening, keyed by client IP,
 * and the real limiter runs here rather than a stub. Every request therefore
 * gets its own synthetic IP unless a test is deliberately hammering one.
 */
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter % 250}:${ipCounter}`;
}

async function get(handler: Handler, opts: { method?: string; ip?: string } = {}) {
  const { req, res } = createMocks({
    method: opts.method ?? 'GET',
    headers: { 'x-forwarded-for': opts.ip ?? nextIp() },
  });
  await handler(req, res);
  return res as unknown as {
    _getStatusCode(): number;
    _getBuffer(): Buffer;
    _getJSONData(): Record<string, unknown>;
    getHeader(name: string): unknown;
  };
}

/**
 * `VERCEL_ENV` decides whether a generated document may be written back to the
 * shared `propuestas` bucket, so each test says which environment it is running
 * as. Restoring is a delete rather than an assignment: writing `undefined` back
 * would leave the *string* `"undefined"` in the environment, which is not the
 * same thing as unset — and unset is exactly the local case that matters here.
 */
const REAL_VERCEL_ENV = process.env.VERCEL_ENV;

function runningOn(vercelEnv: string | undefined): void {
  if (vercelEnv === undefined) {
    delete process.env.VERCEL_ENV;
  } else {
    process.env.VERCEL_ENV = vercelEnv;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDownloadFile.mockResolvedValue(CACHED_PDF);
  mockUploadFile.mockResolvedValue(undefined);
  mockGenerateBrochure.mockResolvedValue(GENERATED_PDF);
  mockGenerateFicha.mockResolvedValue(GENERATED_PDF);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // The default for the suite; the non-production block overrides it.
  runningOn('production');
});

afterEach(() => {
  vi.restoreAllMocks();
  runningOn(REAL_VERCEL_ENV);
});

describe.each(DOCUMENTS)('/api/pasantias/$label', (doc) => {
  describe('cache hit', () => {
    it('serves the cached object and neither generates nor uploads', async () => {
      const res = await get(doc.handler);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getBuffer().equals(CACHED_PDF)).toBe(true);
      expect(mockDownloadFile).toHaveBeenCalledWith(doc.cachePath);
      expect(doc.generator).not.toHaveBeenCalled();
      expect(mockUploadFile).not.toHaveBeenCalled();
    });

    /**
     * D-05's manual override. The bytes at the cache path win over anything the
     * generator would produce — that is what makes the path a publishing
     * mechanism for the owner's designed brochure rather than a cache detail.
     */
    it('serves a pre-existing override file as-is, never regenerating over it', async () => {
      const designed = Buffer.from('%PDF-1.7 owner-designed override\n%%EOF\n', 'utf8');
      mockDownloadFile.mockResolvedValue(designed);

      const res = await get(doc.handler);

      expect(res._getBuffer().equals(designed)).toBe(true);
      expect(res._getBuffer().equals(GENERATED_PDF)).toBe(false);
      expect(doc.generator).not.toHaveBeenCalled();
      expect(mockUploadFile).not.toHaveBeenCalled();
    });
  });

  describe('cache miss, in production', () => {
    beforeEach(() => {
      mockDownloadFile.mockRejectedValue(new Error('Object not found'));
      runningOn('production');
    });

    it('generates, uploads to the cache path, then serves the generated bytes', async () => {
      const res = await get(doc.handler);

      expect(res._getStatusCode()).toBe(200);
      expect(doc.generator).toHaveBeenCalledTimes(1);
      expect(doc.other).not.toHaveBeenCalled();
      expect(mockUploadFile).toHaveBeenCalledWith(doc.cachePath, GENERATED_PDF, 'application/pdf');
      expect(res._getBuffer().equals(GENERATED_PDF)).toBe(true);
    });

    it('still serves 200 when the upload fails — a broken bucket is not a broken download', async () => {
      mockUploadFile.mockRejectedValue(new Error('Bucket unavailable'));

      const res = await get(doc.handler);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getBuffer().equals(GENERATED_PDF)).toBe(true);
      expect(res.getHeader('Content-Type')).toBe('application/pdf');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining(`could not cache ${doc.cachePath}`)
      );
    });

    it('returns 500 in es-CL when the document cannot be generated at all', async () => {
      doc.generator.mockRejectedValue(new Error('renderToBuffer exploded'));

      const res = await get(doc.handler);

      expect(res._getStatusCode()).toBe(500);
      expect(res._getJSONData().error).toBe(
        'No se pudo generar el documento. Intente nuevamente en unos minutos.'
      );
      expect(mockUploadFile).not.toHaveBeenCalled();
    });
  });

  /**
   * The bucket is shared with production, and outside production the origin the
   * generators print comes from local or preview configuration. So a cold-cache
   * request off production must still answer with a document — and must not
   * write it anywhere. `preview` and `development` are what Vercel sets; unset
   * is `npm run dev`, `npm start` and CI.
   */
  describe.each([
    ['preview', 'preview'],
    ['development', 'development'],
    ['off-platform (unset)', undefined],
  ])('cache miss, on %s', (_label, vercelEnv) => {
    beforeEach(() => {
      mockDownloadFile.mockRejectedValue(new Error('Object not found'));
      runningOn(vercelEnv);
    });

    it('generates and serves without writing anything to the shared bucket', async () => {
      const res = await get(doc.handler);

      expect(res._getStatusCode()).toBe(200);
      expect(doc.generator).toHaveBeenCalledTimes(1);
      expect(res._getBuffer().equals(GENERATED_PDF)).toBe(true);
      expect(mockUploadFile).not.toHaveBeenCalled();
    });

    it('says once, at info level, why the cache was not written', async () => {
      await get(doc.handler);

      expect(console.info).toHaveBeenCalledTimes(1);
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining(`not caching ${doc.cachePath}`)
      );
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('VERCEL_ENV=production')
      );
    });

    it('still serves the cached object on a hit', async () => {
      mockDownloadFile.mockResolvedValue(CACHED_PDF);

      const res = await get(doc.handler);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getBuffer().equals(CACHED_PDF)).toBe(true);
      expect(doc.generator).not.toHaveBeenCalled();
      expect(mockUploadFile).not.toHaveBeenCalled();
    });
  });

  describe('headers', () => {
    it('is served inline as a PDF, publicly cacheable for an hour', async () => {
      const res = await get(doc.handler);

      expect(res.getHeader('Content-Type')).toBe('application/pdf');
      expect(res.getHeader('Cache-Control')).toBe(`public, max-age=${PDF_MAX_AGE_SECONDS}`);
      expect(res.getHeader('Cache-Control')).toBe('public, max-age=3600');
      expect(res.getHeader('Content-Length')).toBe(CACHED_PDF.length);
    });

    it('names the download in both Content-Disposition forms, RFC 5987 encoded', async () => {
      const res = await get(doc.handler);

      expect(res.getHeader('Content-Disposition')).toBe(
        `inline; filename="${doc.filename}"; filename*=UTF-8''${doc.filename}`
      );
      // The constants are attr-char clean, so the encoded form is the name
      // itself — assert that rather than trusting it.
      expect(isRfc5987SafeFilename(doc.filename)).toBe(true);
      expect(encodeRfc5987Filename(doc.filename)).toBe(doc.filename);
    });
  });

  describe('method guard', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects %s with 405', async (method) => {
      const res = await get(doc.handler, { method });

      expect(res._getStatusCode()).toBe(405);
      expect(res.getHeader('Allow')).toBe('GET');
      expect(mockDownloadFile).not.toHaveBeenCalled();
      expect(doc.generator).not.toHaveBeenCalled();
      expect(mockUploadFile).not.toHaveBeenCalled();
    });
  });
});

describe('cache paths (D-05)', () => {
  it('key each document by its own version under the pasantias prefix', () => {
    expect(pasantiasCachePath('brochure', BROCHURE_VERSION)).toBe(
      `pasantias/brochure-${BROCHURE_VERSION}.pdf`
    );
    expect(pasantiasCachePath('ficha', FICHA_VERSION)).toBe(
      `pasantias/ficha-${FICHA_VERSION}.pdf`
    );
    // Independent keys: a price change must not invalidate the price-free ficha.
    expect(pasantiasCachePath('brochure', BROCHURE_VERSION)).not.toBe(
      pasantiasCachePath('ficha', FICHA_VERSION)
    );
  });
});

/**
 * Sol's A3 SHOULD-FIX, landing here because A4 is what consumes the helper: the
 * old check was "printable ASCII minus a denylist", which accepted names RFC
 * 5987 §3.2.1 forbids. The grammar is `attr-char` only.
 */
describe('RFC 5987 filename grammar (§3.2.1)', () => {
  it('accepts both shipped filename constants', () => {
    expect(isRfc5987SafeFilename(BROCHURE_FILENAME)).toBe(true);
    expect(isRfc5987SafeFilename(FICHA_FILENAME)).toBe(true);
  });

  it('accepts every attr-char and nothing else that is printable ASCII', () => {
    expect(isRfc5987SafeFilename("aZ0!#$&+-.^_`|~")).toBe(true);
  });

  /**
   * The first four are what the old denylist let through and the grammar does
   * not: SPACE is not an attr-char, `%` is legal only inside a pct-encoded
   * triplet, `'` closes the charset/language prefix a parser is reading, and
   * `*` opens another extended parameter. The rest were already rejected.
   */
  it.each([
    '', // the grammar needs at least one character
    'Ficha Pasantias.pdf', // SPACE
    'a%b.pdf',
    "a'b.pdf",
    'a*b.pdf',
    'a=b.pdf',
    'a@b.pdf',
    'a(b).pdf',
    'a"b.pdf',
    'a\\b.pdf',
    'dir/file.pdf',
    'a;b.pdf',
    'a,b.pdf',
    'a\nb.pdf',
    'a\u007Fb.pdf',
    'Pasant\u00EDas.pdf',
  ])('rejects %j', (name) => {
    expect(isRfc5987SafeFilename(name)).toBe(false);
  });

  it('percent-encodes per UTF-8 byte, not per character', () => {
    expect(encodeRfc5987Filename('Ficha Pasantías.pdf')).toBe('Ficha%20Pasant%C3%ADas.pdf');
    expect(encodeRfc5987Filename("100%'*.pdf")).toBe('100%25%27%2A.pdf');
  });

  it('degrades the quoted fallback to the encoded form when a name is not clean', () => {
    expect(buildContentDisposition('Ficha Pasantías.pdf')).toBe(
      "inline; filename=\"Ficha%20Pasant%C3%ADas.pdf\"; filename*=UTF-8''Ficha%20Pasant%C3%ADas.pdf"
    );
  });
});
