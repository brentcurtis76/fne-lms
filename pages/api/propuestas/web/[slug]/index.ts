import { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '@/lib/api-auth';

/**
 * Public metadata API for propuesta web view.
 * GET /api/propuestas/web/[slug]
 * Returns non-sensitive metadata to power the unlock screen.
 * No auth required (public endpoint).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { slug } = req.query;
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Slug inválido' });
  }

  try {
    const serviceClient = createServiceRoleClient();

    const { data: propuesta, error } = await serviceClient
      .from('propuesta_generadas')
      .select('web_slug, web_status, snapshot_json')
      .eq('web_slug', slug)
      .eq('estado', 'completada')
      .single();

    if (error || !propuesta) {
      return res.status(404).json({ error: 'Propuesta no encontrada' });
    }

    if (propuesta.web_status === 'expired') {
      return res.status(410).json({ error: 'Esta propuesta ha expirado' });
    }

    // Extract only public metadata from snapshot — NO sensitive data
    const snapshot = propuesta.snapshot_json as Record<string, unknown> | null;

    return res.status(200).json({
      data: {
        slug: propuesta.web_slug,
        status: propuesta.web_status,
        schoolName: snapshot?.schoolName ?? null,
        serviceName: snapshot?.serviceName ?? null,
        type: snapshot?.type ?? null,
        programYear: snapshot?.programYear ?? null,
      },
    });
  } catch (err) {
    console.error('[propuesta-web/metadata]', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
