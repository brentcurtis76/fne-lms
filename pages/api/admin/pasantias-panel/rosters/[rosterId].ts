/**
 * PUT /api/admin/pasantias-panel/rosters/[rosterId] — the two lines FNE fills
 * in for a school's invitation letters:
 * `{letterSchoolLine, letterLodgingLine, expectedVersion: number|null}`.
 *
 * Global admins only. Optimistic: a save made on stale data answers 409 with
 * nothing written.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { authorizeIntakeAdmin } from '../../../../../lib/pasantias/participants/admin';
import { logIntakeFailure } from '../../../../../lib/pasantias/participants/server';
import { isUuid } from '../../../../../lib/pasantias/participants/validation';
import { saveRosterDetails } from '../../../../../lib/pasantias/panel/server';
import { validateRosterDetailsBody } from '../../../../../lib/pasantias/panel/validation';

export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };

const NOT_FOUND = { code: 'NOT_FOUND', error: 'No encontramos esa nómina.' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authorizeIntakeAdmin(req, res, ['PUT']);
  if (!auth) return;
  const { supabase, userId } = auth;

  const rosterId = typeof req.query.rosterId === 'string' ? req.query.rosterId.toLowerCase() : '';
  if (!isUuid(rosterId)) return res.status(404).json(NOT_FOUND);

  try {
    const validation = validateRosterDetailsBody(req.body);
    if (validation.ok === false) {
      return res
        .status(422)
        .json({ code: 'VALIDATION', error: 'Revisa los campos marcados.', fields: validation.errors });
    }
    const { data: roster, error: rosterError } = await supabase
      .from('pasantias_intake_rosters')
      .select('id')
      .eq('id', rosterId)
      .maybeSingle();
    if (rosterError) {
      logIntakeFailure('panel roster read failed', rosterError);
      return res.status(500).json({ error: 'Error al guardar los datos de la carta' });
    }
    if (!roster) return res.status(404).json(NOT_FOUND);

    const written = await saveRosterDetails(supabase, rosterId, validation.value, userId);
    if (written.ok === true) return res.status(200).json({ details: written.details });
    if (written.reason === 'not_found') return res.status(404).json(NOT_FOUND);
    if (written.reason === 'stale') {
      return res.status(409).json({
        code: 'STALE',
        error: 'Otra persona cambió estos datos mientras los editabas. Actualiza el panel y vuelve a intentarlo.',
      });
    }
    logIntakeFailure('panel roster details write failed', written.error);
    return res.status(500).json({ error: 'Error al guardar los datos de la carta' });
  } catch (error) {
    logIntakeFailure('panel unexpected error', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
