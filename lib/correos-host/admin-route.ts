/**
 * The one shape of every Correos admin route in GENERA. Server only.
 *
 *   1. A method the route does not accept: 405, nothing else done.
 *   2. "Is admin" (`identify` in host.ts, the same check as the preview page): a visitor gets 401, a non-admin
 *      (or an admin held by the forced password change) 403. Nothing has been read or written, and the answer
 *      holds no contact data.
 *   3. Only then the handler runs, with the service-role client and the admin's id.
 *
 * A failure the handler did not expect answers 500 with a plain message; the raw error goes to the server log
 * only (its message, never contact data).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '../api-auth';
import { GENERIC_FAILURE } from '../correos/messages';
import { identify } from './host';

export interface CorreosAdminContext {
  adminId: string;
  db: SupabaseClient;
}

export type CorreosMethodHandler = (req: NextApiRequest, res: NextApiResponse, context: CorreosAdminContext) => Promise<unknown>;

export function correosAdminRoute(name: string, handlers: Partial<Record<'GET' | 'POST' | 'PATCH', CorreosMethodHandler>>) {
  const allowed = Object.keys(handlers);
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    const method = (req.method ?? '').toUpperCase();
    // Each handler is read by its fixed name, never through a computed key: the repo-wide ledger inventory
    // (__tests__/lib/services/ledger-hours-reader-inventory.test.ts) refuses a callable chosen dynamically
    // and then handed the service-role client.
    const run =
      method === 'GET' ? handlers.GET
        : method === 'POST' ? handlers.POST
          : method === 'PATCH' ? handlers.PATCH
            : undefined;
    if (!run) {
      res.setHeader('Allow', allowed.join(', '));
      return res.status(405).json({ error: 'Método no permitido' });
    }

    let identity;
    try {
      identity = await identify(req, res);
    } catch {
      identity = { kind: 'refused' as const, reason: 'not_admin' as const };
    }
    if (identity.kind !== 'admin') {
      return identity.reason === 'not_signed_in'
        ? res.status(401).json({ error: 'Debes iniciar sesión' })
        : res.status(403).json({ error: 'Solo administradores' });
    }

    res.setHeader('Cache-Control', 'no-store');
    try {
      const db = createServiceRoleClient();
      await run(req, res, { adminId: identity.adminId, db });
    } catch (error) {
      console.error(`[correos/${name}] failed:`, error instanceof Error ? error.message : 'unknown error');
      if (!res.headersSent) res.status(500).json({ error: GENERIC_FAILURE });
    }
  };
}

/** Sends a refusal or failure `{ error }` with its status. */
export function sendFailure(res: NextApiResponse, failure: { status: number; message: string }) {
  return res.status(failure.status).json({ error: failure.message });
}
