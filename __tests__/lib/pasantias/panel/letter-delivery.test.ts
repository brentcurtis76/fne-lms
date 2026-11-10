// @vitest-environment node
/**
 * PASANTÍAS PANEL — emailing the Carta de Invitación (`sendLetter`).
 *
 * The real letter is rendered (with a 2×2 PNG standing in for the logo and the
 * signature) and the real outbound-email module runs; only the Supabase client
 * and the provider transport are stand-ins. What the claim/finish SQL
 * functions really do is proven by pgTAP 116.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { letterEmail, retentionDate, sendLetter } from '../../../../lib/pasantias/panel/letter-delivery';
import type { EmailTransport } from '../../../../lib/email/provider';
import { fakePanel, type Answer, type FakePanel, type PanelQuery } from './fake-panel-supabase';
import { tinyPng } from './tiny-png';

const PARTICIPANT_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const ROSTER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ADMIN_ID = '99999999-8888-4777-8666-555555555555';
const ACCOUNT_ID = 'eeeeeeee-ffff-4000-8111-222222222222';
const EMAIL = 'ana.sintetica@example.com';
const PERSON = { first: 'Ana', last: 'Sintética', rut: '11111111-1', passport: 'ZZ998877' };

interface World {
  email?: string | null;
  salutation?: string | null;
  sentAt?: string | null;
  account?: boolean;
  images?: boolean;
  claim?: boolean;
  rowInsertFails?: boolean;
  /** How many times recording the outcome fails before it works. */
  finishFailures?: number;
}

function world(options: World = {}): FakePanel {
  const png = tinyPng();
  let finishCalls = 0;
  return fakePanel({
    query: (q: PanelQuery): Answer => {
      if (q.op === 'insert') {
        if (q.table === 'pasantias_panel_documents') {
          if (options.rowInsertFails) return { data: null, error: { code: 'XX000' } };
          return {
            data: {
              id: 'dddddddd-eeee-4fff-8000-111111111111',
              participant_id: PARTICIPANT_ID,
              kind: 'invitation_letter',
              description: null,
              file_name: q.payload?.file_name,
              mime_type: 'application/pdf',
              size_bytes: q.payload?.size_bytes,
              created_at: '2027-01-09T12:00:00.000Z',
            },
            error: null,
          };
        }
        return { data: null, error: null };
      }
      switch (q.table) {
        case 'pasantias_intake_participants':
          return {
            data: {
              roster_id: ROSTER_ID,
              id: PARTICIPANT_ID,
              version: 2,
              first_names: PERSON.first,
              last_names: PERSON.last,
              rut: PERSON.rut,
              passport_number: PERSON.passport,
              arrival_date: null,
              departure_date: null,
              focus: null,
              dietary_restrictions: [],
              dietary_other: null,
              updated_at: '2026-11-01T12:00:00.000Z',
              created_at: '2026-11-01T12:00:00.000Z',
              acknowledged_at: '2026-11-01T12:00:00.000Z',
              notice_version: 'v',
            },
            error: null,
          };
        case 'pasantias_intake_rosters':
          return {
            data: { id: ROSTER_ID, program: 'inspira', school_name: 'Colegio Sintético Uno', status: 'submitted', last_submitted_at: null, school_funding: null },
            error: null,
          };
        case 'pasantias_panel_roster_details':
          return {
            data: { roster_id: ROSTER_ID, letter_school_line: 'del Colegio Sintético Uno, Chile', letter_lodging_line: 'la Residencia Sintética', version: 1 },
            error: null,
          };
        case 'pasantias_nomina_participant_focus':
          return { data: { all_levels: false }, error: null };
        case 'pasantias_panel_logistics':
          return {
            data: {
              participant_id: PARTICIPANT_ID,
              flight_status: 'paid',
              lodging_status: 'reserved',
              deposit_received: true,
              balance_received: true,
              salutation: options.salutation === undefined ? 'estimada' : options.salutation,
              notes: null,
              scl_departure_date: '2027-01-16',
              bcn_arrival_date: null,
              bcn_departure_date: null,
              scl_arrival_date: null,
              letter_sent_at: options.sentAt ?? null,
              letter_sent_to: options.sentAt ? EMAIL : null,
              letter_send_error: null,
              version: 3,
              updated_at: '2026-11-02T12:00:00.000Z',
            },
            error: null,
          };
        case 'pasantias_panel_documents':
          return { data: [], error: null };
        case 'pasantias_panel_contacts':
          return { data: { email: options.email === undefined ? EMAIL : options.email }, error: null };
        case 'profiles':
          if ('email' in q.ilike) return { data: options.account ? [{ id: ACCOUNT_ID }] : [], error: null };
          // authorizeUserEmail: an account attached to no school.
          return { data: { school_id: null }, error: null };
        case 'user_roles':
          return { data: [], error: null };
        default:
          return { data: null, error: { code: 'UNEXPECTED_TABLE' } };
      }
    },
    rpc: (rpc) => {
      if (rpc.name === 'pasantias_panel_claim_letter_send') return { data: options.claim ?? true, error: null };
      if (rpc.name === 'pasantias_panel_finish_letter_send') {
        finishCalls += 1;
        return finishCalls <= (options.finishFailures ?? 0) ? { data: null, error: { code: '57014' } } : { data: null, error: null };
      }
      return { data: null, error: { code: 'UNEXPECTED_RPC' } };
    },
    storage: (call) => {
      if (call.op === 'download') {
        if (options.images === false) return { data: null, error: { message: 'not found' } };
        return { data: { arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) }, error: null };
      }
      return { data: null, error: null };
    },
  });
}

const accepted: EmailTransport = async () => ({ data: { id: 'provider-message-1' }, error: null });
const finish = (fake: FakePanel) => fake.rpcs.find((rpc) => rpc.name === 'pasantias_panel_finish_letter_send');

let logged: string[] = [];
beforeEach(() => {
  logged = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    });
  }
});
afterEach(() => {
  // Ley 21.719: no name, RUT, passport or address in any log line.
  const all = logged.join('\n');
  for (const secret of [PERSON.last, PERSON.rut, PERSON.passport, EMAIL]) expect(all).not.toContain(secret);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('sendLetter — the automatic send', () => {
  it('claims, emails the PDF to the traveller, keeps a copy and records the send, in that order', async () => {
    const fake = world();
    const transport = vi.fn(accepted);
    const result = await sendLetter(fake.client, PARTICIPANT_ID, { actorId: null, force: false, baseUrl: 'https://genera.example', transport });
    expect(result).toEqual({ status: 'sent', to: EMAIL, stored: true });

    expect(fake.rpcs[0]).toEqual({ name: 'pasantias_panel_claim_letter_send', args: { p_participant_id: PARTICIPANT_ID, p_force: false } });
    expect(transport).toHaveBeenCalledTimes(1);
    const message = transport.mock.calls[0][0];
    expect(message.to).toBe(EMAIL);
    expect(message.subject).toContain('carta de invitación');
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments?.[0].filename).toBe('Carta Invitación - Ana Sintética.pdf');
    // The attachment really is the PDF, in base64.
    expect(Buffer.from(message.attachments?.[0].content ?? '', 'base64').subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // No account for this address: no link to a page they could not open.
    expect(message.text).not.toContain('genera.example');

    const upload = fake.storage.find((call) => call.op === 'upload');
    expect(upload?.path).toMatch(new RegExp(`^participants/${PARTICIPANT_ID}/[0-9a-f-]{36}\\.pdf$`));
    const row = fake.writes().find((q) => q.table === 'pasantias_panel_documents');
    expect(row?.payload).toMatchObject({ participant_id: PARTICIPANT_ID, kind: 'invitation_letter', uploaded_by: null });
    expect(finish(fake)?.args).toEqual({
      p_participant_id: PARTICIPANT_ID,
      p_sent: true,
      p_email: EMAIL,
      p_error: null,
      p_actor: null,
    });
    // The copy is stored only after the provider accepted the message.
    const order = [...fake.storage.map((c) => c.op), 'finish'];
    expect(order.indexOf('upload')).toBeGreaterThan(order.lastIndexOf('download'));
  });

  it('links to «Mi pasantía» only when the address belongs to a GENERA account', async () => {
    const fake = world({ account: true });
    const transport = vi.fn(accepted);
    await sendLetter(fake.client, PARTICIPANT_ID, { actorId: null, force: false, baseUrl: 'https://genera.example', transport });
    expect(transport.mock.calls[0][0].text).toContain('https://genera.example/profile/pasantia');
  });

  it('does nothing when the letter was already sent or another run holds it', async () => {
    const already = world({ claim: false, sentAt: '2027-01-09T12:00:00Z' });
    const transport = vi.fn(accepted);
    expect(await sendLetter(already.client, PARTICIPANT_ID, { actorId: null, force: false, baseUrl: null, transport })).toEqual({
      status: 'skipped',
      reason: 'already_sent',
    });
    const busy = world({ claim: false });
    expect(await sendLetter(busy.client, PARTICIPANT_ID, { actorId: null, force: false, baseUrl: null, transport })).toEqual({
      status: 'skipped',
      reason: 'in_progress',
    });
    expect(transport).not.toHaveBeenCalled();
    expect(finish(already)).toBeUndefined();
    expect(already.storage).toHaveLength(0);
  });

  it.each([
    ['no email', { email: null }, 'missing_email'],
    ['no Estimado/Estimada', { salutation: null }, 'missing_data'],
    ['no logo or signature', { images: false }, 'missing_data'],
  ] as [string, World, string][])('with %s it sends nothing and records why', async (_label, options, code) => {
    const fake = world(options);
    const transport = vi.fn(accepted);
    const result = await sendLetter(fake.client, PARTICIPANT_ID, { actorId: null, force: false, baseUrl: null, transport });
    expect(result).toMatchObject({ status: 'failed', error: code });
    expect(transport).not.toHaveBeenCalled();
    expect(fake.storage.some((call) => call.op === 'upload')).toBe(false);
    expect(finish(fake)?.args).toEqual({ p_participant_id: PARTICIPANT_ID, p_sent: false, p_email: null, p_error: code, p_actor: null });
  });

  it('a refusal or an outage of the mail provider stores no letter and is recorded for the next run', async () => {
    const refused = world();
    const rejecting: EmailTransport = async () => ({ data: null, error: { message: `bad address ${EMAIL}`, statusCode: 422 } });
    expect(await sendLetter(refused.client, PARTICIPANT_ID, { actorId: null, force: false, baseUrl: null, transport: rejecting })).toEqual({
      status: 'failed',
      error: 'email_rejected',
    });
    expect(refused.storage.some((call) => call.op === 'upload')).toBe(false);
    expect(finish(refused)?.args.p_error).toBe('email_rejected');

    const down = world();
    const throwing: EmailTransport = async () => {
      throw new Error(`socket closed for ${EMAIL}`);
    };
    expect(await sendLetter(down.client, PARTICIPANT_ID, { actorId: null, force: false, baseUrl: null, transport: throwing })).toEqual({
      status: 'failed',
      error: 'email_failed',
    });
  });

  it('without a configured mail provider it says so instead of pretending', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const fake = world();
    expect(await sendLetter(fake.client, PARTICIPANT_ID, { actorId: null, force: false, baseUrl: null })).toEqual({
      status: 'failed',
      error: 'email_not_configured',
    });
    expect(finish(fake)?.args.p_error).toBe('email_not_configured');
  });

  it('still counts as sent when only the stored copy failed (the traveller has the letter)', async () => {
    const fake = world({ rowInsertFails: true });
    const result = await sendLetter(fake.client, PARTICIPANT_ID, { actorId: null, force: false, baseUrl: null, transport: accepted });
    expect(result).toEqual({ status: 'sent', to: EMAIL, stored: false });
    expect(finish(fake)?.args.p_sent).toBe(true);
    // The orphan file is removed again.
    expect(fake.storage.some((call) => call.op === 'remove')).toBe(true);
  });
});

describe('sendLetter — recording a send that already went out', () => {
  it('tries the record three times, so one hiccup does not cause a second email tomorrow', async () => {
    const fake = world({ finishFailures: 2 });
    const transport = vi.fn(accepted);
    const result = await sendLetter(fake.client, PARTICIPANT_ID, { actorId: null, force: false, baseUrl: null, transport });
    expect(result.status).toBe('sent');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(fake.rpcs.filter((rpc) => rpc.name === 'pasantias_panel_finish_letter_send')).toHaveLength(3);
  });

  it('gives up after three, still reports the send, and never emails twice in one run', async () => {
    const fake = world({ finishFailures: 9 });
    const transport = vi.fn(accepted);
    const result = await sendLetter(fake.client, PARTICIPANT_ID, { actorId: null, force: false, baseUrl: null, transport });
    expect(result.status).toBe('sent');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(fake.rpcs.filter((rpc) => rpc.name === 'pasantias_panel_finish_letter_send')).toHaveLength(3);
  });
});

describe('sendLetter — an admin presses "send now"', () => {
  it('forces the claim and records who sent it', async () => {
    const fake = world({ sentAt: '2027-01-09T12:00:00Z' });
    const result = await sendLetter(fake.client, PARTICIPANT_ID, { actorId: ADMIN_ID, force: true, baseUrl: null, transport: accepted });
    expect(result.status).toBe('sent');
    expect(fake.rpcs[0].args).toEqual({ p_participant_id: PARTICIPANT_ID, p_force: true });
    expect(finish(fake)?.args.p_actor).toBe(ADMIN_ID);
    expect(fake.writes().find((q) => q.table === 'pasantias_panel_documents')?.payload?.uploaded_by).toBe(ADMIN_ID);
  });
});

describe('letterEmail', () => {
  it('is plain es-CL, names the program and its dates, and escapes the HTML', () => {
    const message = letterEmail({
      firstNames: 'Ana <b>María</b>',
      roster: { program: 'mirada-profunda', programName: 'Pasantía Mirada Profunda' },
      accountUrl: null,
    });
    // The program name already says "Pasantía": it is not repeated.
    expect(message.subject).toBe('Tu carta de invitación — Pasantía Mirada Profunda, Barcelona');
    expect(message.text).toContain('a la Pasantía Mirada Profunda en Barcelona');
    expect(message.text).toContain('entre el 18 y el 29 de enero de 2027');
    expect(message.html).toContain('Ana &lt;b&gt;María&lt;/b&gt;');
    expect(message.html).not.toContain('<b>');
  });
});

describe('retentionDate', () => {
  it('is one calendar month after the program ends, clamped to the end of February', () => {
    expect(retentionDate('inspira')).toBe('2027-02-28');
    expect(retentionDate('mirada-profunda')).toBe('2027-02-28');
  });
});
