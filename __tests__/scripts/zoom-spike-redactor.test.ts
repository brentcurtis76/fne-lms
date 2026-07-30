/**
 * Contract tests for the spike's runtime redactor (`scripts/spikes/zoom/lib.mjs`).
 *
 * Sol R1 finding ③, second half: the redactor covered the six CREDENTIALS and
 * nothing else. `ZOOM_LICENSED_HOST_EMAIL` was not in the list, so every
 * `redact(JSON.stringify(participantRow))` printed the host's real address — which
 * is how it reached the results doc in the first place. Nothing tested the redactor
 * at all, so the omission was invisible.
 *
 * The payloads below are the shape of a real Zoom participants row, with entirely
 * invented values.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Redactor = (value: unknown) => string;

const ENV = {
  ZOOM_S2S_ACCOUNT_ID: 'AcctIdInvented000001',
  ZOOM_S2S_CLIENT_ID: 'S2sClientIdInvented1',
  ZOOM_S2S_CLIENT_SECRET: 'S2sClientSecretInvented00001',
  ZOOM_WEBHOOK_SECRET_TOKEN: 'WebhookSecretInvented0001',
  ZOOM_SDK_CLIENT_ID: 'SdkClientIdInvented1',
  ZOOM_SDK_CLIENT_SECRET: 'SdkClientSecretInvented00001',
  ZOOM_LICENSED_HOST_EMAIL: 'anfitrion@colegio-inventado.cl',
};

async function loadRedactor(): Promise<Redactor> {
  const lib = (await import('../../scripts/spikes/zoom/lib.mjs')) as {
    makeRedactor: (env: Record<string, string>) => Redactor;
  };
  return lib.makeRedactor(ENV);
}

describe('spike redactor — credentials', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('collapses every credential in the env contract', async () => {
    const redact = await loadRedactor();
    const text = redact(Object.values(ENV).join(' | '));
    for (const [key, value] of Object.entries(ENV)) {
      expect(text, `${key} survived redaction`).not.toContain(value);
    }
  });

  it('collapses JWT-shaped values (ZAKs, download tokens, start_url tokens)', async () => {
    const redact = await loadRedactor();
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aW52ZW50ZWQtcGF5bG9hZA.c2lnbmF0dXJl';
    expect(redact({ token: jwt })).toContain('«jwt-redacted»');
    expect(redact({ token: jwt })).not.toContain(jwt);
  });
});

describe('spike redactor — participant identity (new in Z0B-2r1)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  /** The row shape the customerKey PoC and followup-report both print. */
  const ROW = {
    id: 'UserIdInvented00000001',
    user_id: 16778240,
    name: 'Prueba Spike Uno',
    user_email: 'apoderado@colegio-inventado.cl',
    participant_user_id: 'UserIdInvented00000001',
    participant_uuid: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
    registrant_id: 'RegIdInvented0001',
    customer_key: '00112233445566778899aabbccddeeff',
    public_ip: '198.51.100.7',
    join_time: '2026-07-29T23:55:56Z',
  };

  it('redacts the licensed host email — the value that reached the results doc', async () => {
    const redact = await loadRedactor();
    const out = redact({ host_email: ENV.ZOOM_LICENSED_HOST_EMAIL });
    expect(out).not.toContain(ENV.ZOOM_LICENSED_HOST_EMAIL);
  });

  it("redacts a school user's email too, not only the host's", async () => {
    const redact = await loadRedactor();
    const out = redact(ROW);
    expect(out).not.toContain('apoderado@colegio-inventado.cl');
    expect(out).toContain('«email-redacted»');
  });

  it('redacts the public IP (personal data under Ley 21.719)', async () => {
    const redact = await loadRedactor();
    const out = redact(ROW);
    expect(out).not.toContain('198.51.100.7');
    expect(out).toContain('«ip-redacted»');
  });

  it('redacts Zoom user ids in both string and numeric form', async () => {
    const redact = await loadRedactor();
    const out = redact(ROW);
    expect(out).not.toContain('UserIdInvented00000001');
    expect(out).not.toContain('16778240');
    expect(out).not.toContain('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE');
    expect(out).not.toContain('RegIdInvented0001');
  });

  it('redacts recording playback URLs, which grant access to the media', async () => {
    const redact = await loadRedactor();
    const out = redact({ play_url: 'https://us02web.zoom.us/rec/play/InventedTokenValue123' });
    expect(out).not.toContain('InventedTokenValue123');
    expect(out).toContain('«recording-url-redacted»');
  });

  it('PRESERVES field names and presence — the finding was which fields are populated', async () => {
    // Over-redaction that erased the keys would delete the customerKey verdict:
    // "customer_key survives and is the ONLY identity field populated for a
    // license-free guest" is a claim about WHICH keys carry values.
    const redact = await loadRedactor();
    const out = redact(ROW);
    for (const key of Object.keys(ROW)) {
      expect(out, `key ${key} was erased`).toContain(`"${key}"`);
    }
    // The display name is synthetic by construction and must stay readable.
    expect(out).toContain('Prueba Spike Uno');
    // And an empty value stays distinguishable from a redacted one, because
    // "field absent / empty" is itself the guest-row finding.
    expect(redact({ user_email: '' })).toContain('«email-redacted»');
  });
});
