import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/api-auth';
import { verifyAccessCode } from '@/lib/propuestas-web/access-code';
import {
  getProposalRequestIp,
  releaseProposalAccessAttempt,
  reserveProposalAccessAttempt,
} from '@/lib/propuestas-web/access-rate-limit';
import { resolveSnapshotUrls } from '@/lib/propuestas-web/resolve-urls';
import type { ProposalSnapshot } from '@/lib/propuestas-web/snapshot';

/**
 * Access code verification API for propuesta web view.
 * POST /api/propuestas/web/[slug]/verify
 * Validates the access code and returns the full snapshot on success.
 * Rate limited: 5 attempts per IP per slug per hour (Supabase-backed).
 *
 * R2-02 (2026-09-07): the attempt is RESERVED — counted and recorded
 * atomically — immediately before the code is compared, and never compared
 * without a successful reservation. A limiter that cannot record answers 503
 * and the guess does not reach verification; an exhausted window answers 429;
 * a correct code releases its reservation so recipients do not consume slots.
 * Method / slug / body validation and the proposal lookup happen first: they
 * are not guesses (404 / 410 / 400 disclose nothing about the code) and were
 * never counted before either.
 */

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

  // Validate body
  const bodyParse = VerifySchema.safeParse(req.body);
  if (!bodyParse.success) {
    return res.status(400).json({
      error: 'Código inválido',
    });
  }

  const { code } = bodyParse.data;
  const ip = getProposalRequestIp(req);
  const serviceClient = createServiceRoleClient();

  try {

    const { data: propuesta, error } = await serviceClient
      .from('propuesta_generadas')
      .select('id, access_code, web_status, viewed_at, view_count, snapshot_json')
      .eq('web_slug', slug)
      .eq('estado', 'completada')
      .single();

    if (error || !propuesta) {
      return res.status(404).json({ error: 'Propuesta no encontrada' });
    }

    if (propuesta.web_status === 'expired') {
      return res.status(410).json({ error: 'Esta propuesta ha expirado' });
    }

    if (!propuesta.access_code) {
      return res.status(500).json({ error: 'Propuesta sin código de acceso configurado' });
    }

    // Reserve the attempt (count + record, atomically) BEFORE comparing the code.
    const reservation = await reserveProposalAccessAttempt(serviceClient, ip, slug);

    if (reservation.degraded) {
      // The attempt could not be accounted for: refuse (fail-closed) without
      // telling the client it exhausted its attempts. The code is NOT compared.
      return res.status(503).json({
        error: 'Servicio no disponible. Intente nuevamente en unos minutos.',
      });
    }

    if (!reservation.allowed) {
      return res.status(429).json({
        error: 'Demasiados intentos. Intente nuevamente en una hora.',
        remaining: 0,
      });
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
      // Already recorded by the reservation; nothing to write here.
      return res.status(401).json({
        error: 'Código de acceso incorrecto',
        remaining: reservation.remaining,
      });
    }

    // A correct code does not consume a failed-attempt slot.
    await releaseProposalAccessAttempt(serviceClient, reservation.attemptId);

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
