// GES-1.4: an instalment's stored invoice value (cuotas.factura_url) comes in
// two shapes — an old full address of the invoices store (written by both
// upload screens until F2c) or the bare file name (written since F2c). This
// turns either into the file name inside INVOICES_BUCKET, or refuses (null)
// anything that points elsewhere or does not name exactly one file. The host
// of an old address is ignored: only the name is used. The checks are those
// of lib/expenses/receipt-path.ts (GES-1.5).

export const INVOICES_BUCKET = 'facturas';

const MAX_NAME_LENGTH = 300;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

// `?` and `#` are refused because the signing request would read only the part
// before them; a leading dot or surrounding white space is never a real invoice.
function safeName(name: string): string | null {
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  if (name.includes('/') || name.includes('\\') || name.includes('..') || name.includes('%')) return null;
  if (name.includes('?') || name.includes('#')) return null;
  if (name.startsWith('.') || /^\s|\s$/.test(name)) return null;
  if (CONTROL_CHARACTER.test(name)) return null;
  return name;
}

// The RAW value is matched (no `new URL`: it would normalise `..`, backslashes
// and encoded forms before the checks). The store's own address shape, one
// path segment after the bucket, an optional query, no fragment.
const STORAGE_URL = new RegExp(
  '^https?:\\/\\/[^\\/?#\\\\]+\\/storage\\/v1\\/object\\/(?:(?:sign|public)\\/)?' +
    INVOICES_BUCKET +
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

export function invoiceObjectName(stored: string | null): string | null {
  if (typeof stored !== 'string' || stored === '') return null;
  if (/^https?:\/\//i.test(stored)) return nameFromStorageUrl(stored);
  return safeName(stored);
}

// GES-1.4 (F2c): what an upload writes to the instalment. The uploaded file's
// NAME goes into factura_url (the link route signs it on demand; the store is
// never asked for a public address). The contract screen passes the file and
// time and also writes the four metadata columns, as before; the cash-flow
// screen writes factura_url only, as before.
export interface InvoiceUploadColumns {
  factura_url: string;
  factura_filename?: string;
  factura_size?: number;
  factura_type?: string;
  factura_uploaded_at?: string;
}

export function invoiceUploadColumns(
  objectName: string,
  file?: { name: string; size: number; type: string },
  uploadedAt?: string
): InvoiceUploadColumns {
  if (!file) return { factura_url: objectName };
  return {
    factura_url: objectName,
    factura_filename: file.name,
    factura_size: file.size,
    factura_type: file.type,
    factura_uploaded_at: uploadedAt ?? new Date().toISOString(),
  };
}

// GES-1.4 (F2c, send-back 1): the stored name of a new invoice upload,
// `<prefix>_<cuotaId>_<timestamp>.<ext>`. The extension is the part after the
// last dot of the uploaded file's name, reduced to ASCII letters and digits in
// lower case, at most 10 of them; `bin` when nothing is left (or no dot) — as
// lib/expenses/receipt-path.ts bounds a receipt's. So the name is always one
// that invoiceObjectName accepts, and the invoice can be opened and removed.
const MAX_EXTENSION_LENGTH = 10;

export function invoiceUploadObjectName(
  prefix: string,
  cuotaId: string,
  fileName: string,
  timestamp: number
): string {
  const dot = fileName.lastIndexOf('.');
  const ext =
    dot === -1
      ? ''
      : fileName
          .slice(dot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .slice(0, MAX_EXTENSION_LENGTH);
  return `${prefix}_${cuotaId}_${timestamp}.${ext || 'bin'}`;
}
