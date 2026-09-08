import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../lib/api-auth';
import {
  enqueueRecoveryRequest,
  normalizeRecoveryEmail,
  recoveryClientIp,
} from '../../../lib/auth/recovery-request-queue';
import { getAppBaseUrl } from '../../../lib/utils/app-url';

/** Identical for known, unknown, malformed, throttled, and failure paths. */
export const RECOVERY_REQUEST_ACKNOWLEDGEMENT =
  'Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña. ' +
  'Revisa tu bandeja de entrada y la carpeta de spam.';

export const RECOVERY_RESPONSE_FLOOR_MS = 300;

export async function waitForRecoveryResponseFloor(
  startedAt: number,
  now: () => number = Date.now,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds))
): Promise<void> {
  const remaining = RECOVERY_RESPONSE_FLOOR_MS - (now() - startedAt);
  if (remaining > 0) await sleep(remaining);
}

function acknowledge(res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(200).json({ message: RECOVERY_REQUEST_ACKNOWLEDGEMENT });
}

/**
 * The process-local limiter is deliberately absent. One RPC owns an atomic
 * per-account cooldown, a second database-backed IP budget, the encrypted
 * outbox enqueue, and the `queued` audit row. No provider call is on this
 * request path, and no account fact affects the response.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const startedAt = Date.now();
  try {
    await enqueueRecoveryRequest(createServiceRoleClient(), {
      email: normalizeRecoveryEmail((req.body ?? {})?.email),
      origin: getAppBaseUrl(req),
      ip: recoveryClientIp(req),
    });
  } catch {
    console.error('[recovery-request] request could not be queued');
  }

  await waitForRecoveryResponseFloor(startedAt);
  return acknowledge(res);
}
