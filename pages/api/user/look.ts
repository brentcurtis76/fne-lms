import type { NextApiRequest, NextApiResponse } from 'next';
import { createApiSupabaseClient, handleMethodNotAllowed, loggableError, requireVerifiedCaller } from '../../../lib/api-auth';
import { isLook, lookFromPreferences, mayChooseLook, preferencesWithLook } from '../../../lib/look';

/**
 * The caller's own look (lib/look.ts): today's or the redesign's.
 *
 * PUT `{ "look": "nuevo" | "clasico" }` saves it in the caller's own profile row
 * (`learning_preferences.ui_look`, every other key of that column kept) and answers
 * `{ look }`. The user id never comes from the request: it is the verified caller's.
 * Only accounts that are offered the choice may save one (`mayChooseLook`); the read and
 * the write go through the caller's own client, so the row policies apply as well.
 */

const INVALID = 'La solicitud no es válida.';
const NOT_OFFERED = 'Tu cuenta no tiene esta opción.';
const READ_FAILED = 'No pudimos leer tu apariencia. Inténtalo nuevamente.';
const WRITE_FAILED = 'No pudimos guardar tu apariencia. Inténtalo nuevamente.';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'PUT') return handleMethodNotAllowed(res, ['PUT']);

  try {
    const caller = await requireVerifiedCaller(req, res);
    if (!caller.user) return res.status(caller.status).json(caller.body);
    const userId = caller.user.id;

    const body: unknown = req.body;
    const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : null;
    const look = keys && keys.length === 1 && keys[0] === 'look' ? (body as { look: unknown }).look : undefined;
    if (!isLook(look)) return res.status(400).json({ error: INVALID, code: 'invalid_look' });

    const client = await createApiSupabaseClient(req, res);
    const current = await client
      .from('profiles')
      .select('can_run_qa_tests, learning_preferences')
      .eq('id', userId)
      .maybeSingle();
    if (current.error || !current.data) {
      if (current.error) console.error('[look] read failed', loggableError(current.error));
      return res.status(500).json({ error: READ_FAILED, code: 'read_failed' });
    }
    if (!mayChooseLook(current.data)) return res.status(403).json({ error: NOT_OFFERED, code: 'not_offered' });

    const preferences = preferencesWithLook(current.data.learning_preferences, look);
    const written = await client
      .from('profiles')
      .update({ learning_preferences: preferences })
      .eq('id', userId)
      .select('learning_preferences')
      .maybeSingle();
    if (written.error || !written.data) {
      if (written.error) console.error('[look] write failed', loggableError(written.error));
      return res.status(500).json({ error: WRITE_FAILED, code: 'write_failed' });
    }

    return res.status(200).json({ look: lookFromPreferences(written.data.learning_preferences) });
  } catch (error) {
    console.error('[look] failed', loggableError(error));
    return res.status(500).json({ error: WRITE_FAILED, code: 'write_failed' });
  }
}
