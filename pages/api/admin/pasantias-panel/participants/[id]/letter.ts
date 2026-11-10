/**
 * POST /api/admin/pasantias-panel/participants/[id]/letter — generate the
 * Carta de Invitación of one traveller as a PDF and keep it with their
 * documents. No body.
 *
 * Global admins only. Refuses with 422 `LETTER_INCOMPLETE` (and the list of
 * what is missing) until the greeting, the school line, the lodging line and
 * the two letter images exist — a letter is never generated with a guessed
 * value. Each call stores a NEW document; earlier letters stay until removed.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { authorizeIntakeAdmin } from '../../../../../../lib/pasantias/participants/admin';
import { logIntakeFailure } from '../../../../../../lib/pasantias/participants/server';
import { isUuid } from '../../../../../../lib/pasantias/participants/validation';
import { buildLetter, storeLetter } from '../../../../../../lib/pasantias/panel/letter-delivery';
import { loadParticipant } from '../../../../../../lib/pasantias/panel/server';

export const config = { api: { bodyParser: { sizeLimit: '1kb' } } };

const NOT_FOUND = { code: 'NOT_FOUND', error: 'No encontramos a esa persona.' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authorizeIntakeAdmin(req, res, ['POST']);
  if (!auth) return;
  const { supabase, userId } = auth;

  const participantId = typeof req.query.id === 'string' ? req.query.id.toLowerCase() : '';
  if (!isUuid(participantId)) return res.status(404).json(NOT_FOUND);

  try {
    const found = await loadParticipant(supabase, participantId);
    // Explicit `=== false`: tsconfig has strict off (see the intake routes).
    if (found.ok === false) {
      logIntakeFailure('panel letter participant read failed', found.error);
      return res.status(500).json({ error: 'Error al generar la carta' });
    }
    if (!found.value) return res.status(404).json(NOT_FOUND);
    const { row, roster } = found.value;

    const letter = await buildLetter(supabase, row, roster);
    if (letter.ok === false) {
      if (letter.reason === 'incomplete') {
        return res.status(422).json({
          code: 'LETTER_INCOMPLETE',
          error: `Para generar la carta falta: ${letter.missing.join('; ')}.`,
          missing: letter.missing,
        });
      }
      // `renderInvitationLetter` already strips its message down to the error kind.
      logIntakeFailure('panel letter render failed', letter.error);
      return res.status(500).json({ error: 'Error al generar la carta' });
    }

    const stored = await storeLetter(supabase, participantId, letter, userId);
    if (stored.ok === false) {
      logIntakeFailure(`panel letter store failed (${stored.stage})`, stored.error);
      return res.status(500).json({ error: 'Error al generar la carta' });
    }
    if (!stored.activityLogged) console.error('[pasantias-intake] panel letter: activity row not written');
    return res.status(201).json({ document: stored.document });
  } catch (error) {
    logIntakeFailure('panel letter unexpected error', error);
    return res.status(500).json({ error: 'Error al generar la carta' });
  }
}
