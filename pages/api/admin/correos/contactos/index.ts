/**
 * Correos contacts.
 *
 *   GET   ?q=&page=  search by part of the address, name or organisation; 25 a page, newest first. Erased
 *         people are never found.
 *   POST  add one person: { email, first_name?, last_name?, organization?, list_ids, legal_basis, basis_note,
 *         consent_notice_version? }. The reason has no default: without a chosen basis and a typed note the
 *         request is refused (400) before the database is called. One call of `email_add_contacts`.
 *
 * Admins only (401 visitor, 403 non-admin, 405 other methods).
 */
import type { NextApiResponse } from 'next';
import { isValidAddress, readIds, readPage, searchTerm } from '../../../../../lib/correos/address';
import { addContacts, contactIdFor, searchContacts, type AddCounts } from '../../../../../lib/correos/contacts';
import { CONTACT_MESSAGES } from '../../../../../lib/correos/messages';
import { parseReason } from '../../../../../lib/correos/reason';
import { correosAdminRoute, sendFailure } from '../../../../../lib/correos-host/admin-route';

const MAX_LISTS_PER_REQUEST = 50;
const MAX_NAME = 200;

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length > MAX_NAME) return undefined;
  return trimmed || null;
}

/** The one-person outcome, in plain words. */
function outcomeFor(counts: AddCounts): { outcome: string; message: string; status: number } {
  if (counts.invalid > 0) return { outcome: 'invalid', message: CONTACT_MESSAGES.addressInvalid, status: 422 };
  if (counts.blocked > 0) return { outcome: 'blocked', message: CONTACT_MESSAGES.blocked, status: 409 };
  if (counts.left > 0) return { outcome: 'left', message: CONTACT_MESSAGES.left, status: 409 };
  if (counts.duplicate > 0) return { outcome: 'duplicate', message: CONTACT_MESSAGES.alreadyThere, status: 200 };
  return { outcome: 'added', message: CONTACT_MESSAGES.added, status: 201 };
}

export default correosAdminRoute('contactos', {
  async GET(req, res, { db }) {
    const result = await searchContacts(db, searchTerm(req.query.q), readPage(req.query.page));
    if (result.ok === false) return sendFailure(res, result);
    const { ok: _ok, ...body } = result;
    return res.status(200).json(body);
  },

  async POST(req, res: NextApiResponse, { db, adminId }) {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const reason = parseReason(body);
    if (reason.ok === false) return res.status(400).json({ error: reason.message });

    const listIds = readIds(body.list_ids, MAX_LISTS_PER_REQUEST);
    if (!listIds) return res.status(400).json({ error: CONTACT_MESSAGES.listsRequired });
    if (!isValidAddress(body.email)) return res.status(400).json({ error: CONTACT_MESSAGES.addressInvalid });
    const first = optionalText(body.first_name);
    const last = optionalText(body.last_name);
    const organization = optionalText(body.organization);
    if (first === undefined || last === undefined || organization === undefined) {
      return res.status(400).json({ error: CONTACT_MESSAGES.nameTooLong });
    }

    const email = (body.email as string).trim();
    const added = await addContacts(db, {
      rows: [{ email, first_name: first, last_name: last, organization }],
      listIds,
      source: 'manual',
      reason: reason.reason,
      recordedAt: new Date().toISOString(),
      actor: adminId,
    });
    if (added.ok === false) return sendFailure(res, added);

    const outcome = outcomeFor(added.counts);
    const contactId = outcome.outcome === 'added' || outcome.outcome === 'duplicate' ? await contactIdFor(db, email) : null;
    return res.status(outcome.status).json({ outcome: outcome.outcome, message: outcome.message, contactId, counts: added.counts });
  },
});
