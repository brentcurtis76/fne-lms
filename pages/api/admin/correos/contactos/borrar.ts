/**
 * Erase a person.
 *
 *   POST  { contact_id }: `email_erase_contact` with the admin as actor. The address leaves the contact and every
 *         past send; the fingerprint stays in the block list for good; the row is not deleted. Cannot be undone.
 *
 * Admins only (401 visitor, 403 non-admin, 405 other methods): a visitor or a non-admin erases nothing.
 */
import { isUuid } from '../../../../../lib/correos/address';
import { eraseContact } from '../../../../../lib/correos/contacts';
import { CONTACT_MESSAGES } from '../../../../../lib/correos/messages';
import { correosAdminRoute, sendFailure } from '../../../../../lib/correos-host/admin-route';

export default correosAdminRoute('contactos/borrar', {
  async POST(req, res, { db, adminId }) {
    const id = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>).contact_id : undefined;
    if (!isUuid(id)) return res.status(400).json({ error: CONTACT_MESSAGES.notFound });
    const result = await eraseContact(db, id, adminId);
    if (result.ok === false) return sendFailure(res, result);
    return res.status(200).json({
      erased: result.result.erased,
      alreadyErased: result.result.already_erased,
      message: result.result.already_erased ? CONTACT_MESSAGES.alreadyErased : CONTACT_MESSAGES.erased,
    });
  },
});
