import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/api-auth';
import { verifyAccessCode } from '@/lib/propuestas-web/access-code';
import { resolveSnapshotUrls } from '@/lib/propuestas-web/resolve-urls';
import type { ProposalSnapshot } from '@/lib/propuestas-web/snapshot';

/**
 * Access code verification API for propuesta web view.
 * POST /api/propuestas/web/[slug]/verify
 * Validates the access code and returns the full snapshot on success.
 * Rate limited: 5 attempts per IP per slug per hour (Supabase-backed).
 */

const MAX_ATTEMPTS = 5;

async function getRateLimitCount(
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
    // Fail open on DB error — don't block legitimate users
    return { allowed: true, remaining: MAX_ATTEMPTS };
  }

  const attempts = count ?? 0;
  if (attempts >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - attempts };
}

async function recordFailedAttempt(
  client: SupabaseClient,
  ip: string,
  slug: string
): Promise<void> {
  await client
    .from('propuesta_rate_limits')
    .insert({ ip_address: ip, slug });
}

const VerifySchema = z.object({
  code: z.string().min(1, 'Código requerido').max(10),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { slug } = req.query;
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Slug inválido' });
  }

  // Rate limiting by IP + slug
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || 'unknown';

  const serviceClient = createServiceRoleClient();
  const { allowed, remaining } = await getRateLimitCount(serviceClient, ip, slug);

  if (!allowed) {
    return res.status(429).json({
      error: 'Demasiados intentos. Intente nuevamente en una hora.',
      remaining: 0,
    });
  }

  // Validate body
  const bodyParse = VerifySchema.safeParse(req.body);
  if (!bodyParse.success) {
    return res.status(400).json({
      error: 'Código inválido',
      remaining,
    });
  }

  const { code } = bodyParse.data;

  try {

    const { data: propuesta, error } = await serviceClient
      .from('propuesta_generadas')
      .select('id, access_code, web_status, viewed_at, view_count, snapshot_json')
      .eq('web_slug', slug)
      .eq('estado', 'completada')
      .single();

    if (error || !propuesta) {
      return res.status(404).json({ error: 'Propuesta no encontrada', remaining });
    }

    if (propuesta.web_status === 'expired') {
      return res.status(410).json({ error: 'Esta propuesta ha expirado' });
    }

    if (!propuesta.access_code) {
      return res.status(500).json({ error: 'Propuesta sin código de acceso configurado' });
    }

    // Verify the access code
    let valid = false;
    try {
      valid = await verifyAccessCode(code.toUpperCase(), propuesta.access_code);
    } catch (bcryptErr) {
      // Truncated or malformed hash (e.g. from VARCHAR(8) era)
      console.error(`[propuesta-web/verify] Malformed access_code hash for slug=${slug}:`, bcryptErr);
      return res.status(500).json({
        error: 'Código de acceso corrupto. Esta propuesta debe ser regenerada.',
      });
    }
    if (!valid) {
      await recordFailedAttempt(serviceClient, ip, slug);
      return res.status(401).json({
        error: 'Código de acceso incorrecto',
        remaining: remaining - 1,
      });
    }

    // Success — update view tracking
    const updates: Record<string, unknown> = {
      view_count: (propuesta.view_count ?? 0) + 1,
    };
    if (!propuesta.viewed_at) {
      updates.viewed_at = new Date().toISOString();
    }
    if (propuesta.web_status === 'published') {
      updates.web_status = 'viewed';
    }

    await serviceClient
      .from('propuesta_generadas')
      .update(updates)
      .eq('id', propuesta.id);

    const resolvedSnapshot = await resolveSnapshotUrls(propuesta.snapshot_json as ProposalSnapshot);
    return res.status(200).json({
      data: {
        snapshot: resolvedSnapshot,
      },
    });
  } catch (err) {
    console.error('[propuesta-web/verify]', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
