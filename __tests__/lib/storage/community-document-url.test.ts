import { describe, expect, it } from 'vitest';
import { resolveCommunityDocumentUrl as resolve } from '../../../lib/storage/community-document-url';

const origin = 'https://synthetic.supabase.co';
describe('community document URLs', () => {
  it('resolves stored object keys and encodes filenames exactly once', () => {
    expect(resolve('documents/workspace/root/guía #1.png', origin)).toBe(`${origin}/storage/v1/object/public/resources/documents/workspace/root/gu%C3%ADa%20%231.png`);
    expect(resolve('documents/a%20b.png', origin)).toBe(`${origin}/storage/v1/object/public/resources/documents/a%2520b.png`);
  });
  it('retains existing same-project public and signed URLs', () => {
    for (const mode of ['public', 'sign', 'authenticated']) {
      const url = `${origin}/storage/v1/object/${mode}/resources/documents/file%20one.png?token=synthetic`;
      expect(resolve(url, origin)).toBe(url);
    }
  });
  it('honors the configured repository bucket', () => {
    expect(resolve('documents/file.png', origin, 'repository')).toContain('/public/repository/documents/file.png');
    expect(resolve(`${origin}/storage/v1/object/public/resources/file.png`, origin, 'repository')).toBeNull();
  });
  it.each(['../file.png', 'documents/../file.png', 'documents/%2e%2e/file.png', 'documents/%2fprivate.png', 'documents\\file.png', '//evil.test/a', '/documents/a', 'javascript:alert(1)', 'data:image/png;base64,a', '', ' documents/a', 'documents//file.png'])('rejects unsafe key %s', value => {
    expect(resolve(value, origin)).toBeNull();
  });
  it.each([
    'https://evil.test/storage/v1/object/public/resources/file.png',
    `${origin}/storage/v1/object/public/private/file.png`,
    `${origin}/other/public/resources/file.png`,
    `${origin}/storage/v1/object/public/resources/../private/file.png`,
    `${origin}/storage/v1/object/public/resources/%2e%2e/private/file.png`,
    'https://user:pass@synthetic.supabase.co/storage/v1/object/public/resources/file.png',
  ])('rejects foreign or ambiguous absolute URL %s', value => {
    expect(resolve(value, origin)).toBeNull();
  });
});
