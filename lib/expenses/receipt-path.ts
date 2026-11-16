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

function safeName(name: string): string | null {
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  if (name.includes('/') || name.includes('\\') || name.includes('..') || name.includes('%')) return null;
  if (CONTROL_CHARACTER.test(name)) return null;
  return name;
}

function nameFromStorageUrl(value: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(value).pathname;
  } catch {
    return null;
  }
  // /storage/v1/object[/sign|/public]/<bucket>/<name>
  const parts = pathname.split('/');
  if (parts[0] !== '' || parts[1] !== 'storage' || parts[2] !== 'v1' || parts[3] !== 'object') return null;
  let rest = parts.slice(4);
  if (rest[0] === 'sign' || rest[0] === 'public') rest = rest.slice(1);
  if (rest.length !== 2 || rest[0] !== RECEIPTS_BUCKET) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rest[1]);
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
