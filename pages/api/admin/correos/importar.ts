/**
 * CSV import.
 *
 *   POST  { csv: <the file's text>, list_ids, legal_basis, basis_note, consent_notice_version? }
 *         The reason is for the whole file and has no default: without it the request is refused (400) before
 *         anything else. The text is read by the kit's own parser (`lib/correos/csv.ts`): a file that is not
 *         text, has no address column, or has more than 20,000 rows is refused whole. Then ONE call of
 *         `email_add_contacts` for the whole file; the answer is the database's counts.
 *
 * Admins only (401 visitor, 403 non-admin, 405 other methods). Its own body limit: 8 MB.
 */
import { readIds } from '../../../../lib/correos/address';
import { addContacts } from '../../../../lib/correos/contacts';
import { CSV_REFUSAL_MESSAGES, MAX_CSV_BYTES, parseContactsCsv } from '../../../../lib/correos/csv';
import { CONTACT_MESSAGES } from '../../../../lib/correos/messages';
import { parseReason } from '../../../../lib/correos/reason';
import { correosAdminRoute, sendFailure } from '../../../../lib/correos-host/admin-route';

export const config = {
  api: { bodyParser: { sizeLimit: '8mb' } },
};

const MAX_LISTS_PER_REQUEST = 50;

export default correosAdminRoute('importar', {
  async POST(req, res, { db, adminId }) {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const reason = parseReason(body);
    if (reason.ok === false) return res.status(400).json({ error: reason.message });

    const listIds = readIds(body.list_ids, MAX_LISTS_PER_REQUEST);
    if (!listIds) return res.status(400).json({ error: CONTACT_MESSAGES.listsRequired });

    if (typeof body.csv !== 'string') return res.status(400).json({ error: CSV_REFUSAL_MESSAGES.not_text });
    if (Buffer.byteLength(body.csv, 'utf8') > MAX_CSV_BYTES) return res.status(413).json({ error: CSV_REFUSAL_MESSAGES.too_large });

    const parsed = parseContactsCsv(body.csv);
    if (parsed.ok === false) {
      return res.status(parsed.refusal === 'too_large' ? 413 : 422).json({ error: parsed.message, refusal: parsed.refusal });
    }

    const added = await addContacts(db, {
      rows: parsed.rows,
      listIds,
      source: 'csv_import',
      reason: reason.reason,
      recordedAt: new Date().toISOString(),
      actor: adminId,
    });
    if (added.ok === false) return sendFailure(res, added);
    return res.status(200).json({ counts: added.counts, columns: parsed.columns });
  },
});
