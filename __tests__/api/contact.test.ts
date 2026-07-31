// @vitest-environment node
/**
 * /api/contact — the homepage contact form's handler.
 *
 * Covers the A7b transport swap: the interest map (current form values plus
 * the retained legacy aliases), the Resend payload, HTML escaping of every
 * user-supplied field, the per-IP rate limit, and the soft-fail path when
 * RESEND_API_KEY is absent. The real lib/rateLimit limiter is exercised here
 * (not stubbed), so every case that must not be throttled uses its own
 * synthetic client IP.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockSend, mockResendCtor } = vi.hoisted(() => {
  const send = vi.fn();
  return {
    mockSend: send,
    mockResendCtor: vi.fn(() => ({ emails: { send } })),
  };
});

vi.mock('resend', () => ({ Resend: mockResendCtor }));

vi.mock('../../lib/securityAuditLog', () => ({
  logSecurityIncident: vi.fn(),
}));

import handler from '../../pages/api/contact';

let ipCounter = 0;
// Each call gets its own bucket unless the test pins an IP on purpose.
function nextIp() {
  ipCounter += 1;
  return `203.0.113.${ipCounter % 250}:${ipCounter}`;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    nombre: 'Ana Pérez',
    email: 'ana@example.com',
    institucion: 'Colegio Uno',
    cargo: 'Directora',
    interes: 'inspira',
    mensaje: 'Quiero información.',
    ...overrides,
  };
}

async function run(
  body: Record<string, unknown> | undefined,
  opts: { method?: string; ip?: string } = {}
) {
  const { req, res } = createMocks({
    method: opts.method ?? 'POST',
    body,
    headers: { 'x-forwarded-for': opts.ip ?? nextIp() },
  });
  await handler(req as never, res as never);
  return { req, res };
}

function sentPayload() {
  expect(mockSend).toHaveBeenCalledTimes(1);
  return mockSend.mock.calls[0][0] as Record<string, string>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
  vi.stubEnv('RESEND_API_KEY', 'test-resend-key');
  vi.stubEnv('EMAIL_FROM_ADDRESS', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('api/contact — method and rate limit', () => {
  it('rejects non-POST with 405 and sends nothing', async () => {
    const { res } = await run(undefined, { method: 'GET' });
    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({ error: 'Method not allowed' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sixth request from the same IP inside the window → 429, no send', async () => {
    const ip = '198.51.100.7';
    for (let i = 0; i < 5; i += 1) {
      const { res } = await run(validBody(), { ip });
      expect(res._getStatusCode()).toBe(200);
    }
    expect(mockSend).toHaveBeenCalledTimes(5);

    const { res } = await run(validBody(), { ip });
    expect(res._getStatusCode()).toBe(429);
    expect(res._getJSONData().error).toBe(
      'Demasiadas solicitudes. Por favor, intente de nuevo más tarde.'
    );
    // The limiter short-circuits before any transport work.
    expect(mockSend).toHaveBeenCalledTimes(5);
  });
});

describe('api/contact — validation', () => {
  it('empty body → 400 with the per-field missing map', async () => {
    const { res } = await run({});
    expect(res._getStatusCode()).toBe(400);
    const json = res._getJSONData();
    expect(json.error).toBe('Faltan campos obligatorios');
    expect(json.missing).toEqual({
      nombre: true,
      email: true,
      institucion: true,
      interes: true,
      mensaje: true,
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('invalid email → 400', async () => {
    const { res } = await run(validBody({ email: 'not-an-email' }));
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toBe('Formato de email inválido');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('cargo is optional: omitting it still succeeds and drops the Cargo block', async () => {
    const { res } = await run(validBody({ cargo: undefined }));
    expect(res._getStatusCode()).toBe(200);
    expect(sentPayload().html).not.toContain('Cargo:');
  });
});

describe('api/contact — interest labels', () => {
  // First five: what pages/index.tsx submits today. Last three: legacy values
  // kept as aliases so older payloads still resolve to a readable label.
  const CASES: Array<[string, string]> = [
    ['inspira', 'Inspira (Pasantía en Barcelona)'],
    ['inicia', 'Inicia'],
    ['evoluciona', 'Evoluciona'],
    ['aula-generativa', 'Aula Generativa'],
    ['otro', 'Otro proyecto'],
    ['pasantias', 'Pasantías en Barcelona'],
    ['consultoria', 'Consultoría educativa'],
    ['formacion', 'Formación de equipos'],
  ];

  it.each(CASES)('%s maps to its label in subject and body', async (interes, label) => {
    const { res } = await run(validBody({ interes }));
    expect(res._getStatusCode()).toBe(200);
    const payload = sentPayload();
    expect(payload.subject).toBe(`[Contacto Web FNE] Ana Pérez - Colegio Uno (${label})`);
    expect(payload.html).toContain(label);
  });

  it('unknown interest value falls back to the submitted value', async () => {
    const { res } = await run(validBody({ interes: 'algo-nuevo' }));
    expect(res._getStatusCode()).toBe(200);
    const payload = sentPayload();
    expect(payload.subject).toBe('[Contacto Web FNE] Ana Pérez - Colegio Uno (algo-nuevo)');
    expect(payload.html).toContain('algo-nuevo');
  });
});

describe('api/contact — Resend transport', () => {
  it('sends to info@nuevaeducacion.org with the default sender and reply-to', async () => {
    const { res } = await run(validBody());
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      success: true,
      message: 'Mensaje enviado exitosamente. Te responderemos pronto.',
      emailSent: true,
    });
    expect(mockResendCtor).toHaveBeenCalledWith('test-resend-key');

    const payload = sentPayload();
    expect(payload.to).toBe('info@nuevaeducacion.org');
    expect(payload.from).toBe('Genera <notificaciones@nuevaeducacion.org>');
    expect(payload.reply_to).toBe('ana@example.com');
    expect(payload.subject).toBe(
      '[Contacto Web FNE] Ana Pérez - Colegio Uno (Inspira (Pasantía en Barcelona))'
    );
    expect(payload.html).toContain('Colegio Uno');
    expect(payload.html).toContain('Quiero información.');
  });

  it('honours EMAIL_FROM_ADDRESS when set', async () => {
    vi.stubEnv('EMAIL_FROM_ADDRESS', 'FNE <hola@nuevaeducacion.org>');
    const { res } = await run(validBody());
    expect(res._getStatusCode()).toBe(200);
    expect(sentPayload().from).toBe('FNE <hola@nuevaeducacion.org>');
  });

  it('never calls Formspree, even with FORMSPREE_ENDPOINT configured', async () => {
    vi.stubEnv('FORMSPREE_ENDPOINT', 'https://formspree.io/f/legacy');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    const { res } = await run(validBody());
    expect(res._getStatusCode()).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('newlines in the message become <br>', async () => {
    const { res } = await run(validBody({ mensaje: 'Linea 1\nLinea 2' }));
    expect(res._getStatusCode()).toBe(200);
    expect(sentPayload().html).toContain('Linea 1<br>Linea 2');
  });
});

describe('api/contact — escaping', () => {
  it('hostile input renders inert in the HTML payload', async () => {
    const { res } = await run(
      validBody({
        nombre: '<script>alert(1)</script>',
        institucion: 'Colegio "Comillas" & Asociados',
        cargo: "O'Higgins <b>bold</b>",
        mensaje: '<img src=x onerror="alert(2)">',
      })
    );
    expect(res._getStatusCode()).toBe(200);
    const html = sentPayload().html;

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Colegio &quot;Comillas&quot; &amp; Asociados');
    expect(html).toContain('O&#39;Higgins &lt;b&gt;bold&lt;/b&gt;');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(2)&quot;&gt;');

    // Nothing user-supplied survives as live markup.
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<b>bold</b>');
    expect(html).not.toContain('<img src=x');
  });

  it('escapes an unknown interest value echoed back into the body', async () => {
    const { res } = await run(validBody({ interes: '<script>alert(3)</script>' }));
    expect(res._getStatusCode()).toBe(200);
    const html = sentPayload().html;
    expect(html).toContain('&lt;script&gt;alert(3)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(3)</script>');
  });

  it('strips line breaks from the subject line', async () => {
    const { res } = await run(
      validBody({ nombre: 'Ana\nBcc: victima@example.com', institucion: 'Colegio\r\nUno' })
    );
    expect(res._getStatusCode()).toBe(200);
    const subject = sentPayload().subject;
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject).toBe(
      '[Contacto Web FNE] Ana Bcc: victima@example.com - Colegio Uno (Inspira (Pasantía en Barcelona))'
    );
  });
});

describe('api/contact — soft fail', () => {
  it('missing RESEND_API_KEY → 200 with emailSent false, logged, nothing constructed', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const { res } = await run(validBody());
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      success: true,
      message: 'Mensaje enviado exitosamente. Te responderemos pronto.',
      emailSent: false,
    });
    expect(mockResendCtor).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      '[contact] RESEND_API_KEY missing; notification email not sent',
      expect.objectContaining({ to: 'info@nuevaeducacion.org' })
    );
  });

  it('Resend returning an error → 200 with emailSent false', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'domain not verified' } });
    const { res } = await run(validBody());
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().emailSent).toBe(false);
    expect(console.error).toHaveBeenCalledWith('[contact] Resend failed:', {
      message: 'domain not verified',
    });
  });

  it('Resend throwing → 200 with emailSent false', async () => {
    mockSend.mockRejectedValue(new Error('network down'));
    const { res } = await run(validBody());
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().emailSent).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });
});
