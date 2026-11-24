/**
 * Bring in pasantías leads who ticked the optional newsletter box.
 *
 *   GET   ?q=&page=  only rows of `pasantias_leads` with `marketing_opt_in = true`; 25 a page.
 *   POST  { lead_ids, list_ids, legal_basis, basis_note }. The basis must be chosen by the admin and can only be
 *         `consent_form` (the tick is a consent on a form); the note must be typed. Without them: 400, before the
 *         database is called. EVERY id is read again; one that has not ticked refuses the whole request (422)
 *         and nothing is written. Per row: `basis_recorded_at` = the tick's time, `consent_notice_version` = its
 *         notice version; source `pasantia_leads`. The registro-tractor form's table is never read.
 *
 * Admins only (401 visitor, 403 non-admin, 405 other methods).
 */
import { readIds, readPage, searchTerm } from '../../../../lib/correos/address';
import { addContacts } from '../../../../lib/correos/contacts';
import { CONTACT_MESSAGES } from '../../../../lib/correos/messages';
import { parseReason } from '../../../../lib/correos/reason';
import { correosAdminRoute, sendFailure } from '../../../../lib/correos-host/admin-route';
import { checkLeadIds, listTickedLeads } from '../../../../lib/correos-host/pasantias';

const MAX_LISTS_PER_REQUEST = 50;
const MAX_LEADS_PER_REQUEST = 200;

const LEAD_MESSAGES = {
  idsRequired: `Elige entre 1 y ${MAX_LEADS_PER_REQUEST} personas.`,
  notAllowed:
    'Al menos una de las personas elegidas no marcó la casilla del boletín, así que no se puede agregar. No se agregó a nadie.',
  lookupFailed: 'No pudimos comprobar a las personas elegidas. No se agregó a nadie. Inténtalo de nuevo en un momento.',
  readFailed: 'No se pudo leer la lista de interesados. Inténtalo de nuevo en un momento.',
} as const;

export default correosAdminRoute('pasantias', {
  async GET(req, res, { db }) {
    const result = await listTickedLeads(db, searchTerm(req.query.q), readPage(req.query.page));
    if (result.ok === false) return res.status(500).json({ error: LEAD_MESSAGES.readFailed });
    const { ok: _ok, ...body } = result;
    return res.status(200).json(body);
  },

  async POST(req, res, { db, adminId }) {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    // Each lead carries its own notice version: none is typed here.
    const reason = parseReason(body, { allowed: ['consent_form'], versionFromRequest: false });
    if (reason.ok === false) return res.status(400).json({ error: reason.message });

    const listIds = readIds(body.list_ids, MAX_LISTS_PER_REQUEST);
    if (!listIds) return res.status(400).json({ error: CONTACT_MESSAGES.listsRequired });
    const leadIds = readIds(body.lead_ids, MAX_LEADS_PER_REQUEST);
    if (!leadIds) return res.status(400).json({ error: LEAD_MESSAGES.idsRequired });

    const checked = await checkLeadIds(db, leadIds);
    if (checked.ok === false) {
      return checked.reason === 'lookup_failed'
        ? res.status(500).json({ error: LEAD_MESSAGES.lookupFailed })
        : res.status(422).json({ error: LEAD_MESSAGES.notAllowed });
    }

    const added = await addContacts(db, {
      rows: checked.rows,
      listIds,
      source: 'pasantia_leads',
      reason: reason.reason,
      // Required by the function; every row carries its own tick time, which wins.
      recordedAt: new Date().toISOString(),
      actor: adminId,
    });
    if (added.ok === false) return sendFailure(res, added);
    return res.status(200).json({ counts: added.counts });
  },
});
