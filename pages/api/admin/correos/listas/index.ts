/**
 * Correos lists.
 *
 *   GET   every list (archived ones too), each with its number of subscribed members.
 *   POST  a new list: { name, description?, is_public }. A name already taken (any letter case, surrounding
 *         spaces) is refused with 409.
 *
 * Admins only (401 visitor, 403 non-admin, 405 other methods). No list is ever deleted.
 */
import { createList, listLists, parseListInput } from '../../../../../lib/correos/contacts';
import { correosAdminRoute, sendFailure } from '../../../../../lib/correos-host/admin-route';

export default correosAdminRoute('listas', {
  async GET(_req, res, { db }) {
    const result = await listLists(db);
    if (result.ok === false) return sendFailure(res, result);
    return res.status(200).json({ lists: result.lists });
  },

  async POST(req, res, { db, adminId }) {
    const parsed = parseListInput(req.body, true);
    if (parsed.ok === false) return sendFailure(res, parsed);
    const created = await createList(db, parsed.input, adminId);
    if (created.ok === false) return sendFailure(res, created);
    return res.status(201).json({ id: created.id });
  },
});
