// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Attachments of a message (GENERA fixes F18f, EC-M9).
 *
 * The message is stored first (its attachments' paths are bound to its id);
 * then each file is uploaded and recorded. A file that cannot be uploaded or
 * recorded is named in `failedAttachments`, with a reason; the message is
 * stored once and sendMessage does not throw for it (a retry would store the
 * message twice).
 *
 * The browser client is the recording fake of the neighbouring messagingUtils
 * tests, with a fake store added. Synthetic data only.
 */

import { has, opArgs, type RecordedRequest as Request } from '../helpers/recordingSupabase';

const fake = vi.hoisted(() => ({
  ref: null as any,
  uploads: [] as Array<{ bucket: string; path: string; name: string }>,
  uploadError: (_name: string): unknown => null,
  /** F26b: every getPublicUrl asked (none is expected any more). */
  publicUrls: [] as string[],
}));

vi.mock('../../lib/supabase-wrapper', async () => {
  const { createRecordingSupabase } = await import('../helpers/recordingSupabase');
  fake.ref = createRecordingSupabase();
  const storage = {
    from: (bucket: string) => ({
      upload: async (path: string, file: File) => {
        fake.uploads.push({ bucket, path, name: file.name });
        const error = fake.uploadError(file.name);
        return error ? { data: null, error } : { data: { path }, error: null };
      },
      getPublicUrl: (path: string) => {
        fake.publicUrls.push(`${bucket}/${path}`);
        return { data: { publicUrl: `https://example.invalid/storage/v1/object/public/${bucket}/${path}` } };
      },
    }),
  };
  return { supabase: { ...fake.ref.client, storage } };
});

import { sendMessage } from '../../utils/messagingUtils-simple';

const h = fake.ref.state as {
  requests: Request[];
  respond: (req: Request, terminal: string) => { data: unknown; error: unknown };
  userId: string | null;
};

const WS = '14600000-0000-4000-8000-0000000000b1';
const THREAD = '14600000-0000-4000-8000-000000000301';
const MESSAGE_ID = '14600000-0000-4000-8000-000000000401';

/** The database: the message insert answers its row; attachment records as `recordError` says. */
function database(recordError: (fileName: string) => unknown = () => null) {
  h.respond = (req) => {
    if (req.kind === 'from' && req.target === 'profiles') {
      return { data: { first_name: 'Ana', last_name: 'Uno', email: 'ana@f18f.test.local', avatar_url: null }, error: null };
    }
    if (req.kind === 'from' && req.target === 'community_messages' && has(req, 'insert')) {
      const row = opArgs(req, 'insert')?.[0] as Record<string, unknown>;
      return { data: { id: MESSAGE_ID, created_at: '2026-11-19T10:00:00.000Z', ...row }, error: null };
    }
    if (req.kind === 'from' && req.target === 'message_attachments' && has(req, 'insert')) {
      const row = opArgs(req, 'insert')?.[0] as Record<string, unknown>;
      const error = recordError(String(row.file_name));
      return error ? { data: null, error } : { data: { id: `att-${row.file_name}`, ...row }, error: null };
    }
    return { data: null, error: null };
  };
}

const file = (name: string) => new File(['%PDF-1.4'], name, { type: 'application/pdf' });
const send = (attachments: File[]) =>
  sendMessage(WS, { content: 'Con adjuntos', thread_id: THREAD, attachments } as any, 'user-a1');
const messageInserts = () => h.requests.filter((r) => r.target === 'community_messages' && has(r, 'insert'));

beforeEach(() => {
  h.requests.length = 0;
  h.userId = 'user-a1';
  fake.uploads.length = 0;
  fake.uploadError = () => null;
  fake.publicUrls.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('F18f EC-M9 attachments that fail are named; the message is stored once', () => {
  it('two attachments, the second upload fails: one message, the second file named with a reason, the first recorded', async () => {
    database();
    fake.uploadError = (name) => (name === 'segundo.pdf' ? { message: 'The object exceeded the maximum allowed size' } : null);

    const result = await send([file('primero.pdf'), file('segundo.pdf')]);

    expect(messageInserts()).toHaveLength(1);
    expect(result.id).toBe(MESSAGE_ID);
    expect(result.failedAttachments).toEqual([
      { index: 1, name: 'segundo.pdf', reason: 'The object exceeded the maximum allowed size' },
    ]);
    expect(result.attachments.map((a: any) => a.file_name)).toEqual(['primero.pdf']);
    // The path of an attachment stays bound to its message: <workspace id>/<message id>/…
    expect(fake.uploads.map((u) => u.path.split('/').slice(0, 2).join('/'))).toEqual([
      `${WS}/${MESSAGE_ID}`,
      `${WS}/${MESSAGE_ID}`,
    ]);
    expect(fake.uploads.every((u) => u.bucket === 'message-attachments')).toBe(true);
  });

  it('the upload works but the record cannot be stored: that file is named as failed', async () => {
    database((name) => (name === 'acta.pdf' ? { code: '42501', message: 'Message parent access denied' } : null));

    const result = await send([file('acta.pdf')]);

    expect(messageInserts()).toHaveLength(1);
    expect(fake.uploads.map((u) => u.name)).toEqual(['acta.pdf']);
    expect(result.failedAttachments).toEqual([{ index: 0, name: 'acta.pdf', reason: 'Message parent access denied' }]);
    expect(result.attachments).toEqual([]);
  });

  it('F26b: the stored storage_path is the uploaded key, and getPublicUrl is never asked', async () => {
    database();

    await send([file('acta.pdf')]);

    const records = h.requests.filter((r) => r.target === 'message_attachments' && has(r, 'insert'));
    expect(records).toHaveLength(1);
    const row = opArgs(records[0], 'insert')?.[0] as Record<string, unknown>;
    expect(fake.uploads).toHaveLength(1);
    expect(row.storage_path).toBe(fake.uploads[0].path);
    expect(String(row.storage_path)).toMatch(new RegExp(`^${WS}/${MESSAGE_ID}/\\d+_[a-z0-9]*\\.pdf$`));
    expect(fake.publicUrls).toEqual([]);
  });

  it('nothing fails: an empty list, every file recorded', async () => {
    database();

    const result = await send([file('uno.pdf'), file('dos.pdf')]);

    expect(messageInserts()).toHaveLength(1);
    expect(result.failedAttachments).toEqual([]);
    expect(result.attachments.map((a: any) => a.file_name)).toEqual(['uno.pdf', 'dos.pdf']);
  });

  it('a message without attachments: an empty list', async () => {
    database();
    const result = await send([]);
    expect(result.failedAttachments).toEqual([]);
  });

  it('send-back 1 (2): two files with the same name, the second fails: it is named by its position', async () => {
    database();
    let calls = 0;
    fake.uploadError = () => (++calls === 2 ? { message: 'upload failed' } : null);

    const result = await send([file('acta.pdf'), file('acta.pdf')]);

    expect(messageInserts()).toHaveLength(1);
    expect(result.failedAttachments).toEqual([{ index: 1, name: 'acta.pdf', reason: 'upload failed' }]);
    expect(result.attachments).toHaveLength(1);
  });
});
