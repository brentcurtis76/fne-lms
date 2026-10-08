import type { NextApiRequest, NextApiResponse } from 'next';
import {
  createApiSupabaseClient,
  createServiceRoleClient,
  handleMethodNotAllowed,
  loggableError,
  requireVerifiedCaller,
} from '../../../lib/api-auth';
import { isOutboxDeliveryEnabled, readNotificationAddressSuppression } from '../../../lib/email/notification-worker';
import {
  buildPreferencesView,
  mergeRows,
  parsePreferencesUpdate,
  readOwnPreferences,
  selectsUnavailableDigest,
  writeOwnChoices,
  type AddressSuppression,
  type CategoryChoice,
} from '../../../lib/notifications/preferences-api';

/**
 * The caller's own notification email settings (N4-01).
 *
 * GET returns the stored category choices and each event's effective mode. It
 * writes nothing. PUT saves category choices for the verified caller only: the
 * user id never comes from the request. Contract:
 * docs/planning/reviews/fase-notif-19-review-request.md.
 */

const READ_FAILED = 'No pudimos cargar tus preferencias de notificación. Inténtalo nuevamente.';
const WRITE_FAILED = 'No pudimos guardar tus preferencias de notificación. Inténtalo nuevamente.';
const INVALID = 'La solicitud de preferencias no es válida.';
const DIGEST_UNAVAILABLE = 'El resumen diario aún no está disponible.';

/** Never fails the response: after a saved PUT a failure here must not read as a failed save. */
async function addressSuppression(email: string | undefined): Promise<AddressSuppression> {
  if (!email) return 'unavailable';
  try {
    return await readNotificationAddressSuppression(createServiceRoleClient(), email);
  } catch {
    return 'unavailable';
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PUT') return handleMethodNotAllowed(res, ['GET', 'PUT']);

  try {
    const caller = await requireVerifiedCaller(req, res);
    if (!caller.user) return res.status(caller.status).json(caller.body);
    const user = caller.user;

    let choices: CategoryChoice[] | null = null;
    if (req.method === 'PUT') {
      const parsed = parsePreferencesUpdate(req.body);
      if ('code' in parsed) return res.status(400).json({ error: INVALID, code: parsed.code });
      choices = parsed.choices;
    }

    const client = await createApiSupabaseClient(req, res);
    const stored = await readOwnPreferences(client, user.id);
    if ('error' in stored) {
      console.error('[notification-preferences] read failed', loggableError(stored.error));
      return res.status(500).json({ error: READ_FAILED, code: 'read_failed' });
    }

    const digestAvailable = isOutboxDeliveryEnabled();
    let categoryRows = stored.categoryRows;
    if (choices) {
      if (selectsUnavailableDigest(choices, categoryRows, digestAvailable)) {
        return res.status(400).json({ error: DIGEST_UNAVAILABLE, code: 'digest_unavailable' });
      }
      const written = await writeOwnChoices(client, user.id, choices);
      if ('error' in written) {
        console.error('[notification-preferences] write failed', loggableError(written.error));
        return res.status(500).json({ error: WRITE_FAILED, code: 'write_failed' });
      }
      categoryRows = mergeRows(categoryRows, written.rows);
    }

    return res.status(200).json(
      buildPreferencesView({
        categoryRows,
        legacyRows: stored.legacyRows,
        digestAvailable,
        addressSuppression: await addressSuppression(user.email),
      })
    );
  } catch (error) {
    console.error('[notification-preferences] unexpected failure', loggableError(error));
    return res.status(500).json({ error: req.method === 'PUT' ? WRITE_FAILED : READ_FAILED, code: 'unexpected' });
  }
}
