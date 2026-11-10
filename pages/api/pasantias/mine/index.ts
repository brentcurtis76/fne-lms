/**
 * GET /api/pasantias/mine — whether the signed-in account is a traveller of
 * the January 2027 pasantías (its confirmed email equals a traveller's email).
 *
 * Answers `{ hasPasantia }` only: the sidebar uses it to show "Mi pasantía".
 * Any signed-in user may ask; the answer is about the caller alone.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  createServiceRoleClient,
  getApiUser,
  getForcedPasswordChangeVerdict,
  handleMethodNotAllowed,
  sendForcedPasswordChangeResponse,
} from '../../../../lib/api-auth';
import { logIntakeFailure, setNoStore } from '../../../../lib/pasantias/participants/server';
import { confirmedEmail, findMyParticipantIds } from '../../../../lib/pasantias/panel/mine';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoStore(res);
  if (req.method !== 'GET') return handleMethodNotAllowed(res, ['GET']);
  const { user, error } = await getApiUser(req, res);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const supabase = createServiceRoleClient();
    const verdict = await getForcedPasswordChangeVerdict(supabase, user.id);
    if (sendForcedPasswordChangeResponse(res, verdict)) return;

    const email = confirmedEmail(user);
    if (!email) return res.status(200).json({ hasPasantia: false });
    const ids = await findMyParticipantIds(supabase, email);
    // Explicit `=== false`: tsconfig has strict off (see the intake routes).
    if (ids.ok === false) {
      logIntakeFailure('mi pasantia lookup failed', ids.error);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
    return res.status(200).json({ hasPasantia: ids.value.length > 0 });
  } catch (error) {
    logIntakeFailure('mi pasantia unexpected error', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
