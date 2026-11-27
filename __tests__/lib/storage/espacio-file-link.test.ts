import { describe, it, expect } from 'vitest';
import {
  FILE_LINK_SECONDS,
  MESSAGE_ATTACHMENTS_BUCKET,
  POST_MEDIA_BUCKET,
  espacioObjectKey,
} from '../../../lib/storage/espacio-file-link';

// F26b (EC-F2, EC-F3): the key of an Espacio file from what its row stores —
// a bare key (new rows) or an old full public address of that same store.
// Invented ids and hosts only.

const HOST = 'http://127.0.0.1:54321';
const POST = 'c0000000-0000-4000-8000-00000000000a';
const WS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MSG = 'e0000000-0000-4000-8000-000000000001';

describe('espacio-file-link constants', () => {
  it('names the two stores and the five-minute link', () => {
    expect(POST_MEDIA_BUCKET).toBe('post-media');
    expect(MESSAGE_ATTACHMENTS_BUCKET).toBe('message-attachments');
    expect(FILE_LINK_SECONDS).toBe(300);
  });
});

describe('espacioObjectKey', () => {
  it('a bare key is the key', () => {
    expect(espacioObjectKey(`${POST}/0.png`, POST_MEDIA_BUCKET, HOST)).toBe(`${POST}/0.png`);
    expect(espacioObjectKey(`${WS}/${MSG}/1700000000000_ab12.pdf`, MESSAGE_ATTACHMENTS_BUCKET, HOST))
      .toBe(`${WS}/${MSG}/1700000000000_ab12.pdf`);
  });

  it('an old public address of the same store → the key inside it, decoded once', () => {
    expect(espacioObjectKey(`${HOST}/storage/v1/object/public/post-media/${POST}/1.png`, POST_MEDIA_BUCKET, HOST))
      .toBe(`${POST}/1.png`);
    expect(espacioObjectKey(`${HOST}/storage/v1/object/public/message-attachments/${WS}/${MSG}/gu%C3%ADa%20uno.pdf`, MESSAGE_ATTACHMENTS_BUCKET, HOST))
      .toBe(`${WS}/${MSG}/guía uno.pdf`);
  });

  it('uses NEXT_PUBLIC_SUPABASE_URL as the storage origin by default', () => {
    const before = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = HOST;
    try {
      expect(espacioObjectKey(`${HOST}/storage/v1/object/public/post-media/${POST}/1.png`, POST_MEDIA_BUCKET)).toBe(`${POST}/1.png`);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = before;
    }
  });

  it("another store's address, another host's address, a non-storage address → null", () => {
    expect(espacioObjectKey(`${HOST}/storage/v1/object/public/message-attachments/${POST}/0.png`, POST_MEDIA_BUCKET, HOST)).toBeNull();
    expect(espacioObjectKey(`https://evil.example/storage/v1/object/public/post-media/${POST}/0.png`, POST_MEDIA_BUCKET, HOST)).toBeNull();
    expect(espacioObjectKey(`${HOST}/otra/cosa/${POST}/0.png`, POST_MEDIA_BUCKET, HOST)).toBeNull();
  });

  it("dot segments, percent signs, '%2F', a leading slash, empty segments → null", () => {
    expect(espacioObjectKey(`${POST}/../x/0.png`, POST_MEDIA_BUCKET, HOST)).toBeNull();
    expect(espacioObjectKey(`${POST}/%2e%2e/0.png`, POST_MEDIA_BUCKET, HOST)).toBeNull();
    expect(espacioObjectKey(`${POST}%2F0.png`, POST_MEDIA_BUCKET, HOST)).toBeNull();
    expect(espacioObjectKey(`${HOST}/storage/v1/object/public/post-media/${POST}%2F..%2Fx/0.png`, POST_MEDIA_BUCKET, HOST)).toBeNull();
    expect(espacioObjectKey(`/${POST}/0.png`, POST_MEDIA_BUCKET, HOST)).toBeNull();
    expect(espacioObjectKey(`${POST}//0.png`, POST_MEDIA_BUCKET, HOST)).toBeNull();
    expect(espacioObjectKey(`${POST}/0.png?x=1`, POST_MEDIA_BUCKET, HOST)).toBeNull();
  });

  it('empty, not a string, edge spaces → null', () => {
    expect(espacioObjectKey('', POST_MEDIA_BUCKET, HOST)).toBeNull();
    expect(espacioObjectKey(null, POST_MEDIA_BUCKET, HOST)).toBeNull();
    expect(espacioObjectKey(undefined, POST_MEDIA_BUCKET, HOST)).toBeNull();
    expect(espacioObjectKey(42, POST_MEDIA_BUCKET, HOST)).toBeNull();
    expect(espacioObjectKey(` ${POST}/0.png`, POST_MEDIA_BUCKET, HOST)).toBeNull();
  });
});
