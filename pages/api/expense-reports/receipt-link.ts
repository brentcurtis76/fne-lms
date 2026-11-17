/**
 * GET /api/expense-reports/receipt-link?itemId=<uuid>
 *
 * GES-1.5: the one way to open an expense receipt. Checks who is asking and
 * answers a signed link to the receipt valid for five minutes.
 *
 * Who may: the person who filed the report (expense_reports.submitted_by) and
 * an active admin. Anyone else gets the same 404 as an unknown item, so an
 * outsider cannot tell that the expense exists.
 *
 * The stored value (expense_items.receipt_url) may be the place in the store
 * (`boletas/<name>`) or an old long-lived link; receiptPathFromStored reads
 * both and refuses anything else. Reads use the service client; the checks
 * above, not RLS, gate who may ask.
 *
 * Signing never lends a non-admin more rights than their own session has
 * (GES-1.5c): the filer can write receipt_url of their own expense, so the
 * route signs for an active admin with the service client and for anyone else
 * (the filer) with the caller's own session client, whose request the file
 * store's own rules decide. A refusal from the store is "no receipt". The path
 * and the link are never logged.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createApiSupabaseClient, createServiceRoleClient, requireVerifiedCaller } from '../../../lib/api-auth';
import { receiptPathFromStored } from '../../../lib/expenses/receipt-path';
import { RECEIPTS_BUCKET } from '../../../utils/expenseConfig';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK_SECONDS = 300;
const NOT_FOUND = { error: 'Recurso no encontrado' };
const NO_RECEIPT = { error: 'Esta rendición no tiene boleta disponible' };

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

  const { itemId } = req.query;
  if (typeof itemId !== 'string' || !UUID_PATTERN.test(itemId)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const service = createServiceRoleClient();

    const { data: item, error: itemError } = await service
      .from('expense_items')
      .select('id, report_id, receipt_url')
      .eq('id', itemId)
      .maybeSingle();
    if (itemError) {
      console.error('[receipt-link] expense item read failed:', itemError.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
    if (!item || !item.report_id) {
      return res.status(404).json(NOT_FOUND);
    }

    const { data: report, error: reportError } = await service
      .from('expense_reports')
      .select('submitted_by')
      .eq('id', item.report_id)
      .maybeSingle();
    if (reportError) {
      console.error('[receipt-link] expense report read failed:', reportError.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
    if (!report) {
      return res.status(404).json(NOT_FOUND);
    }

    // An active admin role, read with the service client (the way
    // pages/api/quotes/[id].ts decides it), in every case, so that a filer who
    // is also an admin is treated as an admin. A failed read is no role.
    const { data: roles } = await service
      .from('user_roles')
      .select('role_type')
      .eq('user_id', userId)
      .eq('role_type', 'admin')
      .eq('is_active', true);
    const isAdmin = Array.isArray(roles) && roles.some((r: { role_type?: string }) => r.role_type === 'admin');
    const allowed = isAdmin || report.submitted_by === userId;
    if (!allowed) {
      return res.status(404).json(NOT_FOUND);
    }

    const path = receiptPathFromStored(item.receipt_url);
    if (!path) {
      return res.status(404).json(NO_RECEIPT);
    }

    // Admins sign with full rights; the filer with their own session's rights.
    const signer = isAdmin ? service : await createApiSupabaseClient(req, res);
    const { data: signed, error: signError } = await signer.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrl(path, LINK_SECONDS);
    if (signError || !signed?.signedUrl) {
      if (signError) console.error('[receipt-link] signing failed:', signError.message);
      return res.status(404).json(NO_RECEIPT);
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ url: signed.signedUrl, expiresIn: LINK_SECONDS });
  } catch (error) {
    console.error('[receipt-link] unexpected error:', error instanceof Error ? error.message : 'unknown');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
