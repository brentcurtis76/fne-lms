import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/api-auth';
import { verifyAccessCode } from '@/lib/propuestas-web/access-code';

/**
 * Access code verification API for propuesta web view.
 * POST /api/propuestas/web/[slug]/verify
 * Validates the access code and returns the full snapshot on success.
 * Rate limited: 5 attempts per IP per slug per hour.
 */

// In-memory rate limiting store
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count };
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
  const rateLimitKey = `${ip}:${slug}`;
  const { allowed, remaining } = checkRateLimit(rateLimitKey);

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
    const serviceClient = createServiceRoleClient();

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
    const valid = await verifyAccessCode(code.toUpperCase(), propuesta.access_code);
    if (!valid) {
      return res.status(401).json({
        error: 'Código de acceso incorrecto',
        remaining,
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

    return res.status(200).json({
      data: {
        snapshot: propuesta.snapshot_json,
      },
    });
  } catch (err) {
    console.error('[propuesta-web/verify]', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
