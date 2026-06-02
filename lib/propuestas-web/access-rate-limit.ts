import type { NextApiRequest } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';

export const PROPOSAL_ACCESS_MAX_ATTEMPTS = 5;

export function getProposalRequestIp(req: NextApiRequest): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || 'unknown'
  );
}

export async function getProposalRateLimitCount(
  client: SupabaseClient,
  ip: string,
  slug: string
): Promise<{ allowed: boolean; remaining: number }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await client
    .from('propuesta_rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .eq('slug', slug)
    .gte('attempted_at', oneHourAgo);

  if (error) {
    console.error('[rate-limit] count error:', error);
    return { allowed: true, remaining: PROPOSAL_ACCESS_MAX_ATTEMPTS };
  }

  const attempts = count ?? 0;
  if (attempts >= PROPOSAL_ACCESS_MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: PROPOSAL_ACCESS_MAX_ATTEMPTS - attempts };
}

export async function recordProposalFailedAttempt(
  client: SupabaseClient,
  ip: string,
  slug: string
): Promise<void> {
  await client
    .from('propuesta_rate_limits')
    .insert({ ip_address: ip, slug });
}
