/** Resolve repository object keys without treating arbitrary URLs as documents. */
export function resolveCommunityDocumentUrl(
  value: string,
  storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  bucket = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'resources',
): string | null {
  try {
    const base = new URL(storageOrigin);
    if (!['https:', 'http:'].includes(base.protocol) || !value || value !== value.trim()) return null;
    const safeKey = (key: string): boolean => key.split('/').every(segment => {
      if (!segment || /[\\\u0000-\u001f\u007f]/.test(segment)) return false;
      const decoded = decodeURIComponent(segment);
      return decoded !== '.' && decoded !== '..' && !/[\/\\\u0000-\u001f\u007f]/.test(decoded);
    });

    if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
      // Check the raw path too: URL parsing would normalize away dot segments.
      const rawPath = value.replace(/^[a-z][a-z\d+.-]*:\/\/[^/]+/i, '').split(/[?#]/)[0];
      if (!safeKey(rawPath.slice(1))) return null;
      const url = new URL(value);
      if (url.origin !== base.origin || url.username || url.password) return null;
      const segments = url.pathname.split('/');
      if (segments[1] !== 'storage' || segments[2] !== 'v1' || segments[3] !== 'object'
        || !['public', 'sign', 'authenticated'].includes(segments[4])
        || decodeURIComponent(segments[5] || '') !== bucket || segments.length < 7) return null;
      return url.href;
    }

    if (value.startsWith('/') || !safeKey(value)) return null;
    const key = value.split('/').map(encodeURIComponent).join('/');
    return `${base.origin}/storage/v1/object/public/${encodeURIComponent(bucket)}/${key}`;
  } catch {
    return null;
  }
}
