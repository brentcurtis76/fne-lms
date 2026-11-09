/**
 * POST /api/admin/pasantias-panel/bulk — set ONE tracking field to one value
 * for up to 200 travellers: `{participantIds, field, value}`.
 *
 * Global admins only. One SQL function call, one transaction: every traveller
 * changes (each with its own activity row) or none does. Last write wins — the
 * admin chose the value for the whole selection.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { authorizeIntakeAdmin } from '../../../../lib/pasantias/participants/admin';
import { isUnavailable, logIntakeFailure } from '../../../../lib/pasantias/participants/server';
import { callBulkSet } from '../../../../lib/pasantias/panel/server';
import { validateBulkBody } from '../../../../lib/pasantias/panel/validation';

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authorizeIntakeAdmin(req, res, ['POST']);
  if (!auth) return;
  const { supabase, userId } = auth;

  try {
    const validation = validateBulkBody(req.body);
    if (validation.ok === false) {
      return res.status(422).json({ code: 'VALIDATION', error: 'Revisa la selección.', fields: validation.errors });
    }
    const outcome = await callBulkSet(supabase, validation.value, userId);
    if (outcome.ok === true) return res.status(200).json({ changed: outcome.row.changed });
    if (outcome.refusal === 'unknown_participant') {
      return res.status(404).json({
        code: 'NOT_FOUND',
        error: 'Alguna de las personas seleccionadas ya no existe. Actualiza el panel e inténtalo de nuevo.',
      });
    }
    if (outcome.refusal) {
      // The SQL refused what this validator accepted: the two drifted.
      console.error('[pasantias-intake] panel bulk refused by the database:', { code: outcome.refusal });
      return res.status(422).json({ code: 'VALIDATION', error: 'Revisa la selección.' });
    }
    logIntakeFailure('panel bulk failed', outcome.error);
    return res
      .status(isUnavailable(outcome.error) ? 503 : 500)
      .json({ error: 'No pudimos aplicar el cambio. Inténtalo de nuevo.' });
  } catch (error) {
    logIntakeFailure('panel unexpected error', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
