/**
 * One Correos list.
 *
 *   PATCH  { name?, description?, is_public?, archive?: true }: rename, describe, set public or not, archive.
 *          Archiving cannot be undone here; an archived list is not changed again. A name already taken (any
 *          letter case, surrounding spaces) is refused with 409.
 *
 * Admins only (401 visitor, 403 non-admin, 405 other methods). No list is ever deleted.
 */
import { isUuid } from '../../../../../lib/correos/address';
import { parseListInput, updateList } from '../../../../../lib/correos/contacts';
import { LIST_MESSAGES } from '../../../../../lib/correos/messages';
import { correosAdminRoute, sendFailure } from '../../../../../lib/correos-host/admin-route';

export default correosAdminRoute('listas/[id]', {
  async PATCH(req, res, { db }) {
    const id = req.query.id;
    if (!isUuid(id)) return res.status(404).json({ error: LIST_MESSAGES.notFound });
    const parsed = parseListInput(req.body, false);
    if (parsed.ok === false) return sendFailure(res, parsed);
    const updated = await updateList(db, id, parsed.input);
    if (updated.ok === false) return sendFailure(res, updated);
    return res.status(200).json({ ok: true });
  },
});
