/**
 * One Correos contact.
 *
 *   GET  the person: address, names, organisation, the recorded reason and its date, each list with its state
 *        (subscribed, pending, left), and whether they are blocked and why. Admins only ever see the block.
 *
 * Admins only (401 visitor, 403 non-admin, 405 other methods).
 */
import { isUuid } from '../../../../../lib/correos/address';
import { getContactDetail } from '../../../../../lib/correos/contacts';
import { CONTACT_MESSAGES } from '../../../../../lib/correos/messages';
import { correosAdminRoute, sendFailure } from '../../../../../lib/correos-host/admin-route';

export default correosAdminRoute('contactos/[id]', {
  async GET(req, res, { db }) {
    const id = req.query.id;
    if (!isUuid(id)) return res.status(404).json({ error: CONTACT_MESSAGES.notFound });
    const result = await getContactDetail(db, id);
    if (result.ok === false) return sendFailure(res, result);
    return res.status(200).json({ contact: result.contact });
  },
});
