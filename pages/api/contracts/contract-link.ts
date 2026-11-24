/**
 * GET /api/contracts/contract-link?contratoId=<uuid>
 *
 * F26 (N146): the one way to open a contract's document (a signed contract or
 * the original PDF of an imported contract). Checks who is asking and answers
 * a signed link to the file valid for five minutes, so it works with the
 * `contracts` store public or private.
 *
 * Who may: an active admin, as everywhere else in Contratos. Anyone else gets
 * the same 404 as an unknown contract, so an outsider cannot tell that the
 * document exists.
 *
 * The stored value (contratos.contrato_url) may be an old full address of the
 * contracts store or the bare object name; contractObjectName reads both and
 * refuses anything else. Reads and signing use the service client; the admin
 * check above, not RLS, gates who may ask. The stored value and the link are
 * never logged. Built line for line on pages/api/contracts/invoice-link.ts.
 *
 * `download=1` («Descargar documento original»): the link is signed with the
 * storage client's download option set to `true`, so the store answers "save
 * this file" under the object's own name. Any other value of `download` is
 * ignored.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient, requireVerifiedCaller } from '../../../lib/api-auth';
import { CONTRACTS_BUCKET, contractObjectName } from '../../../lib/contracts/contract-path';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK_SECONDS = 300;
const NOT_FOUND = { error: 'Contrato no encontrado' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const caller = await requireVerifiedCaller(req, res);
  if (!caller.user) {
    return res.status(caller.status).json(caller.body);
  }
  const userId = caller.user.id;

  const { contratoId } = req.query;
  const download = req.query.download === '1';
  if (typeof contratoId !== 'string' || !UUID_PATTERN.test(contratoId)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const service = createServiceRoleClient();

    // An active admin role, read with the service client (the way
    // invoice-link.ts decides it). A failed read is no role.
    const { data: roles } = await service
      .from('user_roles')
      .select('role_type')
      .eq('user_id', userId)
      .eq('role_type', 'admin')
      .eq('is_active', true);
    const isAdmin = Array.isArray(roles) && roles.some((r: { role_type?: string }) => r.role_type === 'admin');
    if (!isAdmin) {
      return res.status(404).json(NOT_FOUND);
    }

    const { data: contrato, error: contratoError } = await service
      .from('contratos')
      .select('id, contrato_url')
      .eq('id', contratoId)
      .maybeSingle();
    if (contratoError) {
      console.error('[contract-link] contract read failed:', contratoError.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
    if (!contrato) {
      return res.status(404).json(NOT_FOUND);
    }

    const name = contractObjectName(typeof contrato.contrato_url === 'string' ? contrato.contrato_url : null);
    if (!name) {
      return res.status(404).json(NOT_FOUND);
    }

    const bucket = service.storage.from(CONTRACTS_BUCKET);
    const { data: signed, error: signError } = download
      ? await bucket.createSignedUrl(name, LINK_SECONDS, { download: true })
      : await bucket.createSignedUrl(name, LINK_SECONDS);
    if (signError || !signed?.signedUrl) {
      if (signError) console.error('[contract-link] signing failed:', signError.message);
      return res.status(404).json(NOT_FOUND);
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ url: signed.signedUrl, expiresIn: LINK_SECONDS });
  } catch (error) {
    console.error('[contract-link] unexpected error:', error instanceof Error ? error.message : 'unknown');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
