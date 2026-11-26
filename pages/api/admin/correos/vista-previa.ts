/**
 * Correos, release 1: the sample email in GENERA's brand.
 *
 *   GET   the rendered sample (subject, HTML, text), for an admin.
 *   POST  "send me a test": one message to the signed-in admin's own address, subject "[PRUEBA] …".
 *         The request body is never read: no recipient can be given.
 *
 * A visitor gets 401, a non-admin 403, any other method 405; a refusal carries no email content.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { renderEmail, sampleContent, sendTestEmail } from '../../../../lib/correos';
import { generaSamplePictureUrl } from '../../../../lib/correos-host/brand';
import { buildCorreosHost } from '../../../../lib/correos-host/host';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  let host;
  try {
    host = buildCorreosHost(req, res);
  } catch (error) {
    console.error('[correos/vista-previa] host unavailable:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'No se pudo preparar la vista previa' });
  }

  const identity = await host.identify();
  if (identity.kind !== 'admin') {
    return identity.reason === 'not_signed_in'
      ? res.status(401).json({ error: 'Debes iniciar sesión' })
      : res.status(403).json({ error: 'Solo administradores' });
  }

  const content = sampleContent({ baseUrl: host.baseUrl, pictureUrl: generaSamplePictureUrl(host.baseUrl) });

  try {
    if (req.method === 'GET') {
      const rendered = await renderEmail(host.brand, content);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(rendered);
    }

    const result = await sendTestEmail(host, identity, content);
    switch (result.status) {
      case 'sent':
        return res.status(200).json({ status: 'sent', to: result.to });
      case 'not_configured':
        return res.status(503).json({ status: 'not_configured' });
      case 'not_sent':
        return res.status(422).json({ status: 'not_sent', reason: result.reason });
      case 'invalid':
        return res.status(422).json({ status: 'not_sent', reason: 'invalid_content' });
      default:
        return res.status(403).json({ error: 'Solo administradores' });
    }
  } catch (error) {
    console.error('[correos/vista-previa] failed:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'No se pudo completar la acción' });
  }
}
