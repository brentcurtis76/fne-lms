/**
 * File-size + mime-type display helpers.
 *
 * The `formatFileSize` / `getFileIcon` pair was inlined across the meeting
 * components and doubly-exported from both `utils/documentUtils.ts` and
 * `utils/messagingUtils.ts`. This module is the canonical home — the two
 * legacy util files now re-export from here.
 *
 * Scope intentionally excludes the JSX-returning `getFileIcon` variants in
 * messaging/documents/blocks (they return React elements, not emoji strings,
 * so they can't merge with this signature). Those stay with their owners.
 */

/**
 * Render a byte count as a short human-readable string (e.g. "1.5 MB").
 * Accepts null/undefined so call sites can pass `attachment.file_size` from
 * schema rows where the column may be nullable — returns '' in that case,
 * matching what the previous inline copies did when they defaulted missing
 * sizes to empty strings.
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === 0) return '0 Bytes';
  if (!bytes) return '';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Pick a single-emoji badge for a mime type. Used in attachment rows where
 * a tiny visual hint is enough — no need for the richer JSX icon components
 * the messaging/documents modules use.
 *
 * Unknown or missing types fall back to 📎 (generic attachment).
 */
export function getFileIcon(mimeType: string | null | undefined): string {
  if (!mimeType) return '📎';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('word')) return '📝';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📽️';
  return '📎';
}
