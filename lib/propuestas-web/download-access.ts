import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkIsAdmin } from '@/lib/api-auth';
import {
  getProposalRateLimitCount,
  getProposalRequestIp,
  recordProposalFailedAttempt,
} from './access-rate-limit';
import { verifyAccessCode } from './access-code';

type DownloadAccessResult =
  | { ok: true }
  | { ok: false; status: number; error: string; remaining?: number };

/**
 * Proposal web downloads are available to recipients with the proposal access
 * code, and to authenticated admins using the preview flow where no code is
 * present in the browser state.
 */
export async function authorizeProposalDownload(
  req: NextApiRequest,
  res: NextApiResponse,
  serviceClient: SupabaseClient,
  slug: string,
  accessCodeHash: string | null | undefined,
  sessionCode: string | null | undefined
): Promise<DownloadAccessResult> {
  if (!accessCodeHash) {
    return { ok: false, status: 500, error: 'Propuesta sin codigo de acceso configurado' };
  }

  const normalizedCode = (sessionCode || '').trim().toUpperCase();

  if (normalizedCode) {
    const ip = getProposalRequestIp(req);
    const { allowed, remaining } = await getProposalRateLimitCount(serviceClient, ip, slug);

    if (!allowed) {
      return {
        ok: false,
        status: 429,
        error: 'Demasiados intentos. Intente nuevamente en una hora.',
        remaining: 0,
      };
    }

    try {
      const valid = await verifyAccessCode(normalizedCode, accessCodeHash);
      if (valid) {
        return { ok: true };
      }

      await recordProposalFailedAttempt(serviceClient, ip, slug);
      return {
        ok: false,
        status: 401,
        error: 'Codigo de sesion invalido',
        remaining: Math.max(remaining - 1, 0),
      };
    } catch (err) {
      console.error('[propuesta-web/download-access] Malformed access_code hash:', err);
      return {
        ok: false,
        status: 500,
        error: 'Codigo de acceso corrupto. Esta propuesta debe ser regenerada.',
      };
    }
  }

  const { isAdmin } = await checkIsAdmin(req, res);
  if (isAdmin) {
    return { ok: true };
  }

  return { ok: false, status: 401, error: 'Codigo de sesion invalido' };
}
