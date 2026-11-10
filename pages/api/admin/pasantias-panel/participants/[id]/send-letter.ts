/**
 * POST /api/admin/pasantias-panel/participants/[id]/send-letter — email one
 * traveller's Carta de Invitación now, without waiting for the automatic send
 * (seven days before they leave Santiago). No body.
 *
 * Global admins only. The letter is built from the data as it is now, emailed
 * to the traveller's address, and a copy is kept with their documents. It goes
 * out even when a letter was already emailed (an admin asked for it).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { authorizeIntakeAdmin } from '../../../../../../lib/pasantias/participants/admin';
import { logIntakeFailure } from '../../../../../../lib/pasantias/participants/server';
import { isUuid } from '../../../../../../lib/pasantias/participants/validation';
import { sendLetter } from '../../../../../../lib/pasantias/panel/letter-delivery';
import { LETTER_SEND_ERRORS } from '../../../../../../lib/pasantias/panel/types';
import { getAppBaseUrl } from '../../../../../../lib/utils/app-url';

export const config = { api: { bodyParser: { sizeLimit: '1kb' } } };

const NOT_FOUND = { code: 'NOT_FOUND', error: 'No encontramos a esa persona.' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authorizeIntakeAdmin(req, res, ['POST']);
  if (!auth) return;
  const { supabase, userId } = auth;

  const participantId = typeof req.query.id === 'string' ? req.query.id.toLowerCase() : '';
  if (!isUuid(participantId)) return res.status(404).json(NOT_FOUND);

  try {
    const result = await sendLetter(supabase, participantId, {
      actorId: userId,
      force: true,
      baseUrl: getAppBaseUrl(req),
    });
    if (result.status === 'not_found') return res.status(404).json(NOT_FOUND);
    if (result.status === 'sent') return res.status(200).json({ sent: true, to: result.to, stored: result.stored });
    if (result.status === 'skipped') {
      return res.status(409).json({
        code: 'SEND_IN_PROGRESS',
        error: 'Ya hay un envío en curso para esta persona. Espera unos minutos e inténtalo de nuevo.',
      });
    }
    if (result.status === 'failed') {
      const detail = result.missing?.length ? `: ${result.missing.join('; ')}` : '';
      const incomplete = result.error === 'missing_data' || result.error === 'missing_email';
      return res.status(incomplete ? 422 : 502).json({
        code: incomplete ? 'LETTER_INCOMPLETE' : 'SEND_FAILED',
        error: `No se envió la carta: ${LETTER_SEND_ERRORS[result.error]}${detail}.`,
      });
    }
    return res.status(500).json({ error: 'Error al enviar la carta' });
  } catch (error) {
    logIntakeFailure('panel letter send unexpected error', error);
    return res.status(500).json({ error: 'Error al enviar la carta' });
  }
}
