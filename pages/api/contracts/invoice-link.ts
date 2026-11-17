/**
 * GET /api/contracts/invoice-link?cuotaId=<uuid>
 *
 * GES-1.4: the one way to open an instalment's invoice. Checks who is asking
 * and answers a signed link to the invoice valid for five minutes.
 *
 * Who may: an active admin, as everywhere else in Contratos. Anyone else gets
 * the same 404 as an unknown instalment, so an outsider cannot tell that the
 * invoice exists.
 *
 * The stored value (cuotas.factura_url) may be an old full address of the
 * invoices store or the bare file name; invoiceObjectName reads both and
 * refuses anything else. Reads and signing use the service client; the admin
 * check above, not RLS, gates who may ask. The stored value and the link are
 * never logged. Built on pages/api/expense-reports/receipt-link.ts.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient, requireVerifiedCaller } from '../../../lib/api-auth';
import { INVOICES_BUCKET, invoiceObjectName } from '../../../lib/contracts/invoice-path';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK_SECONDS = 300;
const NOT_FOUND = { error: 'Factura no encontrada' };

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

  const { cuotaId } = req.query;
  if (typeof cuotaId !== 'string' || !UUID_PATTERN.test(cuotaId)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const service = createServiceRoleClient();

    // An active admin role, read with the service client (the way
    // receipt-link.ts decides it). A failed read is no role.
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

    const { data: cuota, error: cuotaError } = await service
      .from('cuotas')
      .select('id, factura_url')
      .eq('id', cuotaId)
      .maybeSingle();
    if (cuotaError) {
      console.error('[invoice-link] instalment read failed:', cuotaError.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
    if (!cuota) {
      return res.status(404).json(NOT_FOUND);
    }

    const name = invoiceObjectName(typeof cuota.factura_url === 'string' ? cuota.factura_url : null);
    if (!name) {
      return res.status(404).json(NOT_FOUND);
    }

    const { data: signed, error: signError } = await service.storage
      .from(INVOICES_BUCKET)
      .createSignedUrl(name, LINK_SECONDS);
    if (signError || !signed?.signedUrl) {
      if (signError) console.error('[invoice-link] signing failed:', signError.message);
      return res.status(404).json(NOT_FOUND);
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ url: signed.signedUrl, expiresIn: LINK_SECONDS });
  } catch (error) {
    console.error('[invoice-link] unexpected error:', error instanceof Error ? error.message : 'unknown');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
