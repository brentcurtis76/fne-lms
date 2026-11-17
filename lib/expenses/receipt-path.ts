import { RECEIPTS_BUCKET } from '../../utils/expenseConfig';

// GES-1.5: an expense item's stored receipt value (expense_items.receipt_url)
// comes in three shapes — the place in the receipts store (`boletas/<name>`,
// written by the Telegram bot and, since GES-1.5, by the web form), a bare file
// name, or an old long-lived signed/public link to that store. This turns any
// of them into the bare file name inside RECEIPTS_BUCKET, or refuses (null)
// anything that points elsewhere or does not name exactly one file.

const MAX_NAME_LENGTH = 300;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

// Not an allow-list on purpose: receipts already stored may carry spaces or
// accents in the part of the name taken from the uploaded file's extension.
// `?` and `#` are refused because the signing request would read only the part
// before them; a leading dot or surrounding white space is never a real receipt.
function safeName(name: string): string | null {
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  if (name.includes('/') || name.includes('\\') || name.includes('..') || name.includes('%')) return null;
  if (name.includes('?') || name.includes('#')) return null;
  if (name.startsWith('.') || /^\s|\s$/.test(name)) return null;
  if (CONTROL_CHARACTER.test(name)) return null;
  return name;
}

function escapeForPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The RAW value is matched (no `new URL`: it would normalise `..`, backslashes
// and encoded forms before the checks). One path segment after the bucket, an
// optional query, no fragment.
const STORAGE_URL = new RegExp(
  '^https?:\\/\\/[^\\/?#\\\\]+\\/storage\\/v1\\/object\\/(?:(?:sign|public)\\/)?' +
    escapeForPattern(RECEIPTS_BUCKET) +
    '\\/([^\\/?#\\\\]+)(?:\\?[^#]*)?$',
  'i'
);

function nameFromStorageUrl(value: string): string | null {
  const match = STORAGE_URL.exec(value);
  if (!match) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return safeName(decoded);
}

export function receiptPathFromStored(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null;
  if (/^https?:\/\//i.test(value)) return nameFromStorageUrl(value);
  const prefix = `${RECEIPTS_BUCKET}/`;
  if (value.startsWith(prefix)) return safeName(value.slice(prefix.length));
  return safeName(value);
}

// GES-1.5e: the extension the web form gives a new receipt's stored name — the
// part after the last dot of the uploaded file's name, lower-cased, letters a–z
// and digits only, at most 10 characters; `bin` when there is none.
export function receiptExtensionFromFileName(name: unknown): string {
  if (typeof name !== 'string') return 'bin';
  const dot = name.lastIndexOf('.');
  if (dot === -1) return 'bin';
  const ext = name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
  return ext || 'bin';
}
