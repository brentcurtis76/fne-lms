// @vitest-environment node
/**
 * PASANTÍAS PANEL — how a private file is stored: the object's path is never a
 * name a person chose, the type comes from the file's own bytes, and a failed
 * metadata row never leaves an orphan object behind.
 */
import { describe, expect, it } from 'vitest';
import {
  documentStoragePath,
  letterAssetPath,
  readLetterAsset,
  sniffAllowedMime,
  storeDocument,
} from '../../../../lib/pasantias/panel/documents';
import { fakePanel } from './fake-panel-supabase';

const PARTICIPANT_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const ADMIN_ID = '99999999-8888-4777-8666-555555555555';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'latin1');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const PATH_SHAPE = /^participants\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/;

const INPUT = {
  participantId: PARTICIPANT_ID,
  kind: 'ticket' as const,
  description: 'Ida y vuelta',
  fileName: 'pasaje de Ana.pdf',
  mimeType: 'application/pdf',
  buffer: PDF,
  actorId: ADMIN_ID,
  action: 'document_uploaded' as const,
};

describe('sniffAllowedMime', () => {
  it('decides by the bytes, whatever the file claimed to be', async () => {
    expect(await sniffAllowedMime(PDF)).toBe('application/pdf');
    expect(await sniffAllowedMime(PNG)).toBe('image/png');
  });

  it('refuses anything outside the four allowed types', async () => {
    expect(await sniffAllowedMime(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(await sniffAllowedMime(Buffer.from('MZ\u0090\u0000 not a document', 'latin1'))).toBeNull();
    expect(await sniffAllowedMime(Buffer.from('PK\u0003\u0004 zip or docx', 'latin1'))).toBeNull();
    expect(await sniffAllowedMime(Buffer.from('GIF89a' + '\u0000'.repeat(20), 'latin1'))).toBeNull();
    expect(await sniffAllowedMime(Buffer.alloc(0))).toBeNull();
  });
});

describe('documentStoragePath', () => {
  it('is random, carries no user text and matches the table CHECK', () => {
    const a = documentStoragePath(PARTICIPANT_ID, 'application/pdf');
    const b = documentStoragePath(PARTICIPANT_ID, 'image/jpeg');
    expect(a).toMatch(PATH_SHAPE);
    expect(b).toMatch(/\.jpg$/);
    expect(a.startsWith(`participants/${PARTICIPANT_ID}/`)).toBe(true);
    expect(a).not.toBe(documentStoragePath(PARTICIPANT_ID, 'application/pdf'));
  });
});

describe('storeDocument', () => {
  it('uploads create-only, then writes the metadata row and the activity row', async () => {
    const fake = fakePanel({
      query: (q) =>
        q.table === 'pasantias_panel_documents'
          ? {
              data: {
                id: 'doc-1',
                participant_id: PARTICIPANT_ID,
                kind: 'ticket',
                description: 'Ida y vuelta',
                file_name: 'pasaje de Ana.pdf',
                mime_type: 'application/pdf',
                size_bytes: PDF.length,
                created_at: '2026-11-09T12:00:00.000Z',
              },
              error: null,
            }
          : { data: null, error: null },
    });
    const result = await storeDocument(fake.client, INPUT);
    expect(result.ok).toBe(true);

    const upload = fake.storage[0];
    expect(upload.op).toBe('upload');
    expect(upload.bucket).toBe('pasantias-documents');
    expect(upload.path).toMatch(PATH_SHAPE);
    expect(upload.path).not.toContain('Ana');
    expect(upload.options).toEqual({ contentType: 'application/pdf', upsert: false });
    expect(upload.body).toBe(PDF);

    const [row, activity] = fake.writes();
    expect(row.table).toBe('pasantias_panel_documents');
    expect(row.payload).toEqual({
      participant_id: PARTICIPANT_ID,
      kind: 'ticket',
      description: 'Ida y vuelta',
      storage_path: upload.path,
      file_name: 'pasaje de Ana.pdf',
      mime_type: 'application/pdf',
      size_bytes: PDF.length,
      uploaded_by: ADMIN_ID,
    });
    // The answer never selects the storage path back.
    expect(row.columns).not.toContain('storage_path');
    expect(activity.payload).toEqual({
      participant_id: PARTICIPANT_ID,
      actor_id: ADMIN_ID,
      action: 'document_uploaded',
      details: { kind: 'ticket', file_name: 'pasaje de Ana.pdf' },
    });
    if (result.ok === true) {
      expect(result.activityLogged).toBe(true);
      expect(result.document).toMatchObject({ id: 'doc-1', kind: 'ticket', fileName: 'pasaje de Ana.pdf' });
      expect(JSON.stringify(result.document)).not.toContain('participants/');
    }
  });

  it('removes the uploaded object again when the metadata row fails', async () => {
    const fake = fakePanel({ query: () => ({ data: null, error: { code: '23514', message: 'check' } }) });
    const result = await storeDocument(fake.client, INPUT);
    expect(result).toMatchObject({ ok: false, stage: 'row' });
    expect(fake.storage.map((c) => c.op)).toEqual(['upload', 'remove']);
    expect(fake.storage[1].paths).toEqual([fake.storage[0].path]);
    expect(fake.writes()).toHaveLength(1);
  });

  it('writes no row when the upload itself fails', async () => {
    const fake = fakePanel({ storage: () => ({ data: null, error: { message: 'bucket down' } }) });
    const result = await storeDocument(fake.client, INPUT);
    expect(result).toMatchObject({ ok: false, stage: 'upload' });
    expect(fake.queries).toHaveLength(0);
  });

  it('still succeeds, flagged, when only the activity row fails', async () => {
    const fake = fakePanel({
      query: (q) =>
        q.table === 'pasantias_panel_documents'
          ? { data: { id: 'doc-2', kind: 'other', file_name: 'x.pdf', mime_type: 'application/pdf', size_bytes: 1 }, error: null }
          : { data: null, error: { code: 'XX000' } },
    });
    const result = await storeDocument(fake.client, INPUT);
    expect(result).toMatchObject({ ok: true, activityLogged: false });
    expect(fake.storage.map((c) => c.op)).toEqual(['upload']);
  });
});

describe('letter images', () => {
  it('live at two fixed private paths', () => {
    expect(letterAssetPath('logo')).toBe('letter-assets/logo');
    expect(letterAssetPath('signature')).toBe('letter-assets/signature');
  });

  it('are read back only when they really are PNG or JPEG', async () => {
    const blob = (buffer: Buffer) => ({ arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length) });
    const png = fakePanel({ storage: () => ({ data: blob(PNG), error: null }) });
    expect(await readLetterAsset(png.client, 'logo')).toMatchObject({ format: 'png' });
    expect(png.storage[0]).toMatchObject({ op: 'download', bucket: 'pasantias-documents', path: 'letter-assets/logo' });

    const pdf = fakePanel({ storage: () => ({ data: blob(PDF), error: null }) });
    expect(await readLetterAsset(pdf.client, 'signature')).toBeNull();
    const missing = fakePanel({ storage: () => ({ data: null, error: { message: 'not found' } }) });
    expect(await readLetterAsset(missing.client, 'signature')).toBeNull();
  });
});
