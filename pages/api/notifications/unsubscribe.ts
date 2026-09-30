import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { CATEGORY_LABELS } from '../../../lib/notifications/catalog';
import {
  applyUnsubscribe,
  isUnsubscribeTokenShape,
  UNSUBSCRIBE_PAGE_PATH,
  verifyUnsubscribeToken,
} from '../../../lib/email/notification-unsubscribe';

/** A multipart body holding the one-click field and nothing else. */
const ONE_CLICK_MULTIPART =
  /^--[^\r\n]+\r\nContent-Disposition: form-data; name="List-Unsubscribe"\r\n(?:[^\r\n]+\r\n)*\r\nOne-Click\r\n--[^\r\n]+--(?:\r\n)?$/i;

/** RFC 8058: the body is `List-Unsubscribe=One-Click`, as multipart/form-data or urlencoded, and nothing else. */
function isOneClickBody(req: NextApiRequest): boolean {
  const type = String(req.headers['content-type'] ?? '').toLowerCase();
  const body: unknown = req.body;
  if (type.startsWith('application/x-www-form-urlencoded')) {
    return (
      typeof body === 'object' && body !== null && Object.keys(body).length === 1 &&
      (body as Record<string, unknown>)['List-Unsubscribe'] === 'One-Click'
    );
  }
  if (type.startsWith('multipart/form-data')) {
    return typeof body === 'string' && body.length <= 1024 && ONE_CLICK_MULTIPART.test(body);
  }
  return false;
}

/**
 * Unsubscribe from notification email (N3-05). Public on purpose: the signed
 * token in `t` is the only authorization, so no session, cookie or CSRF token
 * is read, and a mailbox provider can call it.
 *
 * POST with the RFC 8058 one-click body applies the token. GET changes nothing:
 * it sends the reader to the confirmation page, so a link preview is harmless,
 * and with `info=1` it tells that page what the link is for, without reading
 * the database. The token is never logged.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const token = req.query.t;

  if (req.method === 'GET' && req.query.info !== '1') {
    return res.redirect(303, isUnsubscribeTokenShape(token) ? `${UNSUBSCRIBE_PAGE_PATH}?t=${token}` : UNSUBSCRIBE_PAGE_PATH);
  }

  if (req.method === 'POST' && !isOneClickBody(req)) {
    return res.status(400).json({ error: 'Solicitud no válida' });
  }

  const verified = verifyUnsubscribeToken(token);
  if ('reason' in verified) {
    if (verified.reason === 'not_configured') return res.status(503).json({ error: 'Servicio no disponible' });
    if (verified.reason === 'expired') return res.status(410).json({ error: 'El enlace venció' });
    return res.status(400).json({ error: 'Enlace no válido' });
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      digest: verified.kind === 'digest',
      categories: verified.scopes.map((scope) => ({ id: scope.category, label: CATEGORY_LABELS[scope.category] })),
    });
  }

  try {
    const categories = await applyUnsubscribe(createServiceRoleClient(), verified);
    if (!categories) throw new Error('unsubscribe_failed');
    // Every category changed after the email was sent: the later choice stands.
    const stale = categories.every((entry) => entry.outcome === 'stale');
    return res.status(stale ? 409 : 200).json({ ok: !stale, categories });
  } catch {
    // The exception text is not logged: it can carry a credential or an identifier.
    console.error('[notification-unsubscribe] request failed');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
