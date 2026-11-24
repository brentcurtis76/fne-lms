/**
 * Bring in GENERA users.
 *
 *   GET   ?q=&page=  staff users who may be mailed (lib/correos-host/staff.ts: any active role, a valid address,
 *         allowed by the outbound policy, so never a QA school's user). 25 a page; those the rule leaves out are
 *         only counted.
 *   POST  { user_ids, list_ids, legal_basis, basis_note, consent_notice_version? }. The reason has no default
 *         (400 without it, before the database is called). EVERY id is checked again by the same rule; one that
 *         fails refuses the whole request (422) and nothing is written. Name and address are copied as they
 *         are now; source `profiles`.
 *
 * Admins only (401 visitor, 403 non-admin, 405 other methods).
 */
import { readIds, readPage, searchTerm } from '../../../../lib/correos/address';
import { addContacts } from '../../../../lib/correos/contacts';
import { CONTACT_MESSAGES } from '../../../../lib/correos/messages';
import { parseReason } from '../../../../lib/correos/reason';
import { correosAdminRoute, sendFailure } from '../../../../lib/correos-host/admin-route';
import { checkStaffIds, listStaff } from '../../../../lib/correos-host/staff';

const MAX_LISTS_PER_REQUEST = 50;
const MAX_USERS_PER_REQUEST = 200;

const USER_MESSAGES = {
  idsRequired: `Elige entre 1 y ${MAX_USERS_PER_REQUEST} personas.`,
  notAllowed:
    'Al menos una de las personas elegidas no se puede agregar (no tiene un rol activo, no tiene correo o pertenece a un colegio de prueba). No se agregó a nadie.',
  lookupFailed: 'No pudimos comprobar a las personas elegidas. No se agregó a nadie. Inténtalo de nuevo en un momento.',
  readFailed: 'No se pudo leer la lista de usuarios. Inténtalo de nuevo en un momento.',
} as const;

export default correosAdminRoute('usuarios', {
  async GET(req, res, { db }) {
    const result = await listStaff(db, searchTerm(req.query.q), readPage(req.query.page));
    if (result.ok === false) return res.status(500).json({ error: USER_MESSAGES.readFailed });
    const { ok: _ok, ...body } = result;
    return res.status(200).json(body);
  },

  async POST(req, res, { db, adminId }) {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const reason = parseReason(body);
    if (reason.ok === false) return res.status(400).json({ error: reason.message });

    const listIds = readIds(body.list_ids, MAX_LISTS_PER_REQUEST);
    if (!listIds) return res.status(400).json({ error: CONTACT_MESSAGES.listsRequired });
    const userIds = readIds(body.user_ids, MAX_USERS_PER_REQUEST);
    if (!userIds) return res.status(400).json({ error: USER_MESSAGES.idsRequired });

    const checked = await checkStaffIds(db, userIds);
    if (checked.ok === false) {
      return checked.reason === 'lookup_failed'
        ? res.status(500).json({ error: USER_MESSAGES.lookupFailed })
        : res.status(422).json({ error: USER_MESSAGES.notAllowed });
    }

    const added = await addContacts(db, {
      rows: checked.users.map((user) => ({ email: user.email, first_name: user.first_name, last_name: user.last_name })),
      listIds,
      source: 'profiles',
      reason: reason.reason,
      recordedAt: new Date().toISOString(),
      actor: adminId,
    });
    if (added.ok === false) return sendFailure(res, added);
    return res.status(200).json({ counts: added.counts });
  },
});
